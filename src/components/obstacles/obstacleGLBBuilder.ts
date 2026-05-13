// src/components/obstacles/obstacleGLBBuilder.ts
import { Scene, AbstractMesh, SceneLoader, AssetContainer, Vector3, BoundingInfo } from "@babylonjs/core";
import { ObstacleType } from "./obstacleSystem";
import { ObstacleModelMap } from "./obstacleModelScanner";
import { applyUnifiedMaterialsToHierarchy } from "../materials/MaterialFactory";

export class ObstacleGLBBuilder {
    // Store containers with their source URLs
    private static cache: Record<ObstacleType, { container: AssetContainer, sourceUrl: string }[]> = {
        jump: [],
        duck: [],
        platform: [],
        insuperable: [],
        hamburger: [],
    };

    private static loaded = false;
    private static sceneUid: string | null = null;

    public static async preloadAll(scene: Scene, modelMap: ObstacleModelMap): Promise<void> {
        if (this.loaded && this.sceneUid === scene.uid) return;
        if (this.loaded && this.sceneUid !== scene.uid) {
            this.disposeCache();
        }

        const loadPromises: Promise<void>[] = [];

        for (const typeKey in modelMap) {
            const type = typeKey as ObstacleType;
            const urls = modelMap[type];

            for (const url of urls) {
                // Load the GLB file
                // We use LoadAssetContainerAsync to keep it isolated and cloneable
                const p = SceneLoader.LoadAssetContainerAsync("", url, scene, null, ".glb")
                    .then((container) => {
                        // Store container with its source URL for identification
                        this.cache[type].push({ container, sourceUrl: url });
                    })
                    .catch((err) => {
                        console.error(`Failed to load obstacle GLB [${type}]: ${url}`, err);
                    });

                loadPromises.push(p);
            }
        }

        await Promise.all(loadPromises);
        this.loaded = true;
        this.sceneUid = scene.uid;
        console.log("Obstacle GLBs preloaded:", this.cache);
    }

    public static disposeCache(): void {
        for (const typeKey in this.cache) {
            const type = typeKey as ObstacleType;
            for (const entry of this.cache[type]) {
                entry.container.dispose();
            }
            this.cache[type] = [];
        }
        this.loaded = false;
        this.sceneUid = null;
    }

    public static getVariantCount(type: ObstacleType): number {
        const containers = this.cache[type];
        return containers ? containers.length : 0;
    }

    public static getMesh(type: ObstacleType, scene: Scene, variantIndex?: number): { root: AbstractMesh, collisionMeshes: AbstractMesh[] } | null {
        const containers = this.cache[type];

        if (!containers || containers.length === 0) {
            return null; // Fallback to default builder
        }

        // Pick a specific container when requested, otherwise random
        const maxIndex = containers.length - 1;
        const safeIndex =
            typeof variantIndex === "number" && variantIndex >= 0 && variantIndex <= maxIndex
                ? variantIndex
                : Math.floor(Math.random() * containers.length);
        const { container, sourceUrl } = containers[safeIndex];

        // Instantiate models from the container
        const entries = container.instantiateModelsToScene((name) => name, false, { doNotInstantiate: false });
        const root = entries.rootNodes[0];

        if (!root) {
            console.warn(`Empty GLB container for ${type}`);
            return null;
        }

        // The root might be a __root__ node or the mesh itself.
        // We need to ensure we return a single mesh that represents the obstacle.
        // If it's a hierarchy, we might want to parent it to a new mesh or return the root.

        // Ensure the root is an AbstractMesh
        const mesh = root as AbstractMesh;

        // Store source URL in metadata for identification
        mesh.metadata = mesh.metadata || {};
        mesh.metadata.sourceUrl = sourceUrl;

        // Fix rotation/scaling if needed? 
        // Usually GLBs come in with Z-forward, Y-up.
        // Our game assumes Z-forward.

        // Calculate bounding box to position it correctly
        // We need to normalize the position so the bottom is at y=0 (or whatever the game expects)
        // The game expects the mesh pivot/position to be handled by the spawner.
        // But the default builders return a mesh where position.y is set.

        // Let's reset position to 0,0,0 relative to parent
        mesh.position.setAll(0);

        // Apply type-specific scaling
        if (type === "duck") {
            mesh.scaling.setAll(1.5);
        }

        // --- SPECIFIC SCALING FOR FRIES ---
        if (sourceUrl.toLowerCase().includes("fries")) {
            mesh.scaling.setAll(1.2); // Fries need a bit of a boost

            // GLB files use rotationQuaternion - must clear it to use euler rotation
            mesh.rotationQuaternion = null;
            mesh.rotation.y = Math.PI; // Rotate 180 degrees to face player

            // Also clear on all children (GLB hierarchy often has nested quaternions)
            mesh.getChildMeshes(false).forEach(child => {
                child.rotationQuaternion = null;
            });

            console.log(`🍟 Spawned FRIES: ${sourceUrl}`);
        } else if (sourceUrl.toLowerCase().includes("soda")) {
            console.log(`🥤 Spawned SODA: ${sourceUrl}`);
        }

        // Rotate insuperable obstacles (Soda) on Z-axis so logo is visible
        if (type === "insuperable") {
            mesh.rotation.z = 0; // 90 degrees on Z-axis
        }

        // Apply unified materials to the GLB mesh hierarchy
        applyUnifiedMaterialsToHierarchy(mesh, scene, type);

        // ------------------------------------------------------
        // CUSTOM COLLISION LOGIC
        // ------------------------------------------------------
        let collisionMeshes: AbstractMesh[] = [];

        // Search for "customCollision" in children (case-insensitive)
        const children = mesh.getChildMeshes(false);
        const customCols = children.filter(c => c.name.toLowerCase().includes("customcollision"));

        if (mesh.name && mesh.name.toLowerCase().includes("customcollision")) {
            customCols.unshift(mesh);
        }

        if (customCols.length > 0) {
            // Found custom collision mesh
            console.log(`[ObstacleGLBBuilder] Found ${customCols.length} custom collision mesh(es) for ${type}`);
            collisionMeshes = customCols;

            // Hide them and make them unpickable
            collisionMeshes.forEach((col) => {
                col.isVisible = false;
                col.isPickable = true;      // must be pickable for raycasting
                col.metadata = col.metadata || {};
                col.metadata.isCollisionMesh = true;

                // Ensure we update its world matrix
                col.computeWorldMatrix(true);
            });
        } else {
            // Fallback: use main mesh (or root)
            // If root has no geometry, we might need to find the first mesh with geometry?
            // For now, we stick to the previous behavior: use the root (which encapsulates hierarchy bounds)
            collisionMeshes = [mesh];
        }

        // FORCE BOUNDING INFO UPDATE
        // 1. Ensure world matrix is up to date
        mesh.computeWorldMatrix(true);

        // 2. Get hierarchy bounds in world space if it's the root, or just its own bounds if it's a custom mesh
        // If it's custom collision mesh, it's likely a simple shape (box), so its own bounding info is enough.
        // If it's the root (fallback), we might want hierarchy bounds.

        if (collisionMeshes.length === 1 && collisionMeshes[0] === mesh) {
            // Fallback case: use hierarchy bounds of the root
            const { min, max } = mesh.getHierarchyBoundingVectors();
            const newBoundingInfo = new BoundingInfo(min, max);
            mesh.setBoundingInfo(newBoundingInfo);
        }

        // 5. Force update again just in case
        collisionMeshes.forEach((col) => col.computeWorldMatrix(true));

        return { root: mesh, collisionMeshes };
    }
}
