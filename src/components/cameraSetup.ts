// src/components/cameraSetup.ts
import * as BABYLON from "babylonjs";

export function createCamera(
  scene: BABYLON.Scene,
  canvas: HTMLCanvasElement
) {
  const camera = new BABYLON.ArcRotateCamera(
    "camera",
    Math.PI / 2,
    Math.PI / 3,
    25,
    new BABYLON.Vector3(0, 8, 0),
    scene
  );

  camera.attachControl(canvas, true);

  return { camera };
}
