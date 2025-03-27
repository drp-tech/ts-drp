import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export class McDonaldsModel {
    private model: THREE.Group | null;
    private loader: GLTFLoader;

    constructor() {
        this.model = null;
        this.loader = new GLTFLoader();
    }

    async loadModel(url: string): Promise<void> {
        try {
            const gltf = await this.loader.loadAsync(url);
            this.model = gltf.scene;
            
            // Configure model
            if (this.model) {
                // Scale the model to be 3x the height of the goose (goose is 0.03)
                this.model.scale.set(0.09, 0.09, 0.09);
                
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
            }
        } catch (error) {
            console.error('Error loading mcdonalds model:', error);
            // Create a fallback object if the model fails to load
            const geometry = new THREE.BoxGeometry(5, 10, 5);
            const material = new THREE.MeshPhongMaterial({ 
                color: 0x00ffff, 
                emissive: 0x005555 
            });
            const cube = new THREE.Mesh(geometry, material);
            
            this.model = new THREE.Group();
            this.model.add(cube);
            console.log('Created fallback for mcdonalds model');
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

    dispose(): void {
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
