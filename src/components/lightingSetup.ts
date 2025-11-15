// src/components/lightingSetup.ts
import * as BABYLON from "babylonjs";

export function createLighting(scene: BABYLON.Scene) {
  const hemisphericLight = new BABYLON.HemisphericLight(
    "hemilight",
    new BABYLON.Vector3(0, 1, 0),
    scene
  );
  hemisphericLight.intensity = 0.9;

  const directionalLight = new BABYLON.DirectionalLight(
    "dirLight",
    new BABYLON.Vector3(-0.5, -1, 0.5),
    scene
  );

  const shadowGenerator = new BABYLON.ShadowGenerator(2048, directionalLight);
  shadowGenerator.useExponentialShadowMap = true;

  return {
    hemisphericLight,
    directionalLight,
    shadowGenerator,
  };
}
