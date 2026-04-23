// src/components/babylonRunner.ts
import * as BABYLON from "@babylonjs/core";
import "@babylonjs/loaders";

import { createScene, createLighting, createCamera, createSkyDome, createLensEffect } from "./scene/sceneManager";
import { getAssetRoots } from "./assetPaths";
import { PERFORMANCE_CONFIG } from "../config/performanceConfig";

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

  // Set default mode if not set
  if (!(window as any).__GAME_DISPLAY_MODE) {
      (window as any).__GAME_DISPLAY_MODE = 'fullscreen';
  }

  let engine: BABYLON.Engine | null = null;

  // --------------------------------------------
  // HARDWARE SCALING
  // --------------------------------------------
  const updateHardwareScaling = () => {
    if (!engine) return;

    // Check for URL parameter quality overrides
    const urlParams = new URLSearchParams(window.location.search);
    const quality = urlParams.get('quality')?.toLowerCase() || urlParams.get('res')?.toLowerCase();

    if (quality === "ultra") {
      // Full native physical pixels (extremely sharp, heavy)
      const scaling = 1.0 / window.devicePixelRatio;
      engine.setHardwareScalingLevel(scaling);
      console.log(`🚀 HIGH-RES MODE (ULTRA): Scaling at native physical pixels (${scaling.toFixed(4)})`);
      return;
    }

    if (quality === "4k" || quality === "high") {
      // 2.0 = Significant reduction from 4K for performance (effectively 1080p internal buffer on a 4K screen)
      // Takes the edge off 4K rendering while staying sharp on the UI side
      engine.setHardwareScalingLevel(2.0);
      console.log("🚀 HIGH-RES MODE (4K/HIGH): Scaling set to 2.0");
      return;
    }

    if (quality === "med" || quality === "medium") {
      // 1.5 = Slightly reduced resolution
      engine.setHardwareScalingLevel(1.5);
      console.log("⚖️ MEDIUM-RES MODE: Scaling set to 1.5");
      return;
    }

    // Default Optimized Mode
    const defaultScaling = PERFORMANCE_CONFIG.defaultHardwareScaling || 2.0;
    engine.setHardwareScalingLevel(defaultScaling);
    console.log(`🚀 DEFAULT SCALING: Level ${defaultScaling}`);
  };

  // --------------------------------------------
  // RESPONSIVE CANVAS
  // --------------------------------------------
  const applyCanvasSize = () => {
    document.body.style.backgroundImage = "none";
    document.body.style.backgroundColor = "black";
    document.body.style.width = "100vw";
    document.body.style.height = "100vh";

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

    // Ensure responsive centering
    canvas.style.position = 'relative';
    canvas.style.left = 'auto';
    canvas.style.top = 'auto';
    canvas.style.transform = 'none';

    updateHardwareScaling();
    engine?.resize();
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
  
  // Apply saved global shadow state immediately
  const savedShadows = localStorage.getItem('perf_shadows');
  if (savedShadows === 'false') {
      scene.shadowsEnabled = false;
      console.log("🔦 Performance: Global shadows DISABLED on boot.");
  }
  
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

    // Linearly scale from 1.0 to 2.0 over the match duration
    const progress = Math.min(1.0, elapsed / total);
    return 1.0 + (progress * 1.0);
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
      console.log("✅ All assets loaded - starting automatically");
      useGameStore.getState().setLoading(false);
      // Auto-start: dismiss intro screen immediately
      useGameStore.getState().dismissIntroScreen();
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
  // UNIVERSAL AUDIO UNLOCK (FOR AUTO-START)
  // --------------------------------------------
  let audioUnlocked = false;
  const unlockAudioOnInteraction = () => {
    if (audioUnlocked) return;
    audioUnlocked = true;
    audioManager.unlockAudio();
    
    // If the game is already playing, start the music since it was blocked
    const { gameState, isMatchTimerActive } = useGameStore.getState();
    if (gameState === "playing" && isMatchTimerActive) {
      const audio = getAudioManager();
      if (audio) {
        console.log("🎵 Late starting music upon first user interaction");
        audio.playMusic("music_theme", true);
      }
    }
    
    // Clean up listeners
    window.removeEventListener("keydown", unlockAudioOnInteraction);
    window.removeEventListener("pointerdown", unlockAudioOnInteraction);
    window.removeEventListener("touchstart", unlockAudioOnInteraction);
  };

  window.addEventListener("keydown", unlockAudioOnInteraction);
  window.addEventListener("pointerdown", unlockAudioOnInteraction);
  window.addEventListener("touchstart", unlockAudioOnInteraction);

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

    // Camera Capture Hotkey (Shift + C) - Gameplay
    // Camera Capture Hotkey (Shift + B) - Intro
    const isShiftC = ev.shiftKey && ev.code === "KeyC";
    const isShiftB = ev.shiftKey && ev.code === "KeyB";
    const isShiftR = ev.shiftKey && ev.code === "KeyR";

    if (isShiftR) {
      ev.preventDefault();
      ev.stopPropagation();

      console.log("🔄 Resetting camera to file defaults (clearing localStorage)...");

      const keysToRemove = [
        "camera_alpha", "camera_beta", "camera_radius",
        "camera_target_x", "camera_target_y", "camera_target_z", "camera_fov",
        "camera_alpha_intro", "camera_beta_intro", "camera_radius_intro",
        "camera_target_x_intro", "camera_target_y_intro", "camera_target_z_intro", "camera_fov_intro"
      ];

      keysToRemove.forEach(key => localStorage.removeItem(key));

      alert("✅ Camera overrides cleared! Refresh or tap start to see file defaults.");
      return;
    }

    if (isShiftC || isShiftB) {
      ev.preventDefault();
      ev.stopPropagation();

      const type = isShiftC ? "GAMEPLAY" : "INTRO";
      const suffix = isShiftC ? "" : "_intro";
      const filename = isShiftC ? "camera-settings.json" : "camera-intro-settings.json";

      console.log(`📸 ${type} CAMERA CAPTURE (Saving to LocalStorage & ${filename})...`);

      // Save Orbit details
      localStorage.setItem(`camera_alpha${suffix}`, camera.alpha.toString());
      localStorage.setItem(`camera_beta${suffix}`, camera.beta.toString());
      localStorage.setItem(`camera_radius${suffix}`, camera.radius.toString());

      // Also save target position for panning
      localStorage.setItem(`camera_target_x${suffix}`, camera.target.x.toString());
      localStorage.setItem(`camera_target_y${suffix}`, camera.target.y.toString());
      localStorage.setItem(`camera_target_z${suffix}`, camera.target.z.toString());

      // Save FOV
      localStorage.setItem(`camera_fov${suffix}`, camera.fov.toString());

      // Generate JSON for camera settings
      const cameraSettingsJson = {
        alpha: parseFloat(camera.alpha.toFixed(2)),
        beta: parseFloat(camera.beta.toFixed(2)),
        radius: parseFloat(camera.radius.toFixed(2)),
        targetX: parseFloat(camera.target.x.toFixed(1)),
        targetY: parseFloat(camera.target.y.toFixed(1)),
        targetZ: parseFloat(camera.target.z.toFixed(1)),
        fov: parseFloat(camera.fov.toFixed(2)),
        filename: filename
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
            console.log(`✅ ${type} Camera settings saved automatically!`);

            // Calculate 35mm equivalent focal length (assuming 24mm sensor height for vertical FOV)
            const mm = (12 / Math.tan(camera.fov / 2)).toFixed(1);

            const msg = `✅ ${type} Camera Saved Automatically!

Alpha: ${camera.alpha.toFixed(2)} rad
Beta: ${camera.beta.toFixed(2)} rad
Radius: ${camera.radius.toFixed(2)}
FOV: ${camera.fov.toFixed(2)} rad (${(camera.fov * 180 / Math.PI).toFixed(1)}°) | ${mm}mm
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

    if (ev.code === "KeyO") {
      ev.preventDefault();
      ev.stopPropagation();
      // We toggle demo camera mode via a custom event so the render loop can pick it up
      window.dispatchEvent(new CustomEvent("toggleDemoCameraMode"));
      return;
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

  let demoCameraMode = false;
  let previousDemoCameraMode = false;

  window.addEventListener("toggleDemoCameraMode", () => {
    demoCameraMode = !demoCameraMode;
    console.log(`Demo Camera Mode: ${demoCameraMode ? "ON" : "OFF"}`);
  });

  // Save camera orbit state when pausing or entering demo mode
  let savedCameraState: {
    alpha: number;
    beta: number;
    radius: number;
    fov: number;
    targetPosition: BABYLON.Vector3;
    lockedTarget: BABYLON.Nullable<BABYLON.AbstractMesh | BABYLON.TransformNode | BABYLON.Vector3>;
  } | null = null;

  scene.onBeforeRenderObservable.add(() => {
    const gameState = useGameStore.getState().gameState;

    // --- DEMO CAMERA MODE ---
    if (demoCameraMode && !previousDemoCameraMode) {
      savedCameraState = {
        alpha: camera.alpha,
        beta: camera.beta,
        radius: camera.radius,
        fov: camera.fov,
        targetPosition: camera.target.clone(),
        lockedTarget: camera.lockedTarget,
      };
      camera.lockedTarget = null;
      camera.attachControl(canvas, true);
      cameraLocked = false;
      console.log("🔓 Camera unlocked (Demo Mode)");
    }

    if (!demoCameraMode && previousDemoCameraMode) {
      camera.detachControl();
      cameraLocked = true;
      if (savedCameraState) {
        if (savedCameraState.lockedTarget) {
          camera.lockedTarget = savedCameraState.lockedTarget;
        }
        savedCameraState = null;
        console.log("🔒 Camera re-locked (Demo Mode off, user adjustments kept)");
      }
    }

    if (!demoCameraMode) {
      // --- PAUSE: Unlock camera for free orbiting ---
      if (gameState === "paused" && previousGameState !== "paused") {
        savedCameraState = {
          alpha: camera.alpha,
          beta: camera.beta,
          radius: camera.radius,
          fov: camera.fov,
          targetPosition: camera.target.clone(),
          lockedTarget: camera.lockedTarget,
        };
        camera.lockedTarget = null;
        camera.attachControl(canvas, true);
        cameraLocked = false;
        console.log("🔓 Camera unlocked for pause (free orbit)");
      }

      // --- UNPAUSE: Keep user adjustments, re-lock controls ---
      if (gameState === "playing" && previousGameState === "paused") {
        camera.detachControl();
        cameraLocked = true;

        if (savedCameraState) {
          if (savedCameraState.lockedTarget) {
            camera.lockedTarget = savedCameraState.lockedTarget;
          }
          savedCameraState = null;
          console.log("🔒 Camera re-locked (user adjustments kept)");
        }
      }

      // Ensure camera controls are detached outside of pause
      if (gameState !== "paused" && !cameraLocked) {
        camera.detachControl();
        cameraLocked = true;
        console.log("🔒 Camera controls locked (no user input)");
      }
    }

    // Track previous states for next frame
    previousGameState = gameState;
    previousDemoCameraMode = demoCameraMode;
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

  // Global cleanup function to be called before reloading the page to prevent memory leaks (WebGL, AudioContext)
  (window as any).performGameCleanup = () => {
    console.log("🧹 Performing explicit game cleanup...");
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
    audioManager.dispose(); // CRITICAL: Stop audio and close AudioContexts

    BABYLON.Logger.ClearLogCache();
    BABYLON.Logger.LogLevels = BABYLON.Logger.AllLogLevel;

    engine?.dispose();
    console.log("✅ Cleanup complete.");
  };

  // Still hook it up to beforeunload just in case the browser or user refreshes normally
  window.addEventListener("beforeunload", (window as any).performGameCleanup);

  // Expose engine/scene globally for performance monitoring
  (window as any).__BABYLON_ENGINE__ = engine;
  (window as any).__BABYLON_SCENE__ = scene;

  return { engine, scene };
}
