import { ActionType, type IDRP, type ResolveConflictsType, SemanticsType, type Vertex } from "@ts-drp/types";

import * as THREE from "three";

// No need for this interface as we're using inline types
// interface SerializableVector3 {
//     x: number;
//     y: number;
//     z: number;
// }

export interface PlayerState {
    id: string;
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    rotation: number;
    isJumping: boolean;
    userData?: {
        isSleeping?: boolean;
        lastUpdateTime?: number;
        timeInLowActivity?: number;
    };
}

export interface TerrainBlock {
    position: THREE.Vector3;
    size: THREE.Vector3;
}

export class GooseWorld implements IDRP {
    static terrainSerialized = false;
    semanticsType: SemanticsType = SemanticsType.pair;
    private players: Map<string, PlayerState>;
    private terrain: Map<string, TerrainBlock>;

    constructor() {
        this.players = new Map();
        this.terrain = new Map();
        this.initializeTerrain();
    }

    private initializeTerrain(): void {
        // Create ground
        const ground: TerrainBlock = {
            position: new THREE.Vector3(0, -1, 0),
            size: new THREE.Vector3(200, 2, 200)
        };
        this.terrain.set('ground', ground);

        // Create some platforms
        const platforms: TerrainBlock[] = [
            {
                position: new THREE.Vector3(5, 2, 5),
                size: new THREE.Vector3(3, 1, 3)
            },
            {
                position: new THREE.Vector3(-5, 4, -5),
                size: new THREE.Vector3(3, 1, 3)
            },
            {
                position: new THREE.Vector3(0, 6, 0),
                size: new THREE.Vector3(3, 1, 3)
            }
        ];

        platforms.forEach((platform, index) => {
            this.terrain.set(`platform_${index}`, platform);
        });
    }
    
    // Implement toJSON for DRP serialization
    toJSON(): any {
        // Convert maps to serializable objects
        const serializedPlayers: Record<string, any> = {};
        for (const [id, player] of this.players.entries()) {
            serializedPlayers[id] = {
                id: player.id,
                position: {
                    x: player.position.x,
                    y: player.position.y,
                    z: player.position.z
                },
                velocity: {
                    x: player.velocity.x,
                    y: player.velocity.y,
                    z: player.velocity.z
                },
                rotation: player.rotation,
                isJumping: player.isJumping,
                userData: player.userData
            };
        }
        
        // Only serialize terrain once to reduce payload size
        // Use a static flag to track if terrain has been sent
        if (!GooseWorld.terrainSerialized) {
            const serializedTerrain: Record<string, any> = {};
            for (const [id, block] of this.terrain.entries()) {
                serializedTerrain[id] = {
                    position: {
                        x: block.position.x,
                        y: block.position.y,
                        z: block.position.z
                    },
                    size: {
                        x: block.size.x,
                        y: block.size.y,
                        z: block.size.z
                    }
                };
            }
            GooseWorld.terrainSerialized = true;
            return {
                players: serializedPlayers,
                terrain: serializedTerrain
            };
        } else {
            // After first sync, only send player data to reduce payload size
            return {
                players: serializedPlayers
            };
        }
    }
    
    // Implement fromJSON for DRP deserialization
    fromJSON(json: any): void {
        // Reduce logging to improve performance
        if (json.players) {
            // Don't clear the players map to avoid resetting local player
            // this.players.clear();
            
            for (const id in json.players) {
                const p = json.players[id];
                const existingPlayer = this.players.get(id);
                
                if (existingPlayer) {
                    // Update existing player without creating a new Vector3
                    existingPlayer.position.set(p.position.x, p.position.y, p.position.z);
                    existingPlayer.velocity.set(p.velocity.x, p.velocity.y, p.velocity.z);
                    existingPlayer.rotation = p.rotation;
                    existingPlayer.isJumping = p.isJumping;
                    existingPlayer.userData = p.userData;
                } else {
                    // Create new player
                    this.players.set(id, {
                        id: p.id,
                        position: new THREE.Vector3(p.position.x, p.position.y, p.position.z),
                        velocity: new THREE.Vector3(p.velocity.x, p.velocity.y, p.velocity.z),
                        rotation: p.rotation,
                        isJumping: p.isJumping,
                        userData: p.userData
                    });
                }
            }
        }
        
        if (json.terrain && Object.keys(this.terrain).length === 0) {
            // Only initialize terrain if it's empty
            this.terrain.clear();
            for (const id in json.terrain) {
                const t = json.terrain[id];
                this.terrain.set(id, {
                    position: new THREE.Vector3(t.position.x, t.position.y, t.position.z),
                    size: new THREE.Vector3(t.size.x, t.size.y, t.size.z)
                });
            }
        }
    }

    resolveConflicts(_vertices: Vertex[]): ResolveConflictsType {
        return { action: ActionType.Nop };
    }

    addPlayer(playerId: string): void {
        console.log('Adding player:', playerId.slice(0, 8));
        const playerState: PlayerState = {
            id: playerId,
            position: new THREE.Vector3(0, 10, 0),
            velocity: new THREE.Vector3(0, 0, 0),
            rotation: 0,
            isJumping: false
        };
        this.players.set(playerId, playerState);
        console.log('Player added with position:', {...playerState.position});
    }

    removePlayer(playerId: string): void {
        this.players.delete(playerId);
    }

    updatePlayerState(playerId: string, position: THREE.Vector3, velocity: THREE.Vector3, rotation: number, isJumping: boolean): void {
        const player = this.players.get(playerId);
        if (player) {
            // Use set instead of copy to avoid reference issues
            player.position.set(position.x, position.y, position.z);
            player.velocity.set(velocity.x, velocity.y, velocity.z);
            player.rotation = rotation;
            player.isJumping = isJumping;
        } else {
            console.warn('Attempted to update non-existent player:', playerId.slice(0, 8));
        }
    }

    updatePlayerUserData(playerId: string, userData: { isSleeping?: boolean; lastUpdateTime?: number; timeInLowActivity?: number }): void {
        const player = this.players.get(playerId);
        if (player) {
            player.userData = userData;
        } else {
            console.warn('Attempted to update non-existent player:', playerId.slice(0, 8));
        }
    }

    getPlayerState(playerId: string): PlayerState | undefined {
        return this.players.get(playerId);
    }

    getAllPlayers(): PlayerState[] {
        return Array.from(this.players.values());
    }

    getTerrain(): Map<string, TerrainBlock> {
        return this.terrain;
    }
}
