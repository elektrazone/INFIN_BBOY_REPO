// src/components/player/impactVFX.ts
import * as BABYLON from "@babylonjs/core";

export interface ImpactVFXOptions {
    duration?: number;
    particleCount?: number;
    color1?: BABYLON.Color4;
    color2?: BABYLON.Color4;
}

/**
 * Creates a dust cloud VFX at the collision point
 * @param scene Babylon scene
 * @param impactPoint Position where the collision occurred
 * @param parentMesh Mesh to parent the VFX to (the obstacle)
 * @param options VFX customization options
 */
export function createImpactVFX(
    scene: BABYLON.Scene,
    impactPoint: BABYLON.Vector3,
    parentMesh: BABYLON.AbstractMesh,
    options: ImpactVFXOptions = {}
): void {
    const duration = options.duration ?? 0.8;
    const particleCount = options.particleCount ?? 60;
    // Dust cloud colors - earthy browns and grays
    const color1 = options.color1 ?? new BABYLON.Color4(0.6, 0.55, 0.5, 0.6); // Light dusty brown
    const color2 = options.color2 ?? new BABYLON.Color4(0.4, 0.35, 0.3, 0.5); // Darker brown

    // Create particle system
    const particleSystem = new BABYLON.ParticleSystem(
        "dustCloud",
        particleCount,
        scene
    );

    // Use smoke texture for dust-like appearance
    particleSystem.particleTexture = new BABYLON.Texture(
        "https://raw.githubusercontent.com/BabylonJS/Babylon.js/master/packages/tools/playground/public/textures/cloud.png",
        scene
    );

    // Create emitter at impact point, parented to obstacle
    const emitter = BABYLON.MeshBuilder.CreateBox(
        "dustEmitter",
        { size: 0.1 },
        scene
    );
    emitter.position = impactPoint.clone();
    emitter.parent = parentMesh;
    emitter.isVisible = false;

    particleSystem.emitter = emitter;

    // Dust cloud appearance - LARGER particles for more visible cloud
    particleSystem.color1 = color1;
    particleSystem.color2 = color2;
    particleSystem.colorDead = new BABYLON.Color4(0.3, 0.28, 0.25, 0); // Fade to transparent

    particleSystem.minSize = 3.0;  // Increased from 1.5
    particleSystem.maxSize = 7.0;  // Increased from 3.5

    particleSystem.minLifeTime = 0.4;
    particleSystem.maxLifeTime = duration;

    // Emission settings - more particles, wider spread
    particleSystem.emitRate = 220;
    particleSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD; // Standard blend for dust

    // Stronger emission for bigger cloud spread
    particleSystem.minEmitPower = 5;  // Increased from 3
    particleSystem.maxEmitPower = 12; // Increased from 8
    particleSystem.updateSpeed = 0.01;

    // Larger horizontal dust spread - bigger cylinder emitter
    particleSystem.createCylinderEmitter(2.5, 0.5, 0); // Increased radius from 1.5 to 2.5

    // Adjust direction to spread both UP and DOWN for fuller dust cloud
    particleSystem.direction1 = new BABYLON.Vector3(-1, -0.5, -1); // Allow downward spread
    particleSystem.direction2 = new BABYLON.Vector3(1, 1.5, 1);     // Keep upward spread

    // Slight gravity to pull dust down eventually
    particleSystem.gravity = new BABYLON.Vector3(0, -5, 0);

    // Start the particle system
    particleSystem.start();

    // Stop emitting after dust burst
    const burstDuration = 0.15;
    setTimeout(() => {
        particleSystem.stop();
    }, burstDuration * 1000);

    // Cleanup after effect completes
    setTimeout(() => {
        particleSystem.dispose();
        emitter.dispose();
    }, (duration + 0.5) * 1000);

    console.log("💨 Dust cloud VFX created at", impactPoint.toString());
}
