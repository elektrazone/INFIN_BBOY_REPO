// src/components/obstacles/obstacleSystem.ts
import * as BABYLON from "@babylonjs/core";
import { scanObstacleFolders } from "./obstacleModelScanner";
import { ObstacleGLBBuilder } from "./obstacleGLBBuilder";
import { getObstacleMaterial } from "../materials/MaterialFactory";
import { buildHamburgerObstacle } from "./hamburgerBuilder";

import { ALL_PATTERNS, ObstaclePattern } from "./obstaclePatterns";

export type ObstacleType = "jump" | "duck" | "platform" | "insuperable" | "hamburger";

const HAMBURGER_AS_JUMP_PROBABILITY = 0;
const HAMBURGER_AS_INSUPERABLE_PROBABILITY = 0;

export interface ObstacleSystemOptions {
  laneWidth?: number;
  laneCount?: number;
  spawnZ?: number;
  despawnZ?: number;
  minSpawnDelay?: number;
  maxSpawnDelay?: number;
}

// SAFETY CORRIDORS CONSTANTS - Granular Control
// ENTRY: Space before the obstacle (Run-up/Visibility)
const BUFFER_ENTRY_JUMP = 130;
const BUFFER_ENTRY_DUCK = 100;
const BUFFER_ENTRY_PLAT = 100;
const BUFFER_ENTRY_WALL = 60;

// EXIT: Space after the obstacle (Landing/Recovery Animation)
const BUFFER_EXIT_JUMP = 50;
const BUFFER_EXIT_DUCK = 80;  // CRITICAL: Room for recovery animation (1.0s)
const BUFFER_EXIT_PLAT = 60;
const BUFFER_EXIT_WALL = 20;

import { CoinController } from "../world/coinSystem";

export interface ObstacleController {
  getActiveObstacles(): ObstacleInstance[];
  getActivePlatformMeshes(): BABYLON.AbstractMesh[];
  dispose(): void;
  reset(): void;
  isReady(): boolean;
  hasObstacleAt(x: number, z: number, radius: number): boolean;
  isGroundLocked(x: number, z: number, laneWidth: number): boolean;
}

export interface ObstacleInstance {
  mesh: BABYLON.AbstractMesh;
  collisionMeshes: BABYLON.AbstractMesh[];
  type: ObstacleType;
  variant?: number;
  isHamburgerVariant?: boolean;
  active: boolean;
  speedMultiplier?: number;
}

// ... [BUILDER FUNCTIONS RIMANGONO INVARIATE: buildJumpObstacle, buildDuckObstacle, etc.] ...
function buildJumpObstacle(scene: BABYLON.Scene, material: BABYLON.Material): BABYLON.Mesh {
  const mesh = BABYLON.MeshBuilder.CreateBox("obs_jump", { width: 12, height: 12, depth: 14 }, scene);
  mesh.material = material;
  mesh.position.y = 6;
  return mesh;
}
function buildDuckObstacle(scene: BABYLON.Scene, material: BABYLON.Material): BABYLON.Mesh {
  const frame = BABYLON.MeshBuilder.CreateBox("obs_duck", { width: 18, height: 6, depth: 10 }, scene);
  frame.material = material;
  frame.position.y = 12;
  return frame;
}
function buildPlatformObstacle(scene: BABYLON.Scene, material: BABYLON.Material): BABYLON.Mesh {
  const width = 18; const height = 15; const depth = 90;
  const platform = BABYLON.MeshBuilder.CreateBox("obs_platform", { width, height, depth }, scene);
  platform.material = material;
  platform.position.y = height / 2;
  return platform;
}
function buildInsuperableObstacle(scene: BABYLON.Scene, material: BABYLON.Material): BABYLON.Mesh {
  const hamburger = buildHamburgerObstacle(scene, 1.5);
  hamburger.name = "obs_insuperable";
  return hamburger;
}

import { useGameStore } from "../../store/gameStore";

export function createObstacleSystem(
  scene: BABYLON.Scene,
  shadowGenerator: BABYLON.ShadowGenerator,
  getScrollSpeed: () => number,
  coinController: CoinController,
  options: ObstacleSystemOptions = {},
  onReady?: () => void
): ObstacleController {
  const laneWidth = options.laneWidth ?? 25;
  const laneCount = options.laneCount ?? 3;
  const spawnZ = options.spawnZ ?? -400;
  const despawnZ = options.despawnZ ?? 200;

  const materials = {
    jump: getObstacleMaterial(scene, "jump"),
    duck: getObstacleMaterial(scene, "duck"),
    platform: getObstacleMaterial(scene, "platform"),
    insuperable: getObstacleMaterial(scene, "insuperable"),
    hamburger: getObstacleMaterial(scene, "jump"),
  };

  const modelMap = scanObstacleFolders();
  let glbsReady = false;

  ObstacleGLBBuilder.preloadAll(scene, modelMap).then(() => {
    glbsReady = true;
    console.log("✅ Obstacle GLBs ready");
    if (onReady) onReady();
  });

  const root = new BABYLON.TransformNode("obstacles_root", scene);

  const obstacleBuilders: Record<ObstacleType, () => BABYLON.Mesh> = {
    jump: () => buildJumpObstacle(scene, materials.jump),
    duck: () => buildDuckObstacle(scene, materials.duck),
    platform: () => buildPlatformObstacle(scene, materials.platform),
    insuperable: () => buildInsuperableObstacle(scene, materials.insuperable),
    hamburger: () => buildHamburgerObstacle(scene, 0.8),
  };

  const obstaclePool: ObstacleInstance[] = [];
  const activeObstacles: ObstacleInstance[] = [];

  function acquire(type: ObstacleType) {
    let useHamburger = false;
    if (type !== "hamburger") {
      if (type === "jump") useHamburger = Math.random() < HAMBURGER_AS_JUMP_PROBABILITY;
      else if (type === "insuperable") useHamburger = Math.random() < HAMBURGER_AS_INSUPERABLE_PROBABILITY;
    }

    const variantCount = ObstacleGLBBuilder.getVariantCount(type);
    const variantIndex = variantCount > 0 ? Math.floor(Math.random() * variantCount) : undefined;

    const pooled = obstaclePool.find((o) => {
      if (o.type !== type || o.active) return false;
      const isHamburger = !!o.isHamburgerVariant;
      if (isHamburger !== useHamburger) return false;
      if (variantIndex === undefined) return true;
      return o.variant === variantIndex || o.variant === undefined;
    });

    if (pooled) {
      pooled.active = true;
      pooled.mesh.setEnabled(true);

      // Randomize speed for platforms when re-acquired
      if (type === "platform") {
        pooled.speedMultiplier = 1.2 + Math.random() * 1.0; // 1.2 to 2.2
      } else {
        pooled.speedMultiplier = 1.0;
      }

      return pooled;
    }

    let mesh: BABYLON.AbstractMesh | null = null;
    let collisionMeshes: BABYLON.AbstractMesh[] | null = null;
    let variantUsed: number | undefined = variantIndex;
    let isHamburgerVariant = false;

    if (useHamburger) {
      const scale = type === "insuperable" ? 2.0 : 0.8;
      mesh = buildHamburgerObstacle(scene, scale);
      collisionMeshes = [mesh];
      variantUsed = undefined;
      isHamburgerVariant = true;
    } else {
      const glbResult = variantIndex !== undefined
        ? ObstacleGLBBuilder.getMesh(type, scene, variantIndex)
        : ObstacleGLBBuilder.getMesh(type, scene);

      if (glbResult) {
        mesh = glbResult.root;
        collisionMeshes = glbResult.collisionMeshes;
      } else {
        mesh = obstacleBuilders[type]();
        collisionMeshes = [mesh];
        variantUsed = undefined;
      }
      isHamburgerVariant = false;
    }

    mesh.parent = root;
    mesh.receiveShadows = true;
    mesh.metadata = { obstacleType: type, variant: variantUsed, isHamburgerVariant };
    shadowGenerator.addShadowCaster(mesh, true);

    // Allow bounding boxes to sync normally as objects move towards the player
    if (collisionMeshes) {
        // Ensure collision meshes also sync bounds with their parents/transforms
        collisionMeshes.forEach(col => col.doNotSyncBoundingInfo = false);
    }

    const created: ObstacleInstance = {
      mesh,
      collisionMeshes: collisionMeshes ?? [mesh],
      type,
      variant: variantUsed,
      isHamburgerVariant,
      active: true,
      speedMultiplier: type === "platform" ? (1.2 + Math.random() * 1.0) : 1.0
    };
    obstaclePool.push(created);
    return created;
  }

  // --- COSTANTI DI AZIONE ---
  // Nota: JUMP_COST è 1.3s, ma in un "Burst" vogliamo spawnare PRIMA che finisca.
  const JUMP_COST = 1.3;
  const DUCK_COST = 1.0;
  const PLAT_COST = 1.8;
  const LANE_COST = 0.4;

  const getDifficultyMultiplier = () => {
    const store = useGameStore.getState();
    const total = Math.max(1, store.matchDuration);
    const elapsed = total - store.matchTimeRemaining;
    const progress = Math.min(1.0, elapsed / total);
    return 1.0 + (progress * 1.0); // 1.0 to 2.0
  };

  let spawnTimer = 1.0;
  let currentPattern: ObstaclePattern = ALL_PATTERNS[0];
  let currentPatternIndex = 0;
  let nextSpawnDelay = 4.0; // Start with a safe 4 second buffer

  // State tracking
  let lastActionCost = 0;
  let lastSafeLane = 0;

  function spawnFromPattern() {
    if (currentPatternIndex >= currentPattern.length) {
      const randomIndex = Math.floor(Math.random() * ALL_PATTERNS.length);
      currentPattern = ALL_PATTERNS[randomIndex];
      currentPatternIndex = 0;
      console.log("Switched to pattern index:", randomIndex);
    }

    const speed = getScrollSpeed();
    const step = currentPattern[currentPatternIndex];
    let maxDepthInStep = 0;

    // Logica Open Lanes per determinare la Safe Lane
    let openLanes = [true, true, true]; // -1, 0, 1
    let currentStepActionCost = 0;

    for (const def of step.obstacles) {
      const obs = acquire(def.type);
      const xPos = def.laneIndex * laneWidth;
      const laneArrIdx = def.laneIndex + 1;

      // Mark blocked lanes
      if (laneArrIdx >= 0 && laneArrIdx <= 2) {
        // Se è insuperable, blocca la corsia
        // Se è jump/duck/platform, è "bloccata" nel senso che ha un costo, ma è percorribile
        if (def.type === "insuperable") openLanes[laneArrIdx] = false;
      }

      // Action Cost
      let cost = 0;
      if (def.type === "jump") cost = JUMP_COST;
      else if (def.type === "duck") cost = DUCK_COST;
      else if (def.type === "platform") cost = PLAT_COST;
      if (cost > currentStepActionCost) currentStepActionCost = cost;

      const source = obs.mesh.metadata?.sourceUrl || "";
      const isCar = source.toLowerCase().includes("car");
      const isPlatformCar = isCar && obs.type === "platform";
      const yOffset = isPlatformCar ? -3 : 0;

      obs.mesh.position.set(xPos, obs.mesh.position.y + yOffset, spawnZ);

      // Depth Check
      let depth = 12;
      if (def.type === "platform") depth = 90;
      else if (def.type === "duck") depth = 10;
      else if (def.type === "insuperable") depth = 14;
      if (depth > maxDepthInStep) maxDepthInStep = depth;

      // Rotation
      const isFries = source.toLowerCase().includes("fries");
      if (isCar && (obs.type === "insuperable" || obs.type === "platform")) {
        const isRightSide = def.laneIndex >= 0;
        obs.mesh.rotation.y = isRightSide ? Math.PI : 0;
      } else if (!isFries) {
        // Don't reset rotation for fries - it's set in GLBBuilder
        obs.mesh.rotation.y = 0;
      }
      activeObstacles.push(obs);
    }

    // Determine current Safe Lane (heuristic)
    let bestLane = lastSafeLane;
    // 1. Cerca corsia libera (senza ostacoli insuperable)
    // 2. Se non c'è, cerca corsia interagibile (jump/duck)
    // Priorità alla corsia più vicina alla precedente
    let minDist = 999;
    let foundOpen = false;

    // Prima passata: cerchiamo corsie "vere" libere (senza nulla)
    // Ma nel nostro sistema, spesso "Safe Lane" = "Lane with Jump".
    // Quindi ricalcoliamo openLanes basandoci SOLO su Insuperable.
    let playableLanes = [true, true, true];
    step.obstacles.forEach(o => {
      if (o.type === "insuperable") playableLanes[o.laneIndex + 1] = false;
    });

    for (let l = -1; l <= 1; l++) {
      if (playableLanes[l + 1]) {
        const dist = Math.abs(l - lastSafeLane);
        if (dist < minDist) {
          minDist = dist;
          bestLane = l;
          foundOpen = true;
        }
      }
    }

    const currentSafeLane = bestLane;
    const isSameLane = (currentSafeLane === lastSafeLane);
    const laneChangeDiff = Math.abs(currentSafeLane - lastSafeLane);
    const laneBuffer = laneChangeDiff * LANE_COST;

    // Spawn Coins
    if (step.coins) {
      for (const coinDef of step.coins) {
        // Find if there's a platform just spawned in the same lane to sync the coin speed to the bus
        const laneX = coinDef.laneIndex * laneWidth;
        let coinSpeedMultiplier = 1.0;
        
        for (const o of activeObstacles) {
            if (o.active && o.type === "platform" && Math.abs(o.mesh.position.x - laneX) < 1.0 && Math.abs(o.mesh.position.z - spawnZ) < 20) {
                coinSpeedMultiplier = o.speedMultiplier || 1.0;
                break;
            }
        }
        
        coinController.spawnCoin(
            coinDef.laneIndex, 
            coinDef.yOffset || 0, 
            coinDef.count || 1, 
            coinDef.spacing || 10, 
            coinDef.arcHeight || 0, 
            coinSpeedMultiplier,
            coinDef.zOffset || 0
        );
      }
    }

    // --- CALCOLO DELAY INTELLIGENTE ---

    // 1. Difficoltà
    const timeSinceStart = performance.now() / 1000;
    const speedMultiplier = Math.max(0.4, 1.0 - (timeSinceStart / 300));

    // Delay Base dal Pattern - multiply by 2 to reduce obstacles by 50%
    let patternDelay = step.delayNext * speedMultiplier * 2.0;

    // 2. Sicurezza Fisica (Mesh Overlap)
    // Questo è il limite "Hard": non possiamo spawnare dentro un altro oggetto.
    let meshSafetyDelay = 0;
    if (speed > 0) {
      // Buffer ridotto a 10 per permettere spawn più vicini
      meshSafetyDelay = (maxDepthInStep + 10) / speed;
    }

    // 3. Action Window (Il Comfort Umano)
    // Se rimaniamo nella STESSA corsia, siamo aggressivi (ignoriamo parte del costo azione).
    // Se cambiamo corsia, siamo protettivi (sommiamo costo azione + spostamento).

    let requiredHumanTime = 0;

    if (isSameLane) {
      // BURST MODE INTELLIGENTE
      // Se l'azione precedente era veloce (es. Duck o semplice corsa), possiamo spawnare subito (0.6s).
      // MA se l'azione precedente richiedeva gravità (Jump o Platform), DOBBIAMO aspettare l'atterraggio.

      // JUMP_COST = 1.3, PLAT_COST = 1.8. 
      // Se lastActionCost è > 1.1, significa che siamo in aria o su una struttura.
      if (lastActionCost > 1.1) {
        requiredHumanTime = lastActionCost; // Aspetta di atterrare! (es. 1.3s)
      } else {
        requiredHumanTime = 0.6; // Burst rapido (es. dopo Duck o cambio corsia)
      }
    } else {
      // SWITCH MODE (Cambio corsia)
      // Sommiamo sempre il costo dell'azione precedente + il tempo di spostamento
      requiredHumanTime = lastActionCost + laneBuffer;
    }

    // FORMULA FINALE
    let finalDelay = Math.max(
      patternDelay,       // Design
      meshSafetyDelay,    // Fisica
      requiredHumanTime   // Umano
    );

    // --- DIFFICULTY SCALING ---
    // Multiply by speed and decrease delay
    const difficulty = getDifficultyMultiplier();
    finalDelay = finalDelay / difficulty;

    // Hard floor assoluto per evitare bug fisici
    if (finalDelay < 0.5) finalDelay = 0.5;

    nextSpawnDelay = finalDelay;

    // Aggiorna stato
    lastActionCost = currentStepActionCost;
    lastSafeLane = currentSafeLane;
    currentPatternIndex++;
  }

  // ... [RESTO DEL FILE INVARIATO: Observer, dispose, reset, ecc.] ...
  const observer = scene.onBeforeRenderObservable.add(() => {
    const state = useGameStore.getState().gameState;
    const speed = getScrollSpeed();
    const isBounceBack = state === "gameover" && speed < 0;

    if (state !== "playing" && !isBounceBack) return;

    const dt = scene.getEngine().getDeltaTime() / 1000;
    if (speed === 0) return;

    const movement = speed * dt;

    for (const obs of activeObstacles) {
      // Each platform has its own speedMultiplier
      const multiplier = obs.speedMultiplier || 1.0;
      obs.mesh.position.z += movement * multiplier;

      if (obs.type === "insuperable") {
        const sourceUrl = obs.mesh.metadata?.sourceUrl || "";
        if (sourceUrl.toLowerCase().includes("soda")) {
          obs.mesh.rotate(BABYLON.Axis.Y, dt * 1.5, BABYLON.Space.LOCAL);
        }
      }
    }

    for (let i = activeObstacles.length - 1; i >= 0; i--) {
      const obs = activeObstacles[i];
      if (obs.mesh.position.z > despawnZ) {
        obs.active = false;
        obs.mesh.setEnabled(false);
        activeObstacles.splice(i, 1);
      }
    }

    // DEMO MODE: Obstacles disabled for recording
    const DEBUG_DISABLE_OBSTACLES = false;
    if (speed > 0 && !DEBUG_DISABLE_OBSTACLES) {
      spawnTimer += dt;
      if (spawnTimer >= nextSpawnDelay) {
        spawnTimer = 0;
        spawnFromPattern();
      }
    }
  });

  function dispose() {
    if (observer) scene.onBeforeRenderObservable.remove(observer);
    obstaclePool.forEach((o) => o.mesh.dispose());
    root.dispose();
  }
  function getActiveObstacles() { return activeObstacles; }
  function getActivePlatformMeshes() { return activeObstacles.filter((o) => o.type === "platform").map((o) => o.mesh); }
  function reset() {
    activeObstacles.forEach(o => { o.active = false; o.mesh.setEnabled(false); });
    activeObstacles.length = 0;
    spawnTimer = 0;
    currentPatternIndex = 0;
    nextSpawnDelay = 4.0; // Grace period on restart
    const randomIndex = Math.floor(Math.random() * ALL_PATTERNS.length);
    currentPattern = ALL_PATTERNS[randomIndex];
    console.log("Obstacle system reset");
  }
  function isReady() { return glbsReady; }

  function isGroundLocked(x: number, z: number, laneWidth: number): boolean {
    for (const obs of activeObstacles) {
      if (!obs.active) continue;

      // Wider lane check - cover full lane width to guarantee no holes near obstacles
      const dx = Math.abs(x - obs.mesh.position.x);
      if (dx >= laneWidth) continue; // Check full lane width (was 0.45x)

      const obsZ = obs.mesh.position.z;
      let isLocked = false;

      switch (obs.type) {
        case "duck":
          isLocked = z >= obsZ - BUFFER_EXIT_DUCK && z <= obsZ + BUFFER_ENTRY_DUCK;
          break;
        case "jump":
          isLocked = z >= obsZ - BUFFER_EXIT_JUMP && z <= obsZ + BUFFER_ENTRY_JUMP;
          break;
        case "platform":
          // Platform has depth 90, so it extends 45 units in each direction from center
          isLocked = z >= obsZ - (45 + BUFFER_EXIT_PLAT) && z <= obsZ + (45 + BUFFER_ENTRY_PLAT);
          break;
        case "insuperable":
          isLocked = z >= obsZ - BUFFER_EXIT_WALL && z <= obsZ + BUFFER_ENTRY_WALL;
          break;
      }

      if (isLocked) return true;
    }
    return false;
  }

  function hasObstacleAt(x: number, z: number, radius: number): boolean {
    for (const obs of activeObstacles) {
      if (!obs.active) continue;
      const dx = x - obs.mesh.position.x;
      const dz = z - obs.mesh.position.z;
      if (dx * dx + dz * dz < radius * radius) return true;
    }
    return false;
  }

  return { dispose, getActiveObstacles, getActivePlatformMeshes, reset, isReady, hasObstacleAt, isGroundLocked };
}