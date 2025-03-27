import * as THREE from "three";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AnimationMixer } from 'three';
import { PlayerState, TerrainBlock } from '../objects/world';
import { gameState } from '../state';
import { ParticleSystem } from './particles';

export class WorldRenderer {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private playerModels: Map<string, THREE.Group>;
    private terrainMeshes: Map<string, THREE.Mesh>;
    private gooseModel: THREE.Group | null = null;
    private modelLoader: GLTFLoader;
    private isLoadingModel: boolean = false;
    private isLoadingDogemanModel: boolean = false;
    private isLoadingMcDonaldsModel: boolean = false;
    private particleSystem: ParticleSystem;
    private currentCameraOffset: THREE.Vector3;
    private targetCameraOffset: THREE.Vector3;
    private cameraLerpFactor: number = 0.1; // Smoothing factor for camera movement
    private dogemanModel: THREE.Group | null = null;
    private mcdonaldsModel: THREE.Group | null = null;
    private animationMixer: THREE.AnimationMixer | null = null;
    private animations: THREE.AnimationClip[] = [];
    private clock: THREE.Clock;

    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // Sky blue background for better visibility
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        
        // Set an initial camera position that should show the scene
        this.camera.position.set(0, 20, 30);
        this.camera.lookAt(0, 0, 0);
        
        // Initialize camera offset vectors
        this.currentCameraOffset = new THREE.Vector3(0, 15, -25);
        this.targetCameraOffset = new THREE.Vector3(0, 15, -25);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true; // Enable shadows
        document.body.appendChild(this.renderer.domElement);

        this.playerModels = new Map();
        this.terrainMeshes = new Map();
        this.modelLoader = new GLTFLoader();
        this.particleSystem = new ParticleSystem(this.scene);
        this.clock = new THREE.Clock();
        
        // Load the goose model
        this.loadGooseModel();
        
        // Models will be loaded after terrain is initialized
        
        this.setupLighting();
        this.setupEventListeners();
        
        // Grid helper and axes helper removed for cleaner visuals
    }

    private loadGooseModel(): void {
        if (this.isLoadingModel) return;
        this.isLoadingModel = true;
        
        // Load the model from the public/models/goose directory
        this.modelLoader.load('/models/goose/scene.gltf', (gltf) => {
            console.log('Goose model loaded successfully');
            
            // Process the model
            this.gooseModel = gltf.scene;
            
            // Scale the model appropriately - make it 3x larger than before
            this.gooseModel.scale.set(0.03, 0.03, 0.03);
            
            // Make sure model casts shadows
            this.gooseModel.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            
            this.isLoadingModel = false;
        }, 
        // Progress callback
        (xhr) => {
            console.log(`Loading model: ${(xhr.loaded / xhr.total) * 100}% loaded`);
        },
        // Error callback
        (error) => {
            console.error('Error loading goose model:', error);
            this.isLoadingModel = false;
        });
    }

    private loadDogemanModel(): void {
        if (this.isLoadingDogemanModel) return;
        this.isLoadingDogemanModel = true;
        
        console.log('Starting to load dogeman model...');
        
        // Create a helper box to mark the position while loading
        const boxGeometry = new THREE.BoxGeometry(10, 10, 10);
        const boxMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff0000, 
            wireframe: true 
        });
        const box = new THREE.Mesh(boxGeometry, boxMaterial);
        // Position closer to the player's starting position
        box.position.set(20, 5, 20);
        this.scene.add(box);
        
        // Add a text label for debugging
        const debugText = document.createElement('div');
        debugText.style.position = 'absolute';
        debugText.style.top = '100px';
        debugText.style.left = '10px';
        debugText.style.color = 'white';
        debugText.style.backgroundColor = 'rgba(0,0,0,0.5)';
        debugText.style.padding = '5px';
        debugText.textContent = 'Loading Dogeman...';
        document.body.appendChild(debugText);
        
        // Load the dogeman model directly using the modelLoader
        this.modelLoader.load('/models/dogeman/scene.gltf', (gltf) => {
            console.log('Dogeman model loaded successfully');
            debugText.textContent = 'Dogeman loaded successfully';
            
            // Process the model
            this.dogemanModel = gltf.scene;
            
            const dogemanModelScale = 50;
            this.dogemanModel.scale.set(dogemanModelScale, dogemanModelScale, dogemanModelScale);
            
            // Position the model closer to the player's starting position
            // Add a small offset (1) to keep it above ground
            this.dogemanModel.position.set(20, 1, 20);
            
            // Make sure model casts shadows
            this.dogemanModel.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    
                    // Ensure materials are visible
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => {
                                mat.transparent = false;
                                mat.opacity = 1.0;
                                // Add some emissive property to make it more visible
                                if (mat.emissive) {
                                    mat.emissive.set(0x444444);
                                }
                            });
                        } else {
                            child.material.transparent = false;
                            child.material.opacity = 1.0;
                            // Add some emissive property to make it more visible
                            if (child.material.emissive) {
                                child.material.emissive.set(0x444444);
                            }
                        }
                    }
                }
            });
            
            // Set up animation
            this.animationMixer = new THREE.AnimationMixer(this.dogemanModel);
            this.animations = gltf.animations;
            
            // Play all animations if available
            if (this.animations && this.animations.length > 0) {
                console.log(`Dogeman has ${this.animations.length} animations`);
                debugText.textContent = `Dogeman has ${this.animations.length} animations`;
                this.animations.forEach(clip => {
                    console.log(`Playing animation: ${clip.name}`);
                    this.animationMixer?.clipAction(clip).play();
                });
            } else {
                console.log('No animations found for dogeman model');
                debugText.textContent = 'No animations found for dogeman model';
            }
            
            // Remove the helper box
            this.scene.remove(box);
            
            // Add to scene
            this.scene.add(this.dogemanModel);
            console.log('Dogeman added to scene at position:', this.dogemanModel.position);
            
            this.isLoadingDogemanModel = false;
        }, 
        // Progress callback
        (xhr) => {
            const percentComplete = Math.round((xhr.loaded / xhr.total) * 100);
            console.log(`Loading dogeman model: ${percentComplete}% loaded`);
            debugText.textContent = `Loading Dogeman: ${percentComplete}%`;
        },
        // Error callback
        (error) => {
            console.error('Error loading dogeman model:', error);
            debugText.textContent = `Error loading Dogeman: ${error.message || 'Unknown error'}`;
            
            // Create a fallback object if the model fails to load
            const geometry = new THREE.BoxGeometry(10, 20, 10);
            const material = new THREE.MeshPhongMaterial({ 
                color: 0xff00ff, 
                emissive: 0x550055 
            });
            const cube = new THREE.Mesh(geometry, material);
            cube.position.set(20, 10, 20); // Position it at the same place
            cube.castShadow = true;
            cube.receiveShadow = true;
            
            // Remove the helper box
            this.scene.remove(box);
            
            this.scene.add(cube);
            console.log('Added fallback for dogeman at position:', cube.position);
            
            this.isLoadingDogemanModel = false;
        });
    }
    
    private loadMcDonaldsModel(): void {
        if (this.isLoadingMcDonaldsModel) return;
        this.isLoadingMcDonaldsModel = true;
        
        console.log('Starting to load mcdonalds model...');
        
        // Create a helper box to mark the position while loading
        const boxGeometry = new THREE.BoxGeometry(10, 10, 10);
        const boxMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x0000ff, 
            wireframe: true 
        });
        const box = new THREE.Mesh(boxGeometry, boxMaterial);
        // Position closer to the player's starting position
        box.position.set(-20, 5, -20);
        this.scene.add(box);
        
        // Add a text label for debugging
        const debugText = document.createElement('div');
        debugText.style.position = 'absolute';
        debugText.style.top = '130px';
        debugText.style.left = '10px';
        debugText.style.color = 'white';
        debugText.style.backgroundColor = 'rgba(0,0,0,0.5)';
        debugText.style.padding = '5px';
        debugText.textContent = 'Loading McDonalds...';
        document.body.appendChild(debugText);
        
        // Load the mcdonalds model directly using the modelLoader
        this.modelLoader.load('/models/mcdonalds/scene.gltf', (gltf) => {
            console.log('McDonalds model loaded successfully');
            debugText.textContent = 'McDonalds loaded successfully';
            
            // Process the model
            this.mcdonaldsModel = gltf.scene;
            
            const mcdonaldsModelScale = 2000;
            this.mcdonaldsModel.scale.set(mcdonaldsModelScale, mcdonaldsModelScale, mcdonaldsModelScale);
            
            // Position the model closer to the player's starting position
            // Add a small offset (1) to keep it above ground
            const mcdonaldsModelYOffset = 25;
            this.mcdonaldsModel.position.set(-30, mcdonaldsModelYOffset, -30);
            
            // Make sure model casts shadows
            this.mcdonaldsModel.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    
                    // Ensure materials are visible
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => {
                                mat.transparent = false;
                                mat.opacity = 1.0;
                                // Add some emissive property to make it more visible
                                if (mat.emissive) {
                                    mat.emissive.set(0x444444);
                                }
                            });
                        } else {
                            child.material.transparent = false;
                            child.material.opacity = 1.0;
                            // Add some emissive property to make it more visible
                            if (child.material.emissive) {
                                child.material.emissive.set(0x444444);
                            }
                        }
                    }
                }
            });
            
            // Remove the helper box
            this.scene.remove(box);
            
            // Add to scene
            this.scene.add(this.mcdonaldsModel);
            console.log('McDonalds added to scene at position:', this.mcdonaldsModel.position);
            
            this.isLoadingMcDonaldsModel = false;
        }, 
        // Progress callback
        (xhr) => {
            const percentComplete = Math.round((xhr.loaded / xhr.total) * 100);
            console.log(`Loading mcdonalds model: ${percentComplete}% loaded`);
            debugText.textContent = `Loading McDonalds: ${percentComplete}%`;
        },
        // Error callback
        (error) => {
            console.error('Error loading mcdonalds model:', error);
            debugText.textContent = `Error loading McDonalds: ${error.message || 'Unknown error'}`;
            
            // Create a fallback object if the model fails to load
            const geometry = new THREE.BoxGeometry(10, 20, 10);
            const material = new THREE.MeshPhongMaterial({ 
                color: 0x00ffff, 
                emissive: 0x005555 
            });
            const cube = new THREE.Mesh(geometry, material);
            cube.position.set(-20, 10, -20); // Position it at the same place
            cube.castShadow = true;
            cube.receiveShadow = true;
            
            // Remove the helper box
            this.scene.remove(box);
            
            this.scene.add(cube);
            console.log('Added fallback for mcdonalds at position:', cube.position);
            
            this.isLoadingMcDonaldsModel = false;
        });
    }

    private setupLighting(): void {
        // Brighter ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambientLight);

        // Directional light for shadows
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 100, 50);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 500;
        directionalLight.shadow.camera.left = -100;
        directionalLight.shadow.camera.right = 100;
        directionalLight.shadow.camera.top = 100;
        directionalLight.shadow.camera.bottom = -100;
        this.scene.add(directionalLight);
    }

    private setupEventListeners(): void {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    initializeTerrain(terrain: Map<string, TerrainBlock>): void {
        for (const [id, block] of terrain.entries()) {
            this.addTerrainBlock(id, block);
        }
        
        // Now that terrain is initialized, load the additional models
        console.log('Terrain initialized, loading additional models...');
        this.loadDogemanModel();
        this.loadMcDonaldsModel();
    }

    addTerrainBlock(id: string, block: TerrainBlock): void {
        // Only create the ground, skip other terrain blocks
        if (id !== 'ground') {
            return;
        }
        
        // Use the exact size from the physics system without any scaling
        const geometry = new THREE.BoxGeometry(
            block.size.x,
            block.size.y,
            block.size.z
        );
        
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x2E8B57, // Sea Green - a slightly dark grassy green
            roughness: 0.8,
            metalness: 0.2
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(block.position);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        
        this.scene.add(mesh);
        this.terrainMeshes.set(id, mesh);
    }

    updatePlayerRender(playerId: string, state: PlayerState): void {
        let player = this.playerModels.get(playerId);
        
        if (!player) {
            // Create a new player group
            player = new THREE.Group();
            
            if (this.gooseModel) {
                // Use the goose model if available
                const goose = this.gooseModel.clone();
                
                // Adjust the model position so feet touch the ground
                // Fine-tune Y position to make feet rest on ground
                goose.position.y = -1.2; // Adjusted to raise the model slightly
                
                // Keep the same scale as set in loadGooseModel
                goose.rotation.y = Math.PI; // Rotate to face forward if needed
                
                player.add(goose);
                
                // Store reference to the goose model for animation
                player.userData.gooseModel = goose;
            } else {
                // Fallback to red cube if model isn't loaded
                const geometry = new THREE.BoxGeometry(4, 4, 4);
                const material = new THREE.MeshPhongMaterial({ 
                    color: 0xFF0000, 
                    emissive: 0x550000 
                });
                const cube = new THREE.Mesh(geometry, material);
                cube.castShadow = true;
                cube.position.y = 0;
                player.add(cube);
            }
            
            this.playerModels.set(playerId, player);
            this.scene.add(player);
        }

        // Update position and rotation directly
        player.position.copy(state.position);
        player.rotation.y = state.rotation;
        
        // Handle jumping animation if we have a goose model
        const gooseModel = player.userData.gooseModel;
        if (gooseModel && state.isJumping) {
            // You could add simple animation here if desired
            // For example, slightly raise the model when jumping
            gooseModel.position.y = Math.sin(Date.now() * 0.01) * 0.5 - 1.2; // Keep the base offset
        } else if (gooseModel) {
            // Reset position when not jumping
            gooseModel.position.y = -1.2; // Keep the base offset
        }
        
        // Update camera if this is the local player
        if (playerId === gameState.playerId) {
            // Get camera pitch from player userData (defaults to 0 if not set)
            const cameraPitch = state.userData?.cameraPitch || 0;
            
            // Update target camera offset - base position
            this.targetCameraOffset.set(0, 15, -25);
            
            // Apply horizontal rotation (player's rotation)
            this.targetCameraOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), state.rotation);
            
            // Create a rotational axis perpendicular to the camera direction in the horizontal plane
            const horizontalDir = new THREE.Vector3(this.targetCameraOffset.x, 0, this.targetCameraOffset.z).normalize();
            const pitchAxis = new THREE.Vector3(-horizontalDir.z, 0, horizontalDir.x);
            
            // Apply vertical rotation (camera pitch)
            this.targetCameraOffset.applyAxisAngle(pitchAxis, cameraPitch);
            
            // Smoothly interpolate current camera offset towards target
            this.currentCameraOffset.lerp(this.targetCameraOffset, this.cameraLerpFactor);
            
            // Apply the smoothed camera offset
            this.camera.position.copy(state.position).add(this.currentCameraOffset);
            
            // Calculate look target with pitch offset
            const lookTarget = new THREE.Vector3(0, 2 + cameraPitch * 10, 0);
            lookTarget.applyAxisAngle(new THREE.Vector3(0, 1, 0), state.rotation);
            lookTarget.add(state.position);
            
            // Look at target point
            this.camera.lookAt(lookTarget);
        }
    }

    removePlayer(playerId: string): void {
        const player = this.playerModels.get(playerId);
        if (player) {
            this.scene.remove(player);
            this.playerModels.delete(playerId);
        }
    }

    createJumpParticles(position: THREE.Vector3): void {
        this.particleSystem.createJumpParticles(position);
    }

    render(): void {
        // Update animation mixer if it exists
        if (this.animationMixer) {
            this.animationMixer.update(this.clock.getDelta());
        }
        
        // Update particle systems
        this.particleSystem.update(1/60); // Assuming ~60fps, could use actual deltaTime
        
        this.renderer.render(this.scene, this.camera);
    }

    dispose(): void {
        // Clean up models
        this.particleSystem.dispose();
        this.renderer.dispose();
        this.scene.traverse((object: THREE.Object3D) => {
            if (object instanceof THREE.Mesh) {
                object.geometry.dispose();
                if (Array.isArray(object.material)) {
                    object.material.forEach((material: THREE.Material) => material.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });
    }

    getCamera(): THREE.PerspectiveCamera {
        return this.camera;
    }
    
    getScene(): THREE.Scene {
        return this.scene;
    }

    getDomElement(): HTMLCanvasElement {
        return this.renderer.domElement;
    }
}
