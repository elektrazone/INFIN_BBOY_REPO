// src/components/scene/sceneManager.ts
import * as BABYLON from "@babylonjs/core";
import { CAMERA_DEFAULTS } from "../../config/cameraDefaults";

// -----------------------------------------------------------------------------
// SCENE SETUP
// -----------------------------------------------------------------------------
export function createScene(canvas: HTMLCanvasElement) {
    const engine = new BABYLON.Engine(canvas, true, {
        premultipliedAlpha: false,  // Required for CSS sky to show through transparent areas
        alpha: true                 // Enable WebGL alpha channel
    });

    // Logger config
    BABYLON.Logger.ClearLogCache();
    BABYLON.Logger.LogLevels = BABYLON.Logger.NoneLogLevel;

    const scene = new BABYLON.Scene(engine);

    // ==========================================================================
    // PERFORMANCE OPTIMIZATIONS (Safe optimizations only)
    // ==========================================================================

    // Skip pointer picking for better CPU performance (we handle input manually)
    scene.skipPointerMovePicking = true;
    scene.skipPointerDownPicking = true;
    scene.skipPointerUpPicking = true;

    // ==========================================================================

    // Create environment texture for PBR reflections
    // This enables reflections on metallic/shiny surfaces
    scene.environmentTexture = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env",
        scene
    );
    scene.environmentIntensity = 0.4; // Subtle reflections

    // Transparent background so CSS sky layer shows through
    scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);

    // ==========================================================================
    // IMAGE PROCESSING - Color vibrancy and saturation
    // ==========================================================================
    scene.imageProcessingConfiguration.isEnabled = true;
    scene.imageProcessingConfiguration.contrast = 1.3;      // Boost contrast
    scene.imageProcessingConfiguration.exposure = 1.1;      // Slightly brighter

    // Color curves for saturation boost
    const colorCurves = new BABYLON.ColorCurves();
    colorCurves.globalSaturation = 40;  // Increase saturation (0 = no change, positive = more saturated)
    scene.imageProcessingConfiguration.colorCurvesEnabled = true;
    scene.imageProcessingConfiguration.colorCurves = colorCurves;

    // Tone mapping for richer colors
    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    scene.imageProcessingConfiguration.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;

    return {
        engine,
        scene,
    };
}

// -----------------------------------------------------------------------------
// LIGHTING SETUP
// -----------------------------------------------------------------------------
export function createLighting(scene: BABYLON.Scene) {
    const hemisphericLight = new BABYLON.HemisphericLight(
        "hemilight",
        new BABYLON.Vector3(0, 1, 0),
        scene
    );
    hemisphericLight.intensity = 0.2; // Reduced from 0.5 for darker shadows

    const directionalLight = new BABYLON.DirectionalLight(
        "dirLight",
        new BABYLON.Vector3(-0.5, -1, 0.5),
        scene
    );
    directionalLight.position = new BABYLON.Vector3(20, 40, -30);
    directionalLight.intensity = 2.0; // Increased from 1.5 for higher contrast

    // Check if shadows should be enabled from saved performance settings
    const savedShadows = localStorage.getItem('perf_shadows');
    const shadowsEnabled = savedShadows !== null ? savedShadows === 'true' : true;
    
    // Mobile detection for performance optimization
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    // Use Cascaded Shadow Maps for consistent shadows over long distances
    // MEMORY OPTIMIZED: Reduced from 2048 to 1024 to save ~48MB GPU memory
    const shadowMapSize = 1024;
    const shadowGenerator = new BABYLON.CascadedShadowGenerator(shadowMapSize, directionalLight);
    
    if (!shadowsEnabled) {
        directionalLight.shadowEnabled = false;
        const shadowMap = shadowGenerator.getShadowMap();
        if (shadowMap) shadowMap.refreshRate = 0;
    }

    shadowGenerator.numCascades = 2; // MEMORY: Reduced from 4 to save GPU memory
    shadowGenerator.lambda = 0.9; // Blend factor between logarithmic and linear distribution
    shadowGenerator.cascadeBlendPercentage = 0.1; // Smooth blending between cascades
    shadowGenerator.stabilizeCascades = true; // Reduce shadow swimming/flickering
    shadowGenerator.shadowMaxZ = 300; // MEMORY: Reduced from 500
    shadowGenerator.autoCalcDepthBounds = false; // MEMORY: Disable extra depth pre-pass

    // Shadow quality settings
    shadowGenerator.usePercentageCloserFiltering = true; // Softer shadows
    shadowGenerator.filteringQuality = BABYLON.ShadowGenerator.QUALITY_MEDIUM;
    shadowGenerator.bias = 0.001;
    shadowGenerator.normalBias = 0.02;

    return {
        hemisphericLight,
        directionalLight,
        shadowGenerator,
        setDirectionalLightIntensity: (intensity: number) => {
            directionalLight.intensity = intensity;
        },
    };
}

// -----------------------------------------------------------------------------
// CAMERA SETUP
// -----------------------------------------------------------------------------
export function createCamera(
    scene: BABYLON.Scene,
    canvas: HTMLCanvasElement
) {
    const savedAlpha = localStorage.getItem("camera_alpha");
    const savedBeta = localStorage.getItem("camera_beta");
    const savedRadius = localStorage.getItem("camera_radius");
    const savedTargetX = localStorage.getItem("camera_target_x");
    const savedTargetY = localStorage.getItem("camera_target_y");
    const savedTargetZ = localStorage.getItem("camera_target_z");
    const savedFov = localStorage.getItem("camera_fov");

    // Use config defaults when no localStorage data exists
    const startAlpha = savedAlpha ? parseFloat(savedAlpha) : CAMERA_DEFAULTS.alpha;
    const startBeta = savedBeta ? parseFloat(savedBeta) : CAMERA_DEFAULTS.beta;
    const startRadius = savedRadius ? parseFloat(savedRadius) : CAMERA_DEFAULTS.radius;
    const startTargetX = savedTargetX ? parseFloat(savedTargetX) : CAMERA_DEFAULTS.targetX;
    const startTargetY = savedTargetY ? parseFloat(savedTargetY) : CAMERA_DEFAULTS.targetY;
    const startTargetZ = savedTargetZ ? parseFloat(savedTargetZ) : CAMERA_DEFAULTS.targetZ;
    const startFov = savedFov ? parseFloat(savedFov) : CAMERA_DEFAULTS.fov;

    const camera = new BABYLON.ArcRotateCamera(
        "camera",
        startAlpha,
        startBeta,
        startRadius, // Radius increased to see more road (was 120)
        new BABYLON.Vector3(startTargetX, startTargetY, startTargetZ),
        scene
    );
    // Apply saved or default FOV
    camera.fov = startFov;

    // Enable camera orbit controls for debugging
    // Check for debug mode in URL to allow camera controls
    const urlParams = new URLSearchParams(window.location.search);
    const isDebugMode = urlParams.get('debug') === 'true';

    if (isDebugMode) {
        // Enable camera orbit controls ONLY in debug mode
        camera.attachControl(canvas, true);
        console.log("📷 Camera controls ENABLED (Debug Mode)");
    } else {
        // DISALLOW manual camera movement in normal play
        // camera.attachControl(canvas, true);
        console.log("📷 Camera controls LOCKED (Normal Mode)");
    }

    // Explicitly configure mouse input for Right-Click Panning
    // We cast to any to avoid TypeScript errors with specific input properties
    const mouseInput = camera.inputs.attached["mouse"] as any;
    if (mouseInput) {
        mouseInput.useCtrlForPanning = false;
        mouseInput.buttons = [0, 1, 2]; // Allow all buttons
        mouseInput.panningMouseButton = 2; // Right click for panning
    }

    // Remove default keyboard input to prevent Arrow Keys from orbiting
    // We are handling Arrow Keys manually in babylonRunner.ts for panning
    // Remove default keyboard input to prevent Arrow Keys from orbiting
    // We are handling Arrow Keys manually in babylonRunner.ts for panning
    camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");

    // NUCLEAR OPTION: Explicitly clear the key lists to prevent ANY default WASD/Arrow movement
    camera.keysUp = [];
    camera.keysDown = [];
    camera.keysLeft = [];
    camera.keysRight = [];

    camera.lowerRadiusLimit = 1;
    camera.upperRadiusLimit = 200;

    // DISABLE CAMERA COLLISION (to prevent "push back" when hitting objects)
    camera.checkCollisions = false;
    camera.collisionRadius = new BABYLON.Vector3(0, 0, 0);

    // Enable Panning
    camera.panningSensibility = 50; // Lower is faster
    camera.panningAxis = new BABYLON.Vector3(1, 1, 0); // Allow panning on X and Y relative to camera

    // Explicitly configure mouse input to ensure Right Click (2) works
    // (Babylon 4.2+ sometimes needs this explicit mapping if defaults are weird)
    // Note: attachControl(canvas, true, false) should have handled this, 
    // but we can force it here if needed.
    // However, simplest fix is to allow all axis and ensure sensibility is set.

    // Ensure inputs are attached
    // camera.inputs.addMouse(); // Already added by default


    return { camera };
}

// -----------------------------------------------------------------------------
// SKY DOME SETUP
// -----------------------------------------------------------------------------
export function createSkyDome(scene: BABYLON.Scene, assetBase: string) {
    // Sky is now rendered as a CSS background layer for zero GPU cost.
    // Create a minimal invisible mesh to maintain the API contract.
    const skyDome = BABYLON.MeshBuilder.CreatePlane("skyDome", { size: 0.001 }, scene);
    skyDome.isVisible = false;
    skyDome.isPickable = false;

    return { skyDome, skyMaterial: null, cloudTexture: null };
}

// -----------------------------------------------------------------------------
// POST-PROCESS SETUP (Water Lens)
// -----------------------------------------------------------------------------
export function createLensEffect(scene: BABYLON.Scene, camera: BABYLON.Camera) {
    const lensEffect = new BABYLON.LensRenderingPipeline(
        "waterLens",
        {
            edge_blur: 0.5,
            chromatic_aberration: 2.0,      // High for watery look
            distortion: 0.8,                // Significant distortion
            dof_focus_distance: 200,        // Focus far away (player/road)
            dof_aperture: 3.0,              // Slight blur for depth
            grain_amount: 0.15,
            dof_pentagon: true,
            dof_gain: 1.0,
            dof_threshold: 1.0,
            dof_darken: 0.25
        },
        scene,
        1.0,
        [camera]
    );

    // If available in this version:
    // lensEffect.setAperture(3.0); 

    return { lensEffect };
}
