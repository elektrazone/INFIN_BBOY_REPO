import React, { useRef, useEffect } from 'react';
import * as BABYLON from 'babylonjs';
import 'babylonjs-loaders';

const BabylonCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Set fixed canvas size to avoid stretching
    canvas.width = 800;
    canvas.height = 600;
    const engine = new BABYLON.Engine(canvas, true);
    engine.setHardwareScalingLevel(window.devicePixelRatio);
    const scene = new BABYLON.Scene(engine);
    // Move camera further back and point at origin
    const camera = new BABYLON.ArcRotateCamera('camera', Math.PI / 2, Math.PI / 2.2, 8, BABYLON.Vector3.Zero(), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 2;
    camera.upperRadiusLimit = 20;
    camera.wheelPrecision = 50;
    new BABYLON.HemisphericLight('light', new BABYLON.Vector3(0, 1, 0), scene);
    // Add a visible cube for reference
    const cube = BABYLON.MeshBuilder.CreateBox('refCube', { size: 1 }, scene);
    cube.position = new BABYLON.Vector3(0, 0.5, 3); // Place cube in front of camera
  const cubeMaterial = new BABYLON.StandardMaterial('cubeMat', scene);
  cubeMaterial.diffuseColor = new BABYLON.Color3(0.2, 0.6, 1);
  cube.material = cubeMaterial;

    // Load player character .glb model with error logging
    BABYLON.SceneLoader.ImportMesh(
      null,
      '/scene/assets/model/',
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
    engine.runRenderLoop(() => scene.render());
    return () => {
      engine.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} width={800} height={600} style={{ display: 'block' }} />;
};

export default BabylonCanvas;
