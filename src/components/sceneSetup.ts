// src/components/sceneSetup.ts
import * as BABYLON from "babylonjs";

export function createScene(canvas: HTMLCanvasElement) {
  const engine = new BABYLON.Engine(canvas, true);

  // Logger config identical to original file
  BABYLON.Logger.ClearLogCache();
  BABYLON.Logger.LogLevels = BABYLON.Logger.NoneLogLevel;

  const scene = new BABYLON.Scene(engine);

  return {
    engine,
    scene,
  };
}
