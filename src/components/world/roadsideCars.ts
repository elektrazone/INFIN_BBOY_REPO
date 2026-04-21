// src/components/world/roadsideCars.ts
import * as BABYLON from "@babylonjs/core";
import { useGameStore } from "../../store/gameStore";

export interface RoadsideCarsController {
    update(dt: number): void;
    dispose(): void;
    reset(): void;
}

interface CarInstance {
    mesh: BABYLON.AbstractMesh;
    active: boolean;
}

export function createRoadsideCars(
    scene: BABYLON.Scene,
    shadowGenerator: BABYLON.ShadowGenerator,
    getScrollSpeed: () => number
): RoadsideCarsController {
    // Configuration - OPTIMIZED
    const SPAWN_Z = -600;        // Reduced spawn distance (was -800)
    const DESPAWN_Z = 100;       // Tighter despawn (was 150)
    const LEFT_X = -50;          // Road edge position
    const RIGHT_X = 50;          // Road edge position
    const MIN_SPACING = 200;     // Increased spacing = fewer cars (was 150)
    const MAX_SPACING = 400;     // Increased spacing (was 350)
    const CAR_Y = -5;            // Lower to road surface (model origin offset)

    const root = new BABYLON.TransformNode("roadside_cars_root", scene);

    // Load car models
    const carContainers: BABYLON.AssetContainer[] = [];
    const activeCars: CarInstance[] = [];
    const carPool: CarInstance[] = [];

    let isReady = false;
    let nextSpawnZ = SPAWN_Z;

    // Load all car models from roadside folder
    const carFiles = ["red_car.glb", "green_car.glb", "flame_car.glb", "white_car.glb"];
    const loadPromises = carFiles.map(file => {
        const url = `scene/assets/model/roadside/${file}`;
        return BABYLON.SceneLoader.LoadAssetContainerAsync("", url, scene, null, ".glb")
            .then(container => {
                carContainers.push(container);
                console.log(`✅ Loaded roadside car: ${file}`);
            })
            .catch(err => {
                console.warn(`Failed to load car ${file}:`, err);
            });
    });

    Promise.all(loadPromises).then(() => {
        isReady = carContainers.length > 0;
        if (isReady) {
            console.log(`✅ Roadside cars ready (${carContainers.length} variants)`);
            // Spawn initial cars
            spawnInitialCars();
        }
    });

    function spawnInitialCars() {
        // Spawn cars along the road from spawn to despawn
        let z = SPAWN_Z;
        while (z < DESPAWN_Z - MIN_SPACING) {
            spawnCar(z);
            z += MIN_SPACING + Math.random() * (MAX_SPACING - MIN_SPACING);
        }
    }

    function getRandomCar(): BABYLON.AbstractMesh | null {
        if (carContainers.length === 0) return null;

        const container = carContainers[Math.floor(Math.random() * carContainers.length)];
        const entries = container.instantiateModelsToScene(name => name, false, { doNotInstantiate: false });
        const meshRoot = entries.rootNodes[0] as BABYLON.AbstractMesh;

        if (!meshRoot) return null;

        meshRoot.parent = root;
        shadowGenerator.addShadowCaster(meshRoot, true);

        // Enable shadows on children
        meshRoot.getChildMeshes().forEach(child => {
            child.receiveShadows = true;
        });

        return meshRoot;
    }

    function spawnCar(z: number) {
        // Check pool for inactive car
        let car = carPool.find(c => !c.active);

        if (!car) {
            const mesh = getRandomCar();
            if (!mesh) return;

            car = { mesh, active: false };
            carPool.push(car);
        }

        // Position car on left or right side randomly
        const side = Math.random() < 0.5 ? LEFT_X : RIGHT_X;
        // Rotate cars to face forward (parallel to road) - add 90 degrees from previous
        const rotationY = side === LEFT_X ? 0 : Math.PI; // Face same direction as player

        car.mesh.position.set(side, CAR_Y, z);
        car.mesh.rotation = new BABYLON.Vector3(0, rotationY, 0);
        car.mesh.setEnabled(true);
        car.active = true;
        activeCars.push(car);
    }

    function update(dt: number) {
        const state = useGameStore.getState().gameState;
        const speed = getScrollSpeed();

        // Only scroll when playing or during bounce back
        const isBounceBack = state === "gameover" && speed < 0;
        if (state !== "playing" && !isBounceBack) return;
        if (speed === 0) return;

        const movement = speed * dt;

        // Move all active cars
        for (const car of activeCars) {
            car.mesh.position.z += movement;
        }

        // Despawn cars that passed the player
        for (let i = activeCars.length - 1; i >= 0; i--) {
            const car = activeCars[i];
            if (car.mesh.position.z > DESPAWN_Z) {
                car.active = false;
                car.mesh.setEnabled(false);
                activeCars.splice(i, 1);
            }
        }

        // Spawn new cars when moving forward
        if (speed > 0 && isReady) {
            // Find the furthest car
            let minZ = 0;
            for (const car of activeCars) {
                if (car.mesh.position.z < minZ) {
                    minZ = car.mesh.position.z;
                }
            }

            // Spawn new car if there's space
            if (minZ > SPAWN_Z + MIN_SPACING) {
                const spacing = MIN_SPACING + Math.random() * (MAX_SPACING - MIN_SPACING);
                spawnCar(minZ - spacing);
            }
        }
    }

    function reset() {
        // Deactivate all cars
        for (const car of activeCars) {
            car.active = false;
            car.mesh.setEnabled(false);
        }
        activeCars.length = 0;

        // Respawn initial cars
        if (isReady) {
            spawnInitialCars();
        }
    }

    function dispose() {
        carPool.forEach(car => car.mesh.dispose());
        carContainers.forEach(container => container.dispose());
        root.dispose();
    }

    // Register update loop
    const observer = scene.onBeforeRenderObservable.add(() => {
        const dt = scene.getEngine().getDeltaTime() / 1000;
        update(dt);
    });

    return {
        update,
        dispose: () => {
            scene.onBeforeRenderObservable.remove(observer);
            dispose();
        },
        reset
    };
}
