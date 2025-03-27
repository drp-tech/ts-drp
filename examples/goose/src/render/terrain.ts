import * as THREE from "three";
import { TerrainBlock } from '../objects/world';

export class TerrainGenerator {
    static createTerrainGeometry(block: TerrainBlock): THREE.BufferGeometry {
        return new THREE.BoxGeometry(
            block.size.x,
            block.size.y,
            block.size.z
        );
    }

    static createTerrainMaterial(): THREE.Material {
        return new THREE.MeshPhongMaterial({
            color: 0x808080,
            shininess: 30,
            flatShading: true
        });
    }

    static createTerrainMesh(block: TerrainBlock): THREE.Mesh {
        const geometry = this.createTerrainGeometry(block);
        const material = this.createTerrainMaterial();
        const mesh = new THREE.Mesh(geometry, material);
        
        mesh.position.copy(block.position);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        return mesh;
    }
}
