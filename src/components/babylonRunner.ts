// src/components/babylonRunner.ts
import * as BABYLON from "babylonjs";
import "babylonjs-loaders";

import { createScene } from "./sceneSetup";
import { createLighting } from "./lightingSetup";
import { createCamera } from "./cameraSetup";
import { getAssetRoots } from "./assetPaths";
import { setupPlayerController } from "./player/playerController";

import { setupEnvironment } from "./environment";

// Draco configuration (unchanged)
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

  const updateHardwareScaling = () => {
    if (!engine) return;
    const resolutionScale = Math.max(1, canvas.height / 1080);
    engine.setHardwareScalingLevel(Math.min(2.5, resolutionScale));
  };

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

  // ---- Scene + Engine ----
  const { engine: createdEngine, scene } = createScene(canvas);
  engine = createdEngine;

  updateHardwareScaling();

  // ---- Lighting ----
  const { shadowGenerator } = createLighting(scene);

  // ---- Camera ----
  const { camera } = createCamera(scene, canvas);

  // ---- Assets ----
  const { modelRoot, textureRoot } = getAssetRoots();

  // Scroll speed signal shared between player & environment
  let currentScrollSpeed = 0;
  const setScrollSpeed = (s: number) => (currentScrollSpeed = s);
  const getScrollSpeed = () => currentScrollSpeed;

  // ---- Environment ----
  const environment = setupEnvironment(
    scene,
    shadowGenerator,
    modelRoot,
    textureRoot,
    getScrollSpeed
  );

  // ---- Player ----
  const player = setupPlayerController(
    scene,
    camera,
    modelRoot,
    shadowGenerator,
    setScrollSpeed
  );

  // ---- Main loop ----
  engine.runRenderLoop(() => {
    player.ensureIdle();
    scene.render();
  });

  // ---- Events ----
  const onResize = () => applyCanvasSize();
  const onKeyDown = (ev: KeyboardEvent) => player.handleKeyDown(ev);
  const onKeyUp = (ev: KeyboardEvent) => player.handleKeyUp(ev);

  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  // ---- Cleanup ----
  window.addEventListener("beforeunload", () => {
    window.removeEventListener("resize", onResize);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);

    environment.dispose();
    player.dispose();

    BABYLON.Logger.ClearLogCache();
    BABYLON.Logger.LogLevels = BABYLON.Logger.AllLogLevel;

    engine?.dispose();
  });

  return { engine, scene };
}
