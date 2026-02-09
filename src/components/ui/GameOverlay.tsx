// src/components/ui/GameOverlay.tsx
import React from 'react';
import { useGameStore } from '../../store/gameStore';
import { LoadingScreen } from './LoadingScreen';
import { CountdownOverlay } from './CountdownOverlay';
import { OutroScreen } from './OutroScreen';
import { HeartIcon, HeartEmptyIcon, CoinIcon } from './HudIcons';
import PerformanceMonitor from './PerformanceMonitor';
import '../../styles/main.css';

/**
 * GameOverlay Component
 * 
 * Main React overlay that displays game UI elements on top of the Babylon.js canvas.
 * This component reads state from the Zustand store and renders UI accordingly.
 * 
 * Design principles:
 * - Uses pointer-events: none to allow clicks to pass through to the canvas
 * - Positioned absolutely to overlay the game canvas
 * - Subscribes to Zustand store for automatic updates when state changes
 */
export const GameOverlay: React.FC = () => {

    // Subscribe to game state from Zustand store
    // Components will automatically re-render when these values change
    const showIntroScreen = useGameStore((state) => state.showIntroScreen);
    const coinCount = useGameStore((state) => state.coinCount);
    const lives = useGameStore((state) => state.lives);
    const gameState = useGameStore((state) => state.gameState);
    const activePowerUps = useGameStore((state) => state.activePowerUps);

    // Match timer state
    const matchTimeRemaining = useGameStore((state) => state.matchTimeRemaining);
    const isMatchTimerActive = useGameStore((state) => state.isMatchTimerActive);

    // Format time as MM:SS
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Show intro/loading screen until user taps start
    if (showIntroScreen) {
        return <LoadingScreen />;
    }

    return (
        <div className="game-overlay-container">
            {/* Performance Monitor - Press ` to toggle (dev only) */}
            {process.env.NODE_ENV === 'development' && <PerformanceMonitor />}
            {/* Countdown Overlay */}
            <CountdownOverlay />
            <div className="left-hud-stack">
                {/* Lives Counter */}
                <div className="lives-container">
                    <span className="lives-label">Lives:</span>
                    <div className="hearts-container">
                        {Array.from({ length: Math.max(0, lives) }).map((_, index) => (
                            <HeartIcon key={index} className="hud-icon heart" />
                        ))}
                        {/* Show empty hearts for lost lives */}
                        {Array.from({ length: Math.max(0, 3 - lives) }).map((_, index) => (
                            <HeartEmptyIcon key={`empty-${index}`} className="hud-icon empty-heart" />
                        ))}
                    </div>
                </div>

                {/* Coin Counter */}
                <div className="coin-counter">
                    <CoinIcon className="hud-icon coin-icon" />
                    <span className="coin-count">{coinCount}</span>
                </div>
            </div>

            {/* Match Timer Display - Moved to right via CSS */}
            {isMatchTimerActive && (
                <div className={`match-timer ${matchTimeRemaining <= 10 ? 'timer-warning' : ''}`}>
                    {formatTime(matchTimeRemaining)}
                </div>
            )}

            {/* Power-ups Display - Prepared for future use */}
            {activePowerUps.length > 0 && (
                <div className="powerups-container">
                    {activePowerUps.map((powerUp) => (
                        <div key={powerUp.type} className="powerup-icon">
                            ⚡ {powerUp.type}
                        </div>
                    ))}
                </div>
            )}

            {/* Game Over Screen - Conditional */}
            {gameState === 'gameover' && (
                <div className="gameover-overlay">
                    <div className="gameover-text">
                        {matchTimeRemaining <= 0 ? "TIME'S UP!" : "GAME OVER"}
                    </div>
                </div>
            )}

            {/* Victory Screen - Conditional */}
            {gameState === 'victory' && (
                <OutroScreen />
            )}
        </div>
    );
};

