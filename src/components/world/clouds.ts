// src/components/world/clouds.ts
import * as BABYLON from "@babylonjs/core";
import { getCloudMaterial } from "../materials/MaterialFactory";

export interface CloudsController {
    dispose(): void;
}

export function createClouds(
    scene: BABYLON.Scene,
    getScrollSpeed: () => number
): CloudsController {
    const CLOUD_FILES = ["Cloud_1.glb", "Cloud_2.glb", "Cloud_3.glb"];
    const CLOUD_ROOT = "scene/assets/clouds/";

    const CLOUD_Y_MIN = 180;
    const CLOUD_Y_MAX = 260;
    const CLOUD_Y_HIGH_MIN = 350;  // elevated tier for some clouds
    const CLOUD_Y_HIGH_MAX = 450;
    const CLOUD_X_RANGE = 320;        // spread left/right across the sky
    const CLOUD_SPACING = 550;        // average distance between clouds along Z (sparser, more open sky)
    const CLOUD_NEAR_Z = -450;        // keep clouds well back so one doesn't loom huge up close
    const CLOUD_FIELD_LENGTH = 2400;  // total depth of the cloud field before recycling
    const CLOUD_SCALE_MIN = 46;  // scaled down another 15% from the 54-99 range
    const CLOUD_SCALE_MAX = 84;
    const DESPAWN_Z = 100;
    const PARALLAX = 0.14; // clouds drift far slower than the road/buildings
    const WIND_X_SPEED = 7; // slow left-to-right wind drift (units/sec), independent of gameplay scroll
    const WIND_WRAP_X = CLOUD_X_RANGE * 1.5; // wrap distance, kept off-screen

    const cloudMaterial = getCloudMaterial(scene);
    const root = new BABYLON.TransformNode("clouds_root", scene);
    const cloudContainers: BABYLON.AssetContainer[] = [];
    const cloudRoots: BABYLON.TransformNode[] = [];

    // Dedicated blue "sky bounce" underlight: only affects cloud meshes (via
    // includedOnlyMeshes), so shadowed undersides pick up a soft blue fill
    // instead of going flat/heavy while sunlit tops stay bright and fluffy.
    const cloudUnderlight = new BABYLON.HemisphericLight(
        "cloudUnderlight",
        new BABYLON.Vector3(0, -1, 0),
        scene
    );
    cloudUnderlight.diffuse = new BABYLON.Color3(0.5, 0.72, 1.0);    // undersides: blue bounce
    cloudUnderlight.groundColor = new BABYLON.Color3(0.85, 0.9, 1.0); // topsides: near-white fill
    cloudUnderlight.specular = BABYLON.Color3.Black();
    cloudUnderlight.intensity = 0.8;
    cloudUnderlight.includedOnlyMeshes = [];

    function randomSpacing() {
        return CLOUD_SPACING * (0.6 + Math.random() * 0.8);
    }

    function applyCloudMaterial(node: BABYLON.Node) {
        const meshes = (node as BABYLON.TransformNode).getChildMeshes?.(true) || [];
        if (node instanceof BABYLON.Mesh) {
            meshes.push(node);
        }
        for (const mesh of meshes) {
            mesh.material = cloudMaterial;
            mesh.receiveShadows = false;
            mesh.doNotSyncBoundingInfo = true;
            mesh.alwaysSelectAsActiveMesh = true;
            mesh.checkCollisions = false;
            cloudUnderlight.includedOnlyMeshes.push(mesh);
        }
    }

    function spawnCloud(z: number) {
        if (cloudContainers.length === 0) return;

        const container = cloudContainers[Math.floor(Math.random() * cloudContainers.length)];
        const entries = container.instantiateModelsToScene((name) => name, false, { doNotInstantiate: false });

        const cloudRoot = new BABYLON.TransformNode(`cloud_${cloudRoots.length}`, scene);
        cloudRoot.parent = root;

        // Alternate left/right with a guaranteed minimum offset so a small cloud
        // count can't randomly land clustered on the same side of the sky.
        const side = cloudRoots.length % 2 === 0 ? 1 : -1;
        const x = side * (CLOUD_X_RANGE * 0.35 + Math.random() * CLOUD_X_RANGE * 0.65);
        const isHighCloud = cloudRoots.length % 3 === 2;
        const y = isHighCloud
            ? CLOUD_Y_HIGH_MIN + Math.random() * (CLOUD_Y_HIGH_MAX - CLOUD_Y_HIGH_MIN)
            : CLOUD_Y_MIN + Math.random() * (CLOUD_Y_MAX - CLOUD_Y_MIN);
        cloudRoot.position.set(x, y, z);
        cloudRoot.rotation.y = Math.random() * Math.PI * 2;

        const scale = CLOUD_SCALE_MIN + Math.random() * (CLOUD_SCALE_MAX - CLOUD_SCALE_MIN);
        cloudRoot.scaling.setAll(scale);

        for (const node of entries.rootNodes) {
            node.parent = cloudRoot;
            applyCloudMaterial(node);
        }

        cloudRoots.push(cloudRoot);
    }

    function populateField() {
        let z = CLOUD_NEAR_Z;
        while (z > -CLOUD_FIELD_LENGTH) {
            spawnCloud(z);
            z -= randomSpacing();
        }
        console.log(`☁️ Created ${cloudRoots.length} clouds from ${cloudContainers.length} variants`);
    }

    const loadPromises = CLOUD_FILES.map((file) =>
        BABYLON.SceneLoader.LoadAssetContainerAsync("", `${CLOUD_ROOT}${file}`, scene, null, ".glb")
            .then((container) => {
                cloudContainers.push(container);
            })
            .catch((err) => {
                console.warn(`Failed to load cloud model ${file}:`, err);
            })
    );

    Promise.all(loadPromises).then(() => {
        if (cloudContainers.length > 0) {
            populateField();
        }
    });

    const observer = scene.onBeforeRenderObservable.add(() => {
        if (cloudRoots.length === 0) return;

        const dt = scene.getEngine().getDeltaTime() / 1000;

        // Slow left-to-right wind drift, always active (independent of gameplay
        // scroll) so the distant sky feels alive even when the road isn't moving.
        for (const c of cloudRoots) {
            c.position.x += WIND_X_SPEED * dt;
            if (c.position.x > WIND_WRAP_X) {
                c.position.x -= WIND_WRAP_X * 2;
            }
        }

        const speed = getScrollSpeed();
        if (speed === 0) return;

        const movement = speed * dt * PARALLAX;

        for (const c of cloudRoots) c.position.z += movement;

        let minZ = Infinity;
        for (const c of cloudRoots) if (c.position.z < minZ) minZ = c.position.z;

        for (const c of cloudRoots) {
            if (c.position.z > DESPAWN_Z) {
                c.position.z = minZ - randomSpacing();
            }
        }
    });

    function dispose() {
        scene.onBeforeRenderObservable.remove(observer);
        cloudRoots.forEach((c) => c.dispose());
        cloudContainers.forEach((c) => c.dispose());
        cloudUnderlight.dispose();
        root.dispose();
    }

    return { dispose };
}
