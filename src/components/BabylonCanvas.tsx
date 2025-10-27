import React, { useRef, useEffect } from 'react';
import * as BABYLON from 'babylonjs';
import 'babylonjs-loaders';

const BabylonCanvas: React.FC = () => {
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
    let animationGroupObserver: BABYLON.Nullable<BABYLON.Observer<BABYLON.AnimationGroup>> = null;
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
      if (playerAnimationGroup) {
        if (animationGroupObserver) {
          playerAnimationGroup.onAnimationGroupEndObservable.remove(animationGroupObserver);
          animationGroupObserver = null;
        }
        playerAnimationGroup.stop();
      }
    };

    const setScrollForState = (state: PlayerState) => {
      activeScrollSpeed = animationRanges[state]?.scroll ?? 0;
    };

    const playState = (state: PlayerState, options: { onComplete?: () => void } = {}) => {
      const range = animationRanges[state];
      if (!range) {
        return;
      }
      const { start, end } = resolveFrames(state, range);
      const hasAnimationSource = playerAnimationGroup || playerSkeleton;
      if (!hasAnimationSource) {
        return;
      }
      if (currentPlayerState === state && range.loop) {
        setScrollForState(state);
        return;
      }
      stopCurrentAnimation();
      const shouldBlock = !range.loop && blockingStates.has(state);
      const handleEnd = () => {
        blockingAction = false;
        options.onComplete?.();
      };
      let started = false;
      if (playerAnimationGroup) {
        playerAnimationGroup.enableBlending = true;
        playerAnimationGroup.blendingSpeed = 0.05;
        playerAnimationGroup.start(range.loop, 1, start, end);
        started = true;
        if (!range.loop) {
          animationGroupObserver = playerAnimationGroup.onAnimationGroupEndObservable.add(() => {
            if (animationGroupObserver) {
              playerAnimationGroup!.onAnimationGroupEndObservable.remove(animationGroupObserver);
              animationGroupObserver = null;
            }
            handleEnd();
          });
        }
      } else if (playerSkeleton) {
        playerAnimatable = scene.beginAnimation(playerSkeleton, start, end, range.loop, 1, () => handleEnd());
        started = true;
      }
      if (!started) {
        return;
      }
      currentPlayerState = state;
      setScrollForState(state);
      blockingAction = shouldBlock;
    };

    const setLateralTarget = (value: number) => {
      lateralState.target = Math.max(-lateralRange, Math.min(lateralRange, value));
    };

    const ensureIdle = () => {
      if (idleInitialized) {
        return;
      }
      if (playerAnimationGroup || playerSkeleton) {
        idleInitialized = true;
        playState('Idle');
      }
    };

    const transitionToIdle = () => {
      if (blockingAction) {
        return;
      }
      if (currentPlayerState === 'Idle') {
        playState('Idle');
        return;
      }
      if (currentPlayerState === 'Run_Idle') {
        return;
      }
      playState('Run_Idle', {
        onComplete: () => playState('Idle'),
      });
    };

    const evaluateMovement = () => {
      if (blockingAction) {
        return;
      }
      if (keyState.left && !keyState.right) {
        setLateralTarget(lateralRange);
        playState('Strafe_R');
        return;
      }
      if (keyState.right && !keyState.left) {
        setLateralTarget(-lateralRange);
        playState('Strafe_L');
        return;
      }
      if (keyState.forward) {
        setLateralTarget(playerRoot ? playerRoot.position.x : 0);
        playState('Run');
        return;
      }
      setLateralTarget(playerRoot ? playerRoot.position.x : 0);
      transitionToIdle();
    };

    const triggerSlide = () => {
      if (blockingAction) {
        return;
      }
      setLateralTarget(playerRoot ? playerRoot.position.x : 0);
      playState('Slide', {
        onComplete: () => {
          keyState.slide = false;
          evaluateMovement();
        },
      });
    };

    const triggerJump = () => {
      if (blockingAction) {
        return;
      }
      setLateralTarget(playerRoot ? playerRoot.position.x : 0);
      playState('Jump', {
        onComplete: () =>
          playState('Fall', {
            onComplete: () =>
              playState('Getup', {
                onComplete: () => evaluateMovement(),
              }),
          }),
      });
    };

    const updatePlayerLateralPosition = (deltaSeconds: number) => {
      if (!playerRoot) {
        return;
      }
      const target = lateralState.target;
      const currentX = playerRoot.position.x;
      const diff = target - currentX;
      if (Math.abs(diff) < 0.01) {
        playerRoot.position.x = target;
        return;
      }
      const speed = target === 0 ? lateralReturnSpeed : lateralSpeed;
      const step = Math.sign(diff) * Math.min(Math.abs(diff), speed * deltaSeconds);
      playerRoot.position.x = Math.max(-lateralRange, Math.min(lateralRange, currentX + step));
    };

    playerMotionObserver = scene.onBeforeRenderObservable.add(() => {
      const deltaSeconds = scene.getEngine().getDeltaTime() / 1000;
      updatePlayerLateralPosition(deltaSeconds);
      ensureIdle();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'KeyW':
          if (!keyState.forward) {
            keyState.forward = true;
            evaluateMovement();
          }
          break;
        case 'KeyA':
          if (!keyState.left) {
            keyState.left = true;
            evaluateMovement();
          }
          break;
        case 'KeyD':
          if (!keyState.right) {
            keyState.right = true;
            evaluateMovement();
          }
          break;
        case 'KeyS':
          if (!keyState.slide) {
            keyState.slide = true;
            triggerSlide();
          }
          break;
        case 'Space':
          event.preventDefault();
          triggerJump();
          break;
        default:
          break;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'KeyW':
          if (keyState.forward) {
            keyState.forward = false;
            evaluateMovement();
          }
          break;
        case 'KeyA':
          if (keyState.left) {
            keyState.left = false;
            evaluateMovement();
          }
          break;
        case 'KeyD':
          if (keyState.right) {
            keyState.right = false;
            evaluateMovement();
          }
          break;
        case 'KeyS':
          keyState.slide = false;
          break;
        default:
          break;
      }
    };
    // Move camera further back and point at origin
    const camera = new BABYLON.ArcRotateCamera('camera', Math.PI / 2, Math.PI / 2.2, 12, BABYLON.Vector3.Zero(), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 70;
    camera.upperRadiusLimit = 500;
    camera.wheelPrecision = 50;
    new BABYLON.HemisphericLight('light', new BABYLON.Vector3(0, 1, 0), scene);
    const dirLight = new BABYLON.DirectionalLight('shadowLight', new BABYLON.Vector3(-1, -2, -1), scene);
    dirLight.position = new BABYLON.Vector3(5, 10, 5);
    const shadowGenerator = new BABYLON.ShadowGenerator(1024, dirLight);
    shadowGenerator.useExponentialShadowMap = true;
    // Add a visible cube for reference
    const cube = BABYLON.MeshBuilder.CreateBox('refCube', { size: 1 }, scene);
    cube.position = new BABYLON.Vector3(0, 0.5, 3); // Place cube in front of camera
    const cubeMaterial = new BABYLON.StandardMaterial('cubeMat', scene);
    cubeMaterial.diffuseColor = new BABYLON.Color3(0.2, 0.6, 1);
    cube.material = cubeMaterial;
    shadowGenerator.addShadowCaster(cube, true);
    const groundDimensions = { width: 200, height: 340 };
    const groundBaseOffset = new BABYLON.Vector3(0, 0, 30);
    const ground = BABYLON.MeshBuilder.CreateGround('testGround', groundDimensions, scene);
    const groundMaterial = new BABYLON.StandardMaterial('groundMat', scene);
    groundMaterial.diffuseColor = new BABYLON.Color3(0.45, 0.45, 0.45);
    const roadTextureSize = 2048;
    const roadTexture = new BABYLON.DynamicTexture('roadTexture', { width: roadTextureSize, height: roadTextureSize }, scene, false);
    const roadContext = roadTexture.getContext();
    roadContext.fillStyle = '#1a1a1a';
    roadContext.fillRect(0, 0, roadTextureSize, roadTextureSize);
    roadContext.fillStyle = '#ffd35b';
    const stripeHeight = roadTextureSize * 0.01;
    const stripeGap = roadTextureSize * 0.01;
    const stripeWidth = roadTextureSize * 0.0005;
    const stripeStartX = (roadTextureSize - stripeWidth) / 2;
    for (let y = 0; y < roadTextureSize; y += stripeHeight + stripeGap) {
      roadContext.fillRect(stripeStartX, y, stripeWidth, stripeHeight);
    }
    roadTexture.update();
    groundMaterial.diffuseTexture = roadTexture;
    roadTexture.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    roadTexture.vScale = 4;
    groundMaterial.specularColor = BABYLON.Color3.Black();
    ground.material = groundMaterial;
    ground.receiveShadows = true;
    ground.isPickable = false;
    ground.scaling = new BABYLON.Vector3(environmentScale, 1, environmentScale);
    ground.position = BABYLON.Vector3.Zero();
    const groundSegmentSpacing = groundDimensions.height * environmentScale;
    const groundSegmentCount = 3;
    const groundTextureState = { offset: 0 };
    const createGroundSegment = (index: number) => {
      const segmentRoot = new BABYLON.TransformNode(`groundSeg-${index}`, scene);
      segmentRoot.position = new BABYLON.Vector3(
        groundBaseOffset.x,
        groundBaseOffset.y,
        groundBaseOffset.z - index * groundSegmentSpacing
      );
      const meshInstance = index === 0 ? ground : ground.clone(`groundMesh-${index}`);
      if (!meshInstance) {
        return;
      }
      meshInstance.parent = segmentRoot;
      meshInstance.position = BABYLON.Vector3.Zero();
      groundSegments.push(segmentRoot);
    };
    for (let i = 0; i < groundSegmentCount; i += 1) {
      createGroundSegment(i);
    }

    // Use a relative path so deployments served from a subdirectory (e.g. GitHub Pages) can find the assets
    const assetRoot = 'scene/assets/model/';
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

        scrollObserver = scene.onBeforeRenderObservable.add(() => {
          const deltaSeconds = scene.getEngine().getDeltaTime() / 1000;
          const movement = activeScrollSpeed * deltaSeconds;
          if (movement === 0) {
            return;
          }
          const advanceSegments = (segments: BABYLON.TransformNode[], spacing: number) => {
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
          advanceSegments(buildingSegments, segmentSpacing);
          advanceSegments(groundSegments, groundSegmentSpacing);
          groundTextureState.offset += movement / groundSegmentSpacing;
          groundTextureState.offset %= 1;
          if (groundTextureState.offset < 0) {
            groundTextureState.offset += 1;
          }
          roadTexture.vOffset = groundTextureState.offset;
        });
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

export default BabylonCanvas;
