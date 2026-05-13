// src/config/performanceConfig.ts

/**
 * Global Performance Configuration
 * 
 * These settings are optimized for a native 4K portrait kiosk display.
 * Resolution stays native by default; GPU savings should come from scene cost,
 * materials, shadows, and asset complexity instead of render scaling.
 */
export const PERFORMANCE_CONFIG = {
    // 1.0 = render at the canvas' native pixel size. Do not lower this for
    // default kiosk mode; use explicit debug/test modes for lower resolution.
    defaultHardwareScaling: 1.0,

    // Portrait 4K target for the kiosk display.
    // Babylon hardware scaling controls the internal 3D render resolution.
    targetCanvasWidth: 2160,
    targetCanvasHeight: 3840,
    
    // Whether to use simpler StandardMaterials instead of PBR by default
    // Set to true for maximum fill-rate performance
    useStandardMaterialsByDefault: true,
    
    // Whether shadows are enabled by default
    shadowsEnabledByDefault: false,

    // Keep native render resolution in fullscreen kiosk mode.
    forceNativeFullscreenResolution: true,

    // At native 4K, MSAA and full-scene color grading are expensive. Keep the
    // render buffer native and reduce per-pixel shader work instead.
    antialiasAtNative4K: false,
    imageProcessingEnabledByDefault: false,
    
    // Cascaded Shadow Map cascades (Higher = better quality, lower = better performance)
    shadowCascades: 2,
};
