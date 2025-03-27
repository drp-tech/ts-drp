import * as THREE from "three";
import { PlayerState, TerrainBlock } from './world';

export class PhysicsEngine {
    static readonly GRAVITY = -80;
    static readonly MAX_SPEED = 600;
    static readonly ACCELERATION = 200;
    static readonly JUMP_FORCE = 40;
    static readonly FRICTION = 0.95;
    static readonly PLAYER_HEIGHT = 2; // Player height for collision detection
    static readonly PLAYER_RADIUS = 1; // Player radius for collision detection

    updatePlayerPhysics(player: PlayerState, terrain: Map<string, TerrainBlock>, deltaTime: number): void {
        // Apply gravity
        player.velocity.y += PhysicsEngine.GRAVITY * deltaTime;

        // Apply horizontal movement friction
        player.velocity.x *= PhysicsEngine.FRICTION;
        player.velocity.z *= PhysicsEngine.FRICTION;

        // Clamp horizontal speed
        const horizontalSpeed = Math.sqrt(
            player.velocity.x * player.velocity.x + 
            player.velocity.z * player.velocity.z
        );
        if (horizontalSpeed > PhysicsEngine.MAX_SPEED) {
            const scale = PhysicsEngine.MAX_SPEED / horizontalSpeed;
            player.velocity.x *= scale;
            player.velocity.z *= scale;
        }

        // Calculate new position
        const newPosition = player.position.clone().add(
            player.velocity.clone().multiplyScalar(deltaTime)
        );

        // Check collision with terrain
        let isOnGround = false;
        
        // First check if we're going to fall through the ground
        const groundCheck = new THREE.Vector3(
            newPosition.x, 
            newPosition.y - PhysicsEngine.PLAYER_HEIGHT/2 - 0.1, // Check slightly below feet
            newPosition.z
        );
        
        for (const block of terrain.values()) {
            // Ground collision check (prevent falling through)
            if (this.pointInBlock(groundCheck, block)) {
                isOnGround = true;
                // Place player on top of the block with a slight offset to ensure visibility
                // Add a small offset (0.05) to ensure the cube bottom is visibly above ground
                newPosition.y = block.position.y + block.size.y/2 + PhysicsEngine.PLAYER_HEIGHT/2 + 0.05;
                player.velocity.y = 0;
                break;
            }
            
            // Full collision check with resolution
            if (this.checkCollision(newPosition, block)) {
                this.resolveCollision(player, newPosition, block);
                // If we're on top of a block, mark as on ground
                if (player.position.y > block.position.y + block.size.y/2 - 0.1) {
                    isOnGround = true;
                }
            }
        }

        // Apply the new position
        player.position.copy(newPosition);
        player.isJumping = !isOnGround;
        
        // Prevent falling below a certain point (safety net)
        if (player.position.y < -200) { 
            console.log("Player fell too far, resetting position");
            player.position.set(0, 15, 0);
            player.velocity.set(0, 0, 0);
        }
    }

    handleJump(player: PlayerState): void {
        // Add debug log before jump
        console.log('Jump requested at position:', player.position.y);
        
        // Allow jumping anytime (infinite jumps)
        player.velocity.y = PhysicsEngine.JUMP_FORCE;
        player.isJumping = true;
        
        // Log jump for debugging
        console.log('Player jumped! New velocity:', player.velocity);
    }
    
    // Check if a point is inside a block
    private pointInBlock(point: THREE.Vector3, block: TerrainBlock): boolean {
        const halfSize = block.size.clone().multiplyScalar(0.5);
        const min = block.position.clone().sub(halfSize);
        const max = block.position.clone().add(halfSize);

        return (
            point.x >= min.x && point.x <= max.x &&
            point.y >= min.y && point.y <= max.y &&
            point.z >= min.z && point.z <= max.z
        );
    }

    private checkCollision(position: THREE.Vector3, block: TerrainBlock): boolean {
        // Use a simplified capsule collision for the player
        const playerBottom = position.clone();
        playerBottom.y -= PhysicsEngine.PLAYER_HEIGHT/2;
        
        const playerTop = position.clone();
        playerTop.y += PhysicsEngine.PLAYER_HEIGHT/2;
        
        const halfSize = block.size.clone().multiplyScalar(0.5);
        const blockMin = block.position.clone().sub(halfSize);
        const blockMax = block.position.clone().add(halfSize);
        
        // Check if the player's bounding cylinder intersects with the block
        const horizontalDistance = new THREE.Vector2(
            Math.max(blockMin.x - position.x, 0, position.x - blockMax.x),
            Math.max(blockMin.z - position.z, 0, position.z - blockMax.z)
        ).length();
        
        const verticalIntersection = 
            (playerBottom.y <= blockMax.y && playerBottom.y >= blockMin.y) ||
            (playerTop.y <= blockMax.y && playerTop.y >= blockMin.y) ||
            (playerBottom.y <= blockMin.y && playerTop.y >= blockMax.y);
            
        return horizontalDistance < PhysicsEngine.PLAYER_RADIUS && verticalIntersection;
    }

    private resolveCollision(player: PlayerState, newPosition: THREE.Vector3, block: TerrainBlock): void {
        const halfSize = block.size.clone().multiplyScalar(0.5);
        const blockMin = block.position.clone().sub(halfSize);
        const blockMax = block.position.clone().add(halfSize);
        
        // Calculate penetration depths for each axis
        const penetrations = [
            blockMin.x - (newPosition.x - PhysicsEngine.PLAYER_RADIUS), // Left
            (newPosition.x + PhysicsEngine.PLAYER_RADIUS) - blockMax.x, // Right
            blockMin.y - (newPosition.y - PhysicsEngine.PLAYER_HEIGHT/2), // Bottom
            (newPosition.y + PhysicsEngine.PLAYER_HEIGHT/2) - blockMax.y, // Top
            blockMin.z - (newPosition.z - PhysicsEngine.PLAYER_RADIUS), // Front
            (newPosition.z + PhysicsEngine.PLAYER_RADIUS) - blockMax.z  // Back
        ];
        
        // Find the axis with the smallest penetration (absolute value)
        let minPenetration = Number.MAX_VALUE;
        let minAxis = -1;
        
        for (let i = 0; i < penetrations.length; i++) {
            const penetration = penetrations[i];
            if (penetration > 0 && penetration < minPenetration) {
                minPenetration = penetration;
                minAxis = i;
            }
        }
        
        // Resolve collision based on the penetration axis
        if (minAxis !== -1) {
            switch (minAxis) {
                case 0: // Left collision
                    newPosition.x = blockMin.x - PhysicsEngine.PLAYER_RADIUS;
                    player.velocity.x = Math.min(0, player.velocity.x);
                    break;
                case 1: // Right collision
                    newPosition.x = blockMax.x + PhysicsEngine.PLAYER_RADIUS;
                    player.velocity.x = Math.max(0, player.velocity.x);
                    break;
                case 2: // Bottom collision
                    newPosition.y = blockMin.y - PhysicsEngine.PLAYER_HEIGHT/2;
                    player.velocity.y = Math.min(0, player.velocity.y);
                    break;
                case 3: // Top collision
                    // Add a small offset (0.05) to ensure the cube bottom is visibly above ground
                    newPosition.y = blockMax.y + PhysicsEngine.PLAYER_HEIGHT/2 + 0.05;
                    player.velocity.y = Math.max(0, player.velocity.y);
                    player.isJumping = false;
                    break;
                case 4: // Front collision
                    newPosition.z = blockMin.z - PhysicsEngine.PLAYER_RADIUS;
                    player.velocity.z = Math.min(0, player.velocity.z);
                    break;
                case 5: // Back collision
                    newPosition.z = blockMax.z + PhysicsEngine.PLAYER_RADIUS;
                    player.velocity.z = Math.max(0, player.velocity.z);
                    break;
            }
        }
    }
}
