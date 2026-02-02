// src/components/ui/uiManager.ts
import { useGameStore } from '../../store/gameStore';
import { getAudioManager } from '../audio/audioManager';

export interface UIManager {
    updateCoinCount(count: number): void;
    dispose(): void;
}

export function createUIManager(): UIManager {
    // No longer create DOM elements manually - React handles the UI
    // This manager now only acts as a bridge between Babylon and Zustand

    let currentCount = 0;

    function updateCoinCount(count: number) {
        currentCount = count;
        // Update Zustand store - React will automatically re-render
        useGameStore.getState().updateCoinCount(currentCount);
    }

    // Listen for custom event from playerController
    const onCoinCollected = (e: Event) => {
        const customEvent = e as CustomEvent;
        const added = customEvent.detail.count * 10; // Coin value set to 10
        const newCount = currentCount + added;
        updateCoinCount(newCount);

        // Play coin sound effect
        const audio = getAudioManager();
        if (audio) audio.playSFX("sfx_coin");
    };

    window.addEventListener("coinCollected", onCoinCollected);

    function dispose() {
        window.removeEventListener("coinCollected", onCoinCollected);
        // No DOM cleanup needed - React handles its own cleanup
    }

    return { updateCoinCount, dispose };
}
