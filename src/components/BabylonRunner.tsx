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
    scrollObserver = scene.onBeforeRenderObservable.add(() => {
      const deltaSeconds = scene.getEngine().getDeltaTime() / 1000;
      const movement = activeScrollSpeed * deltaSeconds;
      if (movement === 0) {
        return;
      }
      groundSegments.forEach(segment => {
        segment.position.z += movement;
      });
      let minZ = Infinity;
      groundSegments.forEach(segment => {
        if (segment.position.z < minZ) {
          minZ = segment.position.z;
        }
      });
      groundSegments.forEach(segment => {
        if (segment.position.z > groundSegmentSpacing) {
          segment.position.z = minZ - groundSegmentSpacing;
        }
      });
      groundTextureState.offset += movement / groundSegmentSpacing;
      groundTextureState.offset %= 1;
      if (groundTextureState.offset < 0) {
        groundTextureState.offset += 1;
      }
      roadTexture.vOffset = groundTextureState.offset;
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
