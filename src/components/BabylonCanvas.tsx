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
    const scrollingSegments: BABYLON.TransformNode[] = [];
    let scrollObserver: BABYLON.Nullable<BABYLON.Observer<BABYLON.Scene>> = null;
    const scrollSpeed = 22; // units per second
    // Move camera further back and point at origin
    const camera = new BABYLON.ArcRotateCamera('camera', Math.PI / 2, Math.PI / 2.2, 12, BABYLON.Vector3.Zero(), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 50;
    camera.upperRadiusLimit = 80;
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
    const ground = BABYLON.MeshBuilder.CreateGround('testGround', { width: 40, height: 40 }, scene);
    const groundMaterial = new BABYLON.StandardMaterial('groundMat', scene);
    groundMaterial.diffuseColor = new BABYLON.Color3(0.15, 0.15, 0.15);
    ground.material = groundMaterial;
    ground.receiveShadows = true;

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
        meshes.forEach(mesh => {
          mesh.receiveShadows = true;
        });
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
        const scaleMultiplier = 5;
        buildingMeshes.forEach(mesh => {
          meshTransforms.set(mesh, {
            position: mesh.position.clone(),
            rotation: mesh.rotation ? mesh.rotation.clone() : null,
            rotationQuaternion: mesh.rotationQuaternion ? mesh.rotationQuaternion.clone() : null,
            scaling: mesh.scaling.scale(scaleMultiplier),
          });
          mesh.scaling = mesh.scaling.scale(scaleMultiplier);
          mesh.parent = baseRoot;
          mesh.isVisible = true;
          mesh.setEnabled(true);
          mesh.receiveShadows = true;
        });
        const { min, max } = baseRoot.getHierarchyBoundingVectors();
        const rawSpacing = Math.abs(max.z - min.z);
        const overlapCompensation = 1;
        const segmentSpacing = Math.max(rawSpacing - overlapCompensation, 10);
        const segmentCount = 6;

        const attachSegmentRoot = (root: BABYLON.TransformNode, index: number) => {
          root.position = new BABYLON.Vector3(0, 0, -index * segmentSpacing);
          scrollingSegments.push(root);
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
          attachSegmentRoot(segmentRoot, index);
        };

        attachSegmentRoot(baseRoot, 0);
        for (let i = 1; i < segmentCount; i += 1) {
          createSegment(i);
        }

        scrollObserver = scene.onBeforeRenderObservable.add(() => {
          const deltaSeconds = scene.getEngine().getDeltaTime() / 1000;
          const movement = scrollSpeed * deltaSeconds;
          if (movement === 0) {
            return;
          }
          scrollingSegments.forEach(segment => {
            segment.position.z += movement;
          });
          let minZ = Infinity;
          scrollingSegments.forEach(segment => {
            if (segment.position.z < minZ) {
              minZ = segment.position.z;
            }
          });
          scrollingSegments.forEach(segment => {
            if (segment.position.z > segmentSpacing) {
              segment.position.z = minZ - segmentSpacing;
            }
          });
        });
      },
      undefined,
      (scene, message, exception) => {
        console.error('Error loading buildings.glb:', message, exception);
      }
    );
    engine.runRenderLoop(() => scene.render());
    window.addEventListener('resize', applyCanvasSize);
    return () => {
      window.removeEventListener('resize', applyCanvasSize);
      if (scrollObserver) {
        scene.onBeforeRenderObservable.remove(scrollObserver);
      }
      scrollingSegments.forEach(segment => segment.dispose());
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
