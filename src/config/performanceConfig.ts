// src/config/performanceConfig.ts

/**
 * Global Performance Configuration
 * 
 * These settings are optimized for 4K Kiosk hardware (NUC11).
 * They prioritize pixel-fill throughput and low-latency rendering.
 */
export const PERFORMANCE_CONFIG = {
    // 1.5 = Renders 3D at 1440p internal resolution on a 4K screen
    defaultHardwareScaling: 1.5,
    
    // Whether to use simpler StandardMaterials instead of PBR by default
    // Set to true for maximum fill-rate performance
    useStandardMaterialsByDefault: true,
    
    // Whether shadows are enabled by default
    shadowsEnabledByDefault: true,
    
    // Cascaded Shadow Map cascades (Higher = better quality, lower = better performance)
    shadowCascades: 2,
};
