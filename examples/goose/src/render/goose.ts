import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export class GooseModel {
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
                this.model.scale.set(0.5, 0.5, 0.5);
                this.model.traverse((object: THREE.Object3D) => {
                    if (object instanceof THREE.Mesh) {
                        object.castShadow = true;
                        object.receiveShadow = true;
                    }
                });
            }
        } catch (error) {
            console.error('Error loading goose model:', error);
            // Create a simple cube as fallback
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            const material = new THREE.MeshPhongMaterial({ color: 0xffff00 });
            const cube = new THREE.Mesh(geometry, material);
            this.model = new THREE.Group();
            this.model.add(cube);
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
                    }
                }
            });
        }
    }
}
