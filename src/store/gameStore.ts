import { create } from 'zustand';

/**
 * Game state types
 */
export type GameStateType = 'idle' | 'playing' | 'paused' | 'gameover' | 'victory';
export type PowerUpType = 'invincibility' | 'magnet' | 'doubleCoins' | 'shield';

/**
 * Power-up interface (for future use)
 */
export interface PowerUp {
    type: PowerUpType;
    expiresAt: number; // timestamp in ms
}

/**
 * Game state interface
 * 
 * This is the centralized hub for ALL game session data.
 * 
 * Architecture:
 * - coinSystem/obstacleSystem → Handle only spawning/rendering
 * - playerController → Detects events, updates this store
 * - React UI → Subscribes to this store, displays data
 */
export interface GameState {
    // Score and collectibles
    coinCount: number;
    score: number;

    // Player state
    lives: number;

    // Game flow
    gameState: GameStateType;

    // Loading state
    isLoading: boolean;

    // Intro screen state (stays visible until user taps start)
    showIntroScreen: boolean;

    // Countdown state (3, 2, 1, 0=GO!, null=hidden)
    countdownValue: number | null;

    // Match timer state
    matchDuration: number;        // Total match duration in seconds (default: 120 = 2 minutes)
    matchTimeRemaining: number;   // Time remaining in seconds
    isMatchTimerActive: boolean;  // Whether timer is currently running

    // Power-ups (prepared for future)
    activePowerUps: PowerUp[];
}

/**
 * Game store actions interface
 * Defines all actions that can modify the game state
 */
interface GameActions {
    // Coin management
    updateCoinCount: (count: number) => void;
    incrementCoinCount: (amount: number) => void;
    resetCoinCount: () => void;

    // Lives management
    decrementLives: () => void;
    setLives: (lives: number) => void;

    // Score management (for future)
    addScore: (points: number) => void;

    // Game state management
    setGameState: (state: GameStateType) => void;

    // Power-ups management (for future)
    activatePowerUp: (type: PowerUpType, duration: number) => void;
    deactivatePowerUp: (type: PowerUpType) => void;

    // Loading management
    setLoading: (loading: boolean) => void;

    // Intro screen management
    dismissIntroScreen: () => void;

    // Countdown management
    setCountdown: (value: number | null) => void;

    // Match timer management
    startMatchTimer: () => void;
    tickMatchTimer: (deltaSeconds: number) => void;
    stopMatchTimer: () => void;

    // Full reset
    resetGame: () => void;
}

/**
 * Combined store type
 */
type GameStore = GameState & GameActions;

/**
 * Initial game state
 */
const INITIAL_STATE: GameState = {
    coinCount: 0,
    score: 0,
    lives: 3,
    gameState: 'idle',
    isLoading: true,
    showIntroScreen: true,
    countdownValue: null,
    matchDuration: 5,          // DEFAULT: 5 seconds
    matchTimeRemaining: 5,     // Starts at full duration
    isMatchTimerActive: false,
    activePowerUps: [],
};

/**
 * Zustand store for game state
 * This is the single source of truth for all game session data
 * 
 * Usage in Babylon (playerController, etc.):
 *   import { useGameStore } from '../store/gameStore';
 *   useGameStore.getState().decrementLives();
 * 
 * Usage in React:
 *   import { useGameStore } from '../../store/gameStore';
 *   const lives = useGameStore((state) => state.lives);
 */
export const useGameStore = create<GameStore>((set) => ({
    // Initial state
    ...INITIAL_STATE,

    // Coin actions
    updateCoinCount: (count: number) => set({ coinCount: count }),

    incrementCoinCount: (amount: number) =>
        set((state) => ({ coinCount: state.coinCount + amount })),

    resetCoinCount: () => set({ coinCount: 0 }),

    // Lives actions
    decrementLives: () =>
        set((state) => {
            const newLives = Math.max(0, state.lives - 1);
            const newGameState = newLives <= 0 ? 'gameover' : state.gameState;

            console.log(`❤️ Lives: ${newLives} | Game State: ${newGameState}`);

            return {
                lives: newLives,
                gameState: newGameState,
            };
        }),

    setLives: (lives: number) => set({ lives: Math.max(0, lives) }),

    // Score actions
    addScore: (points: number) =>
        set((state) => ({ score: state.score + points })),

    // Game state actions
    setGameState: (gameState: GameStateType) => {
        console.log(`🎮 Game State: ${gameState}`);
        set({ gameState });
    },

    // Power-up actions (prepared for future implementation)
    activatePowerUp: (type: PowerUpType, duration: number) =>
        set((state) => {
            const expiresAt = Date.now() + duration;
            const newPowerUp: PowerUp = { type, expiresAt };

            // Remove existing power-up of same type, then add new one
            const filtered = state.activePowerUps.filter(p => p.type !== type);

            console.log(`⚡ Power-up activated: ${type} (expires in ${duration}ms)`);

            return {
                activePowerUps: [...filtered, newPowerUp],
            };
        }),

    deactivatePowerUp: (type: PowerUpType) =>
        set((state) => ({
            activePowerUps: state.activePowerUps.filter(p => p.type !== type),
        })),

    // Loading actions
    setLoading: (isLoading: boolean) => {
        console.log(`⏳ Loading: ${isLoading}`);
        set({ isLoading });
    },

    // Intro screen actions
    dismissIntroScreen: () => {
        console.log('🎬 Intro screen dismissed');
        set({ showIntroScreen: false });
    },

    // Countdown actions
    setCountdown: (countdownValue: number | null) => {
        set({ countdownValue });
    },

    // Match timer actions
    startMatchTimer: () => {
        set((state) => ({
            isMatchTimerActive: true,
            matchTimeRemaining: state.matchDuration,
        }));
        console.log('⏱️ Match timer started');
    },

    tickMatchTimer: (deltaSeconds: number) =>
        set((state) => {
            if (!state.isMatchTimerActive) return {};
            if (state.gameState !== 'playing') return {};

            const newTime = Math.max(0, state.matchTimeRemaining - deltaSeconds);

            // Check if time ran out
            if (newTime <= 0) {
                // Victory if player still has lives, otherwise gameover
                const isVictory = state.lives > 0;
                console.log(isVictory ? "🎉 VICTORY! Player survived the match!" : "⏱️ TIME'S UP! Match ended.");
                return {
                    matchTimeRemaining: 0,
                    isMatchTimerActive: false,
                    gameState: isVictory ? 'victory' : 'gameover',
                };
            }

            return { matchTimeRemaining: newTime };
        }),

    stopMatchTimer: () => {
        set({ isMatchTimerActive: false });
        console.log('⏱️ Match timer stopped');
    },

    // Reset everything
    resetGame: () => {
        console.log('🔄 Game reset');
        set({ ...INITIAL_STATE, isLoading: false, showIntroScreen: false, countdownValue: null });
    },
}));
