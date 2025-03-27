import * as THREE from "three";

export class ParticleSystem {
    private scene: THREE.Scene;
    private particles: THREE.Points[] = [];
    
    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }
    
    createJumpParticles(position: THREE.Vector3): void {
        // Create a new particle system for the jump
        const particleCount = 20;
        const geometry = new THREE.BufferGeometry();
        
        // Create positions array for particles
        const positions = new Float32Array(particleCount * 3);
        const velocities: THREE.Vector3[] = [];
        const colors = new Float32Array(particleCount * 3);
        
        // Create particles in a circle around the player's feet
        for (let i = 0; i < particleCount; i++) {
            // Random position in a circle around the player's feet
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 1.5;
            const x = position.x + Math.cos(angle) * radius;
            const y = position.y - 1; // At the feet level
            const z = position.z + Math.sin(angle) * radius;
            
            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;
            
            // Random upward and outward velocity
            velocities.push(new THREE.Vector3(
                (Math.random() - 0.5) * 5,
                Math.random() * 10 + 5,
                (Math.random() - 0.5) * 5
            ));
            
            // Cyan color with some variation
            colors[i * 3] = 0;
            colors[i * 3 + 1] = 0.8 + Math.random() * 0.2; // Green
            colors[i * 3 + 2] = 0.8 + Math.random() * 0.2; // Blue
        }
        
        // Set geometry attributes
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        // Create material
        const material = new THREE.PointsMaterial({
            size: 0.5,
            vertexColors: true,
            transparent: true,
            opacity: 0.8
        });
        
        // Create points
        const points = new THREE.Points(geometry, material);
        this.scene.add(points);
        
        // Store particles with their velocities
        this.particles.push(points);
        points.userData = { 
            velocities, 
            lifetime: 1.0, // Lifetime in seconds
            age: 0 
        };
    }
    
    update(deltaTime: number): void {
        // Update all particle systems
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const points = this.particles[i];
            const userData = points.userData;
            
            // Update age
            userData.age += deltaTime;
            
            // Remove if too old
            if (userData.age >= userData.lifetime) {
                this.scene.remove(points);
                this.particles.splice(i, 1);
                continue;
            }
            
            // Update opacity based on age
            const material = points.material as THREE.PointsMaterial;
            material.opacity = 1.0 - (userData.age / userData.lifetime);
            
            // Update positions
            const positions = (points.geometry as THREE.BufferGeometry).attributes.position.array as Float32Array;
            
            for (let j = 0; j < userData.velocities.length; j++) {
                const velocity = userData.velocities[j];
                
                // Apply gravity
                velocity.y -= 9.8 * deltaTime;
                
                // Update position
                positions[j * 3] += velocity.x * deltaTime;
                positions[j * 3 + 1] += velocity.y * deltaTime;
                positions[j * 3 + 2] += velocity.z * deltaTime;
            }
            
            // Mark the attribute as needing an update
            (points.geometry as THREE.BufferGeometry).attributes.position.needsUpdate = true;
        }
    }
    
    dispose(): void {
        // Clean up all particle systems
        for (const points of this.particles) {
            this.scene.remove(points);
            points.geometry.dispose();
            (points.material as THREE.Material).dispose();
        }
        this.particles = [];
    }
}
