import React, { useRef, useEffect } from 'react';
import * as BABYLON from 'babylonjs';
import 'babylonjs-loaders';

if (BABYLON.DracoCompression) {
  BABYLON.DracoCompression.Configuration = {
    decoder: {
      wasmUrl: 'https://cdn.babylonjs.com/draco_wasm_wrapper_gltf.js',
      wasmBinaryUrl: 'https://cdn.babylonjs.com/draco_wasm_wrapper_gltf.wasm',
      fallbackUrl: 'https://cdn.babylonjs.com/draco_decoder_gltf.js',
    },
  };
}

const BabylonRunner: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const maxHeight = 3840;
    const maxWidth = 2160;
    let engine: BABYLON.Engine | null = null;

    const updateHardwareScaling = () => {
      if (!engine) return;
      // Increase hardware scaling on larger canvases to lower internal render resolution and boost FPS
      const resolutionScale = Math.max(1, canvas.height / 1080);
      engine.setHardwareScalingLevel(Math.min(2.5, resolutionScale));
    };

    const applyCanvasSize = () => {
      let targetHeight = Math.min(window.innerHeight, maxHeight);
      let targetWidth = (targetHeight * 9) / 16;

      if (targetWidth > maxWidth) {
        targetWidth = maxWidth;
        targetHeight = Math.min((targetWidth * 16) / 9, maxHeight);
      }

      canvas.width = targetWidth;
      canvas.height = targetHeight;
      canvas.style.width = `${targetWidth}px`;
      canvas.style.height = `${targetHeight}px`;
      if (engine) {
        engine.resize();
        updateHardwareScaling();
      }
    };

    applyCanvasSize();

    engine = new BABYLON.Engine(canvas, true);
    BABYLON.Logger.ClearLogCache();
    BABYLON.Logger.LogLevels = BABYLON.Logger.NoneLogLevel;
    updateHardwareScaling();
    const scene = new BABYLON.Scene(engine);
    const environmentScale = 8;
    const buildingSegments: BABYLON.TransformNode[] = [];
    let buildingSegmentSpacing = 0;
    const groundSegments: BABYLON.TransformNode[] = [];
    let scrollObserver: BABYLON.Nullable<BABYLON.Observer<BABYLON.Scene>> = null;
    const baseScrollSpeed = 102; // units per second
    let activeScrollSpeed = 0;

    type PlayerState =
      | 'Idle'
      | 'Run'
      | 'Strafe_L'
      | 'Strafe_R'
      | 'Slide'
      | 'Jump'
      | 'Fall'
      | 'Getup'
      | 'Run_Idle';

    type AnimationRangeConfig = {
      start: number;
      end: number;
      loop: boolean;
      scroll: number;
    };

    type LoopingState = Extract<PlayerState, 'Idle' | 'Run' | 'Strafe_L' | 'Strafe_R'>;
    const loopFrameRanges: Record<LoopingState, [number, number]> = {
      Idle: [0, 88],
      Run: [89, 109],
      Strafe_L: [182, 201],
      Strafe_R: [202, 221],
    };
    const buildLoopRange = (state: LoopingState, scroll: number): AnimationRangeConfig => {
      const [start, end] = loopFrameRanges[state];
      return { start, end, loop: true, scroll };
    };

    const sourceFrameRate = 24;
    const animationRanges: Record<PlayerState, AnimationRangeConfig> = {
      Idle: buildLoopRange('Idle', 0),
      Run: buildLoopRange('Run', baseScrollSpeed),
      Slide: { start: 110, end: 154, loop: false, scroll: baseScrollSpeed },
      Jump: { start: 155, end: 181, loop: false, scroll: baseScrollSpeed },
      Strafe_L: buildLoopRange('Strafe_L', baseScrollSpeed),
      Strafe_R: buildLoopRange('Strafe_R', baseScrollSpeed),
      Run_Idle: { start: 222, end: 248, loop: false, scroll: 0 },
      Fall: { start: 249, end: 324, loop: false, scroll: baseScrollSpeed },
      Getup: { start: 325, end: 552, loop: false, scroll: baseScrollSpeed },
    };
    const ensureSkeletonRanges = (skeleton: BABYLON.Skeleton) => {
      (Object.keys(animationRanges) as PlayerState[]).forEach(state => {
        if (!skeleton.getAnimationRange(state)) {
          const { start, end } = animationRanges[state];
          skeleton.createAnimationRange(state, start, end);
        }
      });
    };
    const resolveFrames = (state: PlayerState, fallback: AnimationRangeConfig) => {
      if (playerSkeleton) {
        const namedRange = playerSkeleton.getAnimationRange(state);
        if (namedRange) {
          return { start: namedRange.from, end: namedRange.to };
        }
      }
      return { start: fallback.start, end: fallback.end };
    };

    const blockingStates = new Set<PlayerState>(['Slide', 'Jump', 'Fall', 'Getup']);
    const keyState = {
      forward: false,
      left: false,
      right: false,
      slide: false,
      jump: false,
    };
    const debugKeyMap: Record<string, PlayerState> = {
      Digit1: 'Idle',
      Digit2: 'Run',
      Digit3: 'Slide',
      Digit4: 'Jump',
      Digit5: 'Run_Idle',
    };
    let debugOverrideState: PlayerState | null = null;
    let playerSkeleton: BABYLON.Nullable<BABYLON.Skeleton> = null;
    let playerAnimationGroup: BABYLON.Nullable<BABYLON.AnimationGroup> = null;
    let animationGroupFrameRate = sourceFrameRate;
    let playerAnimatable: BABYLON.Nullable<BABYLON.Animatable> = null;
    let playerAnimatableEndObserver: BABYLON.Nullable<BABYLON.Observer<BABYLON.Animatable>> = null;
    let playerAnimationGroupEndObserver: BABYLON.Nullable<BABYLON.Observer<BABYLON.AnimationGroup>> = null;
    let currentPlayerState: PlayerState = 'Idle';
    let blockingAction = false;
    let playerRoot: BABYLON.Nullable<BABYLON.TransformNode> = null;
    let playerMotionObserver: BABYLON.Nullable<BABYLON.Observer<BABYLON.Scene>> = null;
    let idleInitialized = false;
    const lateralRange = 40;
    const lateralSpeed = 40;
    const lateralReturnSpeed = 40;
    const lateralState = { target: 0 };

    const stopCurrentAnimation = () => {
      if (playerAnimatable && playerAnimatableEndObserver) {
        playerAnimatable.onAnimationEndObservable.remove(playerAnimatableEndObserver);
        playerAnimatableEndObserver = null;
      }
      if (playerAnimationGroup && playerAnimationGroupEndObserver) {
        playerAnimationGroup.onAnimationGroupEndObservable.remove(playerAnimationGroupEndObserver);
        playerAnimationGroupEndObserver = null;
      }
      if (playerAnimationGroup) {
        playerAnimationGroup.stop();
      }
      if (playerAnimatable) {
        playerAnimatable.stop();
        playerAnimatable = null;
      }
    };

    const setPlayerState = (nextState: PlayerState, force = false) => {
      if (!force && currentPlayerState === nextState) {
        return;
      }
      if (!force && blockingStates.has(currentPlayerState)) {
        return;
      }
      if (blockingStates.has(nextState)) {
        blockingAction = true;
      } else {
        blockingAction = false;
      }

      const config = animationRanges[nextState];
      const targetRange = resolveFrames(nextState, config);
      if (!playerSkeleton && !playerAnimationGroup) {
        activeScrollSpeed = config.scroll;
        currentPlayerState = nextState;
        return;
      }

      stopCurrentAnimation();

      const handleAnimationEnd = () => {
        blockingAction = false;
        if (nextState === 'Slide' || nextState === 'Jump') {
          setPlayerState('Run', true);
        } else if (nextState === 'Getup') {
          setPlayerState('Idle', true);
        } else if (nextState === 'Run_Idle') {
          setPlayerState('Idle', true);
        }
      };

      let animationStarted = false;
      if (playerAnimationGroup) {
        const frameScale = animationGroupFrameRate / sourceFrameRate;
        const fromFrame = targetRange.start * frameScale;
        const toFrame = targetRange.end * frameScale;
        playerAnimationGroup.reset();
        playerAnimationGroup.start(config.loop, 1, fromFrame, toFrame, false);
        animationStarted = true;
        if (!config.loop) {
          playerAnimationGroupEndObserver = playerAnimationGroup.onAnimationGroupEndObservable.addOnce(() => {
            playerAnimationGroupEndObserver = null;
            handleAnimationEnd();
          });
        }
        playerAnimatable = null;
      } else if (playerSkeleton) {
        playerAnimatable = scene.beginAnimation(
          playerSkeleton,
          targetRange.start,
          targetRange.end,
          config.loop,
          1
        );
        if (playerAnimatable) {
          animationStarted = true;
          if (!config.loop) {
            playerAnimatableEndObserver = playerAnimatable.onAnimationEndObservable.addOnce(() => {
              playerAnimatableEndObserver = null;
              handleAnimationEnd();
            });
          }
        }
      }
      if (!animationStarted) {
        activeScrollSpeed = config.scroll;
        currentPlayerState = nextState;
        return;
      }
      activeScrollSpeed = config.scroll;
      currentPlayerState = nextState;
    };

    const ensureIdle = () => {
      if (idleInitialized) {
        return;
      }
      const idleRange = resolveFrames('Idle', animationRanges.Idle);
      if (playerAnimationGroup) {
        const frameScale = animationGroupFrameRate / sourceFrameRate;
        const fromFrame = idleRange.start * frameScale;
        const toFrame = idleRange.end * frameScale;
        playerAnimationGroup.reset();
        playerAnimationGroup.start(true, 1, fromFrame, toFrame, true);
        idleInitialized = true;
        playerAnimatable = null;
      } else if (playerSkeleton) {
        playerAnimatable = scene.beginAnimation(playerSkeleton, idleRange.start, idleRange.end, true);
        if (playerAnimatable) {
          idleInitialized = true;
        }
      }
    };

    const triggerDebugState = (state: PlayerState | null) => {
      keyState.forward = false;
      keyState.left = false;
      keyState.right = false;
      keyState.slide = false;
      keyState.jump = false;
      debugOverrideState = state;
      if (state) {
        setPlayerState(state, true);
      } else {
        setPlayerState('Idle', true);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const debugState = debugKeyMap[event.code];
      if (debugState) {
        event.preventDefault();
        triggerDebugState(debugState);
        return;
      }
      if (event.code === 'Digit0') {
        event.preventDefault();
        triggerDebugState(null);
        return;
      }
      switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
          keyState.forward = true;
          break;
        case 'ArrowLeft':
        case 'KeyA':
          keyState.left = true;
          break;
        case 'ArrowRight':
        case 'KeyD':
          keyState.right = true;
          break;
        case 'ArrowDown':
        case 'KeyS':
          keyState.slide = true;
          break;
        case 'Space':
          event.preventDefault();
          keyState.jump = true;
          break;
        default:
          break;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
          keyState.forward = false;
          break;
        case 'ArrowLeft':
        case 'KeyA':
          keyState.left = false;
          break;
        case 'ArrowRight':
        case 'KeyD':
          keyState.right = false;
          break;
        case 'ArrowDown':
        case 'KeyS':
          keyState.slide = false;
          break;
        case 'Space':
          event.preventDefault();
          keyState.jump = false;
          break;
        default:
          break;
      }
    };

    const updateMovementState = () => {
      if (!playerRoot) {
        return;
      }
      if (debugOverrideState) {
        return;
      }
      const moveLeft = keyState.left && !keyState.right;
      const moveRight = keyState.right && !keyState.left;
      const shouldSlide = keyState.slide;
      const shouldRun = keyState.forward || blockingAction;

      let triggeredJump = false;
      if (keyState.jump) {
        if (!blockingAction) {
          setPlayerState('Jump');
          triggeredJump = true;
        }
        keyState.jump = false;
      }
      if (triggeredJump) {
        return;
      }

      if (shouldSlide) {
        setPlayerState('Slide');
      } else if (moveLeft) {
        setPlayerState('Strafe_L');
      } else if (moveRight) {
        setPlayerState('Strafe_R');
      } else if (shouldRun) {
        setPlayerState('Run');
      } else {
        setPlayerState('Idle');
      }
    };

    const lateralClamp = (value: number) => Math.max(-lateralRange, Math.min(lateralRange, value));

    playerMotionObserver = scene.onBeforeRenderObservable.add(() => {
      const deltaSeconds = scene.getEngine().getDeltaTime() / 1000;
      updateMovementState();
      if (!playerRoot) {
        return;
      }
      const targetPosition = playerRoot.position.clone();
      if (keyState.left && !keyState.right) {
        lateralState.target = lateralClamp(lateralState.target - lateralSpeed * deltaSeconds);
      } else if (keyState.right && !keyState.left) {
        lateralState.target = lateralClamp(lateralState.target + lateralSpeed * deltaSeconds);
      } else {
        const direction = Math.sign(-lateralState.target);
        const adjustment = direction * lateralReturnSpeed * deltaSeconds;
        if (Math.abs(adjustment) > Math.abs(lateralState.target)) {
          lateralState.target = 0;
        } else {
          lateralState.target += adjustment;
        }
      }
      targetPosition.x = lateralState.target;
      playerRoot.position = targetPosition;
    });

    const light = new BABYLON.HemisphericLight('light', new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.9;
    const camera = new BABYLON.ArcRotateCamera(
      'camera',
      Math.PI / 2,
      Math.PI / 3,
      25,
      new BABYLON.Vector3(0, 8, 0),
      scene
    );
    camera.attachControl(canvas, true);
    const shadowGenerator = new BABYLON.ShadowGenerator(2048, new BABYLON.DirectionalLight(
      'dirLight',
      new BABYLON.Vector3(-0.5, -1, 0.5),
      scene
    ));
    shadowGenerator.useExponentialShadowMap = true;

    const isGithubPages = typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');
    const assetBase = isGithubPages
      ? 'https://media.githubusercontent.com/media/elektrazone/INFIN_BBOY_REPO/main/public/scene/assets/'
      : 'scene/assets/';
    const modelRoot = `${assetBase}model/`;
    const textureRoot = `${assetBase}road/`;

    const includeClonedSegments = true;
    const targetSegmentCount = includeClonedSegments ? 6 : 1;

    const groundWidth = 250;
    const groundLength = 160;
    let groundSegmentSpacing = groundLength;
    let groundSegmentCount = targetSegmentCount;
    const roadTextureRepeatPerSegment = 2;
    const getRoadTextureVScale = () => Math.max(1, groundSegmentCount * roadTextureRepeatPerSegment);
    const stripePattern = {
      widthFraction: 0.005,
      heightFraction: 0.01,
      gapMultiplier: 1.0,
      startOffsetFraction: 0.0,
    };
    const groundMaterial = new BABYLON.StandardMaterial('groundMaterial', scene);
    groundMaterial.diffuseColor = new BABYLON.Color3(0.12, 0.12, 0.14);
    groundMaterial.specularColor = new BABYLON.Color3(0.02, 0.02, 0.02);
    groundMaterial.emissiveColor = new BABYLON.Color3(0.01, 0.01, 0.012);

    const createFallbackRoadTextures = () => {
      // Use a custom fallback texture image if packaged, otherwise draw one procedurally
      const packagedTextureUrl = `${textureRoot}fallback-road-texture.png`;
      const packagedTexture = new BABYLON.Texture(
        packagedTextureUrl,
        scene,
        undefined,
        false,
        BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
        undefined,
        () => {
          packagedTexture.dispose();
        }
      );
      packagedTexture.onLoadObservable.addOnce(() => {
        packagedTexture.updateSamplingMode(BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
      });
      // Fallback dynamic texture for when the packaged asset is missing
      const dynamicTexture = new BABYLON.DynamicTexture('runner-road-fallback', { width: 1024, height: 1024 }, scene, false);
      const context = dynamicTexture.getContext();
      if (context) {
        const textureSize = 1024;
        context.fillStyle = '#201f2b';
        context.fillRect(0, 0, textureSize, textureSize);
        context.fillStyle = '#14131d';
        context.fillRect(0, textureSize * 0.08, textureSize, textureSize * 0.84);
        context.fillStyle = '#fcd75a';
        const stripeWidth = Math.max(1, Math.round(textureSize * stripePattern.widthFraction));
        const stripeHeight = Math.max(1, Math.round(textureSize * stripePattern.heightFraction));
        const stripeGap = Math.max(1, stripeHeight * stripePattern.gapMultiplier);
        const stripeX = (textureSize - stripeWidth) / 2;
        for (
          let y = textureSize * stripePattern.startOffsetFraction;
          y < textureSize + stripeHeight;
          y += stripeHeight + stripeGap
        ) {
          context.fillRect(stripeX, y, stripeWidth, stripeHeight);
        }
      }
      dynamicTexture.update(false);
      return { packagedTexture, dynamicTexture };
    };

    const applyRoadTextureSettings = (texture: BABYLON.Texture) => {
      texture.uScale = 1;
      texture.vScale = getRoadTextureVScale();
      texture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
      texture.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
      texture.hasAlpha = false;
    };

    const { packagedTexture, dynamicTexture } = createFallbackRoadTextures();
    applyRoadTextureSettings(dynamicTexture);
    groundMaterial.diffuseTexture = dynamicTexture;
    let activeRoadTexture: BABYLON.Texture = dynamicTexture;

    const groundTextureState = { offset: 0 };
    let roadTexture: BABYLON.Nullable<BABYLON.Texture> = null;
    const setActiveRoadTexture = (texture: BABYLON.Texture) => {
      applyRoadTextureSettings(texture);
      groundMaterial.diffuseTexture = texture;
      activeRoadTexture = texture;
    };
    packagedTexture.onLoadObservable.addOnce(() => {
      setActiveRoadTexture(packagedTexture);
    });
    const textureUrl = `${textureRoot}road_texture.jpg`;
    roadTexture = new BABYLON.Texture(
      textureUrl,
      scene,
      undefined,
      false,
      BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
      () => {
        if (!roadTexture) {
          return;
        }
        setActiveRoadTexture(roadTexture);
      },
      () => {
        if (packagedTexture && packagedTexture.isReady()) {
          setActiveRoadTexture(packagedTexture);
        } else {
          setActiveRoadTexture(dynamicTexture);
        }
      }
    );
    roadTexture.onLoadObservable.addOnce(() => {
      if (roadTexture) {
        setActiveRoadTexture(roadTexture);
      }
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
      groundSegments.splice(0).forEach(segment => segment.dispose());
      groundSegmentSpacing = spacing;
      groundSegmentCount = count;
      for (let i = 0; i < count; i += 1) {
        const ground = createGroundSegment(i, spacing);
        groundSegments.push(ground);
      }
      groundTextureState.offset = 0;
      if (activeRoadTexture) {
        applyRoadTextureSettings(activeRoadTexture);
      }
    };

    rebuildGroundSegments(groundSegmentSpacing, groundSegmentCount);

    const advanceSegments = (segments: BABYLON.TransformNode[], spacing: number, movement: number) => {
      if (segments.length === 0) {
        return;
      }
      segments.forEach(segment => {
        segment.position.z += movement;
      });
      let minZ = Infinity;
      segments.forEach(segment => {
        if (segment.position.z < minZ) {
          minZ = segment.position.z;
        }
      });
      segments.forEach(segment => {
        if (segment.position.z > spacing) {
          segment.position.z = minZ - spacing;
        }
      });
    };

    scrollObserver = scene.onBeforeRenderObservable.add(() => {
      const deltaSeconds = scene.getEngine().getDeltaTime() / 1000;
      const movement = activeScrollSpeed * deltaSeconds;
      if (movement === 0) {
        return;
      }
      advanceSegments(groundSegments, groundSegmentSpacing, movement);
      if (buildingSegmentSpacing > 0) {
        advanceSegments(buildingSegments, buildingSegmentSpacing, movement);
      }
      groundTextureState.offset -= movement / groundSegmentSpacing;
      groundTextureState.offset %= 1;
      if (groundTextureState.offset < 0) {
        groundTextureState.offset += 1;
      }
      activeRoadTexture.vOffset = groundTextureState.offset;
    });

    // Use a relative path so deployments served from a subdirectory (e.g. GitHub Pages) can find the assets
    const assetRoot = modelRoot;
    // Load player character .glb model with error logging
    BABYLON.SceneLoader.ImportMesh(
      null,
      assetRoot,
      'player.glb',
      scene,
      (meshes, particleSystems, skeletons, animationGroups) => {
        console.log('Loaded meshes:', meshes);
        console.log('Loaded animationGroups:', animationGroups);
        if (meshes.length === 0) {
          console.error('No meshes loaded from player.glb');
          return;
        }
        const root = new BABYLON.TransformNode('playerRoot', scene);
        meshes.forEach(mesh => {
          mesh.parent = root;
          mesh.alwaysSelectAsActiveMesh = true;
          mesh.setEnabled(true);
          if (mesh instanceof BABYLON.Mesh) {
            mesh.receiveShadows = true;
            shadowGenerator.addShadowCaster(mesh, true);
          }
        });
        const meshAnchor =
          meshes.find((mesh): mesh is BABYLON.Mesh => mesh instanceof BABYLON.Mesh && !!mesh.skeleton) ??
          meshes.find((mesh): mesh is BABYLON.Mesh => mesh instanceof BABYLON.Mesh) ??
          null;
        const cameraAnchor = meshAnchor ?? (meshes[0] || null);
        root.position = BABYLON.Vector3.Zero();
        root.scaling = BABYLON.Vector3.One();
        root.computeWorldMatrix(true);
        const skeleton = skeletons[0] || meshAnchor?.skeleton || null;
        const { min: rawMin, max: rawMax } = root.getHierarchyBoundingVectors();
        const rawHeight = rawMax.y - rawMin.y;
        const desiredHeight = 3.2 * 5;
        const scaleFactor = rawHeight > 0 ? desiredHeight / rawHeight : 1;
        root.scaling = new BABYLON.Vector3(scaleFactor, scaleFactor, scaleFactor);
        root.computeWorldMatrix(true);
        root.rotate(BABYLON.Axis.Y, Math.PI, BABYLON.Space.LOCAL);
        root.computeWorldMatrix(true);
        const { min: scaledMin, max: scaledMax } = root.getHierarchyBoundingVectors();
        const scaledCenter = scaledMin.add(scaledMax).scale(0.5);
        const verticalPadding = 0.05;
        const forwardOffset = 7.5;
        root.position = new BABYLON.Vector3(
          -scaledCenter.x,
          -scaledMin.y + verticalPadding,
          -scaledCenter.z + forwardOffset
        );
        root.computeWorldMatrix(true);
        if (cameraAnchor) {
          camera.lockedTarget = cameraAnchor;
        } else {
          camera.setTarget(root.position.clone());
        }
        playerRoot = root;
        playerSkeleton = skeleton;
        playerAnimationGroup =
          animationGroups.find(group => group.targetedAnimations.length > 0) || null;
        animationGroups.forEach(group => {
          if (group !== playerAnimationGroup) {
            group.stop();
          }
        });
        if (playerAnimationGroup) {
          const firstTarget = playerAnimationGroup.targetedAnimations[0];
          if (firstTarget?.animation?.framePerSecond) {
            animationGroupFrameRate = firstTarget.animation.framePerSecond;
          }
          playerAnimationGroup.reset();
        } else if (skeleton) {
          ensureSkeletonRanges(skeleton);
        }
        // Configure animation controller
        ensureIdle();
      },
      undefined,
      (scene, message, exception) => {
        console.error('Error loading player.glb:', message, exception);
      }
    );
    // Load surrounding buildings for context using the B-series assets
    const buildingModelFiles = Array.from({ length: 10 }, (_, index) => `b${index + 1}.glb`);
    const loadBuildingMeshes = (fileName: string) =>
      BABYLON.SceneLoader.ImportMeshAsync(null, assetRoot, fileName, scene).then(result =>
        result.meshes.filter((mesh): mesh is BABYLON.Mesh => mesh instanceof BABYLON.Mesh)
      );

    Promise.all(buildingModelFiles.map(loadBuildingMeshes))
      .then(meshGroups => {
        const buildingMeshes = meshGroups.flat();
        if (buildingMeshes.length === 0) {
          console.error('No renderable meshes found in b1–b10 assets.');
          return;
        }

        const meshTransforms = new Map<
          BABYLON.Mesh,
          {
            position: BABYLON.Vector3;
            rotation: BABYLON.Nullable<BABYLON.Vector3>;
            rotationQuaternion: BABYLON.Nullable<BABYLON.Quaternion>;
            scaling: BABYLON.Vector3;
          }
        >();

        buildingMeshes.forEach(mesh => {
          mesh.scaling = mesh.scaling.scale(environmentScale);
          meshTransforms.set(mesh, {
            position: mesh.position.clone(),
            rotation: mesh.rotation ? mesh.rotation.clone() : null,
            rotationQuaternion: mesh.rotationQuaternion ? mesh.rotationQuaternion.clone() : null,
            scaling: mesh.scaling.clone(),
          });
          mesh.isVisible = false;
          mesh.setEnabled(false);
        });

        const applyTransform = (target: BABYLON.AbstractMesh, source: BABYLON.Mesh) => {
          const originalTransform = meshTransforms.get(source);
          if (!originalTransform) {
            return;
          }
          target.position = originalTransform.position.clone();
          target.scaling = originalTransform.scaling.clone();
          if (originalTransform.rotationQuaternion) {
            target.rotationQuaternion = originalTransform.rotationQuaternion.clone();
            target.rotation = BABYLON.Vector3.Zero();
          } else if (originalTransform.rotation) {
            target.rotation = originalTransform.rotation.clone();
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
          buildingMeshes.forEach(mesh => {
            const instance = mesh.createInstance(`${mesh.name}-${name}`);
            instance.parent = group;
            applyTransform(instance, mesh);
            instance.receiveShadows = true;
            instance.alwaysSelectAsActiveMesh = false;
          });
          return group;
        };

        const baseRoot = new BABYLON.TransformNode('buildingsSeg-0', scene);
        baseRoot.position = BABYLON.Vector3.Zero();
        createBuildingGroup(baseRoot, 'B_a_group_seg-0', 0);
        createBuildingGroup(baseRoot, 'B_b_group_seg-0', Math.PI);

        const { min, max } = baseRoot.getHierarchyBoundingVectors();
        const rawSpacing = Math.abs(max.z - min.z);
        const overlapCompensation = 1;
        const segmentSpacing = Math.max(rawSpacing - overlapCompensation, 10);
        buildingSegmentSpacing = segmentSpacing;
        const segmentCount = targetSegmentCount;
        rebuildGroundSegments(segmentSpacing, segmentCount);

        const registerBuildingSegment = (root: BABYLON.TransformNode, index: number) => {
          root.position = new BABYLON.Vector3(0, 0, -index * segmentSpacing);
          buildingSegments.push(root);
        };

        const createSegment = (index: number) => {
          const segmentRoot = new BABYLON.TransformNode(`buildingsSeg-${index}`, scene);
          segmentRoot.position = new BABYLON.Vector3(0, 0, -index * segmentSpacing);
          createBuildingGroup(segmentRoot, `B_a_group_seg-${index}`, 0);
          createBuildingGroup(segmentRoot, `B_b_group_seg-${index}`, Math.PI);
          registerBuildingSegment(segmentRoot, index);
        };

        if (includeClonedSegments) {
          registerBuildingSegment(baseRoot, 0);
          for (let i = 1; i < segmentCount; i += 1) {
            createSegment(i);
          }
        } else {
          baseRoot.position = BABYLON.Vector3.Zero();
          registerBuildingSegment(baseRoot, 0);
        }

      })
      .catch(error => {
        console.error('Error loading building assets:', error);
      });
    engine.runRenderLoop(() => {
      ensureIdle();
      scene.render();
    });
    window.addEventListener('resize', applyCanvasSize);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('resize', applyCanvasSize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      BABYLON.Logger.ClearLogCache();
      BABYLON.Logger.LogLevels = BABYLON.Logger.AllLogLevel;
      if (scrollObserver) {
        scene.onBeforeRenderObservable.remove(scrollObserver);
      }
      if (playerMotionObserver) {
        scene.onBeforeRenderObservable.remove(playerMotionObserver);
      }
      stopCurrentAnimation();
      buildingSegments.forEach(segment => segment.dispose());
      groundSegments.forEach(segment => segment.dispose());
      engine.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', margin: '0 auto' }}
    />
  );
};

export default BabylonRunner;
