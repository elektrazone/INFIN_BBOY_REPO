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

    // Check for debug zones param (supports ?debug=zones or #debug=zones)
    const isDebugZones = new URLSearchParams(window.location.search).get('debug') === 'zones' ||
        window.location.hash === '#debug=zones' ||
        window.location.hash.includes('debug=zones');

    if (isDebugZones) {
        console.log("🛠️ TOUCH ZONES DEBUG ACTIVE");
    }

    return (
        <div className="game-overlay-container">
            {/* Performance Monitor - Press ` to toggle (dev only) */}
            {process.env.NODE_ENV === 'development' && <PerformanceMonitor />}

            {/* TOUCH ZONES DEBUG OVERLAY - Always rendered if param is present */}
            {isDebugZones && (
                <div className="touch-zones-debug">
                    <div className="touch-hud-deadzone"><span>NO TOUCH (HUD)</span></div>
                    <div className="touch-active-area">
                        <div className="touch-zone left"><span>MOVE LEFT</span></div>
                        <div className="touch-zone-column">
                            <div className="touch-zone jump"><span>JUMP</span></div>
                            <div className="touch-zone slide"><span>SLIDE</span></div>
                        </div>
                        <div className="touch-zone right"><span>MOVE RIGHT</span></div>
                    </div>
                </div>
            )}

            {/* Conditional Game States */}
            {showIntroScreen ? (
                <LoadingScreen />
            ) : (
                <>
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

                    {/* Match Timer Display */}
                    {isMatchTimerActive && (
                        <div className={`match-timer ${matchTimeRemaining <= 10 ? 'timer-warning' : ''}`}>
                            {formatTime(matchTimeRemaining)}
                        </div>
                    )}

                    {/* Power-ups Display */}
                    {activePowerUps.length > 0 && (
                        <div className="powerups-container">
                            {activePowerUps.map((powerUp) => (
                                <div key={powerUp.type} className="powerup-icon">
                                    ⚡ {powerUp.type}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Game Over Screen */}
                    {gameState === 'gameover' && (
                        <div className="gameover-overlay">
                            <div className="gameover-text">
                                {matchTimeRemaining <= 0 ? "TIME'S UP!" : "GAME OVER"}
                            </div>
                            <div className="gameover-scorecard">
                                <div className="gameover-scorecard-label">FINAL SCORE</div>
                                <div className="gameover-scorecard-value">{coinCount}</div>
                                <div className="gameover-coins-badge">
                                    <CoinIcon className="gameover-coin-icon" />
                                    <span className="gameover-coins-value">{coinCount}</span>
                                </div>
                            </div>
                            <img
                                src="/PlayAgainButton.png"
                                alt="Play Again"
                                className="gameover-play-again"
                                onClick={() => window.location.reload()}
                            />
                        </div>
                    )}

                    {/* Victory Screen */}
                    {gameState === 'victory' && (
                        <OutroScreen />
                    )}
                </>
            )}
        </div>
    );
};

