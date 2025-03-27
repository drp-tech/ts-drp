import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { AnimationMixer } from "three";

export class DogemanModel {
    private model: THREE.Group | null;
    private loader: GLTFLoader;
    private mixer: AnimationMixer | null;
    private animations: THREE.AnimationClip[];
    private clock: THREE.Clock;

    constructor() {
        this.model = null;
        this.loader = new GLTFLoader();
        this.mixer = null;
        this.animations = [];
        this.clock = new THREE.Clock();
    }

    async loadModel(url: string): Promise<void> {
        try {
            const gltf = await this.loader.loadAsync(url);
            this.model = gltf.scene;
            
            // Store animations
            this.animations = gltf.animations;
            
            // Configure model
            if (this.model) {
                // Scale the model to be 5x the height of the goose (goose is 0.03)
                this.model.scale.set(0.15, 0.15, 0.15);
                
                this.model.traverse((object: THREE.Object3D) => {
                    if (object instanceof THREE.Mesh) {
                        object.castShadow = true;
                        object.receiveShadow = true;
                        
                        // Ensure materials are visible
                        if (object.material) {
                            if (Array.isArray(object.material)) {
                                object.material.forEach(mat => {
                                    mat.transparent = false;
                                    mat.opacity = 1.0;
                                    if (mat.emissive) {
                                        mat.emissive.set(0x222222);
                                    }
                                });
                            } else {
                                object.material.transparent = false;
                                object.material.opacity = 1.0;
                                if (object.material.emissive) {
                                    object.material.emissive.set(0x222222);
                                }
                            }
                        }
                    }
                });
                
                // Set up animation mixer
                this.mixer = new AnimationMixer(this.model);
                
                // Play all animations if available
                if (this.animations && this.animations.length > 0) {
                    console.log(`Dogeman has ${this.animations.length} animations`);
                    this.animations.forEach(clip => {
                        console.log(`Playing animation: ${clip.name}`);
                        this.mixer?.clipAction(clip).play();
                    });
                } else {
                    console.log('No animations found for dogeman model');
                }
            }
        } catch (error) {
            console.error('Error loading dogeman model:', error);
            // Create a fallback object if the model fails to load
            const geometry = new THREE.BoxGeometry(5, 10, 5);
            const material = new THREE.MeshPhongMaterial({ 
                color: 0xff00ff, 
                emissive: 0x550055 
            });
            const cube = new THREE.Mesh(geometry, material);
            
            this.model = new THREE.Group();
            this.model.add(cube);
            console.log('Created fallback for dogeman model');
        }
    }

    getModel(): THREE.Group | null {
        return this.model;
    }

    setPosition(position: THREE.Vector3): void {
        if (this.model) {
            this.model.position.copy(position);
        }
    }

    setRotation(rotation: number): void {
        if (this.model) {
            this.model.rotation.y = rotation;
        }
    }
    
    update(deltaTime: number): void {
        // Update animation mixer
        if (this.mixer) {
            this.mixer.update(deltaTime);
        }
    }

    dispose(): void {
        if (this.mixer) {
            this.mixer.stopAllAction();
        }
        
        if (this.model) {
            this.model.traverse((object: THREE.Object3D) => {
                if (object instanceof THREE.Mesh) {
                    object.geometry.dispose();
                    if (object.material instanceof THREE.Material) {
                        object.material.dispose();
                    } else if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    }
                }
            });
        }
    }
}
