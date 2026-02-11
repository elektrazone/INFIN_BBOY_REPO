// src/components/ui/LoadingScreen.tsx
import React from 'react';
import { useGameStore } from '../../store/gameStore';
import '../../styles/main.css';

/**
 * LoadingScreen Component
 * 
 * Displays a full-screen intro loading screen with game instructions.
 * Features a 1940s diner-themed background image explaining gameplay controls.
 * Shows loading spinner while assets load, then shows Start button.
 */
export const LoadingScreen: React.FC = () => {
    const isLoading = useGameStore((state) => state.isLoading);
    const dismissIntroScreen = useGameStore((state) => state.dismissIntroScreen);

    const handleStart = () => {
        dismissIntroScreen();
        // Dispatch a keydown event to trigger the game start flow in playerController
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    };

    return (
        <div className="loading-screen">
            {isLoading && (
                <div className="loading-indicator">
                    <div className="loading-spinner"></div>
                    <div className="loading-text">Loading Assets...</div>
                </div>
            )}
        </div>
    );
};
