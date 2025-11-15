// src/components/player/playerModel.ts
import * as BABYLON from "babylonjs";

export interface PlayerModelResult {
  playerRoot: BABYLON.TransformNode;
  playerSkeleton: BABYLON.Nullable<BABYLON.Skeleton>;
  playerAnimationGroup: BABYLON.Nullable<BABYLON.AnimationGroup>;
}

export function loadPlayerModel(
  scene: BABYLON.Scene,
  camera: BABYLON.ArcRotateCamera,
  modelRoot: string,
  shadowGenerator: BABYLON.ShadowGenerator,
  onLoaded: (info: PlayerModelResult) => void
) {
  BABYLON.SceneLoader.ImportMesh(
    null,
    modelRoot,
    "player.glb",
    scene,
    (meshes, particleSystems, skeletons, animationGroups) => {
      if (meshes.length === 0) {
        console.error("No meshes loaded from player.glb");
        return;
      }

      const root = new BABYLON.TransformNode("playerRoot", scene);

      // Attach meshes to root + shadows
      meshes.forEach((mesh) => {
        mesh.parent = root;
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.setEnabled(true);

        if (mesh instanceof BABYLON.Mesh) {
          mesh.receiveShadows = true;
          shadowGenerator.addShadowCaster(mesh, true);
        }
      });

      const meshAnchor =
        meshes.find(
          (m): m is BABYLON.Mesh =>
            m instanceof BABYLON.Mesh && !!m.skeleton
        ) ??
        meshes.find(
          (m): m is BABYLON.Mesh =>
            m instanceof BABYLON.Mesh
        ) ??
        null;

      const cameraAnchor = meshAnchor ?? meshes[0] ?? null;

      // Initial neutral transform
      root.position = BABYLON.Vector3.Zero();
      root.scaling = BABYLON.Vector3.One();
      root.computeWorldMatrix(true);

      // Skeleton
      const skeleton =
        skeletons[0] || meshAnchor?.skeleton || null;

      // Auto-scale to desired height
      const { min: rawMin, max: rawMax } = root.getHierarchyBoundingVectors();
      const rawHeight = rawMax.y - rawMin.y;
      const desiredHeight = 3.2 * 5;
      const scaleFactor = rawHeight > 0 ? desiredHeight / rawHeight : 1;

      root.scaling = new BABYLON.Vector3(scaleFactor, scaleFactor, scaleFactor);
      root.computeWorldMatrix(true);

      // Rotate 180° (faces camera)
      root.rotate(BABYLON.Axis.Y, Math.PI, BABYLON.Space.LOCAL);
      root.computeWorldMatrix(true);

      // Center pivot + offsets
      const { min: scaledMin, max: scaledMax } =
        root.getHierarchyBoundingVectors();
      const scaledCenter = scaledMin.add(scaledMax).scale(0.5);

      const verticalPadding = 0.05;
      const forwardOffset = 7.5;

      root.position = new BABYLON.Vector3(
        -scaledCenter.x,
        -scaledMin.y + verticalPadding,
        -scaledCenter.z + forwardOffset
      );
      root.computeWorldMatrix(true);

      // Camera follow
      if (cameraAnchor) camera.lockedTarget = cameraAnchor;
      else camera.setTarget(root.position.clone());

      // AnimationGroup detection
      const animationGroup =
        animationGroups.find((g) => g.targetedAnimations.length > 0) ?? null;

      animationGroups.forEach((g) => {
        if (g !== animationGroup) g.stop();
      });

      onLoaded({
        playerRoot: root,
        playerSkeleton: skeleton,
        playerAnimationGroup: animationGroup,
      });
    },
    undefined,
    (scene, message, exception) => {
      console.error("Error loading player.glb:", message, exception);
    }
  );
}
