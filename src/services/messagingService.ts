// src/services/messagingService.ts
import { useGameStore } from '../store/gameStore';

/**
 * Interface for messages sent to the parent window
 */
export interface GameEventMessage {
    type: 'GAME_END' | 'GAME_STATUS' | 'CLOSE_REQUEST';
    payload: {
        status?: 'victory' | 'gameover';
        score?: number;
        coins?: number;
        [key: string]: any;
    };
}

/**
 * MessagingService handles communication between the game and a parent container
 * (e.g., via iframe postMessage).
 */
export class MessagingService {
    private static instance: MessagingService;
    private initialized = false;

    private constructor() { }

    public static getInstance(): MessagingService {
        if (!MessagingService.instance) {
            MessagingService.instance = new MessagingService();
        }
        return MessagingService.instance;
    }

    /**
     * Initializes the messaging service and starts listening for incoming messages
     */
    public init(): void {
        if (this.initialized) return;

        window.addEventListener('message', this.handleIncomingMessage.bind(this));
        this.initialized = true;
        console.log('✉️ MessagingService initialized');
    }

    /**
     * Sends a message to the parent window
     */
    public sendMessage(message: GameEventMessage): void {
        console.log('✉️ Sending message to parent:', message);
        // '*' is used for development flexibility, ideally this should be restricted to specific origins
        window.parent.postMessage(message, '*');
    }

    /**
     * Specific helper to notify game completion
     */
    public notifyGameEnd(status: 'victory' | 'gameover', score: number, coins: number): void {
        this.sendMessage({
            type: 'GAME_END',
            payload: { status, score, coins }
        });
    }

    /**
     * Handles messages received from the parent window
     */
    private handleIncomingMessage(event: MessageEvent): void {
        const { type } = event.data;

        if (!type) return;

        console.log('✉️ Received message from parent:', event.data);

        switch (type) {
            case 'RESTART_GAME':
                console.log('✉️ Command received: Restarting game');
                window.location.reload();
                break;

            case 'START_GAME':
                console.log('✉️ Command received: Starting game');
                useGameStore.getState().dismissIntroScreen();
                break;

            case 'CLOSE_GAME':
                console.log('✉️ Command received: Closing game');
                // We notify the parent that we are ready to close
                this.sendMessage({ type: 'CLOSE_REQUEST', payload: {} });
                break;

            default:
                // Handle other messages as needed
                break;
        }
    }
}

export const messagingService = MessagingService.getInstance();
