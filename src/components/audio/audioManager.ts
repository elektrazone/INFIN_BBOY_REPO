// src/components/audio/audioManager.ts
// Using native HTML5 Audio API for better browser compatibility

/**
 * AudioManager - Centralized audio system for the game
 * Uses native HTML5 Audio for maximum browser compatibility
 */

export interface AudioManagerController {
    playMusic(name: string, loop?: boolean): void;
    stopMusic(): void;
    playSFX(name: string): void;
    setMusicVolume(volume: number): void;
    setSFXVolume(volume: number): void;
    unlockAudio(): void;
    dispose(): void;
}

// Available sound assets
const SOUNDS: Record<string, string> = {
    // Music
    music_loading: "/sounds/music_loading.mp3",
    music_theme: "/sounds/music_theme.mp3",
    music_victory: "/sounds/music_victory.mp3",

    // Sound Effects
    sfx_coin: "/sounds/sfx_coin.wav",
    sfx_crash_gameover: "/sounds/sfx_crash_gameover.wav",
    sfx_dance_finish: "/sounds/sfx_dance_finish.wav",
    sfx_fireworks: "/sounds/sfx_fireworks.wav",
    sfx_hit_life: "/sounds/sfx_hit_life.wav",
    sfx_hit_life_b: "/sounds/sfx_hit_life_b.wav",
    sfx_jump: "/sounds/sfx_jump.wav",
    sfx_slide: "/sounds/sfx_slide.wav",
    sfx_ui_click: "/sounds/sfx_ui_click.wav",
};

export type SoundName = keyof typeof SOUNDS;

export function createAudioManager(): AudioManagerController {
    // DEMO MODE: Set to true to mute all audio for recording
    const DEMO_MUTE = false;

    let currentMusic: HTMLAudioElement | null = null;
    let musicVolume = 0.5;
    let sfxVolume = 0.7;
    let activeAudioContext: any = null;

    // Cache for loaded audio elements
    const audioCache: Map<string, HTMLAudioElement> = new Map();

    /**
     * Get or create an audio element
     */
    function getAudio(name: string): HTMLAudioElement {
        const cached = audioCache.get(name);
        if (cached) return cached;

        const url = SOUNDS[name];
        if (!url) {
            console.warn(`⚠️ Unknown sound: ${name}`);
            return new Audio();
        }

        const audio = new Audio(url);
        audioCache.set(name, audio);
        console.log(`🔊 Created audio element: ${name}`);
        return audio;
    }

    /**
     * Unlock audio - plays a silent sound to unlock audio on user interaction
     */
    function unlockAudio(): void {
        // Create a silent audio context to unlock audio
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
            const ctx = new AudioContextClass();
            activeAudioContext = ctx;
            const buffer = ctx.createBuffer(1, 1, 22050);
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            source.start(0);
        }

        // Unlock HTML5 Audio elements
        // Browsers require audio elements to be played within a user gesture.
        // We playfully silence them so they can be played programmatically later.
        const warmup = ["sfx_jump"];
        warmup.forEach(name => getAudio(name)); // Ensure they are cached

        audioCache.forEach((audio, name) => {
            if (audio !== currentMusic) {
                const prevVolume = audio.volume;
                audio.volume = 0; // Mute during warmup
                const p = audio.play();
                if (p !== undefined) {
                    p.then(() => {
                        if (audio !== currentMusic) {
                            audio.pause();
                            audio.currentTime = 0;
                        }
                        audio.volume = prevVolume;
                    }).catch(() => {
                        audio.volume = prevVolume;
                    });
                }
            }
        });

        console.log("🔓 Audio unlocked via AudioContext and HTML5 warmup");
    }

    let pendingMusic: string | null = null;
    let fallbackListenerAttached = false;

    // Attach a global listener to ensure music plays upon interaction if it was deferred or blocked
    function attachInteractionFallback() {
        if (fallbackListenerAttached) return;
        fallbackListenerAttached = true;
        const trigger = () => {
            if (pendingMusic) {
                console.log("🎵 Recovering blocked music via global interaction listener...");
                const musicToPlay = pendingMusic;
                pendingMusic = null;
                playMusic(musicToPlay, true);
            }
            window.removeEventListener("keydown", trigger);
            window.removeEventListener("pointerdown", trigger);
            window.removeEventListener("touchstart", trigger);
            fallbackListenerAttached = false;
        };
        window.addEventListener("keydown", trigger);
        window.addEventListener("pointerdown", trigger);
        window.addEventListener("touchstart", trigger);
    }

    /**
     * Play background music (stops any currently playing music)
     */
    function playMusic(name: string, loop: boolean = true): void {
        if (DEMO_MUTE) return;
        
        // Always track the last requested music, even if blocked
        pendingMusic = name;

        // Stop current music if playing
        if (currentMusic) {
            currentMusic.pause();
            currentMusic.currentTime = 0;
            currentMusic = null;
        }

        const audio = getAudio(name);
        audio.loop = loop;
        audio.volume = musicVolume;
        
        // Immediately set currentMusic so unlockAudio() knows not to asynchronously pause it
        currentMusic = audio;

        audio.play()
            .then(() => {
                console.log(`🎵 Playing music: ${name}`);
                pendingMusic = null; // Successfully played!
            })
            .catch((err) => {
                console.warn(`⚠️ Music blocked by browser (${name}), queueing for next user interaction`);
                currentMusic = null;
                attachInteractionFallback();
            });
    }

    /**
     * Stop the currently playing music
     */
    function stopMusic(): void {
        if (currentMusic) {
            currentMusic.pause();
            currentMusic.currentTime = 0;
            currentMusic = null;
            console.log("🎵 Music stopped");
        }
    }

    /**
     * Play a one-shot sound effect
     */
    function playSFX(name: string): void {
        if (DEMO_MUTE) return;
        const audio = getAudio(name);

        // Clone the audio for overlapping playback
        const clone = audio.cloneNode() as HTMLAudioElement;
        clone.volume = sfxVolume;

        clone.play().catch((err) => {
            console.error(`❌ Failed to play SFX: ${name}`, err);
        });
    }

    /**
     * Set music volume (0-1)
     */
    function setMusicVolume(volume: number): void {
        musicVolume = Math.max(0, Math.min(1, volume));
        if (currentMusic) {
            currentMusic.volume = musicVolume;
        }
    }

    /**
     * Set sound effects volume (0-1)
     */
    function setSFXVolume(volume: number): void {
        sfxVolume = Math.max(0, Math.min(1, volume));
    }

    /**
     * Clean up all audio
     */
    function dispose(): void {
        stopMusic();
        audioCache.forEach((audio) => {
            audio.pause();
            audio.src = "";
        });
        audioCache.clear();
        
        if (activeAudioContext && typeof activeAudioContext.close === 'function') {
            activeAudioContext.close();
            activeAudioContext = null;
        }
        
        console.log("🔇 Audio manager disposed and Contexts closed");
    }

    console.log("🔊 Audio manager initialized (HTML5 Audio)");

    return {
        playMusic,
        stopMusic,
        playSFX,
        setMusicVolume,
        setSFXVolume,
        unlockAudio,
        dispose,
    };
}

// Singleton instance for easy access from other modules
let audioManagerInstance: AudioManagerController | null = null;

export function initAudioManager(): AudioManagerController {
    if (!audioManagerInstance) {
        audioManagerInstance = createAudioManager();
    }
    return audioManagerInstance;
}

export function getAudioManager(): AudioManagerController | null {
    return audioManagerInstance;
}
