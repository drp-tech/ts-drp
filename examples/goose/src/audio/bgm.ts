import * as THREE from "three";

export class AudioManager {
    private listener: THREE.AudioListener;
    private bgm: THREE.Audio;
    private isInitialized: boolean = false;

    constructor() {
        this.listener = new THREE.AudioListener();
        this.bgm = new THREE.Audio(this.listener);
    }

    async initialize(camera: THREE.Camera): Promise<void> {
        if (this.isInitialized) return;

        camera.add(this.listener);
        
        try {
            const audioLoader = new THREE.AudioLoader();
            const buffer = await audioLoader.loadAsync('/assets/audio/bgm.mp3');
            
            this.bgm.setBuffer(buffer);
            this.bgm.setLoop(true);
            this.bgm.setVolume(0.5);
            
            this.isInitialized = true;
        } catch (error) {
            console.error('Failed to load background music:', error);
        }
    }

    play(): void {
        if (this.isInitialized && !this.bgm.isPlaying) {
            this.bgm.play();
        }
    }

    pause(): void {
        if (this.isInitialized && this.bgm.isPlaying) {
            this.bgm.pause();
        }
    }

    setVolume(volume: number): void {
        if (this.isInitialized) {
            this.bgm.setVolume(Math.max(0, Math.min(1, volume)));
        }
    }

    dispose(): void {
        if (this.isInitialized) {
            this.bgm.stop();
            this.bgm.disconnect();
        }
    }
}
