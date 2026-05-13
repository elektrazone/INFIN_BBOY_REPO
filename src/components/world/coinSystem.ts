// src/components/world/coinSystem.ts
import * as BABYLON from "@babylonjs/core";
import "@babylonjs/loaders";
import { PlayerAABB } from "../player/playerController";

import { useGameStore } from "../../store/gameStore";

export interface CoinSystemOptions {
    spawnZ?: number;
    despawnZ?: number;
    laneWidth?: number;
    modelPath?: string;
}

export interface CoinInstance {
    mesh: BABYLON.AbstractMesh;
    active: boolean;
    rotationSpeed: number;
    speedMultiplier: number;
}

export interface CoinController {
    spawnCoin(laneIndex: number, yOffset: number, count?: number, spacing?: number, arcHeight?: number, speedMultiplier?: number, zPatternOffset?: number): void;
    update(dt: number, scrollSpeed: number): void;
    checkCollisions(playerAABB: PlayerAABB): number;
    dispose(): void;
    reset(): void;
    isReady(): boolean;
    setObstacleChecker(checker: (x: number, z: number, radius: number) => boolean): void;
}

export function createCoinSystem(
    scene: BABYLON.Scene,
    shadowGenerator: BABYLON.ShadowGenerator,
    getScrollSpeed: () => number,
    options: CoinSystemOptions = {}
): CoinController {
    const spawnZ = options.spawnZ ?? -520;
    const despawnZ = options.despawnZ ?? 200;
    const laneWidth = options.laneWidth ?? 30; // Adjusted from 25 to match 9-column cube road (centered on column 2, 4, 6)

    const root = new BABYLON.TransformNode("coins_root", scene);
    const coinPool: CoinInstance[] = [];
    const activeCoins: CoinInstance[] = [];

    // Coin loading state
    let isLoaded = false;
    const pendingSpawns: Array<{ laneIndex: number; yOffset: number; count: number; spacing: number; arcHeight: number; speedMultiplier: number; zPatternOffset: number }> = [];

    // Obstacle checker function - will be set by environment.ts
    let hasObstacleAt: ((x: number, z: number, radius: number) => boolean) | null = null;

    function setObstacleChecker(checker: (x: number, z: number, radius: number) => boolean) {
        hasObstacleAt = checker;
    }

    // Create materials once for all coins
    let coinFaceMaterial: BABYLON.PBRMaterial | null = null;
    let coinEdgeMaterial: BABYLON.PBRMaterial | null = null;
    let coinTexture: BABYLON.Texture | null = null;

    // Initialize materials
    function initMaterials() {
        // Face material with bitcoin texture
        coinFaceMaterial = new BABYLON.PBRMaterial("coinFaceMat", scene);
        coinTexture = new BABYLON.Texture("/scene/assets/model/coin/bitcoin_face.webp", scene);
        coinFaceMaterial.albedoTexture = coinTexture;
        coinFaceMaterial.metallic = 0.85;
        coinFaceMaterial.roughness = 0.3;
        coinFaceMaterial.emissiveColor = new BABYLON.Color3(0.4, 0.32, 0.05); // Brighter glow
        coinFaceMaterial.emissiveIntensity = 0.8; // Higher intensity

        // Edge material - solid gold
        coinEdgeMaterial = new BABYLON.PBRMaterial("coinEdgeMat", scene);
        coinEdgeMaterial.albedoColor = new BABYLON.Color3(1.0, 0.84, 0.0);
        coinEdgeMaterial.metallic = 0.9;
        coinEdgeMaterial.roughness = 0.25;
        coinEdgeMaterial.emissiveColor = new BABYLON.Color3(0.25, 0.2, 0.02);
        coinEdgeMaterial.emissiveIntensity = 0.4;

        isLoaded = true;
        console.log("🪙 Coin materials initialized");

        // Process any pending spawns
        for (const pending of pendingSpawns) {
            spawnCoinInternal(pending.laneIndex, pending.yOffset, pending.count, pending.spacing, pending.arcHeight, pending.speedMultiplier, pending.zPatternOffset);
        }
        pendingSpawns.length = 0;
    }

    // Initialize materials immediately
    initMaterials();

    function createCoinMesh(): BABYLON.AbstractMesh | null {
        // We only create the source mesh ONCE
        // If we already have coins in the pool, we can just return a new instance of the first one
        if (coinPool.length > 0) {
            const source = coinPool[0].mesh as BABYLON.Mesh;
            // Create instance from source
            const instance = source.createInstance(`coin_${coinPool.length}`);
            instance.parent = root;
            instance.checkCollisions = false; // Collision checked manually

            // Shadows handled by source mesh usually, or we can add for instance but it's expensive
            // shadowGenerator.addShadowCaster(instance); 

            return instance;
        }

        if (!coinFaceMaterial || !coinEdgeMaterial) return null;

        // Create cylinder (coin shape) - SOURCE MESH
        const diameter = 7.5;  // Scaled 1.5x from 5
        const thickness = 1.2; // Scaled 1.5x from 0.8

        const coin = BABYLON.MeshBuilder.CreateCylinder(
            `coin_source`,
            {
                diameter: diameter,
                height: thickness,
                tessellation: 32,
                cap: BABYLON.Mesh.CAP_ALL,
                faceUV: [
                    new BABYLON.Vector4(0, 0, 1, 1), // Edge UV
                    new BABYLON.Vector4(1, 0, 0, 1), // Top cap UV - flipped horizontally
                    new BABYLON.Vector4(0, 0, 1, 1), // Bottom cap UV - normal
                ],
            },
            scene
        );

        coin.parent = root;

        // Rotate so the coin face is vertical (standing up)
        coin.rotation.x = Math.PI / 2;

        // Apply multi-material for edge vs caps
        const multiMat = new BABYLON.MultiMaterial(`coinMultiMat`, scene);
        multiMat.subMaterials.push(coinEdgeMaterial);  // Index 0: Edge
        multiMat.subMaterials.push(coinFaceMaterial);  // Index 1: Top cap
        multiMat.subMaterials.push(coinFaceMaterial);  // Index 2: Bottom cap

        coin.material = multiMat;

        // Setup submeshes for the cylinder (edge, top cap, bottom cap)
        coin.subMeshes = [];
        const vertexCount = coin.getTotalVertices();

        // Cylinder has specific index structure: tube, cap1, cap2
        // For a tessellation of 32: tube is 0-383, caps follow
        const tessellation = 32;
        const tubeIndices = tessellation * 2 * 3; // 192 indices for tube
        const capIndices = tessellation * 3;      // 96 indices per cap

        new BABYLON.SubMesh(0, 0, vertexCount, 0, tubeIndices, coin);                    // Edge
        new BABYLON.SubMesh(1, 0, vertexCount, tubeIndices, capIndices, coin);           // Top cap
        new BABYLON.SubMesh(2, 0, vertexCount, tubeIndices + capIndices, capIndices, coin); // Bottom cap

        coin.receiveShadows = true;

        // Hide source mesh initially? No, the first one is used as a pool item too.

        console.log(`🪙 Created source coin mesh`);

        return coin;
    }

    function acquire(): CoinInstance | null {
        const pooled = coinPool.find((c) => !c.active);
        if (pooled) {
            pooled.active = true;
            pooled.mesh.setEnabled(true);
            // Re-enable all child meshes
            // Instances don't really have children in the same way, but just in case
            if (pooled.mesh instanceof BABYLON.Mesh) {
                const children = (pooled.mesh as BABYLON.Mesh).getChildMeshes?.(false);
                if (children) {
                    children.forEach(m => m.setEnabled(true));
                }
            }
            return pooled;
        }

        const mesh = createCoinMesh();
        if (!mesh) return null;

        const instance: CoinInstance = {
            mesh,
            active: true,
            rotationSpeed: 3.0,
            speedMultiplier: 1.0,
        };
        coinPool.push(instance);
        return instance;
    }

    function spawnCoinInternal(laneIndex: number, yOffset: number, count: number = 1, spacing: number = 10, arcHeight: number = 0, speedMultiplier: number = 1.0, zPatternOffset: number = 0) {
        const xPos = laneIndex * laneWidth;
        const baseY = 5;
        const coinCheckRadius = 15; // Radius to check for obstacle collision

        const totalZLength = (count - 1) * spacing;
        const startZOffset = (-totalZLength / 2) + zPatternOffset;

        for (let i = 0; i < count; i++) {
            const zOffset = startZOffset + (i * spacing);
            const coinZ = spawnZ + zOffset;

            // Arc calculation: y = baseY + yOffset + sin(progress * PI) * arcHeight
            const progress = count > 1 ? i / (count - 1) : 0;
            const currentArcY = Math.sin(progress * Math.PI) * arcHeight;
            const finalY = baseY + yOffset + currentArcY;

            // Skip this coin if it would intersect an obstacle
            // BUGFIX: We only check for ground-level obstacle intersections! 
            // If the coin is explicitly placed high up (e.g. over a platform, finalY > 15), we ALWAYS spawn it.
            if (finalY < 15 && hasObstacleAt && hasObstacleAt(xPos, coinZ, coinCheckRadius)) {
                console.log(`🪙 Skipped coin at (${xPos}, ${coinZ}) - obstacle intersection`);
                continue;
            }

            const coin = acquire();
            if (!coin) continue;

            coin.speedMultiplier = speedMultiplier;
            coin.mesh.position.set(xPos, finalY, coinZ);
            activeCoins.push(coin);
        }
    }

    function spawnCoin(laneIndex: number, yOffset: number, count: number = 1, spacing: number = 10, arcHeight: number = 0, speedMultiplier: number = 1.0, zPatternOffset: number = 0) {
        if (!isLoaded) {
            // Queue for later
            pendingSpawns.push({ laneIndex, yOffset, count, spacing, arcHeight, speedMultiplier, zPatternOffset });
            return;
        }
        spawnCoinInternal(laneIndex, yOffset, count, spacing, arcHeight, speedMultiplier, zPatternOffset);
    }

    function update(dt: number, scrollSpeed: number) {
        // Allow negative speed for bounce-back effect
        if (scrollSpeed === 0) return;

        const movement = scrollSpeed * dt;

        for (let i = activeCoins.length - 1; i >= 0; i--) {
            const coin = activeCoins[i];

            // Move
            coin.mesh.position.z += movement * coin.speedMultiplier;

            // Rotate
            coin.mesh.rotation.y += coin.rotationSpeed * dt;

            // Despawn
            if (coin.mesh.position.z > despawnZ) {
                coin.active = false;
                coin.mesh.setEnabled(false);
                activeCoins.splice(i, 1);
            }
        }
    }

    function checkCollisions(playerAABB: PlayerAABB): number {
        let collectedCount = 0;
        const coinRadius = 2.5; // Approximate hit radius

        for (let i = activeCoins.length - 1; i >= 0; i--) {
            const coin = activeCoins[i];
            const pos = coin.mesh.position;

            // Simple AABB check against coin point + radius
            // We treat coin as a small box
            const coinMinX = pos.x - coinRadius;
            const coinMaxX = pos.x + coinRadius;
            const coinMinY = pos.y - coinRadius;
            const coinMaxY = pos.y + coinRadius;
            const coinMinZ = pos.z - coinRadius;
            const coinMaxZ = pos.z + coinRadius;

            const intersect = !(
                playerAABB.max.x < coinMinX ||
                playerAABB.min.x > coinMaxX ||
                playerAABB.max.y < coinMinY ||
                playerAABB.min.y > coinMaxY ||
                playerAABB.max.z < coinMinZ ||
                playerAABB.min.z > coinMaxZ
            );

            if (intersect) {
                // Collected!
                coin.active = false;
                coin.mesh.setEnabled(false);
                activeCoins.splice(i, 1);
                collectedCount++;
            }
        }

        return collectedCount;
    }

    const observer = scene.onBeforeRenderObservable.add(() => {
        // FREEZE COINS IF NOT PLAYING, UNLESS BOUNCE BACK
        const state = useGameStore.getState().gameState;
        const speed = getScrollSpeed();
        const isBounceBack = state === "gameover" && speed < 0;

        if (state !== "playing" && !isBounceBack) return;

        const dt = scene.getEngine().getDeltaTime() / 1000;
        update(dt, speed);
    });

    function dispose() {
        if (observer) {
            scene.onBeforeRenderObservable.remove(observer);
        }
        coinPool.forEach((c) => c.mesh.dispose());
        root.dispose();
    }

    function reset() {
        // Deactivate all active coins
        for (const coin of activeCoins) {
            coin.active = false;
            coin.mesh.setEnabled(false);
        }
        activeCoins.length = 0;
        console.log("Coin system reset");
    }

    return { spawnCoin, update, checkCollisions, dispose, reset, isReady: () => isLoaded, setObstacleChecker };
}
