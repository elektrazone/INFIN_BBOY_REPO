// src/components/world/fallingCubeRoad.ts
import * as BABYLON from "@babylonjs/core";
import { useGameStore } from "../../store/gameStore";
import { getLayeredRoadMaterial } from "../materials/MaterialFactory";

// ============================================================
// CONFIGURATION - OPTIMIZED FOR PERFORMANCE
// ============================================================
const CONFIG = {
    // Grid dimensions - OPTIMIZED: Fewer, larger cubes
    cubesWide: 9,   // Reduced from 10 to ensure a centered column exists (for centered holes)
    cubesLong: 56,   // Reduced from 84 (56 * 15 = 840 units long)
    cubeSize: 15,    // Larger cubes (was 12)

    // Extra cubes at start to fill gap near buildings
    extraStartRows: 2, // Reduced to 2 to move crumble edge closer per user request

    // Total road dimensions
    get roadWidth() { return this.cubesWide * this.cubeSize; },
    get roadLength() { return this.cubesLong * this.cubeSize; },

    // Number of road segments - OPTIMIZED: Reduced from 3 to 2
    segmentCount: 2,

    // Falling physics
    fallGravity: 2500, // Very fast gravity
    fallMaxSpeed: 4000, // Higher terminal velocity

    // Trigger zone (relative to player Z position)
    triggerZoneStart: -80,
    triggerZoneEnd: -200,

    // Fall probability per frame when in trigger zone
    fallProbabilityPerSecond: 0.06375, // Reduced from 0.075 for an additional 15% reduction

    // Maximum adjacent missing cubes (controls gap size)
    maxAdjacentGaps: 1,

    // Cube appearance
    cubeColor: new BABYLON.Color3(0.15, 0.15, 0.2),
    cubeRoughness: 0.8,
};

// ============================================================
// TYPES
// ============================================================
type CubeState = "active" | "falling" | "fallen";

interface CubeData {
    instance: BABYLON.InstancedMesh;
    state: CubeState;
    fallVelocity: number;
    originalY: number;
    gridX: number;
    gridZ: number;
    segmentIndex: number;
    isCellCenter: boolean; // Only cell centers can fall (center of 3x3 cell)
    randomFallOffset: number; // Randomize when this cube falls behind player
    isSafePath: boolean; // Part of the guaranteed solvable path
}

export interface FallingCubeRoadController {
    // Returns meshes player can collide with (for gap detection)
    getGapBoundingBoxes(): { min: BABYLON.Vector3; max: BABYLON.Vector3 }[];

    // Check if player position is over a gap
    isOverGap(playerX: number, playerZ: number): boolean;

    // Reset all cubes to active state
    reset(): void;

    // Rebuild grid with new target length
    rebuild(targetLength: number): void;

    // Repair gap at specific position (for safe respawn)
    fillGapAt(x: number, z: number): void;

    // Trigger all cubes near player to fall (for death scene)
    triggerMassFall(playerX: number, playerZ: number): void;

    // Set callback to check for obstacles
    setObstacleChecker(checker: (x: number, z: number, laneWidth: number) => boolean): void;

    // Dispose all resources
    dispose(): void;
}


// ============================================================
// MAIN FACTORY FUNCTION
// ============================================================
export function createFallingCubeRoad(
    scene: BABYLON.Scene,
    shadowGenerator: BABYLON.ShadowGenerator,
    getScrollSpeed: () => number
): FallingCubeRoadController {

    // ----------------------------------------------------------
    // STATE
    // ----------------------------------------------------------
    let cubesLong = CONFIG.cubesLong;
    let roadLength = CONFIG.roadLength;

    let obstacleChecker: ((x: number, z: number, laneWidth: number) => boolean) | null = null;

    // ----------------------------------------------------------
    // CUBE MATERIALS - Checkerboard pattern
    // ----------------------------------------------------------
    const layeredMaterial = getLayeredRoadMaterial(scene);

    // ----------------------------------------------------------
    // SOURCE CUBE MESHES (for instancing)
    // ----------------------------------------------------------
    const sourceCube = BABYLON.MeshBuilder.CreateBox(
        "fallingCubeSource",
        { size: CONFIG.cubeSize },
        scene
    );
    sourceCube.material = layeredMaterial;
    sourceCube.isVisible = false;
    sourceCube.receiveShadows = true;

    // FIX TEXTURE ORIENTATION: Manually rotate UVs for Side Faces (0, 1, 2, 3)
    // The texture has asphalt at the top (V=1).
    // Faces 0, 1 (Back, Front) need DIFFERENT rotation than 2, 3 (Right, Left).
    // Based on user feedback:
    // - Right/Left (Faces 2,3) are correct with -90 rotation.
    // - Back/Front (Faces 0,1) need +90 rotation (or different).

    // Get current UVs
    const uvs = sourceCube.getVerticesData(BABYLON.VertexBuffer.UVKind);
    if (uvs) {
        // Box has 6 faces * 4 vertices = 24 vertices.
        // Each vertex has 2 floats (u, v). Total 48 floats.
        // Face Order: 0:Back, 1:Front, 2:Right, 3:Left, 4:Top, 5:Bottom
        // Floats per face: 8.

        // FACES 0 & 1: Back/Front (Indices 0-15) -> Standard UVs (No Rotation)
        // Previous attempts (-90, +90) resulted in vertical ("sideways") textures.
        // Therefore, standard orientation (0 degrees) should be horizontal.
        // Since we are iterating and modifying in place, we DO NOTHING for these indices
        // to keep them as generated by CreateBox.

        // Loop intentionally removed for 0-15.

        // FACES 2 & 3: Right/Left (Indices 16-31) -> Rotate -90
        for (let i = 16; i < 32; i += 2) {
            const u = uvs[i];
            const v = uvs[i + 1];
            // Rotate -90
            // u' = v
            // v' = 1 - u
            uvs[i] = v;
            uvs[i + 1] = 1 - u;
        }

        sourceCube.setVerticesData(BABYLON.VertexBuffer.UVKind, uvs);
    }

    // Configure SubMeshes for the layered look
    // SubMaterial 0: Dirt (Sides and Bottom)
    // SubMaterial 1: Asphalt (Top)
    // Box indices are 36 (6 faces * 2 triangles * 3 vertices)
    sourceCube.subMeshes = [];

    // 1. Sides (Material Index 0: Asphalt-Dirt Side)
    // Indices for faces 0, 1, 2, 3 are 0 to 23.
    new BABYLON.SubMesh(0, 0, sourceCube.getTotalVertices(), 0, 24, sourceCube); // Sides

    // 2. Bottom (Material Index 2: Pure Dirt)
    // Indices for face 5 are 30 to 35.
    new BABYLON.SubMesh(2, 0, sourceCube.getTotalVertices(), 30, 6, sourceCube); // Bottom

    // 3. Top (Material Index 1: Pure Asphalt)
    // Indices for face 4 (Top) are 24 to 29.
    new BABYLON.SubMesh(1, 0, sourceCube.getTotalVertices(), 24, 6, sourceCube);

    sourceCube.alwaysSelectAsActiveMesh = true;
    sourceCube.doNotSyncBoundingInfo = true;

    // Re-use sourceCube for both "red" and "black" logic if needed, 
    // but the user wants layered textures like the illustration, which doesn't necessarily need the checkerboard colors anymore.
    // However, to keep the logic consistent, I'll use the same source for both or remove the choice.
    const sourceCubeRed = sourceCube;
    const sourceCubeBlack = sourceCube;

    // ----------------------------------------------------------
    // DEBRIS SYSTEM - Small cubes that spawn when road crumbles behind player
    // ----------------------------------------------------------
    const DEBRIS_CONFIG = {
        pieceSize: CONFIG.cubeSize / 3, // Each debris piece is 1/3 the size
        piecesPerCube: 8, // Number of debris pieces per falling cube
        maxActiveDebris: 100, // Pool limit
        gravity: 400, // Slowed down from 1500
        maxSpeed: 600, // Slowed down from 2000
        randomVelocityRange: 30, // Reduced from 50
        randomRotationSpeed: 1.5, // Slowed from 3
    };

    // Source debris mesh configuration
    const sourceDebris = BABYLON.MeshBuilder.CreateBox(
        "debrisSource",
        { size: DEBRIS_CONFIG.pieceSize },
        scene
    );
    sourceDebris.material = layeredMaterial; // Use the same multi-material as road
    sourceDebris.isVisible = false;

    // Apply same UV rotation as sourceCube for side texture consistency
    const debrisUvs = sourceDebris.getVerticesData(BABYLON.VertexBuffer.UVKind);
    if (debrisUvs) {
        // FACES 2 & 3: Right/Left (Indices 16-31) -> Rotate -90
        for (let i = 16; i < 32; i += 2) {
            const u = debrisUvs[i];
            const v = debrisUvs[i + 1];
            debrisUvs[i] = v;
            debrisUvs[i + 1] = 1 - u;
        }
        sourceDebris.setVerticesData(BABYLON.VertexBuffer.UVKind, debrisUvs);
    }

    // Configure SubMeshes for the layered look (matching sourceCube)
    sourceDebris.subMeshes = [];
    new BABYLON.SubMesh(0, 0, sourceDebris.getTotalVertices(), 0, 24, sourceDebris);  // Sides (Asphalt-Dirt)
    new BABYLON.SubMesh(2, 0, sourceDebris.getTotalVertices(), 30, 6, sourceDebris);  // Bottom (Pure Dirt)
    new BABYLON.SubMesh(1, 0, sourceDebris.getTotalVertices(), 24, 6, sourceDebris);  // Top (Pure Asphalt)

    sourceDebris.alwaysSelectAsActiveMesh = true;
    sourceDebris.doNotSyncBoundingInfo = true;

    interface DebrisPiece {
        mesh: BABYLON.InstancedMesh;
        active: boolean;
        velocity: BABYLON.Vector3;
        rotationSpeed: BABYLON.Vector3;
    }

    const debrisPool: DebrisPiece[] = [];
    const activeDebris: DebrisPiece[] = [];

    function getDebrisPiece(): DebrisPiece | null {
        // Try to find inactive piece in pool
        const inactive = debrisPool.find(d => !d.active);
        if (inactive) return inactive;

        // Create new if under limit
        if (debrisPool.length < DEBRIS_CONFIG.maxActiveDebris) {
            const mesh = sourceDebris.createInstance(`debris_${debrisPool.length}`);
            mesh.isVisible = false;
            mesh.alwaysSelectAsActiveMesh = true;
            mesh.doNotSyncBoundingInfo = true;
            const piece: DebrisPiece = {
                mesh,
                active: false,
                velocity: BABYLON.Vector3.Zero(),
                rotationSpeed: BABYLON.Vector3.Zero(),
            };
            debrisPool.push(piece);
            return piece;
        }

        return null;
    }

    function spawnDebris(x: number, y: number, z: number) {
        const halfSize = CONFIG.cubeSize / 2;
        const pieceHalf = DEBRIS_CONFIG.pieceSize / 2;

        for (let i = 0; i < DEBRIS_CONFIG.piecesPerCube; i++) {
            const piece = getDebrisPiece();
            if (!piece) break;

            // Random position - WIDE spread (1.5x cube bounds)
            const offsetX = (Math.random() - 0.5) * CONFIG.cubeSize * 1.5;
            const offsetZ = (Math.random() - 0.5) * CONFIG.cubeSize * 1.5;
            const offsetY = (Math.random() - 0.5) * halfSize;

            piece.mesh.position.set(
                x + offsetX,
                y + offsetY,
                z + offsetZ
            );

            // Outward velocity - debris flies away from center (stronger)
            piece.velocity = new BABYLON.Vector3(
                offsetX * 3 + (Math.random() - 0.5) * DEBRIS_CONFIG.randomVelocityRange,
                -Math.random() * 30, // Initial downward velocity (slower)
                offsetZ * 3 + (Math.random() - 0.5) * DEBRIS_CONFIG.randomVelocityRange
            );

            // Random rotation speed
            piece.rotationSpeed = new BABYLON.Vector3(
                (Math.random() - 0.5) * DEBRIS_CONFIG.randomRotationSpeed,
                (Math.random() - 0.5) * DEBRIS_CONFIG.randomRotationSpeed,
                (Math.random() - 0.5) * DEBRIS_CONFIG.randomRotationSpeed
            );

            piece.mesh.rotation = new BABYLON.Vector3(
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2
            );

            // Random scale - varied size debris (0.5x to 1.5x base size)
            const randomScale = 0.5 + Math.random() * 1.0;
            piece.mesh.scaling.setAll(randomScale);

            // Check if debris is enabled in Performance Monitor
            const isDebrisEnabled = localStorage.getItem('perf_debris') !== 'false';
            piece.mesh.isVisible = isDebrisEnabled;
            piece.active = true;
            activeDebris.push(piece);
        }
    }

    function updateDebris(dt: number, scrollMovement: number) {
        for (let i = activeDebris.length - 1; i >= 0; i--) {
            const piece = activeDebris[i];

            // Apply gravity
            piece.velocity.y -= DEBRIS_CONFIG.gravity * dt;
            piece.velocity.y = Math.max(piece.velocity.y, -DEBRIS_CONFIG.maxSpeed);

            // Move with scroll + own velocity
            piece.mesh.position.x += piece.velocity.x * dt;
            piece.mesh.position.y += piece.velocity.y * dt;
            piece.mesh.position.z += piece.velocity.z * dt + scrollMovement;

            // Rotate
            piece.mesh.rotation.x += piece.rotationSpeed.x * dt;
            piece.mesh.rotation.y += piece.rotationSpeed.y * dt;
            piece.mesh.rotation.z += piece.rotationSpeed.z * dt;

            // Despawn if too far down or behind
            if (piece.mesh.position.y < -200 || piece.mesh.position.z > 100) {
                piece.active = false;
                piece.mesh.isVisible = false;
                activeDebris.splice(i, 1);
            }
        }
    }


    // ----------------------------------------------------------
    // SHADOW CATCHER GROUND PLANE
    // Large white plane beneath the cubes to catch shadows
    // Follows the camera to always be visible
    // ----------------------------------------------------------
    const shadowCatcherMaterial = new BABYLON.PBRMaterial("shadowCatcherMat", scene);
    shadowCatcherMaterial.albedoColor = new BABYLON.Color3(1, 1, 1); // White
    shadowCatcherMaterial.roughness = 1.0;
    shadowCatcherMaterial.metallic = 0.0;
    // Make it slightly transparent to blend with white background
    shadowCatcherMaterial.alpha = 0.95;

    const shadowCatcherPlane = BABYLON.MeshBuilder.CreateGround(
        "shadowCatcher",
        { width: 600, height: 2000 }, // Large enough to cover visible area
        scene
    );
    shadowCatcherPlane.material = shadowCatcherMaterial;
    shadowCatcherPlane.position.y = -CONFIG.cubeSize - 50; // Below falling cubes
    shadowCatcherPlane.receiveShadows = true;
    shadowCatcherPlane.isPickable = false;

    // Update shadow catcher position to follow camera in render loop
    const shadowCatcherObserver = scene.onBeforeRenderObservable.add(() => {
        const camera = scene.activeCamera;
        if (camera) {
            // Follow camera X and Z, keep fixed Y below cubes
            shadowCatcherPlane.position.x = camera.position.x * 0.3; // Subtle parallax
            // Position ahead of camera (negative Z is forward in this game)
            shadowCatcherPlane.position.z = camera.position.z - 600;
        }
    });

    // ----------------------------------------------------------
    // CUBE DATA
    // ----------------------------------------------------------
    const allCubes: CubeData[] = [];
    const fallenCubePositions: Map<string, { x: number; z: number }> = new Map();

    function getCubeKey(cube: CubeData): string {
        return `${cube.segmentIndex}_${cube.gridX}_${cube.gridZ}`;
    }

    // Helper to check if a cube is the center of a 3x3 cell
    function isCellCenter(gx: number, gz: number): boolean {
        return (gx % 3 === 1) && (gz % 3 === 1);
    }

    // ----------------------------------------------------------
    // GENERATE GRID
    // ----------------------------------------------------------
    function generateGrid() {
        // Clear existing
        for (const cube of allCubes) {
            cube.instance.dispose();
        }
        allCubes.length = 0;
        fallenCubePositions.clear();

        // Calculate starting positions to center the road
        const startX = -CONFIG.roadWidth / 2 + CONFIG.cubeSize / 2;
        const cubeY = -CONFIG.cubeSize / 2; // Top of cube at Y=0 (ground level)

        let cellCenterCount = 0;

        for (let seg = 0; seg < CONFIG.segmentCount; seg++) {
            const segmentStartZ = -seg * roadLength;

            // Include extra start rows (positive Z) for first segment only
            const startRowIndex = (seg === 0) ? -CONFIG.extraStartRows : 0;

            for (let gx = 0; gx < CONFIG.cubesWide; gx++) {
                for (let gz = startRowIndex; gz < cubesLong; gz++) {
                    const x = startX + gx * CONFIG.cubeSize;
                    // Position cubes to tile from segmentStartZ going backward (negative Z)
                    // First cube center at segmentStartZ - halfCube, last at segmentStartZ - roadLength + halfCube
                    const z = segmentStartZ - (gz * CONFIG.cubeSize) - (CONFIG.cubeSize / 2);

                    // Mark extra start cubes as safe (never fall)
                    const isExtraStartCube = gz < 0;

                    // Checkerboard pattern: use red or black based on position
                    const isRedSquare = (gx + gz + seg) % 2 === 0;
                    const sourceCube = isRedSquare ? sourceCubeRed : sourceCubeBlack;

                    const instance = sourceCube.createInstance(`cube_${seg}_${gx}_${gz}`);
                    instance.position = new BABYLON.Vector3(x, cubeY, z);
                    instance.receiveShadows = true;
                    instance.alwaysSelectAsActiveMesh = true;
                    instance.doNotSyncBoundingInfo = true;

                    // Add to shadow caster
                    shadowGenerator.addShadowCaster(instance, true);

                    const isCenter = isCellCenter(gx, gz);
                    if (isCenter) cellCenterCount++;

                    allCubes.push({
                        instance,
                        state: "active",
                        fallVelocity: 0,
                        originalY: cubeY,
                        gridX: gx,
                        gridZ: gz,
                        segmentIndex: seg,
                        isCellCenter: isCenter,
                        randomFallOffset: Math.random() * 100, // Random delay for falling
                        isSafePath: isExtraStartCube, // Extra start cubes are always safe
                    });
                }
            }
        }

        // Generate guaranteed solvable path
        generateSafePath();

        console.log(`✅ Created falling cube road: ${allCubes.length} cubes, ${cellCenterCount} cell centers that can fall`);
    }

    // ----------------------------------------------------------
    // PATH WEAVER ALGORITHM
    // ----------------------------------------------------------
    function generateSafePath() {
        console.log("🕸️ Weaving safe path...");

        // Map cubes for easy lookup: "seg_z" -> Map<x, CubeData>
        // We only care about columns 1-5 (Center lanes). 0 and 6 are always safe.
        const rowMap = new Map<string, Map<number, CubeData>>();

        for (const cube of allCubes) {
            const key = `${cube.segmentIndex}_${cube.gridZ}`;
            if (!rowMap.has(key)) rowMap.set(key, new Map());
            rowMap.get(key)!.set(cube.gridX, cube);
        }

        // Start at center lane (Index 5 for width 10)
        let currentLane = 5;

        for (let seg = 0; seg < CONFIG.segmentCount; seg++) {
            for (let z = 0; z < cubesLong; z++) {
                const key = `${seg}_${z}`;
                const row = rowMap.get(key);
                if (!row) continue;

                // Mark current lane as safe
                const safeCube = row.get(currentLane);
                if (safeCube) {
                    safeCube.isSafePath = true;
                }

                // Decide next lane (Random Walk: -1, 0, +1)
                const dir = Math.floor(Math.random() * 3) - 1; // -1, 0, 1
                let nextLane = currentLane + dir;

                // Clamp to inner lanes (1-8 for width 10)
                if (nextLane < 1) nextLane = 1;
                if (nextLane > 8) nextLane = 8;

                currentLane = nextLane;
            }
        }
    }

    // Initial generation
    generateGrid();

    // ----------------------------------------------------------
    // REBUILD
    // ----------------------------------------------------------
    function rebuild(targetLength: number) {
        console.log(`🛠️ Rebuilding road with target length: ${targetLength}`);

        // Calculate new cubesLong (round to nearest cube)
        cubesLong = Math.round(targetLength / CONFIG.cubeSize);
        roadLength = cubesLong * CONFIG.cubeSize;

        console.log(`   -> New dimensions: ${cubesLong} cubes long = ${roadLength} units`);

        generateGrid();
    }

    // ----------------------------------------------------------
    // GAME STATE LISTENER - Reset cubes when player dies
    // ----------------------------------------------------------
    let previousLives = useGameStore.getState().lives;
    const unsubscribe = useGameStore.subscribe((state) => {
        // Reset road when player loses a life?
        // User requested: "Don't reset the cubes... only at the end of each segment"
        // so we REMOVE the auto-reset on death.
        /*
        if (state.lives < previousLives) {
            console.log("💔 Player lost life - resetting cube road");
            reset();
        }
        */
        previousLives = state.lives;
    });

    // ----------------------------------------------------------
    // UPDATE LOOP
    // ----------------------------------------------------------
    let gracePeriodTimer = 4.0; // 4 seconds of NO holes on start/reset
    
    const updateObserver = scene.onBeforeRenderObservable.add(() => {
        const gameState = useGameStore.getState().gameState;
        if (gameState !== "playing") return;

        const speed = getScrollSpeed();
        if (speed === 0) return;

        const dt = scene.getEngine().getDeltaTime() / 1000;
        const movement = speed * dt;

        if (gracePeriodTimer > 0) {
            gracePeriodTimer -= dt;
        }

        // Update debris pieces
        updateDebris(dt, movement);

        // Player is always at Z=0 in this game (world scrolls toward them)
        const playerZ = 0;

        // Total road length (all segments combined)
        const totalRoadLength = CONFIG.segmentCount * roadLength;

        // Find the furthest back cube Z for looping reference
        let minCubeZ = Infinity;
        for (const cube of allCubes) {
            if (cube.instance.position.z < minCubeZ) {
                minCubeZ = cube.instance.position.z;
            }
        }

        // Process each cube
        for (const cube of allCubes) {
            // ----------------------------------------------------------
            // 1) MOVE WITH SCROLL
            // ----------------------------------------------------------
            cube.instance.position.z += movement;

            // ----------------------------------------------------------
            // 2) SEGMENT LOOPING & REAR FALLING
            // ----------------------------------------------------------

            // Thresholds
            const rearFallZ = CONFIG.cubeSize * 1; // Fall closer behind player per user request (was 2)
            // Limit to ~3 rows falling behind the player before recycling
            const recycleZ = CONFIG.cubeSize * 5;

            // A) Trigger Fall Behind Player - AGGRESSIVE FALLING
            // All cubes fall quickly once behind, minimal delay
            const centerX = 4.5; // Center lane index (0-9 for width 10)
            const distFromCenter = Math.abs(cube.gridX - centerX);
            const triangleDelay = distFromCenter * 2; // Much smaller delay (was 8)
            const triggerZ = rearFallZ + triangleDelay; // Removed random offset for consistent falling

            // [DEBUG] FALLING ENABLED
            const DEBUG_DISABLE_HOLES = false;

            if (!DEBUG_DISABLE_HOLES && cube.instance.position.z > triggerZ && cube.state === "active") {
                cube.state = "falling";

                // Spawn debris for visual crumbling effect
                spawnDebris(
                    cube.instance.position.x,
                    cube.instance.position.y,
                    cube.instance.position.z
                );

                // Hide the original cube immediately (debris replaces it visually)
                cube.instance.isVisible = false;
            }

            // B) Loop when very far behind
            if (cube.instance.position.z > recycleZ) {
                // Wrap to the back of the road
                cube.instance.position.z -= totalRoadLength;

                // Reset cube state when it loops
                if (cube.state !== "active") {
                    cube.state = "active";
                    cube.fallVelocity = 0;
                    cube.instance.position.y = cube.originalY;
                    cube.instance.isVisible = true;
                    fallenCubePositions.delete(getCubeKey(cube));
                }
            }

            // ----------------------------------------------------------
            // 3) FALLING LOGIC
            // ----------------------------------------------------------
            if (cube.state === "falling") {
                // Apply gravity
                cube.fallVelocity = Math.min(
                    cube.fallVelocity + CONFIG.fallGravity * dt,
                    CONFIG.fallMaxSpeed
                );
                cube.instance.position.y -= cube.fallVelocity * dt;

                // Check if fallen far enough to become a gap
                // BUT: If it's a rear-falling cube (z > rearFallZ), keep it visible!
                const isRearCube = cube.instance.position.z > rearFallZ;

                if (!isRearCube && cube.instance.position.y < cube.originalY - CONFIG.cubeSize * 3) {
                    cube.state = "fallen";
                    cube.instance.isVisible = false;

                    // Record gap position for collision detection
                    fallenCubePositions.set(getCubeKey(cube), {
                        x: cube.instance.position.x,
                        z: cube.instance.position.z,
                    });
                }
            }

            // ----------------------------------------------------------
            // 4) TRIGGER FALLING (random chance in trigger zone)
            // Creates variable-sized holes using 2x2 patterns (1-4 cubes)
            // ----------------------------------------------------------
            if (cube.state === "active" && !DEBUG_DISABLE_HOLES && gracePeriodTimer <= 0) {
                const cubeZ = cube.instance.position.z;

                // Check if cube is in trigger zone
                if (cubeZ > CONFIG.triggerZoneEnd && cubeZ < CONFIG.triggerZoneStart) {
                    // Random chance to fall
                    // DIFFICULTY SCALING: Increase probability over time
                    // DIFFICULTY MULTIPLIER (based on match timer)
                    const store = useGameStore.getState();
                    const totalMatch = Math.max(1, store.matchDuration);
                    const elapsedMatch = totalMatch - store.matchTimeRemaining;
                    const progressMatch = Math.min(1.0, elapsedMatch / totalMatch);
                    const difficultyMult = 1.0 + (progressMatch * 1.5); // 1.0 to 2.5 (more aggressive than speed)

                    const fallChance = CONFIG.fallProbabilityPerSecond * difficultyMult * dt;
                    if (Math.random() < fallChance) {
                        // Check safe path constraint
                        if (canCubeFall(cube)) {
                            // Trigger this cube
                            cube.state = "falling";
                            cube.fallVelocity = 0;

                            // Randomly decide hole size (1-4 cubes in 2x2 pattern)
                            // 40% chance = 1 cube, 30% = 2 cubes, 20% = 3 cubes, 10% = 4 cubes
                            const sizeRoll = Math.random();
                            let holePattern: [number, number][] = [[0, 0]]; // Always include origin

                            if (sizeRoll > 0.4) {
                                // 2+ cubes - add one adjacent (either +X or +Z)
                                if (Math.random() > 0.5) {
                                    holePattern.push([1, 0]); // Right
                                } else {
                                    holePattern.push([0, 1]); // Forward
                                }
                            }
                            if (sizeRoll > 0.7) {
                                // 3+ cubes - add diagonal opposite
                                holePattern.push([1, 1]);
                            }
                            if (sizeRoll > 0.9) {
                                // 4 cubes - complete the 2x2
                                if (!holePattern.some(([x, z]) => x === 1 && z === 0)) holePattern.push([1, 0]);
                                if (!holePattern.some(([x, z]) => x === 0 && z === 1)) holePattern.push([0, 1]);
                            }

                            // Apply pattern to adjacent cubes
                            for (const [offsetX, offsetZ] of holePattern) {
                                if (offsetX === 0 && offsetZ === 0) continue; // Already triggered origin

                                const targetGridX = cube.gridX + offsetX;
                                const targetGridZ = cube.gridZ + offsetZ;

                                // Find adjacent cube
                                const adjacent = allCubes.find(c =>
                                    c.gridX === targetGridX &&
                                    c.gridZ === targetGridZ &&
                                    c.segmentIndex === cube.segmentIndex &&
                                    c.state === "active"
                                );

                                if (adjacent && canCubeFallForPattern(adjacent)) {
                                    adjacent.state = "falling";
                                    adjacent.fallVelocity = 0;
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    // ----------------------------------------------------------
    // CELL HOLE CHECK - Only cell centers can fall
    // ----------------------------------------------------------
    function canCubeFall(cube: CubeData): boolean {
        // 1. ABSOLUTE PRIORITY: GROUND LOCK (Safety Corridors)
        // If the ground is locked by an obstacle, it is invulnerable.
        // This check must come before everything else (probability, limits, etc.)
        if (obstacleChecker) {
            if (obstacleChecker(cube.instance.position.x, cube.instance.position.z, CONFIG.cubeSize)) {
                return false;
            }
        }

        // 2. Never outside lanes (exclude 0 and 9 for width 10)
        // Allow columns 1-8 (Center lanes)
        if (cube.gridX < 1 || cube.gridX > 8) {
            return false;
        }

        // 3. Guaranteed Safe Path (Path Weaver)
        if (cube.isSafePath) return false;

        // 4. Enforce Z spacing (every 6 units) - Fewer rows with holes
        if (cube.gridZ % 6 !== 0) {
            return false;
        }

        // 5. MAX 1 HOLE PER ROW - Creates clustered, predictable gaps
        // Count how many cubes in this row (same gridZ, same segment) have already fallen.
        // If 1 or more, don't allow another hole.
        let holesInRow = 0;
        for (const other of allCubes) {
            if (other.gridZ === cube.gridZ && other.segmentIndex === cube.segmentIndex) {
                if (other.state === "falling" || other.state === "fallen") {
                    holesInRow++;
                }
            }
        }
        if (holesInRow >= 1) {
            return false;
        }

        return true;
    }

    // ----------------------------------------------------------
    // PATTERN HOLE CHECK - For adjacent cubes in 2x2 patterns
    // Simpler check without row limit (pattern already decided)
    // ----------------------------------------------------------
    function canCubeFallForPattern(cube: CubeData): boolean {
        // 1. Ground lock check
        if (obstacleChecker) {
            if (obstacleChecker(cube.instance.position.x, cube.instance.position.z, CONFIG.cubeSize)) {
                return false;
            }
        }

        // 2. Lane boundaries (1-8 for width 10)
        if (cube.gridX < 1 || cube.gridX > 8) {
            return false;
        }

        // 3. Safe path protection
        if (cube.isSafePath) return false;

        return true;
    }

    // ----------------------------------------------------------
    // GAP DETECTION FOR PLAYER
    // ----------------------------------------------------------
    function isOverGap(playerX: number, playerZ: number): boolean {
        // Radius set to 10.0. Cubes are 25 units wide (centers at 25, 50, etc). 
        // Lanes are at 30 units. A player at 30 over a hole at 25 has dx=5.
        // A radius of 10.0 correctly registers them inside the hole but prevents falling on solid adjacent edges.
        const searchRadius = 10.0;

        for (const cube of allCubes) {
            if (cube.state === "fallen") {
                // PERFORMANCE: skip cubes too far away
                const distZ = Math.abs(playerZ - cube.instance.position.z);
                if (distZ > 50) continue;

                // Use the LIVE instance position, not a stored snapshot
                const dx = Math.abs(playerX - cube.instance.position.x);
                const dz = Math.abs(playerZ - cube.instance.position.z);

                if (dx < searchRadius && dz < searchRadius) {
                    return true;
                }
            }
        }
        return false;
    }

    function getGapBoundingBoxes(): { min: BABYLON.Vector3; max: BABYLON.Vector3 }[] {
        const boxes: { min: BABYLON.Vector3; max: BABYLON.Vector3 }[] = [];
        const halfCube = CONFIG.cubeSize / 2;

        for (const [, pos] of fallenCubePositions) {
            boxes.push({
                min: new BABYLON.Vector3(pos.x - halfCube, -100, pos.z - halfCube),
                max: new BABYLON.Vector3(pos.x + halfCube, 0, pos.z + halfCube),
            });
        }

        return boxes;
    }

    // ----------------------------------------------------------
    // RESET
    // ----------------------------------------------------------
    function reset() {
        for (const cube of allCubes) {
            cube.state = "active";
            cube.fallVelocity = 0;
            cube.instance.position.y = cube.originalY;
            cube.instance.isVisible = true;
        }
        fallenCubePositions.clear();
        gracePeriodTimer = 4.0; // Restores grace period on restart
        console.log("🔄 Falling cube road reset");
    }

    // ----------------------------------------------------------
    // REPAIR ROAD (fill gap at position)
    // ----------------------------------------------------------
    function fillGapAt(x: number, z: number): void {
        const searchRadius = CONFIG.cubeSize * 2.5; // Expanded to repair all cubes within a 2x2/3x3 area

        for (const cube of allCubes) {
            // Find nearby fallen OR falling cubes
            if (cube.state === "fallen" || cube.state === "falling") {
                const dx = Math.abs(x - cube.instance.position.x);
                const dz = Math.abs(z - cube.instance.position.z);

                if (dx < searchRadius && dz < searchRadius) {
                    // Restore this cube
                    console.log("🩹 Repairing road gap under player");
                    cube.state = "active";
                    cube.fallVelocity = 0;
                    cube.instance.position.y = cube.originalY;
                    cube.instance.isVisible = true;
                    // Remove from fallen tracking
                    fallenCubePositions.delete(getCubeKey(cube));
                    // Keep looping to fix all nearby cubes in the radius
                }
            }
        }
    }

    // ----------------------------------------------------------
    // TRIGGER MASS FALL - Make cubes near player fall (death scene)
    // ----------------------------------------------------------
    function triggerMassFall(playerX: number, playerZ: number) {
        const fallRadius = 80; // Cubes within this radius will fall
        let triggered = 0;

        for (const cube of allCubes) {
            if (cube.state !== "active") continue;

            const dx = Math.abs(cube.instance.position.x - playerX);
            const dz = Math.abs(cube.instance.position.z - playerZ);
            const distance = Math.sqrt(dx * dx + dz * dz);

            if (distance < fallRadius) {
                // Stagger the fall based on distance for dramatic effect
                const delay = distance * 5; // ms delay based on distance

                setTimeout(() => {
                    if (cube.state === "active") {
                        cube.state = "falling";
                        cube.fallVelocity = 0;

                        // Spawn debris for visual effect
                        spawnDebris(
                            cube.instance.position.x,
                            cube.instance.position.y,
                            cube.instance.position.z
                        );
                    }
                }, delay);

                triggered++;
            }
        }

        console.log(`💥 Mass fall triggered! ${triggered} cubes will fall`);
    }

    // ----------------------------------------------------------
    // DISPOSE
    // ----------------------------------------------------------
    function dispose() {
        scene.onBeforeRenderObservable.remove(updateObserver);
        scene.onBeforeRenderObservable.remove(shadowCatcherObserver);
        unsubscribe(); // Remove game state listener

        for (const cube of allCubes) {
            cube.instance.dispose();
        }
        allCubes.length = 0;

        sourceCube.dispose();
        layeredMaterial.dispose();
        shadowCatcherPlane.dispose();
        shadowCatcherMaterial.dispose();
        fallenCubePositions.clear();

        // Dispose debris system
        for (const piece of debrisPool) {
            piece.mesh.dispose();
        }
        debrisPool.length = 0;
        activeDebris.length = 0;
        sourceDebris.dispose();

        console.log("🗑️ Falling cube road disposed");
    }

    // ----------------------------------------------------------
    // RETURN CONTROLLER
    // ----------------------------------------------------------
    return {
        getGapBoundingBoxes,
        isOverGap,
        reset,
        rebuild,
        fillGapAt,
        triggerMassFall,
        setObstacleChecker: (checker) => { obstacleChecker = checker; },
        dispose,
    };
}
