import * as THREE from "three";
import { gameState } from '../state';
import { PhysicsEngine } from '../objects/physics';

// Configuration for state update thresholds
const UPDATE_THRESHOLDS = {
    POSITION: 0.01,  // Units of movement required to trigger update
    ROTATION: 0.01,  // Radians of rotation required to trigger update
    VELOCITY: 0.1,   // Velocity magnitude required to trigger update
    SLEEP_VELOCITY: 0.5, // Velocity below which player can enter sleep state
    SLEEP_TIME: 0.5  // Seconds of low activity before entering sleep state
};

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
    private lastSyncTime: number = 0;
    private syncInterval: number = 50; // Sync at most every 50ms
    
    // State tracking for optimization
    private lastPosition: THREE.Vector3 = new THREE.Vector3();
    private lastRotation: number = 0;
    private lastVelocity: THREE.Vector3 = new THREE.Vector3();
    private lastJumpState: boolean = false;
    private hasUserInput: boolean = false;

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

        // Track if we have user input this frame
        const hasInput = this.moveDirection.lengthSq() > 0 || this.isRotating || this.isMouseDown;
        this.hasUserInput = this.hasUserInput || hasInput;

        // Apply movement based on input
        if (this.moveDirection.lengthSq() > 0) {
            // Wake up the player if sleeping
            if (player.userData && player.userData.isSleeping) {
                this.wakeUp(player);
            }
            
            // Create a movement vector that's relative to the player's rotation
            const rotatedMovement = new THREE.Vector3(this.moveDirection.x, 0, this.moveDirection.z);
            rotatedMovement.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rotation);
            
            const force = rotatedMovement.multiplyScalar(PhysicsEngine.ACCELERATION);
            player.velocity.add(force.multiplyScalar(deltaTime));
        }

        // Handle rotation from keyboard
        if (this.isRotating) {
            // Wake up the player if sleeping
            if (player.userData && player.userData.isSleeping) {
                this.wakeUp(player);
            }
            
            const rotationDiff = this.targetRotation - player.rotation;
            const rotationStep = this.rotationSpeed * deltaTime;
            if (Math.abs(rotationDiff) < rotationStep) {
                player.rotation = this.targetRotation;
                this.isRotating = false;
            } else {
                player.rotation += Math.sign(rotationDiff) * rotationStep;
            }
        }

        // Skip physics updates if sleeping
        if (!(player.userData && player.userData.isSleeping)) {
            // Update physics
            this.physics.updatePlayerPhysics(player, world.getTerrain(), deltaTime);
            
            // Check if player can enter sleep state
            const velocityMagnitude = player.velocity.length();
            if (velocityMagnitude < UPDATE_THRESHOLDS.SLEEP_VELOCITY && !hasInput) {
                if (!player.userData) {
                    player.userData = {};
                }
                if (!player.userData.timeInLowActivity) {
                    player.userData.timeInLowActivity = 0;
                }
                player.userData.timeInLowActivity += deltaTime;
                if (player.userData.timeInLowActivity > UPDATE_THRESHOLDS.SLEEP_TIME) {
                    this.putToSleep(player);
                }
            } else {
                if (player.userData) {
                    player.userData.timeInLowActivity = 0;
                }
            }
        }
        
        // Only update state if there are significant changes or we have user input
        if (this.shouldUpdateState(player) || this.hasUserInput) {
            // Update player state in the world
            world.updatePlayerState(
                gameState.playerId,
                player.position,
                player.velocity,
                player.rotation,
                player.isJumping
            );
            
            // Update last known state
            this.lastPosition.copy(player.position);
            this.lastRotation = player.rotation;
            this.lastVelocity.copy(player.velocity);
            this.lastJumpState = player.isJumping;
            
            // Reset user input flag after sending an update
            this.hasUserInput = false;
        }
    }
    
    // Check if the player state has changed enough to warrant an update
    private shouldUpdateState(player: any): boolean {
        // Always update if jumping state changed
        if (player.isJumping !== this.lastJumpState) {
            return true;
        }
        
        // Check position change
        const positionDelta = player.position.distanceTo(this.lastPosition);
        if (positionDelta > UPDATE_THRESHOLDS.POSITION) {
            return true;
        }
        
        // Check rotation change
        const rotationDelta = Math.abs(player.rotation - this.lastRotation);
        if (rotationDelta > UPDATE_THRESHOLDS.ROTATION) {
            return true;
        }
        
        // Check velocity change
        const velocityDelta = new THREE.Vector3()
            .subVectors(player.velocity, this.lastVelocity)
            .length();
        if (velocityDelta > UPDATE_THRESHOLDS.VELOCITY) {
            return true;
        }
        
        // No significant changes
        return false;
    }
    
    // Put player to sleep (disable physics updates)
    private putToSleep(player: any): void {
        if (player.userData && player.userData.isSleeping) return;
        
        console.log('Player entering sleep state');
        
        // Zero out velocity to prevent drift
        player.velocity.set(0, 0, 0);
        
        // Set sleeping flag in player userData
        if (!player.userData) {
            player.userData = {};
        }
        player.userData.isSleeping = true;
        player.userData.lastUpdateTime = Date.now();
        
        // Force one last state update to ensure consistent state
        if (gameState.world) {
            gameState.world.updatePlayerState(
                gameState.playerId!,
                player.position,
                player.velocity,
                player.rotation,
                player.isJumping
            );
            
            // Update last known state
            this.lastPosition.copy(player.position);
            this.lastRotation = player.rotation;
            this.lastVelocity.copy(player.velocity);
            this.lastJumpState = player.isJumping;
        }
    }
    
    // Wake up player (re-enable physics updates)
    private wakeUp(player: any): void {
        if (!(player.userData && player.userData.isSleeping)) return;
        
        console.log('Player waking up from sleep state');
        
        // Clear sleeping flag in player userData
        if (!player.userData) {
            player.userData = {};
        }
        player.userData.isSleeping = false;
        player.userData.lastUpdateTime = Date.now();
        if (player.userData.timeInLowActivity) {
            player.userData.timeInLowActivity = 0;
        }
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
            
            // Wake up player on any key press
            if (gameState.world && gameState.playerId) {
                const player = gameState.world.getPlayerState(gameState.playerId);
                if (player && player.userData && player.userData.isSleeping) {
                    this.wakeUp(player);
                }
            }
            
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
                            // Wake up player if sleeping
                            if (player.userData && player.userData.isSleeping) {
                                this.wakeUp(player);
                            }
                            
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
                            
                            // Update last known state
                            this.lastPosition.copy(player.position);
                            this.lastRotation = player.rotation;
                            this.lastVelocity.copy(player.velocity);
                            this.lastJumpState = player.isJumping;
                            
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
                
                // Wake up player if sleeping
                if (gameState.world && gameState.playerId) {
                    const playerState = gameState.world.getPlayerState(gameState.playerId);
                    if (playerState && playerState.userData && playerState.userData.isSleeping) {
                        this.wakeUp(playerState);
                    }
                }
                
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
        
        // Wake up player if sleeping
        if (player.userData && player.userData.isSleeping) {
            this.wakeUp(player);
        }
        
        const deltaX = event.clientX - this.mouseX;
        this.mouseX = event.clientX;
        
        // Rotate player based on mouse movement
        player.rotation -= deltaX * this.mouseSensitivity;
        
        // Throttle state synchronization to reduce network overhead
        const now = performance.now();
        if (now - this.lastSyncTime > this.syncInterval) {
            this.lastSyncTime = now;
            
            // Check if rotation change exceeds threshold
            const rotationDelta = Math.abs(player.rotation - this.lastRotation);
            if (rotationDelta > UPDATE_THRESHOLDS.ROTATION) {
                // Ensure state synchronization
                if (world && gameState.playerId) {
                    world.updatePlayerState(
                        gameState.playerId,
                        player.position,
                        player.velocity,
                        player.rotation,
                        player.isJumping
                    );
                    
                    // Update last known state
                    this.lastPosition.copy(player.position);
                    this.lastRotation = player.rotation;
                    this.lastVelocity.copy(player.velocity);
                    this.lastJumpState = player.isJumping;
                }
            }
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
