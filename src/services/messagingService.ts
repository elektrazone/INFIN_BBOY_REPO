// src/services/messagingService.ts
import { useGameStore } from '../store/gameStore';

/**
 * Interface for messages sent to the parent window
 */
export interface GameEventMessage {
    type: 'GAME_END' | 'GAME_START' | 'GAME_STATUS' | 'CLOSE_REQUEST';
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
 *
 * Security: both directions are restricted to an allowlist of trusted origins.
 * - Outgoing messages are posted to each trusted origin; the browser only
 *   delivers to the parent whose origin actually matches, so no data leaks to
 *   an unexpected embedder.
 * - Incoming messages are ignored unless event.origin is trusted.
 *
 * By default the allowlist contains this page's own origin plus the parent's
 * origin inferred from document.referrer (set when embedded in an iframe).
 * An embedder on a different origin can call `configure([...])` before/at init
 * to register additional trusted origins.
 */
export class MessagingService {
    private static instance: MessagingService;
    private initialized = false;
    private trustedOrigins: string[] = [];

    private constructor() { }

    public static getInstance(): MessagingService {
        if (!MessagingService.instance) {
            MessagingService.instance = new MessagingService();
        }
        return MessagingService.instance;
    }

    /**
     * Register additional trusted parent origins (e.g. "https://host.example").
     * Can be called before or after init(). Duplicates and falsy values are ignored.
     */
    public configure(origins: string[]): void {
        for (const origin of origins) {
            if (origin && !this.trustedOrigins.includes(origin)) {
                this.trustedOrigins.push(origin);
            }
        }
    }

    /**
     * Computes the default trusted origins: this page's origin plus, when the
     * game is embedded, the referring parent's origin.
     */
    private computeDefaultOrigins(): string[] {
        const list: string[] = [window.location.origin];
        try {
            if (document.referrer) {
                const refOrigin = new URL(document.referrer).origin;
                if (refOrigin && !list.includes(refOrigin)) {
                    list.push(refOrigin);
                }
            }
        } catch {
            // Malformed referrer — ignore.
        }
        return list;
    }

    private isTrusted(origin: string): boolean {
        return this.trustedOrigins.includes(origin);
    }

    /**
     * Initializes the messaging service and starts listening for incoming messages.
     * @param origins Optional explicit allowlist of trusted parent origins. When
     *                omitted, a sensible default (same-origin + referrer) is used.
     */
    public init(origins?: string[]): void {
        if (this.initialized) return;

        // Seed defaults, then merge any explicitly provided origins.
        this.configure(this.computeDefaultOrigins());
        if (origins) this.configure(origins);

        window.addEventListener('message', this.handleIncomingMessage.bind(this));
        this.initialized = true;
        console.log('✉️ MessagingService initialized. Trusted origins:', this.trustedOrigins);
    }

    /**
     * Sends a message to the parent window. The message is posted to each
     * trusted origin; the browser delivers it only to the parent whose origin
     * matches, so untrusted embedders never receive game data.
     */
    public sendMessage(message: GameEventMessage): void {
        console.log('✉️ Sending message to parent:', message);
        for (const origin of this.trustedOrigins) {
            window.parent.postMessage(message, origin);
        }
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
     * Specific helper to notify game start
     */
    public notifyGameStart(): void {
        this.sendMessage({
            type: 'GAME_START',
            payload: {}
        });
    }

    /**
     * Handles messages received from the parent window
     */
    private handleIncomingMessage(event: MessageEvent): void {
        // Reject anything from an untrusted origin.
        if (!this.isTrusted(event.origin)) {
            console.warn('✉️ Ignored message from untrusted origin:', event.origin);
            return;
        }

        const { type } = event.data ?? {};

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
