// src/components/babylonRunner.ts
import * as BABYLON from "@babylonjs/core";
import "@babylonjs/loaders";

import { createScene, createLighting, createCamera, createSkyDome, createLensEffect } from "./scene/sceneManager";
import { getAssetRoots } from "./assetPaths";

// ... (existing imports)

// ...

// --------------------------------------------
// CAMERA
// --------------------------------------------

import { setupPlayerController } from "./player/playerController";
import { setupEnvironment } from "./world/environment";
import { createUIManager } from "./ui/uiManager";
import { useGameStore } from "../store/gameStore";
import { initAudioManager, getAudioManager } from "./audio/audioManager";


// Draco configuration
if (BABYLON.DracoCompression) {
  BABYLON.DracoCompression.Configuration = {
    decoder: {
      wasmUrl: "https://cdn.babylonjs.com/draco_wasm_wrapper_gltf.js",
      wasmBinaryUrl: "https://cdn.babylonjs.com/draco_wasm_wrapper_gltf.wasm",
      fallbackUrl: "https://cdn.babylonjs.com/draco_decoder_gltf.js",
    },
  };
}

export function babylonRunner(canvas: HTMLCanvasElement) {
  if (!canvas) return;

  let engine: BABYLON.Engine | null = null;

  // --------------------------------------------
  // HARDWARE SCALING
  // --------------------------------------------
  const updateHardwareScaling = () => {
    if (!engine) return;
    const resolutionScale = Math.max(1, canvas.height / 1080);
    engine.setHardwareScalingLevel(Math.min(2.5, resolutionScale));
  };

  // --------------------------------------------
  // RESPONSIVE CANVAS
  // --------------------------------------------
  const applyCanvasSize = () => {
    const aspect = 9 / 16;
    const maxW = window.innerWidth;
    const maxH = window.innerHeight;

    let height = maxH;
    let width = height * aspect;

    if (width > maxW) {
      width = maxW;
      height = width / aspect;
    }

    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    engine?.resize();
    updateHardwareScaling();
  };

  applyCanvasSize();

  // Prevent context menu to allow Right-Click Panning
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  // --------------------------------------------
  // SCENE + ENGINE
  // --------------------------------------------
  const { engine: createdEngine, scene } = createScene(canvas);
  engine = createdEngine;
  updateHardwareScaling();

  // --------------------------------------------
  // LIGHTING
  // --------------------------------------------
  const { shadowGenerator } = createLighting(scene);

  // --------------------------------------------
  // CAMERA
  // --------------------------------------------
  const { camera } = createCamera(scene, canvas);
  // Image processing removed (User request)
  // createLensEffect(scene, camera);

  // --------------------------------------------
  // ASSETS ROOTS
  // --------------------------------------------
  const { assetBase, modelRoot, textureRoot } = getAssetRoots();

  // --------------------------------------------
  // SKY DOME (Disabled)
  // --------------------------------------------
  const { skyDome } = createSkyDome(scene, assetBase);
  skyDome.isVisible = true;

  // --------------------------------------------
  // AUDIO MANAGER
  // --------------------------------------------
  const audioManager = initAudioManager();

  // --------------------------------------------
  // VICTORY CELEBRATION VFX - REMOVED (Static Outro Screen used instead)
  // --------------------------------------------

  // No 3D victory effects/hooks needed.
  // The static OutroScreen in React layer handles the victory state visualization.


  // --------------------------------------------
  // DYNAMIC DIFFICULTY (1.0 to 1.5 multiplier)
  // --------------------------------------------
  const getDifficultyMultiplier = () => {
    const store = useGameStore.getState();
    const total = Math.max(1, store.matchDuration);
    const elapsed = total - store.matchTimeRemaining;

    // Linearly scale from 1.0 to 1.5 over the match duration
    const progress = Math.min(1.0, elapsed / total);
    return 1.0 + (progress * 0.5);
  };

  // --------------------------------------------
  // SCROLL SPEED SIGNAL
  // --------------------------------------------
  let currentScrollSpeed = 0;
  const setScrollSpeed = (s: number) => (currentScrollSpeed = s);
  const getScrollSpeed = () => currentScrollSpeed * getDifficultyMultiplier();

  // --------------------------------------------
  // LOADING STATE TRACKING
  // --------------------------------------------
  let playerReady = false;
  let obstaclesReady = false;

  function checkAllReady() {
    if (playerReady && obstaclesReady) {
      console.log("✅ All assets loaded - ready to start when user taps");
      useGameStore.getState().setLoading(false);
    }
  }

  // Start countdown only when intro screen is dismissed (user taps TAP TO START)
  let countdownStarted = false;
  const unsubscribeIntro = useGameStore.subscribe((state) => {
    // Only start countdown once when intro screen is dismissed AND not loading
    if (!state.showIntroScreen && !state.isLoading && !countdownStarted) {
      countdownStarted = true;
      console.log("🎬 User tapped start - beginning countdown");

      // UNLOCK AUDIO - Required for browsers that suspend audio until user interaction
      audioManager.unlockAudio();

      // Start visual countdown sequence: 3, 2, 1, GO!
      const sequence = [3, 2, 1, 0]; // 0 = "GO!"
      let i = 0;

      const tick = () => {
        useGameStore.getState().setCountdown(sequence[i]);
        i++;

        if (i < sequence.length) {
          setTimeout(tick, 1000);
        } else {
          // After "GO!", hide countdown and start game
          setTimeout(() => {
            useGameStore.getState().setCountdown(null);
            console.log("🏃 Starting game after countdown");
            player.startGame();
            useGameStore.getState().startMatchTimer();
            console.log("⏱️ Match timer started (2 minutes)");

            // Start background music
            const audio = getAudioManager();
            if (audio) audio.playMusic("music_theme", true);
          }, 500);
        }
      };

      tick();
    }
  });

  // --------------------------------------------
  // ENVIRONMENT
  // --------------------------------------------
  const environment = setupEnvironment(
    scene,
    shadowGenerator,
    modelRoot,
    textureRoot,
    getScrollSpeed,
    () => {
      // Obstacles GLBs are ready
      obstaclesReady = true;
      console.log("✅ Obstacles ready");
      checkAllReady();
    }
  );

  // --------------------------------------------
  // UI MANAGER
  // --------------------------------------------
  const uiManager = createUIManager();

  // --------------------------------------------
  // PLAYER
  // --------------------------------------------
  const player = setupPlayerController(
    scene,
    camera,
    modelRoot,
    shadowGenerator,
    setScrollSpeed,
    environment.obstacleController,
    environment.coinController,
    environment.fallingCubeRoadController,
    () => {
      // Player model is ready
      playerReady = true;
      console.log("✅ Player ready");
      checkAllReady();
    }
  );

  // --------------------------------------------
  // MAIN LOOP
  // --------------------------------------------
  engine.runRenderLoop(() => {
    player.ensureIdle();
    scene.render();
  });

  // --------------------------------------------
  // VICTORY HANDLING
  // --------------------------------------------
  window.addEventListener('matchWon', () => {
    console.log("🎯 Match Won Event Received!");
    player.triggerVictorySequence();
  });

  // --------------------------------------------
  // EVENTS
  // --------------------------------------------
  const onResize = () => applyCanvasSize();
  const onKeyDown = (ev: KeyboardEvent) => player.handleKeyDown(ev);
  const onKeyUp = (ev: KeyboardEvent) => player.handleKeyUp(ev);
  const onTouchStart = (ev: TouchEvent) => player.handleTouchStart(ev);
  const onTouchMove = (ev: TouchEvent) => player.handleTouchMove(ev);
  const onTouchEnd = (ev: TouchEvent) => player.handleTouchEnd(ev);
  const onPointerDown = (ev: PointerEvent) => player.handlePointerDown(ev);
  const onPointerUp = (ev: PointerEvent) => player.handlePointerUp(ev);

  window.addEventListener("resize", onResize);
  // --------------------------------------------
  // KEYBOARD STATE TRACKING
  // --------------------------------------------
  const keysPressed: Record<string, boolean> = {};

  window.addEventListener("keydown", (ev) => {
    keysPressed[ev.key] = true;

    // Camera Capture Hotkey (Shift + C) - Check FIRST before player input
    if (ev.shiftKey && ev.code === "KeyC") {
      ev.preventDefault();
      ev.stopPropagation();
      console.log("📸 CAMERA CAPTURE (Saving to LocalStorage)...");

      // Save Orbit details
      localStorage.setItem("camera_alpha", camera.alpha.toString());
      localStorage.setItem("camera_beta", camera.beta.toString());
      localStorage.setItem("camera_radius", camera.radius.toString());

      // Also save target position for panning
      localStorage.setItem("camera_target_x", camera.target.x.toString());
      localStorage.setItem("camera_target_y", camera.target.y.toString());
      localStorage.setItem("camera_target_z", camera.target.z.toString());

      // Save FOV
      localStorage.setItem("camera_fov", camera.fov.toString());

      // Generate JSON for camera settings
      const cameraSettingsJson = {
        alpha: parseFloat(camera.alpha.toFixed(2)),
        beta: parseFloat(camera.beta.toFixed(2)),
        radius: parseFloat(camera.radius.toFixed(2)),
        targetX: parseFloat(camera.target.x.toFixed(1)),
        targetY: parseFloat(camera.target.y.toFixed(1)),
        targetZ: parseFloat(camera.target.z.toFixed(1)),
        fov: parseFloat(camera.fov.toFixed(2)),
      };

      // Send to dev server API for automatic saving (no download prompt!)
      fetch('/api/save-camera', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cameraSettingsJson),
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            console.log('✅ Camera settings saved automatically!');
            const msg = `✅ Camera Saved Automatically!

Alpha: ${camera.alpha.toFixed(2)} rad
Beta: ${camera.beta.toFixed(2)} rad
Radius: ${camera.radius.toFixed(2)}
FOV: ${camera.fov.toFixed(2)} rad (${(camera.fov * 180 / Math.PI).toFixed(1)}°)
Target: (${camera.target.x.toFixed(1)}, ${camera.target.y.toFixed(1)}, ${camera.target.z.toFixed(1)})`;
            console.log(msg);
            alert(msg);
          } else {
            console.error('Failed to save:', data.error);
            alert('Failed to save camera settings: ' + data.error);
          }
        })
        .catch(err => {
          console.error('Failed to save camera settings:', err);
          alert('Failed to save camera settings. Is the dev server running?');
        });

      return; // Don't pass to player controller
    }

    onKeyDown(ev);
  });

  window.addEventListener("keyup", (ev) => {
    keysPressed[ev.key] = false;
    onKeyUp(ev);
  });

  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: true });
  window.addEventListener("touchend", onTouchEnd, { passive: true });
  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);

  // --------------------------------------------
  // CAMERA PANNING UPDATE LOOP
  // --------------------------------------------
  let cameraLocked = false;
  let savedLockedTarget: BABYLON.Nullable<BABYLON.AbstractMesh | BABYLON.TransformNode | BABYLON.Vector3> = null;
  let previousGameState: string = "idle";

  // Save camera orbit state when pausing
  let savedCameraState: {
    alpha: number;
    beta: number;
    radius: number;
    targetPosition: BABYLON.Vector3;
  } | null = null;

  scene.onBeforeRenderObservable.add(() => {
    // FULL CAMERA LOCK during gameplay
    const gameState = useGameStore.getState().gameState;

    if (gameState === "playing") {
      // Lock camera - detach all controls and restore locked target
      if (!cameraLocked) {
        camera.detachControl();

        // Only restore camera state when UNPAUSING (coming from paused state)
        // On fresh start/restart (from idle or gameover), use current camera position
        if (savedCameraState && previousGameState === "paused") {
          camera.alpha = savedCameraState.alpha;
          camera.beta = savedCameraState.beta;
          camera.radius = savedCameraState.radius;
          camera.target.copyFrom(savedCameraState.targetPosition);
          console.log("📷 Camera state restored (unpause)");
        } else {
          console.log("📷 Fresh start - using current camera position");
        }
        savedCameraState = null;

        // Restore locked target for gameplay
        if (savedLockedTarget) {
          camera.lockedTarget = savedLockedTarget;
          savedLockedTarget = null;
        }
        cameraLocked = true;
        console.log("🔒 Camera Locked (Playing)");
      }
      return;
    } else {
      // Unlock camera - reattach controls and remove locked target for free orbiting
      if (cameraLocked) {
        // CRITICAL: Sync camera target before unlocking to prevent jump
        // Store the exact target position before any modifications
        let exactTargetPos: BABYLON.Vector3;

        if (camera.lockedTarget) {
          // Get the absolute position of the locked target
          if (camera.lockedTarget instanceof BABYLON.Vector3) {
            exactTargetPos = camera.lockedTarget.clone();
          } else {
            // TransformNode / AbstractMesh - get absolute position
            const targetNode = camera.lockedTarget as any;
            exactTargetPos = (targetNode.absolutePosition || targetNode.position).clone();
          }

          console.log(`📍 Locking target at: (${exactTargetPos.x.toFixed(2)}, ${exactTargetPos.y.toFixed(2)}, ${exactTargetPos.z.toFixed(2)})`);

          // Save the locked target before removing it
          savedLockedTarget = camera.lockedTarget;
          camera.lockedTarget = null;

          // Force set the target position explicitly
          camera.setTarget(exactTargetPos);
        } else {
          // No locked target, use current target
          exactTargetPos = camera.target.clone();
        }

        // Save camera orbit state AFTER setting target
        savedCameraState = {
          alpha: camera.alpha,
          beta: camera.beta,
          radius: camera.radius,
          targetPosition: exactTargetPos
        };
        console.log(`💾 Camera state saved - Alpha: ${camera.alpha.toFixed(2)}, Beta: ${camera.beta.toFixed(2)}, Radius: ${camera.radius.toFixed(2)}`);

        camera.attachControl(canvas, true);
        cameraLocked = false;
        console.log("🔓 Camera Unlocked (Not Playing) - Free orbit enabled");
      }
    }

    // Track previous game state for next frame
    previousGameState = gameState;

    // User requested panning ONLY in Pause/Idle. 
    // So block if gameover or victory sequence is active.
    if (gameState === "gameover" || player.isVictorySequenceActive()) return;

    const panSpeed = 2.5;

    // Use Camera's local axes to determine "Up/Down/Left/Right" in screen space
    // 1. Get View Matrix -> invert to get World-to-Camera direction vectors
    // Actually, simpler way with ArcRotateCamera: 
    // We can assume "Up" is roughly World Y+Z mix, but let's use the camera view.

    // We want to move the TARGET.
    const forward = camera.getDirection(BABYLON.Vector3.Forward());
    const right = camera.getDirection(BABYLON.Vector3.Right());
    const up = camera.getDirection(BABYLON.Vector3.Up());

    // Flatten forward/right to XZ plane if we want "ground" movement?
    // User said "translating from left to right or up down".
    // "Up/Down" usually means Screen Y.

    // Arrow Left/Right: Pan along camera Right vector
    if (keysPressed["ArrowLeft"]) {
      camera.target.subtractInPlace(right.scale(panSpeed));
    }
    if (keysPressed["ArrowRight"]) {
      camera.target.addInPlace(right.scale(panSpeed));
    }

    // Arrow Up/Down: Pan along camera Up vector (Screen Y)
    // Note: Since camera looks down, "Up" moves target "Back and Up".
    if (keysPressed["ArrowUp"]) {
      camera.target.addInPlace(up.scale(panSpeed));
    }
    if (keysPressed["ArrowDown"]) {
      camera.target.subtractInPlace(up.scale(panSpeed));
    }
  });

  // --------------------------------------------
  // CLEANUP
  // --------------------------------------------

  // Define handler for easy removal
  const stopRenderHandler = () => {
    engine?.stopRenderLoop();
    console.log("🛑 Render loop stopped for VFX");
  };

  // Add listener for VFX overlay
  window.addEventListener("stopRenderLoop", stopRenderHandler);

  window.addEventListener("beforeunload", () => {
    window.removeEventListener("stopRenderLoop", stopRenderHandler);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("touchstart", onTouchStart);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", onTouchEnd);
    window.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointerup", onPointerUp);

    environment.dispose();
    player.dispose();
    uiManager.dispose();

    BABYLON.Logger.ClearLogCache();
    BABYLON.Logger.LogLevels = BABYLON.Logger.AllLogLevel;

    engine?.dispose();
  });

  // Expose engine/scene globally for performance monitoring
  (window as any).__BABYLON_ENGINE__ = engine;
  (window as any).__BABYLON_SCENE__ = scene;

  return { engine, scene };
}
