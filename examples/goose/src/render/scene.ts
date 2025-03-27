import * as THREE from "three";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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
    private particleSystem: ParticleSystem;
    private currentCameraOffset: THREE.Vector3;
    private targetCameraOffset: THREE.Vector3;
    private cameraLerpFactor: number = 0.1; // Smoothing factor for camera movement

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

        // Load the goose model
        this.loadGooseModel();

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
        // Update particle systems
        this.particleSystem.update(1/60); // Assuming ~60fps, could use actual deltaTime
        
        this.renderer.render(this.scene, this.camera);
    }

    dispose(): void {
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
