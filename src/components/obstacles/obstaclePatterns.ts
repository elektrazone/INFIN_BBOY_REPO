// src/components/obstacles/obstaclePatterns.ts
import { ObstacleType } from "./obstacleSystem";

export interface ObstacleDef {
    type: ObstacleType;
    laneIndex: number;
}

export interface CoinDef {
    laneIndex: number;
    yOffset?: number;
    count?: number;
    spacing?: number;
    arcHeight?: number;
}

export interface PatternStep {
    obstacles: ObstacleDef[];
    coins?: CoinDef[];
    delayNext: number;
}

export type ObstaclePattern = PatternStep[];

const WALL = "insuperable" as const;  // Fries/Soda
const JUMP = "jump" as const;         // Burger
const DUCK = "duck" as const;         // Pipe
const PLAT = "platform" as const;     // Bus

// =============================================================
// PATTERNS - MAX 2 OBSTACLES PER ROW (always 1 free lane)
// Variety of all obstacle types!
// =============================================================

// 1. VARIETY MIX - All obstacle types
const PATTERN_VARIETY: ObstaclePattern = [
    // Burger jump center
    {
        obstacles: [{ type: JUMP, laneIndex: 0 }],
        coins: [{ laneIndex: 0, count: 6, spacing: 6, yOffset: 12, arcHeight: 18 }],
        delayNext: 1.5
    },
    // Fries wall left
    {
        obstacles: [{ type: WALL, laneIndex: -1 }],
        coins: [{ laneIndex: 0, count: 4, spacing: 6 }],
        delayNext: 1.2
    },
    // Bus platform right (VARIETY)
    {
        obstacles: [{ type: PLAT, laneIndex: 1 }],
        coins: [{ laneIndex: 1, yOffset: 15, count: 5, spacing: 6 }],
        delayNext: 2.0
    },
    // Pipe duck center
    {
        obstacles: [{ type: DUCK, laneIndex: 0 }],
        coins: [{ laneIndex: 0, count: 4, spacing: 6 }],
        delayNext: 1.3
    },
    // Bus platform left (VARIETY)
    {
        obstacles: [{ type: PLAT, laneIndex: -1 }],
        coins: [{ laneIndex: -1, yOffset: 15, count: 5, spacing: 6 }],
        delayNext: 2.0
    },
    // Breathe - Arc coins
    {
        obstacles: [],
        coins: [{ laneIndex: 0, count: 8, spacing: 6, arcHeight: 20 }],
        delayNext: 1.5
    }
];

// 2. JUMP FOCUS - Burgers with variety
const PATTERN_JUMPS: ObstaclePattern = [
    // Burger left
    {
        obstacles: [{ type: JUMP, laneIndex: -1 }],
        coins: [{ laneIndex: -1, count: 5, spacing: 6, yOffset: 12, arcHeight: 18 }],
        delayNext: 1.5
    },
    // Burger center
    {
        obstacles: [{ type: JUMP, laneIndex: 0 }],
        coins: [{ laneIndex: 0, count: 6, spacing: 6, yOffset: 12, arcHeight: 20 }],
        delayNext: 1.5
    },
    // Burger right
    {
        obstacles: [{ type: JUMP, laneIndex: 1 }],
        coins: [{ laneIndex: 1, count: 5, spacing: 6, yOffset: 12, arcHeight: 18 }],
        delayNext: 1.5
    },
    // Fries wall
    {
        obstacles: [{ type: WALL, laneIndex: 0 }],
        coins: [{ laneIndex: 1, count: 4, spacing: 6 }],
        delayNext: 1.2
    },
    // Breathe
    {
        obstacles: [],
        coins: [{ laneIndex: 0, count: 8, spacing: 6, arcHeight: 22 }],
        delayNext: 1.0
    }
];

// 3. DUCK FOCUS - Pipes with variety
const PATTERN_DUCKS: ObstaclePattern = [
    // Pipe left
    {
        obstacles: [{ type: DUCK, laneIndex: -1 }],
        coins: [{ laneIndex: -1, count: 4, spacing: 6 }],
        delayNext: 1.3
    },
    // Pipe center
    {
        obstacles: [{ type: DUCK, laneIndex: 0 }],
        coins: [{ laneIndex: 0, count: 4, spacing: 6 }],
        delayNext: 1.3
    },
    // Burger jump
    {
        obstacles: [{ type: JUMP, laneIndex: 1 }],
        coins: [{ laneIndex: 1, count: 5, spacing: 6, yOffset: 12, arcHeight: 18 }],
        delayNext: 1.5
    },
    // Pipe right
    {
        obstacles: [{ type: DUCK, laneIndex: 1 }],
        coins: [{ laneIndex: 1, count: 4, spacing: 6 }],
        delayNext: 1.3
    },
    // Breathe
    {
        obstacles: [],
        coins: [{ laneIndex: 0, count: 6, spacing: 6 }],
        delayNext: 1.0
    }
];

// 4. WALLS AND JUMPS - Fries/Soda walls with burgers
const PATTERN_WALLS: ObstaclePattern = [
    // Fries left
    {
        obstacles: [{ type: WALL, laneIndex: -1 }],
        coins: [{ laneIndex: 0, count: 4, spacing: 6 }],
        delayNext: 1.2
    },
    // Burger center
    {
        obstacles: [{ type: JUMP, laneIndex: 0 }],
        coins: [{ laneIndex: 0, count: 5, spacing: 6, yOffset: 12, arcHeight: 18 }],
        delayNext: 1.5
    },
    // Fries right
    {
        obstacles: [{ type: WALL, laneIndex: 1 }],
        coins: [{ laneIndex: 0, count: 4, spacing: 6 }],
        delayNext: 1.2
    },
    // Pipe center
    {
        obstacles: [{ type: DUCK, laneIndex: 0 }],
        coins: [{ laneIndex: 0, count: 4, spacing: 6 }],
        delayNext: 1.3
    },
    // Breathe
    {
        obstacles: [],
        coins: [{ laneIndex: -1, count: 6, spacing: 6 }],
        delayNext: 1.0
    }
];

// 5. PLATFORM MIX - Bus with other obstacles
const PATTERN_PLATFORM: ObstaclePattern = [
    // Bus platform left
    {
        obstacles: [{ type: PLAT, laneIndex: -1 }],
        coins: [{ laneIndex: -1, yOffset: 15, count: 6, spacing: 6 }],
        delayNext: 2.2
    },
    // Burger center
    {
        obstacles: [{ type: JUMP, laneIndex: 0 }],
        coins: [{ laneIndex: 0, count: 5, spacing: 6, yOffset: 12, arcHeight: 18 }],
        delayNext: 1.5
    },
    // Bus platform right
    {
        obstacles: [{ type: PLAT, laneIndex: 1 }],
        coins: [{ laneIndex: 1, yOffset: 15, count: 6, spacing: 6 }],
        delayNext: 2.2
    },
    // Fries wall
    {
        obstacles: [{ type: WALL, laneIndex: -1 }],
        coins: [{ laneIndex: 1, count: 4, spacing: 6 }],
        delayNext: 1.2
    },
    // Bus platform center
    {
        obstacles: [{ type: PLAT, laneIndex: 0 }],
        coins: [{ laneIndex: 0, yOffset: 15, count: 6, spacing: 6 }],
        delayNext: 2.2
    },
    // Breathe
    {
        obstacles: [],
        coins: [{ laneIndex: -1, count: 6, spacing: 6 }],
        delayNext: 1.0
    }
];

// 6. SLALOM - Alternating sides
const PATTERN_SLALOM: ObstaclePattern = [
    // Burger left
    {
        obstacles: [{ type: JUMP, laneIndex: -1 }],
        coins: [{ laneIndex: -1, count: 5, spacing: 6, yOffset: 12, arcHeight: 18 }],
        delayNext: 1.4
    },
    // Fries right
    {
        obstacles: [{ type: WALL, laneIndex: 1 }],
        coins: [{ laneIndex: 0, count: 4, spacing: 6 }],
        delayNext: 1.2
    },
    // Pipe left
    {
        obstacles: [{ type: DUCK, laneIndex: -1 }],
        coins: [{ laneIndex: -1, count: 4, spacing: 6 }],
        delayNext: 1.3
    },
    // Burger right
    {
        obstacles: [{ type: JUMP, laneIndex: 1 }],
        coins: [{ laneIndex: 1, count: 5, spacing: 6, yOffset: 12, arcHeight: 18 }],
        delayNext: 1.4
    },
    // Breathe
    {
        obstacles: [],
        coins: [{ laneIndex: 0, count: 6, spacing: 6 }],
        delayNext: 1.0
    }
];

export const PATTERN_CITY = PATTERN_VARIETY;
export const PATTERN_NIGHTMARE = PATTERN_SLALOM;

export const ALL_PATTERNS = [
    PATTERN_VARIETY,   // Mix of all types
    PATTERN_JUMPS,     // Burgers focus
    PATTERN_DUCKS,     // Pipes focus
    PATTERN_WALLS,     // Fries/Soda walls
    PATTERN_PLATFORM,  // Bus platforms
    PATTERN_SLALOM     // Alternating
];