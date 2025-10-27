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
      Idle: [0, 175],
      Run: [176, 217],
      Strafe_L: [364, 403],
      Strafe_R: [404, 443],
    };
    const buildLoopRange = (state: LoopingState, scroll: number): AnimationRangeConfig => {
      const [start, end] = loopFrameRanges[state];
      return { start, end, loop: true, scroll };
    };

    const animationRanges: Record<PlayerState, AnimationRangeConfig> = {
      Idle: buildLoopRange('Idle', 0),
      Run: buildLoopRange('Run', baseScrollSpeed),
      Slide: { start: 218, end: 309, loop: false, scroll: baseScrollSpeed },
      Jump: { start: 310, end: 363, loop: false, scroll: baseScrollSpeed },
      Strafe_L: buildLoopRange('Strafe_L', baseScrollSpeed),
      Strafe_R: buildLoopRange('Strafe_R', baseScrollSpeed),
      Run_Idle: { start: 444, end: 497, loop: false, scroll: 0 },
      Fall: { start: 498, end: 649, loop: false, scroll: baseScrollSpeed },
      Getup: { start: 650, end: 1106, loop: false, scroll: baseScrollSpeed },
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
    };
    let playerSkeleton: BABYLON.Nullable<BABYLON.Skeleton> = null;
    let playerAnimationGroup: BABYLON.Nullable<BABYLON.AnimationGroup> = null;
    let playerAnimatable: BABYLON.Nullable<BABYLON.Animatable> = null;
    let animationGroupObserver: BABYLON.Nullable<
      BABYLON.Observer<BABYLON.TargetedAnimation>
    > = null;
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
      if (playerAnimatable) {
        playerAnimatable.stop();
        playerAnimatable = null;
      }
      if (animationGroupObserver && playerAnimationGroup) {
        playerAnimationGroup.onAnimationEndObservable.remove(animationGroupObserver);
        animationGroupObserver = null;
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

      const targetRange = resolveFrames(nextState, animationRanges[nextState]);
      if (!playerAnimationGroup || !playerSkeleton) {
        currentPlayerState = nextState;
        return;
      }

      stopCurrentAnimation();
      playerAnimationGroup.start(false, 1, targetRange.start, targetRange.end, false);
      playerAnimatable = playerAnimationGroup.animatables[0] || null;
      if (!playerAnimatable) {
        currentPlayerState = nextState;
        return;
      }
      const config = animationRanges[nextState];
      if (config.loop) {
        playerAnimatable.loopAnimation = true;
      } else {
        playerAnimatable.loopAnimation = false;
        animationGroupObserver = playerAnimationGroup.onAnimationEndObservable.add(() => {
          blockingAction = false;
          if (nextState === 'Slide' || nextState === 'Jump') {
            setPlayerState('Run', true);
          } else if (nextState === 'Getup') {
            setPlayerState('Idle', true);
          } else if (nextState === 'Run_Idle') {
            setPlayerState('Idle', true);
          }
        });
      }
      activeScrollSpeed = config.scroll;
      currentPlayerState = nextState;
    };

    const ensureIdle = () => {
      if (!playerAnimationGroup || idleInitialized) {
        return;
      }
      const idleRange = resolveFrames('Idle', animationRanges.Idle);
      playerAnimationGroup.start(true, 1, idleRange.start, idleRange.end, true);
      playerAnimatable = playerAnimationGroup.animatables[0] || null;
      idleInitialized = true;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
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
        default:
          break;
      }
    };

    const updateMovementState = () => {
      if (!playerRoot) {
        return;
      }
      const moveLeft = keyState.left && !keyState.right;
      const moveRight = keyState.right && !keyState.left;
      const shouldSlide = keyState.slide;
      const shouldRun = keyState.forward || blockingAction;

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
      12,
      new BABYLON.Vector3(0, 3, 0),
      scene
    );
    camera.attachControl(canvas, true);
    const shadowGenerator = new BABYLON.ShadowGenerator(2048, new BABYLON.DirectionalLight(
      'dirLight',
      new BABYLON.Vector3(-0.5, -1, 0.5),
      scene
    ));
    shadowGenerator.useExponentialShadowMap = true;

    const groundSegmentCount = 8;
    const groundSegmentLength = 160;
    const groundSegmentSpacing = groundSegmentLength;
    const groundTexture = new BABYLON.Texture('scene/assets/road/road_texture.jpg', scene);
    groundTexture.uScale = 1;
    groundTexture.vScale = groundSegmentCount;
    const groundMaterial = new BABYLON.StandardMaterial('groundMaterial', scene);
    groundMaterial.diffuseTexture = groundTexture;
    const groundTextureState = { offset: 0 };
    const roadTexture = groundTexture;

    const createGroundSegment = (index: number) => {
      const ground = BABYLON.MeshBuilder.CreateGround(
        `ground-${index}`,
        { width: 40, height: groundSegmentLength },
        scene
      );
      ground.position = new BABYLON.Vector3(0, 0, -index * groundSegmentSpacing);
      ground.material = groundMaterial;
      ground.receiveShadows = true;
      groundSegments.push(ground);
    };

    for (let i = 0; i < groundSegmentCount; i += 1) {
      createGroundSegment(i);
    }

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
      groundTextureState.offset += movement / groundSegmentSpacing;
      groundTextureState.offset %= 1;
      if (groundTextureState.offset < 0) {
        groundTextureState.offset += 1;
      }
      roadTexture.vOffset = groundTextureState.offset;
    });

    // Use a relative path so deployments served from a subdirectory (e.g. GitHub Pages) can find the assets
    const isGithubPages = typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');
    const assetRoot = isGithubPages
      ? 'https://media.githubusercontent.com/media/elektrazone/INFIN_BBOY_REPO/main/public/scene/assets/model/'
      : 'scene/assets/model/';
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
        // Center and scale the player character for visibility
        const root = meshes[0];
        root.position = new BABYLON.Vector3(0, 0, 0);
        root.scaling = new BABYLON.Vector3(8, 8, 8); // Further increase scale
        playerRoot = root;
        playerSkeleton = skeletons[0] || null;
        shadowGenerator.addShadowCaster(root, true);
        // Optionally, adjust bounding box
        if (root.getBoundingInfo) {
          const bounding = root.getBoundingInfo();
          const center = bounding.boundingBox.centerWorld;
          root.position = root.position.subtract(center);
        }
        playerAnimationGroup = animationGroups[0] || null;
        animationGroups.forEach(group => group.stop());
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
            instance.alwaysSelectAsActiveMesh = true;
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
        const includeClonedSegments = true;
        const segmentCount = includeClonedSegments ? 6 : 1;

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
