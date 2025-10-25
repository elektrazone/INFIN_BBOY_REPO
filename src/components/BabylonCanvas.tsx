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
    const scrollSpeed = 102; // units per second
    const scrollingEnabledRef = { current: true };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault();
        scrollingEnabledRef.current = !scrollingEnabledRef.current;
      }
    };
    // Move camera further back and point at origin
    const camera = new BABYLON.ArcRotateCamera('camera', Math.PI / 2, Math.PI / 2.2, 12, BABYLON.Vector3.Zero(), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 120;
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
    const groundDimensions = { width: 200, height: 430 };
    const groundBaseOffset = new BABYLON.Vector3(0, 0, 30);
    const ground = BABYLON.MeshBuilder.CreateGround('testGround', groundDimensions, scene);
    const groundMaterial = new BABYLON.StandardMaterial('groundMat', scene);
    groundMaterial.diffuseColor = new BABYLON.Color3(0.45, 0.45, 0.45);
    const roadTextureSize = 2048;
    const roadTexture = new BABYLON.DynamicTexture('roadTexture', { width: roadTextureSize, height: roadTextureSize }, scene, false);
    const roadContext = roadTexture.getContext();
    roadContext.fillStyle = '#1a1a1a';
    roadContext.fillRect(0, 0, roadTextureSize, roadTextureSize);
    roadContext.fillStyle = '#0f0f0f';
    roadContext.fillRect(0, 0, roadTextureSize, roadTextureSize * 0.08);
    roadContext.fillRect(0, roadTextureSize * 0.92, roadTextureSize, roadTextureSize * 0.08);
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

    const assetRoot = '/scene/assets/model/';
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
        shadowGenerator.addShadowCaster(root, true);
        // Optionally, adjust bounding box
        if (root.getBoundingInfo) {
          const bounding = root.getBoundingInfo();
          const center = bounding.boundingBox.centerWorld;
          root.position = root.position.subtract(center);
        }
        // Play all animations
        animationGroups.forEach(group => group.start(true));
      },
      undefined,
      (scene, message, exception) => {
        console.error('Error loading player.glb:', message, exception);
      }
    );
    // Load surrounding buildings for context
    BABYLON.SceneLoader.ImportMesh(
      null,
      assetRoot,
      'buildings.glb',
      scene,
      meshes => {
        if (meshes.length === 0) {
          console.error('No meshes loaded from buildings.glb');
          return;
        }
        const buildingMeshes = meshes.filter(
          (mesh): mesh is BABYLON.Mesh => mesh instanceof BABYLON.Mesh
        );
        if (buildingMeshes.length === 0) {
          console.error('buildings.glb did not include renderable meshes.');
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
        const baseRoot = new BABYLON.TransformNode('buildingsBaseRoot', scene);
        baseRoot.position = BABYLON.Vector3.Zero();
        buildingMeshes.forEach(mesh => {
          meshTransforms.set(mesh, {
            position: mesh.position.clone(),
            rotation: mesh.rotation ? mesh.rotation.clone() : null,
            rotationQuaternion: mesh.rotationQuaternion ? mesh.rotationQuaternion.clone() : null,
            scaling: mesh.scaling.scale(environmentScale),
          });
          mesh.scaling = mesh.scaling.scale(environmentScale);
          mesh.parent = baseRoot;
          mesh.isVisible = true;
          mesh.setEnabled(true);
          mesh.receiveShadows = true;
        });
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
          buildingMeshes.forEach(mesh => {
            const instance = mesh.createInstance(`${mesh.name}-seg-${index}`);
            instance.parent = segmentRoot;
            const originalTransform = meshTransforms.get(mesh);
            if (originalTransform) {
              instance.position = originalTransform.position.clone();
              instance.scaling = originalTransform.scaling.clone();
              if (originalTransform.rotationQuaternion) {
                instance.rotationQuaternion = originalTransform.rotationQuaternion.clone();
              } else if (originalTransform.rotation) {
                instance.rotation = originalTransform.rotation.clone();
              }
            }
            instance.receiveShadows = true;
            instance.alwaysSelectAsActiveMesh = true;
          });
          registerBuildingSegment(segmentRoot, index);
        };

        if (includeClonedSegments) {
          registerBuildingSegment(baseRoot, 0);
          for (let i = 1; i < segmentCount; i += 1) {
            createSegment(i);
          }
        } else {
          baseRoot.position = BABYLON.Vector3.Zero();
        }

        scrollObserver = scene.onBeforeRenderObservable.add(() => {
          if (!scrollingEnabledRef.current) {
            return;
          }
          const deltaSeconds = scene.getEngine().getDeltaTime() / 1000;
          const movement = scrollSpeed * deltaSeconds;
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
      },
      undefined,
      (scene, message, exception) => {
        console.error('Error loading buildings.glb:', message, exception);
      }
    );
    engine.runRenderLoop(() => scene.render());
    window.addEventListener('resize', applyCanvasSize);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('resize', applyCanvasSize);
      window.removeEventListener('keydown', handleKeyDown);
      if (scrollObserver) {
        scene.onBeforeRenderObservable.remove(scrollObserver);
      }
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
