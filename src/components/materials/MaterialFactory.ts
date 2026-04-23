import * as BABYLON from "@babylonjs/core";
import { PERFORMANCE_CONFIG } from "../../config/performanceConfig";

/**
 * Centralized MaterialFactory
 * 
 * Single source of truth for all game materials.
 * Caches materials to avoid duplicates and ensure consistent appearance.
 */

// Material cache to reuse instances
const materialCache: Map<string, BABYLON.PBRMaterial> = new Map();

/**
 * Material configurations for consistent look
 */
const MATERIAL_CONFIGS = {
    ground: {
        albedoColor: new BABYLON.Color3(0.12, 0.12, 0.14),
        metallic: 0.0,
        roughness: 0.9,
    },
    building: {
        metallic: 0.0,
        roughness: 1.0,
    },
    coin: {
        albedoColor: new BABYLON.Color3(1, 0.8, 0),
        emissiveColor: new BABYLON.Color3(0.4, 0.3, 0),
        metallic: 1.0,
        roughness: 0.3,
    },
    obstacle: {
        metallic: 0.0,
        roughness: 0.9,
    },
    obstacleGLB: {
        // For GLB overrides - will use existing albedo but normalize PBR settings
        metallic: 0.0,
        roughness: 0.85,
    },
    // Hamburger component materials
    hamburger: {
        metallic: 0.0,
        roughness: 0.7,
    }
};

/**
 * Obstacle type color configurations
 */
const OBSTACLE_COLORS: Record<string, { albedo: BABYLON.Color3; emissive: BABYLON.Color3 }> = {
    jump: {
        albedo: new BABYLON.Color3(0.8, 0.2, 0.2),
        emissive: new BABYLON.Color3(0.2, 0.05, 0.05),
    },
    duck: {
        albedo: new BABYLON.Color3(0.2, 0.6, 0.9),
        emissive: new BABYLON.Color3(0.05, 0.15, 0.25),
    },
    platform: {
        albedo: new BABYLON.Color3(0.35, 0.8, 0.4),
        emissive: new BABYLON.Color3(0.08, 0.2, 0.1),
    },
    insuperable: {
        albedo: new BABYLON.Color3(0.5, 0.2, 0.8),
        emissive: new BABYLON.Color3(0.1, 0.05, 0.2),
    },
};

/**
 * Hamburger component color configurations
 */
const HAMBURGER_COLORS: Record<string, { albedo: BABYLON.Color3; emissive?: BABYLON.Color3 }> = {
    bun: {
        albedo: new BABYLON.Color3(0.85, 0.55, 0.25),
    },
    patty: {
        albedo: new BABYLON.Color3(0.35, 0.2, 0.1),
    },
    cheese: {
        albedo: new BABYLON.Color3(1.0, 0.8, 0.2),
    },
    lettuce: {
        albedo: new BABYLON.Color3(0.3, 0.7, 0.2),
    },
    tomato: {
        albedo: new BABYLON.Color3(0.9, 0.2, 0.15),
    },
    sesame: {
        albedo: new BABYLON.Color3(0.95, 0.92, 0.8),
    },
};

export function getGroundMaterial(scene: BABYLON.Scene): BABYLON.Material {
    const saved = localStorage.getItem('perf_mats');
    const isStandard = saved !== null ? saved === 'true' : PERFORMANCE_CONFIG.useStandardMaterialsByDefault;
    
    const key = isStandard ? "groundStd" : "groundPBR";
    
    if (materialCache.has(key)) {
        return (materialCache.get(key) as any);
    }

    let mat: BABYLON.Material;
    if (isStandard) {
        const std = new BABYLON.StandardMaterial(key, scene);
        std.diffuseColor = MATERIAL_CONFIGS.ground.albedoColor;
        mat = std;
    } else {
        const pbr = new BABYLON.PBRMaterial(key, scene);
        pbr.albedoColor = MATERIAL_CONFIGS.ground.albedoColor;
        pbr.metallic = MATERIAL_CONFIGS.ground.metallic;
        pbr.roughness = MATERIAL_CONFIGS.ground.roughness;
        mat = pbr;
    }

    materialCache.set(key, mat as any);
    mat.freeze(); // Freeze for performance (ground is static)
    return mat;
}

/**
 * Get or create coin material
 */
export function getCoinMaterial(scene: BABYLON.Scene): BABYLON.PBRMaterial {
    const key = "coinPBR";
    if (materialCache.has(key)) {
        return materialCache.get(key)!;
    }

    const mat = new BABYLON.PBRMaterial(key, scene);
    mat.albedoColor = MATERIAL_CONFIGS.coin.albedoColor;
    mat.emissiveColor = MATERIAL_CONFIGS.coin.emissiveColor;
    mat.metallic = MATERIAL_CONFIGS.coin.metallic;
    mat.roughness = MATERIAL_CONFIGS.coin.roughness;

    materialCache.set(key, mat);
    mat.freeze(); // Freeze for performance (coin appearance is static)
    return mat;
}

/**
 * Get or create obstacle material for fallback/code-generated obstacles
 */
export function getObstacleMaterial(
    scene: BABYLON.Scene,
    type: string
): BABYLON.PBRMaterial {
    const key = `obstaclePBR_${type}`;
    if (materialCache.has(key)) {
        return materialCache.get(key)!;
    }

    const colors = OBSTACLE_COLORS[type] || OBSTACLE_COLORS.jump;
    const mat = new BABYLON.PBRMaterial(key, scene);
    mat.albedoColor = colors.albedo;
    mat.emissiveColor = colors.emissive;
    mat.metallic = MATERIAL_CONFIGS.obstacle.metallic;
    mat.roughness = MATERIAL_CONFIGS.obstacle.roughness;

    materialCache.set(key, mat);
    mat.freeze(); // Freeze for performance (obstacle materials are static)
    return mat;
}

/**
 * Get or create building material
 */
export function getBuildingMaterial(
    scene: BABYLON.Scene,
    originalColor?: BABYLON.Color3
): BABYLON.Material {
    const saved = localStorage.getItem('perf_mats');
    const isStandard = saved !== null ? saved === 'true' : PERFORMANCE_CONFIG.useStandardMaterialsByDefault;

    // For buildings, we use the original color if provided
    const colorKey = originalColor
        ? `${originalColor.r.toFixed(2)}_${originalColor.g.toFixed(2)}_${originalColor.b.toFixed(2)}`
        : "default";
    const key = isStandard ? `buildingStd_${colorKey}` : `buildingPBR_${colorKey}`;

    if (materialCache.has(key)) {
        return (materialCache.get(key) as any);
    }

    let mat: BABYLON.Material;
    if (isStandard) {
        const std = new BABYLON.StandardMaterial(key, scene);
        std.diffuseColor = originalColor ?? BABYLON.Color3.White();
        std.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        mat = std;
    } else {
        const pbr = new BABYLON.PBRMaterial(key, scene);
        pbr.albedoColor = originalColor ?? BABYLON.Color3.White();
        pbr.metallic = MATERIAL_CONFIGS.building.metallic;
        pbr.roughness = MATERIAL_CONFIGS.building.roughness;
        mat = pbr;
    }

    materialCache.set(key, mat as any);
    mat.freeze(); // Freeze for performance (building materials are static)
    return mat;
}

/**
 * Apply unified material settings to a GLB mesh
 * This preserves all original textures from the GLB
 */
export function applyUnifiedMaterialToGLBMesh(
    mesh: BABYLON.AbstractMesh,
    scene: BABYLON.Scene,
    type?: string
): void {
    const mat = mesh.material;

    if (!mat) return;

    // If already PBRMaterial, check if we should be using Standard instead
    if (mat instanceof BABYLON.PBRMaterial) {
        const saved = localStorage.getItem('perf_mats');
        const shouldBeStandard = saved === 'true';

        if (shouldBeStandard) {
            // Convert to Standard (Optimized)
            const std = new BABYLON.StandardMaterial(`${mat.name}_std`, scene);
            std.diffuseColor = mat.albedoColor;
            std.diffuseTexture = mat.albedoTexture;
            std.emissiveColor = mat.emissiveColor;
            std.emissiveTexture = mat.emissiveTexture;
            std.bumpTexture = mat.bumpTexture;
            std.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
            
            // Store original for live toggling
            mesh.metadata = mesh.metadata || {};
            mesh.metadata.originalPBRMaterial = mat;
            mesh.metadata.cachedStandardMaterial = std;
            
            mesh.material = std;
            return;
        }

        // Only override metallic/roughness if NO texture maps are defined
        // GLB uses metallicRoughnessTexture for combined metallic/roughness
        const hasMetallicRoughnessMap = mat.metallicTexture || mat.microSurfaceTexture;
        const hasNormalMap = mat.bumpTexture;
        const hasReflectanceMap = mat.reflectivityTexture || mat.reflectionTexture;

        // Log what textures we found (for debugging)
        console.log(`[MaterialFactory] ${mesh.name}: metallicRoughness=${!!hasMetallicRoughnessMap}, normal=${!!hasNormalMap}, reflectance=${!!hasReflectanceMap}`);

        // Only apply defaults if the GLB has no textures at all
        if (!hasMetallicRoughnessMap) {
            mat.metallic = MATERIAL_CONFIGS.obstacleGLB.metallic;
            mat.roughness = MATERIAL_CONFIGS.obstacleGLB.roughness;
        }

        // --- DRINK (SODA) BOOST ---
        // If it's a soda can, make it extra vibrant and metallic
        const isDrink = mesh.name.toLowerCase().includes("soda") ||
            mesh.name.toLowerCase().includes("can") ||
            (mesh.parent && mesh.parent.name.toLowerCase().includes("soda"));

        if (isDrink) {
            mat.metallic = 0.8;          // Metallic but not extreme
            mat.roughness = 0.15;        // Smooth but visible
            mat.environmentIntensity = 1.8; // Good reflection boost

            // Safe emissive glow - don't remap textures
            mat.emissiveColor = new BABYLON.Color3(0.4, 0.4, 0.4);
            mat.emissiveIntensity = 0.8;

            console.log(`✨ Brightened drink material for: ${mesh.name}`);
        }
        // Keep ALL other textures as-is (albedo, normal, emissive, metallic-roughness, reflectance, etc.)
        return;
    }

    // Convert StandardMaterial to PBRMaterial while preserving textures
    if (mat instanceof BABYLON.StandardMaterial) {
        const pbr = new BABYLON.PBRMaterial(`${mat.name}_unified`, scene);

        // Preserve all textures from StandardMaterial
        if (mat.diffuseTexture) {
            pbr.albedoTexture = mat.diffuseTexture;
        }
        if (mat.bumpTexture) {
            pbr.bumpTexture = mat.bumpTexture;
        }
        if (mat.emissiveTexture) {
            pbr.emissiveTexture = mat.emissiveTexture;
        }
        if (mat.ambientTexture) {
            pbr.ambientTexture = mat.ambientTexture;
        }
        if (mat.specularTexture) {
            pbr.reflectivityTexture = mat.specularTexture;
        }

        // Use original colors from the material
        pbr.albedoColor = mat.diffuseColor ?? BABYLON.Color3.White();
        pbr.emissiveColor = mat.emissiveColor ?? BABYLON.Color3.Black();
        pbr.metallic = MATERIAL_CONFIGS.obstacleGLB.metallic;
        pbr.roughness = MATERIAL_CONFIGS.obstacleGLB.roughness;

        mesh.material = pbr;
    }
}

/**
 * Apply unified materials to all meshes in a hierarchy
 */
export function applyUnifiedMaterialsToHierarchy(
    root: BABYLON.AbstractMesh,
    scene: BABYLON.Scene,
    type?: string
): void {
    applyUnifiedMaterialToGLBMesh(root, scene, type);

    const children = root.getChildMeshes(false);
    for (const child of children) {
        applyUnifiedMaterialToGLBMesh(child, scene, type);
    }
}

/**
 * Get or create hamburger component material
 */
export function getHamburgerMaterial(
    scene: BABYLON.Scene,
    component: string
): BABYLON.PBRMaterial {
    const key = `hamburger_${component}`;
    if (materialCache.has(key)) {
        return materialCache.get(key)!;
    }

    const colors = HAMBURGER_COLORS[component] || HAMBURGER_COLORS.bun;
    const mat = new BABYLON.PBRMaterial(key, scene);
    mat.albedoColor = colors.albedo;
    mat.emissiveColor = colors.emissive ?? BABYLON.Color3.Black();
    mat.metallic = MATERIAL_CONFIGS.hamburger.metallic;
    mat.roughness = MATERIAL_CONFIGS.hamburger.roughness;

    materialCache.set(key, mat);
    mat.freeze(); // Freeze for performance (hamburger materials are static)
    return mat;
}

/**
 * Get the unified PBR material for hamburgers
 * Uses Vertex Colors for component differentiation
 */
export function getHamburgerUnifiedMaterial(scene: BABYLON.Scene): BABYLON.PBRMaterial {
    const key = "hamburgerUnifiedPBR";
    if (materialCache.has(key)) {
        return materialCache.get(key)!;
    }

    const mat = new BABYLON.PBRMaterial(key, scene);
    // mat.useVertexColors = true; // Not a direct property on PBRMaterial in some versions, mesh.useVertexColors handles this
    mat.metallic = 0.0;
    mat.roughness = 0.9;

    materialCache.set(key, mat);
    return mat;
}

/**
 * Get or create layered road material (Asphalt top, Dirt sides)
 * For use with MultiMaterial and SubMeshes
 */
export function getLayeredRoadMaterial(scene: BABYLON.Scene): BABYLON.MultiMaterial {
    const key = "roadLayeredMulti";
    const multiMatKey = `Multi_${key}`;

    // Check if multi-material is already in cache
    // Note: MultiMaterial isn't in the Map<string, PBRMaterial> directly, 
    // but we can check if it exists in the scene or handle it separately.
    const existing = scene.getMaterialByName(multiMatKey);
    if (existing && existing instanceof BABYLON.MultiMaterial) {
        return existing;
    }

    // Create sub-materials
    // 1. Asphalt Top
    const asphaltMat = new BABYLON.PBRMaterial("asphaltTopMat", scene);
    asphaltMat.albedoTexture = new BABYLON.Texture("./scene/assets/road/asphalt_top.png", scene);
    asphaltMat.metallic = 0.0;
    asphaltMat.roughness = 0.8;
    asphaltMat.freeze(); // Freeze for performance

    // 2. Dirt Sides (with Asphalt Top Thickness)
    const asphaltDirtSideMat = new BABYLON.PBRMaterial("asphaltDirtSideMat", scene);
    // Setting invertY to false because Babylon.js flips textures by default
    asphaltDirtSideMat.albedoTexture = new BABYLON.Texture("./scene/assets/road/asphalt_dirt_side.png", scene, false, false);

    // Fix texture orientation: Reverting global rotation as it breaks some faces
    // if (asphaltDirtSideMat.albedoTexture) {
    //     const tex = asphaltDirtSideMat.albedoTexture as BABYLON.Texture;
    //     tex.wAng = -Math.PI / 2;
    // }
    asphaltDirtSideMat.metallic = 0.0;
    asphaltDirtSideMat.roughness = 0.9;
    asphaltDirtSideMat.freeze(); // Freeze for performance

    // 3. Dirt Bottom (Pure Dirt)
    const dirtBottomMat = new BABYLON.PBRMaterial("dirtBottomMat", scene);
    dirtBottomMat.albedoTexture = new BABYLON.Texture("./scene/assets/road/dirt_sides.png", scene);
    dirtBottomMat.metallic = 0.0;
    dirtBottomMat.roughness = 0.9;
    dirtBottomMat.freeze(); // Freeze for performance

    // Create MultiMaterial
    const multiMat = new BABYLON.MultiMaterial(multiMatKey, scene);
    multiMat.subMaterials.push(asphaltDirtSideMat); // Index 0: Sides
    multiMat.subMaterials.push(asphaltMat);         // Index 1: Top
    multiMat.subMaterials.push(dirtBottomMat);      // Index 2: Bottom

    return multiMat;
}

/**
 * Clear material cache (useful for scene disposal)
 */
export function clearMaterialCache(): void {
    materialCache.forEach((mat) => mat.dispose());
    materialCache.clear();
}
