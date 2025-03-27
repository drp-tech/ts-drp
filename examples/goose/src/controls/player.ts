import * as THREE from "three";
import { gameState } from '../state';
import { PhysicsEngine } from '../objects/physics';

export class PlayerController {
    private physics: PhysicsEngine;
    private moveDirection: THREE.Vector3;
    private rotationSpeed: number;
    private isRotating: boolean;
    private targetRotation: number;
    private mouseSensitivity: number;
    private mouseX: number;
    private mouseY: number;
    private isMouseDown: boolean;
    private canvas: HTMLCanvasElement | null;

    constructor(physics: PhysicsEngine) {
        this.physics = physics;
        this.moveDirection = new THREE.Vector3();
        this.rotationSpeed = 3;
        this.isRotating = false;
        this.targetRotation = 0;
        this.mouseSensitivity = 0.005;
        this.mouseX = 0;
        this.mouseY = 0;
        this.isMouseDown = false;
        this.canvas = null;
        
        // Wait for DOM to be fully loaded before setting up controls
        if (document.readyState === 'complete') {
            this.setupControls();
        } else {
            window.addEventListener('load', () => this.setupControls());
        }
    }

    update(deltaTime: number): void {
        const world = gameState.world;
        if (!world || !gameState.playerId) return;

        const player = world.getPlayerState(gameState.playerId);
        if (!player) return;

        // Apply movement based on input
        if (this.moveDirection.lengthSq() > 0) {
            // Create a movement vector that's relative to the player's rotation
            const rotatedMovement = new THREE.Vector3(this.moveDirection.x, 0, this.moveDirection.z);
            rotatedMovement.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rotation);
            
            const force = rotatedMovement.multiplyScalar(PhysicsEngine.ACCELERATION);
            player.velocity.add(force.multiplyScalar(deltaTime));
        }

        // Handle rotation from keyboard
        if (this.isRotating) {
            const rotationDiff = this.targetRotation - player.rotation;
            const rotationStep = this.rotationSpeed * deltaTime;
            if (Math.abs(rotationDiff) < rotationStep) {
                player.rotation = this.targetRotation;
                this.isRotating = false;
            } else {
                player.rotation += Math.sign(rotationDiff) * rotationStep;
            }
        }

        // Update physics
        this.physics.updatePlayerPhysics(player, world.getTerrain(), deltaTime);
        
        // Update player state in the world
        world.updatePlayerState(
            gameState.playerId,
            player.position,
            player.velocity,
            player.rotation,
            player.isJumping
        );
    }

    private setupControls(): void {
        console.log("Setting up controls");
        
        // Get the canvas element - this is critical for mouse controls
        this.canvas = document.querySelector('canvas');
        if (!this.canvas) {
            console.error("Canvas element not found!");
            // Try to get the renderer's domElement directly if available
            if (gameState.renderer) {
                this.canvas = gameState.renderer.getDomElement();
                console.log("Using renderer's domElement as canvas");
            }
        } else {
            console.log("Canvas element found");
        }
        
        this.setupKeyboardControls();
        this.setupMouseControls();
    }
    
    private setupKeyboardControls(): void {
        console.log("Setting up keyboard controls");
        
        // Add a global event listener for key presses
        document.addEventListener('keydown', (event) => {
            console.log("Key pressed:", event.code);
            
            switch (event.code) {
                case 'KeyW':
                    this.moveDirection.z = 1; 
                    console.log("W pressed - moveDirection:", this.moveDirection);
                    break;
                case 'KeyS':
                    this.moveDirection.z = -1; 
                    console.log("S pressed - moveDirection:", this.moveDirection);
                    break;
                case 'KeyA':
                    this.moveDirection.x = 1; 
                    console.log("A pressed - moveDirection:", this.moveDirection);
                    break;
                case 'KeyD':
                    this.moveDirection.x = -1; 
                    console.log("D pressed - moveDirection:", this.moveDirection);
                    break;
                case 'Space':
                    console.log("Space key pressed - calling physics.handleJump()");
                    if (gameState.world && gameState.playerId) {
                        const player = gameState.world.getPlayerState(gameState.playerId);
                        if (player) {
                            // Apply jump physics
                            this.physics.handleJump(player);
                            
                            // Create particle effect
                            if (gameState.renderer) {
                                gameState.renderer.createJumpParticles(player.position.clone());
                            }
                            
                            // Make sure to update the player state in the world
                            gameState.world.updatePlayerState(
                                gameState.playerId,
                                player.position,
                                player.velocity,
                                player.rotation,
                                player.isJumping
                            );
                            
                            console.log("Jump applied with velocity:", player.velocity.y);
                        }
                    }
                    break;
                case 'KeyQ':
                    this.startRotation(-Math.PI / 2);
                    break;
                case 'KeyE':
                    this.startRotation(Math.PI / 2);
                    break;
            }
        });

        document.addEventListener('keyup', (event) => {
            switch (event.code) {
                case 'KeyW':
                case 'KeyS':
                    this.moveDirection.z = 0;
                    console.log("W/S released - moveDirection:", this.moveDirection);
                    break;
                case 'KeyA':
                case 'KeyD':
                    this.moveDirection.x = 0;
                    console.log("A/D released - moveDirection:", this.moveDirection);
                    break;
            }
        });
        
        console.log("Keyboard controls setup complete");
    }
    
    private setupMouseControls(): void {
        if (!this.canvas) {
            console.error("Cannot set up mouse controls: canvas is null");
            return;
        }
        
        console.log("Setting up mouse controls on canvas:", this.canvas);
        
        // Direct mouse down/up handlers on the canvas
        this.canvas.addEventListener('mousedown', (event) => {
            if (event.button === 0) { // Left button only
                this.isMouseDown = true;
                this.mouseX = event.clientX;
                this.mouseY = event.clientY;
                document.body.style.cursor = 'none';
                
                console.log('Mouse down detected at', this.mouseX, this.mouseY);
                
                // Capture mouse movement on the whole document while mouse is down
                document.addEventListener('mousemove', this.handleMouseMove);
            }
        });
        
        // Listen for mouse up on the document (in case mouse is released outside canvas)
        document.addEventListener('mouseup', (event) => {
            if (event.button === 0 && this.isMouseDown) {
                this.isMouseDown = false;
                document.body.style.cursor = 'auto';
                document.removeEventListener('mousemove', this.handleMouseMove);
                console.log('Mouse up detected');
            }
        });
        
        // Also listen for mouse leave on the document to handle edge cases
        document.addEventListener('mouseleave', () => {
            if (this.isMouseDown) {
                this.isMouseDown = false;
                document.body.style.cursor = 'auto';
                document.removeEventListener('mousemove', this.handleMouseMove);
                console.log('Mouse left window');
            }
        });
        
        console.log("Mouse controls setup complete");
    }
    
    // Use an arrow function to maintain 'this' context
    private handleMouseMove = (event: MouseEvent): void => {
        if (!this.isMouseDown || !gameState.isWorldInitialized()) return;
        
        const world = gameState.world;
        if (!world || !gameState.playerId) return;
        
        const player = world.getPlayerState(gameState.playerId);
        if (!player) return;
        
        const deltaX = event.clientX - this.mouseX;
        this.mouseX = event.clientX;
        
        // Rotate player based on mouse movement
        player.rotation -= deltaX * this.mouseSensitivity;
        
        // Log rotation for debugging
        console.log(`Mouse moved: deltaX=${deltaX}, new rotation=${player.rotation}`);
        
        // Ensure state synchronization
        if (world && gameState.playerId) {
            world.updatePlayerState(
                gameState.playerId,
                player.position,
                player.velocity,
                player.rotation,
                player.isJumping
            );
        }
    };

    private startRotation(angle: number): void {
        if (!gameState.world || !gameState.playerId) return;

        const player = gameState.world.getPlayerState(gameState.playerId);
        if (!player) return;

        this.isRotating = true;
        this.targetRotation = player.rotation + angle;
    }
}
