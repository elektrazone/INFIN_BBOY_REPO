// src/config/performanceConfig.ts

/**
 * Global Performance Configuration
 * 
 * These settings are optimized for 4K Kiosk hardware (NUC11).
 * They prioritize pixel-fill throughput and low-latency rendering.
 */
export const PERFORMANCE_CONFIG = {
    // 2.0 = Renders 3D at 1080p internal resolution on a 4K screen
    defaultHardwareScaling: 2.0,

    // Portrait 4K target for the kiosk display.
    // Babylon hardware scaling controls the internal 3D render resolution.
    targetCanvasWidth: 2160,
    targetCanvasHeight: 3840,
    
    // Whether to use simpler StandardMaterials instead of PBR by default
    // Set to true for maximum fill-rate performance
    useStandardMaterialsByDefault: true,
    
    // Whether shadows are enabled by default
    shadowsEnabledByDefault: false,
    
    // Cascaded Shadow Map cascades (Higher = better quality, lower = better performance)
    shadowCascades: 2,
};
