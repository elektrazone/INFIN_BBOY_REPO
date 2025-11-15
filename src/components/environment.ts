// src/components/environment.ts
import * as BABYLON from "babylonjs";

export interface EnvironmentController {
  dispose(): void;
}

export function setupEnvironment(
  scene: BABYLON.Scene,
  shadowGenerator: BABYLON.ShadowGenerator,
  modelRoot: string,
  textureRoot: string,
  getScrollSpeed: () => number
): EnvironmentController {
  const environmentScale = 8;

  const buildingSegments: BABYLON.TransformNode[] = [];
  const groundSegments: BABYLON.TransformNode[] = [];

  const includeClonedSegments = true;
  const targetSegmentCount = includeClonedSegments ? 6 : 1;

  const groundWidth = 250;
  const groundLength = 160;
  let groundSegmentSpacing = groundLength;
  let groundSegmentCount = targetSegmentCount;

  const roadTextureRepeatPerSegment = 2;
  const getRoadTextureVScale = () =>
    Math.max(1, groundSegmentCount * roadTextureRepeatPerSegment);

  const stripePattern = {
    widthFraction: 0.005,
    heightFraction: 0.01,
    gapMultiplier: 1.0,
    startOffsetFraction: 0.0,
  };

  const groundMaterial = new BABYLON.StandardMaterial(
    "groundMaterial",
    scene
  );
  groundMaterial.diffuseColor = new BABYLON.Color3(0.12, 0.12, 0.14);
  groundMaterial.specularColor = new BABYLON.Color3(0.02, 0.02, 0.02);
  groundMaterial.emissiveColor = new BABYLON.Color3(0.01, 0.01, 0.012);

  const createFallbackRoadTextures = () => {
    const packagedTextureUrl = `${textureRoot}fallback-road-texture.png`;

    const packagedTexture = new BABYLON.Texture(
      packagedTextureUrl,
      scene,
      undefined,
      false,
      BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
      undefined,
      () => packagedTexture.dispose()
    );

    packagedTexture.onLoadObservable.addOnce(() => {
      packagedTexture.updateSamplingMode(
        BABYLON.Texture.TRILINEAR_SAMPLINGMODE
      );
    });

    const dynamicTexture = new BABYLON.DynamicTexture(
      "runner-road-fallback",
      { width: 1024, height: 1024 },
      scene,
      false
    );

    const ctx = dynamicTexture.getContext();
    if (ctx) {
      const size = 1024;
      ctx.fillStyle = "#201f2b";
      ctx.fillRect(0, 0, size, size);

      ctx.fillStyle = "#14131d";
      ctx.fillRect(0, size * 0.08, size, size * 0.84);

      ctx.fillStyle = "#fcd75a";
      const stripeWidth = Math.max(
        1,
        Math.round(size * stripePattern.widthFraction)
      );
      const stripeHeight = Math.max(
        1,
        Math.round(size * stripePattern.heightFraction)
      );
      const stripeGap = Math.max(1, stripeHeight * stripePattern.gapMultiplier);
      const stripeX = (size - stripeWidth) / 2;

      for (
        let y = size * stripePattern.startOffsetFraction;
        y < size + stripeHeight;
        y += stripeHeight + stripeGap
      ) {
        ctx.fillRect(stripeX, y, stripeWidth, stripeHeight);
      }
    }

    dynamicTexture.update(false);

    return { packagedTexture, dynamicTexture };
  };

  const applyRoadTextureSettings = (t: BABYLON.Texture) => {
    t.uScale = 1;
    t.vScale = getRoadTextureVScale();
    t.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
    t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    t.hasAlpha = false;
  };

  const { packagedTexture, dynamicTexture } = createFallbackRoadTextures();

  applyRoadTextureSettings(dynamicTexture);
  groundMaterial.diffuseTexture = dynamicTexture;

  let activeRoadTexture: BABYLON.Texture = dynamicTexture;

  const groundTextureState = { offset: 0 };

  let roadTexture: BABYLON.Nullable<BABYLON.Texture> = null;

  const setActiveRoadTexture = (t: BABYLON.Texture) => {
    applyRoadTextureSettings(t);
    groundMaterial.diffuseTexture = t;
    activeRoadTexture = t;
  };

  packagedTexture.onLoadObservable.addOnce(() => {
    setActiveRoadTexture(packagedTexture);
  });

  const textureUrl = `${textureRoot}fallback-road-texture.png`;

  roadTexture = new BABYLON.Texture(
    textureUrl,
    scene,
    undefined,
    false,
    BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
    () => {
      if (roadTexture) setActiveRoadTexture(roadTexture);
    },
    () => {
      if (packagedTexture && packagedTexture.isReady())
        setActiveRoadTexture(packagedTexture);
      else setActiveRoadTexture(dynamicTexture);
    }
  );

  roadTexture.onLoadObservable.addOnce(() => {
    if (roadTexture) setActiveRoadTexture(roadTexture);
  });

  const createGroundSegment = (index: number, spacing: number) => {
    const ground = BABYLON.MeshBuilder.CreateGround(
      `ground-${index}`,
      { width: groundWidth, height: spacing },
      scene
    );
    ground.position = new BABYLON.Vector3(0, 0, -index * spacing);
    ground.material = groundMaterial;
    ground.receiveShadows = true;
    return ground;
  };

  const rebuildGroundSegments = (spacing: number, count: number) => {
    groundSegments.splice(0).forEach((s) => s.dispose());
    groundSegmentSpacing = spacing;
    groundSegmentCount = count;

    for (let i = 0; i < count; i++) {
      const ground = createGroundSegment(i, spacing);
      groundSegments.push(ground);
    }

    groundTextureState.offset = 0;
    applyRoadTextureSettings(activeRoadTexture);
  };

  rebuildGroundSegments(groundSegmentSpacing, groundSegmentCount);

  const advanceSegments = (
    segments: BABYLON.TransformNode[],
    spacing: number,
    movement: number
  ) => {
    segments.forEach((seg) => {
      seg.position.z += movement;
    });

    let minZ = Infinity;
    segments.forEach((seg) => {
      if (seg.position.z < minZ) minZ = seg.position.z;
    });

    segments.forEach((seg) => {
      if (seg.position.z > spacing) seg.position.z = minZ - spacing;
    });
  };

  const scrollObserver = scene.onBeforeRenderObservable.add(() => {
    const delta = scene.getEngine().getDeltaTime() / 1000;
    const movement = getScrollSpeed() * delta;
    if (movement === 0) return;

    advanceSegments(groundSegments, groundSegmentSpacing, movement);

    if (buildingSegmentSpacing > 0)
      advanceSegments(buildingSegments, buildingSegmentSpacing, movement);

    groundTextureState.offset -= movement / groundSegmentSpacing;
    groundTextureState.offset %= 1;
    if (groundTextureState.offset < 0) groundTextureState.offset += 1;

    activeRoadTexture.vOffset = groundTextureState.offset;
  });

  // BUILDINGS

  const buildingModelFiles = Array.from(
    { length: 10 },
    (_, i) => `b${i + 1}.glb`
  );

  const environmentModelRoot = modelRoot;

  const loadBuildingMeshes = (file: string) =>
    BABYLON.SceneLoader.ImportMeshAsync(
      null,
      environmentModelRoot,
      file,
      scene
    ).then((result) =>
      result.meshes.filter(
        (m): m is BABYLON.Mesh => m instanceof BABYLON.Mesh
      )
    );

  const meshTransforms = new Map<
    BABYLON.Mesh,
    {
      position: BABYLON.Vector3;
      rotation: BABYLON.Nullable<BABYLON.Vector3>;
      rotationQuaternion: BABYLON.Nullable<BABYLON.Quaternion>;
      scaling: BABYLON.Vector3;
    }
  >();

  let buildingSegmentSpacing = 0;

  Promise.all(buildingModelFiles.map(loadBuildingMeshes))
    .then((meshGroups) => {
      const buildingMeshes = meshGroups.flat();
      if (buildingMeshes.length === 0) {
        console.error("No renderable meshes found in b1–b10 assets.");
        return;
      }

      buildingMeshes.forEach((mesh) => {
        mesh.scaling = mesh.scaling.scale(environmentScale);
        meshTransforms.set(mesh, {
          position: mesh.position.clone(),
          rotation: mesh.rotation?.clone() ?? null,
          rotationQuaternion: mesh.rotationQuaternion?.clone() ?? null,
          scaling: mesh.scaling.clone(),
        });

        mesh.isVisible = false;
        mesh.setEnabled(false);
      });

      const applyTransform = (
        target: BABYLON.AbstractMesh,
        source: BABYLON.Mesh
      ) => {
        const original = meshTransforms.get(source);
        if (!original) return;

        target.position = original.position.clone();
        target.scaling = original.scaling.clone();

        if (original.rotationQuaternion) {
          target.rotationQuaternion = original.rotationQuaternion.clone();
          target.rotation = BABYLON.Vector3.Zero();
        } else if (original.rotation) {
          target.rotation = original.rotation.clone();
          target.rotationQuaternion = null;
        }
      };

      const createBuildingGroup = (
        parent: BABYLON.TransformNode,
        name: string,
        rotationY: number
      ) => {
        const group = new BABYLON.TransformNode(name, scene);
        group.parent = parent;

        group.rotation = new BABYLON.Vector3(0, rotationY, 0);

        buildingMeshes.forEach((mesh) => {
          const instance = mesh.createInstance(`${mesh.name}-${name}`);
          instance.parent = group;
          applyTransform(instance, mesh);

          instance.receiveShadows = true;
          instance.alwaysSelectAsActiveMesh = false;
          shadowGenerator.addShadowCaster(instance, true);
        });

        return group;
      };

      const baseRoot = new BABYLON.TransformNode("buildingsSeg-0", scene);

      baseRoot.position = BABYLON.Vector3.Zero();

      createBuildingGroup(baseRoot, "B_a_group_seg-0", 0);
      createBuildingGroup(baseRoot, "B_b_group_seg-0", Math.PI);

      const { min, max } = baseRoot.getHierarchyBoundingVectors();
      const rawSpacing = Math.abs(max.z - min.z);

      const overlapCompensation = 1;
      const spacing = Math.max(rawSpacing - overlapCompensation, 10);

      buildingSegmentSpacing = spacing;

      const segmentCount = targetSegmentCount;

      rebuildGroundSegments(spacing, segmentCount);

      const registerBuildingSegment = (
        root: BABYLON.TransformNode,
        index: number
      ) => {
        root.position = new BABYLON.Vector3(0, 0, -index * spacing);
        buildingSegments.push(root);
      };

      const createSegment = (i: number) => {
        const segRoot = new BABYLON.TransformNode(
          `buildingsSeg-${i}`,
          scene
        );
        segRoot.position = new BABYLON.Vector3(0, 0, -i * spacing);

        createBuildingGroup(segRoot, `B_a_group_seg-${i}`, 0);
        createBuildingGroup(segRoot, `B_b_group_seg-${i}`, Math.PI);

        registerBuildingSegment(segRoot, i);
      };

      if (includeClonedSegments) {
        registerBuildingSegment(baseRoot, 0);

        for (let i = 1; i < segmentCount; i++) createSegment(i);
      } else {
        baseRoot.position = BABYLON.Vector3.Zero();
        registerBuildingSegment(baseRoot, 0);
      }
    })
    .catch((err) => {
      console.error("Error loading building assets:", err);
    });

  const dispose = () => {
    if (scrollObserver) {
      scene.onBeforeRenderObservable.remove(scrollObserver);
    }

    buildingSegments.forEach((s) => s.dispose());
    groundSegments.forEach((s) => s.dispose());

    roadTexture?.dispose();
    packagedTexture.dispose();
    dynamicTexture.dispose();
  };

  return { dispose };
}
