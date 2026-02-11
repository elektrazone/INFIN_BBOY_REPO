// src/components/player/playerController.ts
import * as BABYLON from "@babylonjs/core";

import { loadPlayerModel } from "./playerModel";
import {
  PlayerState,
  createPlayerStateMachine,
} from "./playerStateMachine";
import { ObstacleController, ObstacleInstance } from "../obstacles/obstacleSystem";
import { CoinController } from "../world/coinSystem";
import { FallingCubeRoadController } from "../world/fallingCubeRoad";
import { useGameStore } from "../../store/gameStore";
import { createImpactVFX } from "./impactVFX";
import { getAudioManager } from "../audio/audioManager";
import { CAMERA_DEFAULTS, INTRO_CAMERA_DEFAULTS } from "../../config/cameraDefaults";
export type PlayerAABB = { min: BABYLON.Vector3; max: BABYLON.Vector3 };

export interface PlayerController {
  handleKeyDown(event: KeyboardEvent): void;
  handleKeyUp(event: KeyboardEvent): void;
  handleTouchStart(event: TouchEvent): void;
  handleTouchMove(event: TouchEvent): void;
  handleTouchEnd(event: TouchEvent): void;
  handlePointerDown(event: PointerEvent): void;
  handlePointerUp(event: PointerEvent): void;
  startGame(): void;
  ensureIdle(): void;
  dispose(): void;
  reset(): void;
  triggerCheer(): void;
  triggerVictorySequence(): void;
  isVictorySequenceActive(): boolean;
  cameraTarget?: BABYLON.TransformNode; // Exposed for manual panning
}

// --------------------------------------------------
// DEBUG CONFIG
// --------------------------------------------------
const DEBUG = {
  showRay: false,
  showPlayerAABB: false,
  showPlatformAABB: true,
};

// --------------------------------------------------
// TUNING CONFIG (jump & slide AABB offsets)
// --------------------------------------------------
const TUNING = {
  jumpAABBOffset: 4,   // aumenta il bound durante salto
  slideAABBOffset: 2,  // abbassa ulteriormente il bound in scivolata
};

let lastPlatformDebug = 0;

export function setupPlayerController(
  scene: BABYLON.Scene,
  camera: BABYLON.ArcRotateCamera,
  modelRoot: string,
  shadowGenerator: BABYLON.ShadowGenerator,
  setScrollSpeed: (speed: number) => void,
  obstacleController: ObstacleController,
  coinController: CoinController,
  fallingCubeRoadController?: FallingCubeRoadController,
  onReady?: () => void
): PlayerController {
  // ------------------------------------------
  // INPUT STATE
  // ------------------------------------------
  const keyState = {
    forward: false,
    slide: false,
    jump: false,
    leftPressed: false,
    rightPressed: false,
  };

  let debugOverrideState: PlayerState | null = null;

  const debugKeyMap = {
    Digit1: "Idle",
    Digit2: "Run",
    Digit3: "Slide",
    Digit4: "Jump",
    Digit5: "Run_Idle",
  } as const;

  // ------------------------------------------
  // LANE SYSTEM CONFIG
  // ------------------------------------------
  const laneWidth = 30; // Adjusted from 25 to match 9-column cube centers (-30, 0, 30)
  const maxLane = 1;
  let currentLane = 0;
  let targetX = 0;
  const lateralLerp = 0.12;

  // ------------------------------------------
  // GAME FLOW
  // ------------------------------------------
  let gameStarted = false;
  let requestedStart = false;
  let isFirstStart = true; // Track if this is the very first game start
  let introPlaying = false; // Track if intro sequence is active
  let isVictorySequenceActive = false; // Block input and trigger orbit
  let activeZoomObserver: BABYLON.Observer<BABYLON.Scene> | null = null;

  // ------------------------------------------
  // PLAYER ROOT + STATE MACHINE
  // ------------------------------------------
  let playerRoot: BABYLON.TransformNode | null = null;
  let stateMachine: ReturnType<typeof createPlayerStateMachine> | null = null;
  let baseY = 0;
  let groundBaseY = 0;
  let isOnPlatform = false;

  const playerCollider = {
    halfWidth: 0,
    halfDepth: 0,
    standingHeight: 0,
    slideHeight: 0,
    centerOffsetY: 0,
    slideCenterOffsetY: 0,
    initialized: false,
  };

  let platformRayHelper: BABYLON.RayHelper | null = null;

  // Invulnerability duration must cover Fall (3.1s) + Getup (9.5s) animations + safety margin
  const INVULNERABILITY_AFTER_HIT = 4.0;
  let invulnerabilityTimer = 0;
  let isFallingInGap = false; // Flag for physical falling

  // ------------------------------------------
  // BOUNCE-BACK EFFECT (on collision)
  // ------------------------------------------
  const BOUNCE_BACK_DURATION = 0.25; // seconds - quick, sharp bounce
  const BOUNCE_BACK_INTENSITY = 3.0; // multiplier for reverse speed
  let bounceBackActive = false;
  let bounceBackTimer = 0;

  // ------------------------------------------
  // KINEMATIC JUMP
  // ------------------------------------------
  const jumpMotion = {
    active: false,
    velocity: 0,
    gravity: -488,
    jumpStrength: 180, // Increased from 163 for easier clearing
  };

  function startJumpMotion() {
    if (!playerRoot) return;
    if (jumpMotion.active) return;
    jumpMotion.active = true;
    jumpMotion.velocity = jumpMotion.jumpStrength;

    // Play jump sound effect
    const audio = getAudioManager();
    if (audio) audio.playSFX("sfx_jump");
  }

  // ------------------------------------------
  // CAMERA OFFSET STATE
  // ------------------------------------------
  let savedYOffset: number | null = null;

  function updateJumpMotion(dt: number) {
    if (!playerRoot) return;

    if (!jumpMotion.active) {
      // If falling in a gap, allow gravity to continue pulling down
      // Note: Death fall is now handled at the top of the main update loop for priority.
      if (isFallingInGap && useGameStore.getState().gameState === "playing") {
        jumpMotion.velocity += jumpMotion.gravity * dt;
        playerRoot.position.y += jumpMotion.velocity * dt;
        return;
      }

      if (playerRoot.position.y !== baseY && useGameStore.getState().gameState === "playing") {
        playerRoot.position.y = baseY;
      }
      return;
    }

    jumpMotion.velocity += jumpMotion.gravity * dt;
    playerRoot.position.y += jumpMotion.velocity * dt;

    if (playerRoot.position.y <= baseY) {
      playerRoot.position.y = baseY;
      jumpMotion.active = false;
      jumpMotion.velocity = 0;
      if (!debugOverrideState && stateMachine) {
        stateMachine.setPlayerState("Run", true);
      }
    }
  }

  // ------------------------------------------
  // AABB PLAYER
  // ------------------------------------------
  function computePlayerAABB(): PlayerAABB | null {
    if (!playerRoot || !playerCollider.initialized) return null;

    const isSliding = stateMachine?.currentState === "Slide";
    const height = isSliding
      ? playerCollider.slideHeight
      : playerCollider.standingHeight;

    let centerOffset = isSliding
      ? playerCollider.slideCenterOffsetY
      : playerCollider.centerOffsetY;

    // ------------------------------------------------
    // TUNING: aumento del bound in salto
    // ------------------------------------------------
    if (jumpMotion.active) {
      centerOffset += TUNING.jumpAABBOffset;
    }

    // ------------------------------------------------
    // TUNING: riduzione del bound in scivolata
    // ------------------------------------------------
    if (isSliding) {
      centerOffset -= TUNING.slideAABBOffset;
    }

    const center = new BABYLON.Vector3(
      playerRoot.position.x,
      playerRoot.position.y + centerOffset,
      playerRoot.position.z
    );

    const halfHeight = height * 0.5;

    const aabb = {
      min: new BABYLON.Vector3(
        center.x - playerCollider.halfWidth,
        center.y - halfHeight,
        center.z - playerCollider.halfDepth
      ),
      max: new BABYLON.Vector3(
        center.x + playerCollider.halfWidth,
        center.y + halfHeight,
        center.z + playerCollider.halfDepth
      ),
    };

    // DEBUG DRAW PLAYER AABB
    if (DEBUG.showPlayerAABB) {
      const w = aabb.max.x - aabb.min.x;
      const h = aabb.max.y - aabb.min.y;
      const d = aabb.max.z - aabb.min.z;
      const centerPos = aabb.min.add(aabb.max).scale(0.5);

      const box = BABYLON.MeshBuilder.CreateBox(
        "debug_playerAABB",
        { width: w, height: h, depth: d },
        scene
      );
      box.position = centerPos;
      box.isPickable = false;
      box.visibility = 0.2;

      const mat = new BABYLON.StandardMaterial("m", scene);
      mat.emissiveColor = BABYLON.Color3.Red();
      box.material = mat;

      setTimeout(() => box.dispose(), 50);
    }

    return aabb;
  }

  // ------------------------------------------
  // AABB INTERSECTION
  // ------------------------------------------
  function intersectsAABB(a: PlayerAABB, b: PlayerAABB) {
    return !(
      a.max.x < b.min.x ||
      a.min.x > b.max.x ||
      a.max.y < b.min.y ||
      a.min.y > b.max.y ||
      a.max.z < b.min.z ||
      a.min.z > b.max.z
    );
  }

  // ------------------------------------------
  // PLATFORM RAYCAST (landing)
  // ------------------------------------------
  function updatePlatformRaycast() {
    if (!playerRoot) return;

    // 🔥 Fix: disabilita raycast piattaforme durante caduta, rialzata o morte
    const isGameOver = useGameStore.getState().gameState === "gameover";
    if (isGameOver || stateMachine?.currentState === "Fall" || stateMachine?.currentState === "Getup" || stateMachine?.currentState === "Death") {
      platformRayHelper?.hide();
      return;
    }

    const platformMeshes = obstacleController.getActivePlatformMeshes();
    const hasPlatforms = platformMeshes.length > 0;

    const rayOriginOffset = 2;
    const rayLength = 40;

    const origin = playerRoot.position.add(
      new BABYLON.Vector3(0, rayOriginOffset, 0)
    );

    const ray = new BABYLON.Ray(
      origin,
      new BABYLON.Vector3(0, -1, 0),
      rayLength
    );

    // DEBUG RAY
    if (DEBUG.showRay) {
      if (!platformRayHelper) {
        platformRayHelper = new BABYLON.RayHelper(ray);
      } else {
        platformRayHelper.ray = ray;
      }
      platformRayHelper.show(scene, BABYLON.Color3.Yellow());
    } else {
      platformRayHelper?.hide();
    }

    const hit = scene.pickWithRay(ray, (mesh) => {
      if ((mesh.metadata as any)?.isCollisionMesh === true) return true;
      if ((mesh.metadata as any)?.obstacleType === "platform") return true;
      if (mesh.parent && (mesh.parent.metadata as any)?.obstacleType === "platform")
        return true;
      return false;
    });

    if (hit?.hit && hit.pickedPoint && hit.pickedMesh) {
      const bi = hit.pickedMesh.getBoundingInfo();
      const bbMin = bi?.boundingBox.minimumWorld;
      const bbMax = bi?.boundingBox.maximumWorld;

      const landMargin = 1.5;
      const withinX =
        bbMin && bbMax
          ? playerRoot.position.x >= bbMin.x - landMargin &&
          playerRoot.position.x <= bbMax.x + landMargin
          : true;

      const withinZ =
        bbMin && bbMax
          ? playerRoot.position.z >= bbMin.z - landMargin &&
          playerRoot.position.z <= bbMax.z + landMargin
          : true;

      // Il player deve essere SOPRA la piattaforma, non davanti.
      // Controlliamo che la parte superiore della piattaforma (bbMax.y)
      // sia sotto al player ma non troppo sotto.
      const platformTopY = bbMax.y;
      const feetY = playerRoot.position.y;
      const deltaY = feetY - platformTopY;

      // true solo se la piattaforma è fisicamente sotto il giocatore
      // (tolleranza 0–10 unità, regolabile se serve)
      const platformBelow = deltaY >= -2 && deltaY <= 30;

      if (DEBUG.showPlatformAABB && hit) {
        const now = performance.now();
        if (now - lastPlatformDebug > 300) {
          lastPlatformDebug = now;

          console.log("----- PLATFORM LANDING DEBUG -----");
          console.log("Picked Mesh:", hit.pickedMesh?.name);
          console.log("isCollisionMesh:", (hit.pickedMesh?.metadata as any)?.isCollisionMesh);
          console.log("PickedPoint Y:", hit.pickedPoint?.y?.toFixed(3));
          console.log("Player Y:", playerRoot.position.y.toFixed(3));

          const bi = hit.pickedMesh?.getBoundingInfo();
          if (bi) {
            console.log("bbMinY:", bi.boundingBox.minimumWorld.y.toFixed(3));
            console.log("bbMaxY:", bi.boundingBox.maximumWorld.y.toFixed(3));
          }

          console.log("deltaY:", deltaY);
          console.log("feetY:", feetY);
          console.log("platformTopY:", platformTopY);
          console.log("withinX:", withinX);
          console.log("withinZ:", withinZ);
          console.log("platformBelow:", platformBelow);

          console.log("----------------------------------");
        }
      }

      if (withinX && withinZ && platformBelow) {
        const platformTopY = bbMax.y;
        const newBase = Math.max(platformTopY, groundBaseY);

        const landingSnap = 1.5;
        const descending = jumpMotion.active && jumpMotion.velocity <= 0;
        const closeEnough = playerRoot.position.y - newBase <= landingSnap;

        if (!jumpMotion.active || (descending && closeEnough)) {
          // IMPORTANT: If falling in a gap or dead, do NOT clamp to baseY
          if (isFallingInGap || (stateMachine && (stateMachine.currentState as string) === "Death")) {
            // Let them fall!
          } else {
            // Safety: if we are here, we should NOT be in a "falling in gap" state
            if (isFallingInGap) isFallingInGap = false;

            baseY = newBase;
            playerRoot.position.y = Math.max(playerRoot.position.y, baseY);

            if (jumpMotion.active) {
              jumpMotion.active = false;
              jumpMotion.velocity = 0;
              if (!debugOverrideState && stateMachine) {
                stateMachine.setPlayerState("Run", true);
              }
            }

            isOnPlatform = true;
            return;
          }
        }
      }
    }

    if (!hasPlatforms) {
      isOnPlatform = false;
      baseY = groundBaseY;
      return;
    }

    if (isOnPlatform) {
      baseY = groundBaseY;
      if (!jumpMotion.active || jumpMotion.velocity <= 0) {
        jumpMotion.active = true;
        jumpMotion.velocity = 0;
      }
      isOnPlatform = false;
    } else {
      baseY = groundBaseY;
    }
  }

  // ------------------------------------------
  // COLLISIONE OSTACOLI
  // ------------------------------------------
  function triggerBounceBack(hitObstacle?: ObstacleInstance) {
    bounceBackActive = true;
    bounceBackTimer = BOUNCE_BACK_DURATION;

    // Create impact VFX if we know which obstacle was hit
    if (hitObstacle && playerRoot) {
      // Calculate impact point (lower to ground level for dust effect)
      const impactPoint = playerRoot.position.clone();
      impactPoint.y += 3; // Lowered from 8 to spawn closer to ground

      createImpactVFX(scene, impactPoint, hitObstacle.mesh, {
        duration: 0.4,
        particleCount: 60,
      });
    }

    console.log("🔙 Bounce-back effect triggered!");
  }

  function triggerFallState(hitObstacle?: ObstacleInstance) {
    if (!stateMachine) return;
    const current = stateMachine.currentState;
    if (current === "Fall" || current === "Getup" || current === "Death") return;

    // Trigger bounce-back effect with VFX ONLY if obstacle hit
    if (hitObstacle) {
      triggerBounceBack(hitObstacle);

      // Make the obstacle disappear after collision
      hitObstacle.active = false;
      hitObstacle.mesh.setEnabled(false);
    }
    // Update game store - decrement lives
    const store = useGameStore.getState();
    store.decrementLives();

    // Fetch fresh state to check actual remaining lives
    const freshState = useGameStore.getState();

    // Check for game over
    if (freshState.lives <= 0) {
      console.log("💀 GAME OVER - No lives remaining");

      jumpMotion.active = false;
      jumpMotion.velocity = -50; // Start falling immediately
      isFallingInGap = true;    // Enable physical gravity
      invulnerabilityTimer = INVULNERABILITY_AFTER_HIT;
      stateMachine.setPlayerState("Death", true);

      // FORCE FALL LOGIC - GAME OVER
      isFallingInGap = true;
      jumpMotion.active = false;
      jumpMotion.velocity = -50;
      invulnerabilityTimer = INVULNERABILITY_AFTER_HIT;

      // Make surrounding cubes fall with the player for dramatic effect
      if (fallingCubeRoadController && playerRoot) {
        fallingCubeRoadController.triggerMassFall(playerRoot.position.x, playerRoot.position.z);
      }

      return;
    }

    // NORMAL LIFE LOSS FALL
    console.log("💔 Player lost a life - falling through floor");
    isFallingInGap = true; // Always fall on life loss
    jumpMotion.active = false;
    jumpMotion.velocity = -50; // Start falling immediately
    invulnerabilityTimer = INVULNERABILITY_AFTER_HIT;
    stateMachine.setPlayerState("Fall", true);

    // Cancel camera zoom if active
    if (activeZoomObserver) {
      scene.onBeforeRenderObservable.remove(activeZoomObserver);
      activeZoomObserver = null;
      console.log("🚫 Camera zoom cancelled due to death");
    }

    // ------------------------------------------
    // SAVED OFFSET FOR CAMERA (Prevent overhead snap)
    // ------------------------------------------
    let savedYOffset: number | null = null;

    if (!hitObstacle) {
      // It's a gap! Enable physical falling
      isFallingInGap = true;
      // Also trigger a jump motion so gravity logic picks it up
      jumpMotion.velocity = -50;
      console.log("🕳️ Falling into gap!");

      // Save the current vertical offset between target and player
      // logic: TargetY = PlayerY + Offset  =>  Offset = TargetY - PlayerY
      if (cameraTarget && playerRoot) {
        savedYOffset = cameraTarget.position.y - playerRoot.position.y;
        console.log(`💾 Saved Camera Y Offset: ${savedYOffset}`);
      }
    }
  }

  function checkObstacleCollision(): ObstacleInstance | null {
    if (!playerRoot || !stateMachine) return null;
    if (invulnerabilityTimer > 0) return null;

    const playerBox = computePlayerAABB();
    if (!playerBox) return null;

    const obstacles = obstacleController.getActiveObstacles();
    const platformTopTolerance = 1.2;

    for (const obs of obstacles) {
      if (!obs.active) continue;

      const mesh = obs.mesh;
      mesh.computeWorldMatrix(true);

      const collisionMeshes = obs.collisionMeshes?.length
        ? obs.collisionMeshes
        : [mesh];

      for (const collisionMesh of collisionMeshes) {
        collisionMesh.computeWorldMatrix(true);

        const bi = collisionMesh.getBoundingInfo();
        if (!bi) continue;

        const obsBox = {
          min: bi.boundingBox.minimumWorld,
          max: bi.boundingBox.maximumWorld,
        };

        if (obs.type === "platform") {
          const playerAbove =
            playerBox.min.y >= obsBox.max.y - platformTopTolerance;
          if (isOnPlatform || playerAbove) continue;
        }

        if (intersectsAABB(playerBox, obsBox)) {
          return obs; // Return the obstacle that was hit
        }
      }
    }

    return null;
  }

  // ------------------------------------------
  // CAMERA TARGET
  // ------------------------------------------
  const cameraTarget = new BABYLON.TransformNode("camTarget", scene);

  // ------------------------------------------
  // LOAD PLAYER MODEL
  // ------------------------------------------
  loadPlayerModel(
    scene,
    camera,
    modelRoot,
    shadowGenerator,
    (info) => {
      playerRoot = info.playerRoot;
      baseY = playerRoot.position.y;
      groundBaseY = baseY;

      // Override camera target to our controlled node
      camera.lockedTarget = cameraTarget;

      // Sync initial position (with saved or default framing offset)
      // If we have a saved intro target, use it, otherwise fallback to defaults
      const savedTargetX = localStorage.getItem("camera_target_x_intro") || localStorage.getItem("camera_target_x");
      const savedTargetY = localStorage.getItem("camera_target_y_intro") || localStorage.getItem("camera_target_y");
      const savedTargetZ = localStorage.getItem("camera_target_z_intro") || localStorage.getItem("camera_target_z");

      if (savedTargetX !== null && savedTargetY !== null && savedTargetZ !== null) {
        cameraTarget.position.set(
          parseFloat(savedTargetX),
          parseFloat(savedTargetY),
          parseFloat(savedTargetZ)
        );
        console.log("📷 Camera target initialized from LocalStorage (Intro/Standard)");
      } else {
        // Fallback to INTRO_CAMERA_DEFAULTS if available, else CAMERA_DEFAULTS
        const defaultTarget = (INTRO_CAMERA_DEFAULTS as any) || CAMERA_DEFAULTS;
        cameraTarget.position.set(defaultTarget.targetX, defaultTarget.targetY, defaultTarget.targetZ);
        console.log("📷 Camera target initialized with defaults");
      }

      const { min: worldMin, max: worldMax } =
        info.playerRoot.getHierarchyBoundingVectors();

      const localMin = worldMin.subtract(info.playerRoot.position);
      const localMax = worldMax.subtract(info.playerRoot.position);

      const width = localMax.x - localMin.x;
      const depth = localMax.z - localMin.z;
      const height = localMax.y - localMin.y;

      playerCollider.halfWidth = width * 0.5;
      playerCollider.halfDepth = depth * 0.5;
      playerCollider.standingHeight = height;
      playerCollider.slideHeight = height * 0.6;
      playerCollider.centerOffsetY = localMin.y + height * 0.5;
      playerCollider.slideCenterOffsetY =
        localMin.y + playerCollider.slideHeight * 0.5;

      playerCollider.initialized = true;

      stateMachine = createPlayerStateMachine({
        scene,
        playerRoot: info.playerRoot,
        playerSkeleton: info.playerSkeleton,
        animationGroup: info.playerAnimationGroup,
        setScrollSpeed,
      });

      reset();

      if (requestedStart) startGame();

      onReady?.();
    }
  );

  // ------------------------------------------
  // INPUT
  // ------------------------------------------
  function handleKeyDown(event: KeyboardEvent) {
    const debugState = debugKeyMap[event.code as keyof typeof debugKeyMap];
    if (debugState) {
      event.preventDefault();
      triggerDebugState(debugState);
      return;
    }

    if (event.code === "Digit0") {
      event.preventDefault();
      triggerDebugState(null);
      return;
    }

    // PAUSE TOGGLE (P)
    if (event.code === "KeyP") {
      const store = useGameStore.getState();
      if (store.gameState === "playing") {
        store.setGameState("paused");
        if (stateMachine) stateMachine.pauseAnimation();
      } else if (store.gameState === "paused") {
        store.setGameState("playing");
        if (stateMachine) stateMachine.resumeAnimation();
      }
      return;
    }

    // R key restart - REMOVED (use UI buttons instead)

    // MOVEMENT INPUTS - Only if playing and NOT in victory sequence
    if (!isGameActive() || isVictorySequenceActive) return;

    switch (event.code) {
      case "ArrowLeft":
      case "KeyA":
        keyState.leftPressed = true;
        performLaneSwitch(1);
        break;

      case "ArrowRight":
      case "KeyD":
        keyState.rightPressed = true;
        performLaneSwitch(-1);
        break;

      case "ArrowDown":
      case "KeyS":
        keyState.slide = true;
        break;

      case "KeyW":
        keyState.jump = true;
        break;
    }
  }

  function handleKeyUp(event: KeyboardEvent) {
    switch (event.code) {
      case "ArrowLeft":
      case "KeyA":
        keyState.leftPressed = false;
        break;

      case "ArrowRight":
      case "KeyD":
        keyState.rightPressed = false;
        break;

      case "ArrowDown":
      case "KeyS":
        keyState.slide = false;
        break;

      case "KeyW":
        keyState.jump = false;
        break;
    }
  }

  // ------------------------------------------
  // DEBUG OVERRIDE
  // ------------------------------------------
  function triggerDebugState(state: PlayerState | null) {
    keyState.forward = false;
    keyState.slide = false;
    keyState.jump = false;
    keyState.leftPressed = false;
    keyState.rightPressed = false;

    debugOverrideState = state;

    if (state && stateMachine) {
      stateMachine.setPlayerState(state, true);
    } else if (stateMachine) {
      stateMachine.setPlayerState("Idle", true);
    }
  }

  // ------------------------------------------
  // LANE SWITCH
  // ------------------------------------------
  function performLaneSwitch(dir: number) {
    if (!playerRoot || !stateMachine) return;

    // Check if lateral movement is allowed in current state
    if (!stateMachine.canStrafe) return;

    const previousLane = currentLane;
    currentLane = Math.min(maxLane, Math.max(-maxLane, currentLane + dir));

    if (previousLane === currentLane) return;

    targetX = currentLane * laneWidth;

    if (dir > 0) stateMachine.setPlayerState("Strafe_R");
    else stateMachine.setPlayerState("Strafe_L");
  }

  // ------------------------------------------
  // UPDATE MOVEMENT
  // ------------------------------------------
  function updateMovementState() {
    if (!playerRoot || !stateMachine) return;
    if (debugOverrideState) return;

    const curState = stateMachine.currentState;
    if (curState === "Fall" || curState === "Getup" || curState === "Death") return;

    if (keyState.jump && !jumpMotion.active) {
      stateMachine.setPlayerState("Jump");
      startJumpMotion();
      keyState.jump = false;
      return;
    }

    if (keyState.slide) {
      stateMachine.setPlayerState("Slide");

      // Play slide sound effect
      const audio = getAudioManager();
      if (audio) audio.playSFX("sfx_slide");
      return;
    }

    if (!gameStarted) return;
  }

  // ------------------------------------------
  // MAIN UPDATE LOOP
  // ------------------------------------------
  const isGameActive = () => useGameStore.getState().gameState === "playing";

  scene.onBeforeRenderObservable.add(() => {
    if (!playerRoot || !stateMachine) return;

    // PAUSE CHECK: Freeze EVERYTHING
    if (useGameStore.getState().gameState === "paused") return;

    // MATCH TIMER UPDATE
    const store = useGameStore.getState();
    if (store.isMatchTimerActive && store.gameState === "playing") {
      const timerDt = scene.getEngine().getDeltaTime() / 1000;
      store.tickMatchTimer(timerDt);
    }

    // GAME OVER HANDLING - React to gameState changes
    if (store.gameState === "gameover") {
      const dt = scene.getEngine().getDeltaTime() / 1000;

      // Ensure player is in Death state
      if (stateMachine.currentState !== "Death") {
        console.log("🎮 Game Over detected - setting player to Death state");
        bounceBackActive = false;
        bounceBackTimer = 0;
        setScrollSpeed(0);
        stateMachine.setPlayerState("Death", true);

        // Start falling physics
        jumpMotion.active = false;
        jumpMotion.velocity = -50;
        isFallingInGap = true;
      }

      // 💀 FORCE FALL LOGIC - Highest Priority
      jumpMotion.velocity += jumpMotion.gravity * dt;
      playerRoot.position.y += jumpMotion.velocity * dt;

      if (Math.random() < 0.1) {
        console.log(`💀 [DEATH FALL] Y: ${playerRoot.position.y.toFixed(2)} | Vel: ${jumpMotion.velocity.toFixed(2)}`);
      }

      // Early exit for gameover to skip regular movement/collision
      // But we call some late-stage cleanup like metadata update below
    } else {
      updateMovementState();
    }

    const dt = scene.getEngine().getDeltaTime() / 1000;
    invulnerabilityTimer = Math.max(0, invulnerabilityTimer - dt);

    // ------------------------------------------
    // BOUNCE-BACK EFFECT UPDATE
    // ------------------------------------------
    if (bounceBackActive) {
      bounceBackTimer -= dt;

      if (bounceBackTimer <= 0) {
        // Bounce finished, deactivate
        bounceBackActive = false;
        bounceBackTimer = 0;
        // Ensure scroll speed returns to 0 (Fall/Getup state)
        setScrollSpeed(0);
        console.log("✅ Bounce-back effect completed");
      } else {
        // Apply reverse scroll speed
        const normalSpeed = 80; // Base running speed
        const reverseSpeed = -normalSpeed * BOUNCE_BACK_INTENSITY;
        setScrollSpeed(reverseSpeed);
      }
    }

    playerRoot.position.x = BABYLON.Scalar.Lerp(
      playerRoot.position.x,
      targetX,
      lateralLerp
    );

    updatePlatformRaycast();
    updateJumpMotion(dt);

    // RECOVERY CHECK: If we were falling in a gap and transitioned to Getup, RESET position
    if (isFallingInGap) {
      const cur = stateMachine.currentState;
      if (cur === "Getup" || cur === "Run" || cur === "Idle" || cur === "Strafe_L" || cur === "Strafe_R") {
        console.log(`✨ Respawn Recovery: Resetting isFallingInGap from state ${cur}`);
        isFallingInGap = false;
        playerRoot.position.y = baseY;
        jumpMotion.velocity = 0;

        // RESTORE CAMERA OFFSET (Fix Snap on Respawn)
        if (cameraTarget && savedYOffset !== null) {
          cameraTarget.position.y = playerRoot.position.y + savedYOffset;
          console.log(`🔄 Respawn: Restored Camera Y Offset: ${savedYOffset}`);
          savedYOffset = null;
        }

        // FORCE METADATA UPDATE so next frame delta is not huge (prevent snap)
        playerRoot.metadata = {
          ...(playerRoot.metadata || {}),
          lastX: playerRoot.position.x,
          lastY: playerRoot.position.y,
          lastZ: playerRoot.position.z
        };

        console.log("✨ Recovered from gap fall & repaired road");
      }
    }

    // UPDATE CAMERA TARGET
    // Use DELTA tracking to allow manual panning to persist
    // IMPORTANT: Only lock camera to player during GAMEPLAY - allow free orbiting during pause/idle
    const currentGameState = useGameStore.getState().gameState;
    if (cameraTarget && (currentGameState === "playing" || currentGameState === "gameover")) {
      const deltaX = playerRoot.position.x - (playerRoot.metadata?.lastX ?? playerRoot.position.x);
      const deltaZ = playerRoot.position.z - (playerRoot.metadata?.lastZ ?? playerRoot.position.z);
      let deltaY = 0;

      // Follow Y even if falling in gap, BUT with a damping/limit? 
      // Actually, if it looks like "zooming out" when they die, we should follow them.
      // For gap falls in gameplay we detatched, but for DEATH we should follow.
      const shouldFollowY = !isFallingInGap || (currentGameState === "gameover");

      if (shouldFollowY) {
        deltaY = playerRoot.position.y - (playerRoot.metadata?.lastY ?? playerRoot.position.y);
        cameraTarget.position.y += deltaY;
      }
      // If falling, we intentionally ignore deltaY to "detach" camera from falling player.

      // Re-enabled lateral tracking (User preference)
      cameraTarget.position.x += deltaX;
      cameraTarget.position.z += deltaZ;
    }

    // Always update metadata tracking to prevent position jumps when resuming
    if (playerRoot) {
      playerRoot.metadata = {
        ...(playerRoot.metadata || {}),
        lastX: playerRoot.position.x,
        lastY: playerRoot.position.y,
        lastZ: playerRoot.position.z
      };
    }

    if (!debugOverrideState) {
      if (
        stateMachine.currentState !== "Fall" &&
        stateMachine.currentState !== "Getup" &&
        stateMachine.currentState !== "Death"
      ) {
        // COLLISION CHECKS - Only if game is active (not Game Over)
        if (isGameActive()) {
          const hitObstacle = checkObstacleCollision();
          if (hitObstacle) triggerFallState(hitObstacle);

          // Check for falling into gaps (falling cube road)
          // SKIP if invulnerable (respawn protection)
          if (fallingCubeRoadController && !jumpMotion.active && invulnerabilityTimer <= 0) {
            const isOverGap = fallingCubeRoadController.isOverGap(
              playerRoot.position.x,
              playerRoot.position.z
            );
            if (isOverGap) {
              console.log("⚠️ Player fell into gap!");
              triggerFallState();
            }
          }

          // Check Coins
          const playerBox = computePlayerAABB();
          if (playerBox) {
            const coinsCollected = coinController.checkCollisions(playerBox);
            if (coinsCollected > 0) {
              // TODO: Update UI with score
              console.log("Collected coins:", coinsCollected);
              // Dispatch event or callback? For now just log.
              const event = new CustomEvent("coinCollected", { detail: { count: coinsCollected } });
              window.dispatchEvent(event);
            }
          }
        }
      }
    }

    const cur = stateMachine.currentState;
    const atTarget = Math.abs(playerRoot.position.x - targetX) < 0.5;

    if (
      gameStarted &&
      atTarget &&
      (cur === "Strafe_L" || cur === "Strafe_R")
    ) {
      stateMachine.setPlayerState("Run");
    }

    // 🏆 VICTORY ORBIT CAMERA - REMOVED (User request)
  });

  function startGame() {
    requestedStart = true;

    // If first start, play intro sequence
    if (isFirstStart && stateMachine && playerRoot) {
      isFirstStart = false;
      playIntroSequence();
      return;
    }

    // Normal start (after intro or on restart)
    finishStartGame();
  }

  function finishStartGame() {
    gameStarted = true;
    introPlaying = false;
    isFallingInGap = false; // Safety reset on start/restart
    jumpMotion.active = false;
    jumpMotion.velocity = 0;

    // Update game state in store
    useGameStore.getState().setGameState('playing');
    if (stateMachine) stateMachine.setPlayerState("Run", true);

    // CAMERA ZOOM OUT TRANSITION
    const startRadius = camera.radius;
    const startAlpha = camera.alpha;
    const startBeta = camera.beta;
    const startFov = camera.fov;

    // Get Gameplay (End) values from localStorage or defaults (Shift+C)
    const endAlpha = parseFloat(localStorage.getItem("camera_alpha") || CAMERA_DEFAULTS.alpha.toString());
    const endBeta = parseFloat(localStorage.getItem("camera_beta") || CAMERA_DEFAULTS.beta.toString());
    const endRadius = parseFloat(localStorage.getItem("camera_radius") || CAMERA_DEFAULTS.radius.toString());
    const endTargetX = parseFloat(localStorage.getItem("camera_target_x") || CAMERA_DEFAULTS.targetX.toString());
    const endTargetY = parseFloat(localStorage.getItem("camera_target_y") || CAMERA_DEFAULTS.targetY.toString());
    const endTargetZ = parseFloat(localStorage.getItem("camera_target_z") || CAMERA_DEFAULTS.targetZ.toString());
    const endFov = parseFloat(localStorage.getItem("camera_fov") || CAMERA_DEFAULTS.fov.toString());

    console.log(`🎬 Starting Camera Transition:
      From: Radius ${startRadius.toFixed(2)}, Alpha ${startAlpha.toFixed(2)}, Beta ${startBeta.toFixed(2)}, FOV ${startFov.toFixed(2)}
      To:   Radius ${endRadius.toFixed(2)}, Alpha ${endAlpha.toFixed(2)}, Beta ${endBeta.toFixed(2)}, FOV ${endFov.toFixed(2)}`);

    const zoomDuration = 1500; // 1.5 seconds
    const zoomStartTime = performance.now();
    // Cancel existing
    if (activeZoomObserver) {
      scene.onBeforeRenderObservable.remove(activeZoomObserver);
      activeZoomObserver = null;
    }

    activeZoomObserver = scene.onBeforeRenderObservable.add(() => {
      const elapsed = performance.now() - zoomStartTime;
      const t = Math.min(1, elapsed / zoomDuration);

      // Ease out cubic
      const easeT = 1 - Math.pow(1 - t, 3);

      camera.radius = startRadius + (endRadius - startRadius) * easeT;
      camera.alpha = startAlpha + (endAlpha - startAlpha) * easeT;
      camera.beta = startBeta + (endBeta - startBeta) * easeT;
      camera.fov = startFov + (endFov - startFov) * easeT;

      if (cameraTarget) {
        cameraTarget.position.x = BABYLON.Scalar.Lerp(cameraTarget.position.x, endTargetX, easeT);
        cameraTarget.position.y = BABYLON.Scalar.Lerp(cameraTarget.position.y, endTargetY, easeT);
        cameraTarget.position.z = BABYLON.Scalar.Lerp(cameraTarget.position.z, endTargetZ, easeT);
      }

      if (t >= 1) {
        if (activeZoomObserver) scene.onBeforeRenderObservable.remove(activeZoomObserver);
        activeZoomObserver = null;
        camera.radius = endRadius;
        camera.alpha = endAlpha;
        camera.beta = endBeta;
        camera.fov = endFov;
        if (cameraTarget) cameraTarget.position.set(endTargetX, endTargetY, endTargetZ);
        console.log("✅ Camera Transition Complete");
      }
    });
  }

  /**
   * Play the intro sequence: Idle → Wave (looped) → Right_turn (with 180° rotation) → Run
   */
  function playIntroSequence() {
    if (!stateMachine || !playerRoot) return;

    introPlaying = true;
    console.log("🎬 Starting intro sequence...");

    // Animation sequence: Idle → Wave x5 (looped for visibility) → Right_turn
    const sequence: Array<{ state: "Idle" | "Wave" | "Right_turn"; rotate?: boolean }> = [
      { state: "Idle" },
      { state: "Wave" },
      { state: "Wave" },
      { state: "Wave" },
      { state: "Wave" },
      { state: "Wave" },
      { state: "Right_turn", rotate: true },
    ];

    let currentIndex = 0;

    const playNext = () => {
      if (currentIndex >= sequence.length) {
        // Intro complete - ensure player is facing forward
        console.log("✅ Intro sequence complete!");
        finishStartGame();
        return;
      }

      const step = sequence[currentIndex];
      currentIndex++;

      console.log(`🎬 Playing intro step: ${step.state}`);

      if (step.rotate) {
        // For Right_turn, animate the rotation while playing the animation
        playTurnWithRotation(playNext);
      } else {
        stateMachine!.playStateWithCallback(step.state, playNext);
      }
    };

    // Start the sequence
    playNext();
  }

  /**
   * Play the Right_turn animation while animating the player's Y rotation by 180°
   */
  function playTurnWithRotation(onComplete: () => void) {
    if (!stateMachine || !playerRoot) {
      onComplete();
      return;
    }

    const startRotationY = playerRoot.rotation.y;
    const endRotationY = startRotationY + Math.PI; // 180 degrees

    // Get the animation duration (Right_turn: 636-675 = 39 frames at 24fps = ~1.625s)
    // But with 1.5x speed = ~1.08s
    const durationMs = 1100; // Slightly longer to ensure smooth completion
    const startTime = performance.now();

    // Start the rotation animation using the render loop
    const rotationObserver = scene.onBeforeRenderObservable.add(() => {
      if (!playerRoot) return;

      const elapsed = performance.now() - startTime;
      const t = Math.min(1, elapsed / durationMs);

      // Ease-in-out for smooth rotation
      const easeT = t < 0.5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2;

      playerRoot.rotation.y = startRotationY + (endRotationY - startRotationY) * easeT;

      if (t >= 1) {
        // Rotation complete
        scene.onBeforeRenderObservable.remove(rotationObserver);
        playerRoot.rotation.y = endRotationY; // Ensure exact final rotation
        playerRoot.computeWorldMatrix(true);
      }
    });

    // Play the animation and call callback when done
    stateMachine.playStateWithCallback("Right_turn", () => {
      // Remove rotation observer in case animation ends before rotation
      scene.onBeforeRenderObservable.remove(rotationObserver);
      playerRoot!.rotation.y = endRotationY; // Ensure final rotation (Facing AWAY = PI)
      playerRoot!.computeWorldMatrix(true);
      onComplete();
    });
  }

  function ensureIdle() {
    if (stateMachine) stateMachine.ensureIdle();
  }

  function dispose() {
    if (platformRayHelper) {
      platformRayHelper.dispose();
      platformRayHelper = null;
    }
  }

  function reset() {
    if (!playerRoot || !stateMachine) return;

    // Reset position
    playerRoot.position.y = groundBaseY;
    baseY = groundBaseY;
    currentLane = 0;
    targetX = 0;
    playerRoot.position.x = 0;
    playerRoot.rotation.y = 0; // RESET: Face the camera (Diner) at start

    // RESET CAMERA TARGET to default framing
    // Always reset to player position with default Y offset (-15) on full reset
    if (cameraTarget) {
      // Use saved intro settings if available, else defaults
      const introAlpha = parseFloat(localStorage.getItem("camera_alpha_intro") || (INTRO_CAMERA_DEFAULTS as any)?.alpha || CAMERA_DEFAULTS.alpha.toString());
      const introBeta = parseFloat(localStorage.getItem("camera_beta_intro") || (INTRO_CAMERA_DEFAULTS as any)?.beta || CAMERA_DEFAULTS.beta.toString());
      // Default intro radius should be CLOSER than gameplay (e.g. 50%) to ensure zoom-OUT
      const introRadius = parseFloat(localStorage.getItem("camera_radius_intro") || (INTRO_CAMERA_DEFAULTS as any)?.radius || (CAMERA_DEFAULTS.radius * 0.5).toString());
      const introTargetX = parseFloat(localStorage.getItem("camera_target_x_intro") || (INTRO_CAMERA_DEFAULTS as any)?.targetX || playerRoot.position.x.toString());
      const introTargetY = parseFloat(localStorage.getItem("camera_target_y_intro") || (INTRO_CAMERA_DEFAULTS as any)?.targetY || (playerRoot.position.y - 15).toString());
      const introTargetZ = parseFloat(localStorage.getItem("camera_target_z_intro") || (INTRO_CAMERA_DEFAULTS as any)?.targetZ || playerRoot.position.z.toString());
      const introFov = parseFloat(localStorage.getItem("camera_fov_intro") || (INTRO_CAMERA_DEFAULTS as any)?.fov || (CAMERA_DEFAULTS as any)?.fov || "1.5");

      cameraTarget.position.set(introTargetX, introTargetY, introTargetZ);

      // Apply Intro Zoom
      camera.radius = introRadius;
      camera.alpha = introAlpha;
      camera.beta = introBeta;
      camera.fov = introFov;
      console.log(`📷 Camera target reset and zoomed in (radius: ${introRadius})`);

      // Cancel camera zoom if active
      if (activeZoomObserver) {
        scene.onBeforeRenderObservable.remove(activeZoomObserver);
        activeZoomObserver = null;
      }
    }
    savedYOffset = null; // Clear any saved offset

    // FORCE METADATA UPDATE
    // Crucial: Update metadata immediately so next frame's delta is 0
    if (playerRoot) {
      playerRoot.metadata = {
        lastX: playerRoot.position.x,
        lastY: playerRoot.position.y,
        lastZ: playerRoot.position.z
      };
    }

    // Reset state
    gameStarted = false;
    requestedStart = false;
    isOnPlatform = false;
    isFallingInGap = false; // logic reset
    jumpMotion.active = false;
    jumpMotion.velocity = 0;
    bounceBackActive = false;
    bounceBackTimer = 0;
    invulnerabilityTimer = 0;
    isVictorySequenceActive = false;

    if (stateMachine) stateMachine.setPlayerState("Idle", true);
    setScrollSpeed(0);

    console.log("Player controller reset");
  }

  function restartGame() {
    console.log("🔄 RESTARTING GAME...");

    // 1. Reset Store
    useGameStore.getState().resetGame();

    // 2. Reset World Systems
    obstacleController.reset();
    coinController.reset();

    // 3. Reset Player
    reset();

    // 4. Start Game
    startGame();
    useGameStore.getState().startMatchTimer();
  }

  // ------------------------------------------
  // TOUCH & POINTER INPUT
  // ------------------------------------------
  const touchState = { startX: 0, startY: 0, startTime: 0, isDragging: false };
  const SWIPE_THRESHOLD = 50;
  const TAP_THRESHOLD = 200;
  const SWIPE_MAX_TIME = 500;

  function handleTouchStart(event: TouchEvent) {
    if (!isGameActive() || isVictorySequenceActive) return;
    const touch = event.touches[0];
    if (!touch) return;
    touchState.startX = touch.clientX; touchState.startY = touch.clientY;
    touchState.startTime = Date.now(); touchState.isDragging = true;
  }

  function handleTouchMove(event: TouchEvent) {
    if (!isGameActive() || !touchState.isDragging || isVictorySequenceActive) return;
  }

  function handleTouchEnd(event: TouchEvent) {
    if (!isGameActive() || !touchState.isDragging || isVictorySequenceActive) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const deltaX = touch.clientX - touchState.startX;
    const deltaY = touch.clientY - touchState.startY;
    const deltaTime = Date.now() - touchState.startTime;
    touchState.isDragging = false;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (distance < SWIPE_THRESHOLD && deltaTime < TAP_THRESHOLD) {
      // Swipe Up = Jump
      keyState.jump = true; setTimeout(() => (keyState.jump = false), 100); return;
    }
    if (distance >= SWIPE_THRESHOLD && deltaTime < SWIPE_MAX_TIME) {
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX > 0) { performLaneSwitch(-1); } else { performLaneSwitch(1); }
      } else {
        if (deltaY < 0) { keyState.jump = true; setTimeout(() => (keyState.jump = false), 100); }
        else { keyState.slide = true; setTimeout(() => (keyState.slide = false), 500); }
      }
    }
  }

  function handlePointerDown(event: PointerEvent) {
    if (!isGameActive() || isVictorySequenceActive) return;
    const canvas = scene.getEngine().getRenderingCanvas();
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    const width = rect.width, height = rect.height;

    // Define zones (3x3 Grid)
    const leftZone = x < width * 0.33;
    const rightZone = x > width * 0.66;
    const centerX = !leftZone && !rightZone;

    const topZone = y < height * 0.33;
    const bottomZone = y > height * 0.66;
    const centerY = !topZone && !bottomZone;

    console.log(`POINTER: x:${Math.round(x)} y:${Math.round(y)} | Zones: L:${leftZone} R:${rightZone} T:${topZone} B:${bottomZone}`);

    // LOGIC PRIORITY:
    // 1. Center Column handles vertical actions (Jump/Slide)
    // 2. Left/Right Columns handle lane switching
    // 3. Center square acts as a "Neutral/Action" zone (also Jump)

    if (centerX) {
      if (topZone || centerY) {
        keyState.jump = true;
        console.log("👆 TAP: Jump (Center/Top Center)");
      } else if (bottomZone) {
        keyState.slide = true;
        console.log("👇 TAP: Slide (Bottom Center)");
      }
    } else if (leftZone) {
      performLaneSwitch(1);
      console.log("👈 TAP: Turn Left");
    } else if (rightZone) {
      performLaneSwitch(-1);
      console.log("👉 TAP: Turn Right");
    }
  }

  function handlePointerUp(event: PointerEvent) {
    keyState.slide = false;
    keyState.jump = false;
  }

  // Trigger Cheer animation for victory
  function triggerCheer() {
    if (!stateMachine) return;
    console.log("🎉 Playing Cheer animation!");
    stateMachine.setPlayerState("Cheer", true);
  }

  // Final Victory Sequence: Stop -> Cheer -> Victory UI
  function triggerVictorySequence() {
    if (!stateMachine || !playerRoot) return;
    console.log("🏆 Victory Sequence Started!");

    isVictorySequenceActive = true;

    // 1. Stop world movement
    setScrollSpeed(0);

    // 2. Clear any active input/motions
    jumpMotion.active = false;
    jumpMotion.velocity = 0;
    keyState.jump = false;
    keyState.slide = false;

    // 3. Play Turn animation first, then Cheer, then show UI
    playTurnWithRotation(() => {
      console.log("🔄 Turn complete - starting cheer");
      if (stateMachine) {
        // Play cheer at 1.0x speed for more impact
        stateMachine.playStateWithCallback("Cheer", () => {
          console.log("📽️ Cheer initial loop complete - waiting before showing score");
          // Cheer loop: 533-622 = 89 frames @ 24fps = 3.7s
          // We wait for the first loop to finish plus a small buffer
          setTimeout(() => {
            console.log("📽️ Victory UI trigger");
            useGameStore.getState().setGameState('victory');
          }, 3700); // Wait for approx one full loop (3.7s) before UI
        }, 1.0);
      }
    });

    // 4. Play victory music immediately
    const audio = getAudioManager();
    if (audio) audio.playMusic("music_victory", false);
  }

  return {
    handleKeyDown, handleKeyUp, handleTouchStart, handleTouchMove, handleTouchEnd,
    handlePointerDown, handlePointerUp, startGame, ensureIdle, dispose, reset, triggerCheer, triggerVictorySequence,
    isVictorySequenceActive: () => isVictorySequenceActive,
    cameraTarget, // Expose the transform node
  };
}
