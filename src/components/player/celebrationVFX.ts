// src/components/player/celebrationVFX.ts
import * as BABYLON from "@babylonjs/core";

export interface CelebrationVFXOptions {
    duration?: number;
    fireworkCount?: number;
}

/**
 * Creates celebratory fireworks and confetti VFX for victory screen
 */
export function createCelebrationVFX(
    scene: BABYLON.Scene,
    camera: BABYLON.Camera,
    options: CelebrationVFXOptions = {}
): { dispose: () => void } {
    const duration = options.duration ?? 8;
    const fireworkCount = options.fireworkCount ?? 3;
    const particleSystems: BABYLON.ParticleSystem[] = [];
    const emitters: BABYLON.AbstractMesh[] = [];
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    // Get camera forward direction to position effects in view
    const cameraPos = camera.position.clone();

    // Create confetti system
    const confettiEmitter = BABYLON.MeshBuilder.CreateBox("confettiEmitter", { size: 0.1 }, scene);
    confettiEmitter.position = cameraPos.add(new BABYLON.Vector3(0, 15, 30));
    confettiEmitter.isVisible = false;
    emitters.push(confettiEmitter);

    const confetti = new BABYLON.ParticleSystem("confetti", 260, scene);
    confetti.particleTexture = new BABYLON.Texture(
        "https://raw.githubusercontent.com/BabylonJS/Babylon.js/master/packages/tools/playground/public/textures/flare.png",
        scene
    );
    confetti.emitter = confettiEmitter;

    // Colorful confetti
    confetti.color1 = new BABYLON.Color4(1, 0.2, 0.2, 1);      // Red
    confetti.color2 = new BABYLON.Color4(0.2, 1, 0.2, 1);      // Green
    confetti.colorDead = new BABYLON.Color4(1, 1, 0, 0);       // Fade to yellow

    confetti.minSize = 0.8;
    confetti.maxSize = 1.5;
    confetti.minLifeTime = 3;
    confetti.maxLifeTime = 5;

    confetti.emitRate = 80;
    confetti.blendMode = BABYLON.ParticleSystem.BLENDMODE_ONEONE;

    confetti.minEmitPower = 2;
    confetti.maxEmitPower = 5;

    // Wide horizontal spread
    confetti.createBoxEmitter(
        new BABYLON.Vector3(-1, -1, 0),
        new BABYLON.Vector3(1, -0.5, 0),
        new BABYLON.Vector3(-20, 0, -5),
        new BABYLON.Vector3(20, 0, 5)
    );

    confetti.gravity = new BABYLON.Vector3(0, -3, 0);

    // Add rotation for tumbling confetti
    confetti.minAngularSpeed = -5;
    confetti.maxAngularSpeed = 5;

    confetti.start();
    particleSystems.push(confetti);

    // Create firework bursts
    const fireworkColors = [
        new BABYLON.Color4(1, 0.3, 0.3, 1),    // Red
        new BABYLON.Color4(1, 0.8, 0.2, 1),    // Gold
        new BABYLON.Color4(0.3, 0.5, 1, 1),    // Blue
        new BABYLON.Color4(0.3, 1, 0.3, 1),    // Green
        new BABYLON.Color4(1, 0.3, 1, 1),      // Magenta
    ];

    const createFirework = (delay: number, index: number) => {
        const timeout = setTimeout(() => {
            // Random position in front of camera
            const xOffset = (Math.random() - 0.5) * 40;
            const yOffset = 5 + Math.random() * 15;
            const zOffset = 20 + Math.random() * 20;

            const fireworkEmitter = BABYLON.MeshBuilder.CreateBox(
                `fireworkEmitter${index}`,
                { size: 0.1 },
                scene
            );
            fireworkEmitter.position = cameraPos.add(new BABYLON.Vector3(xOffset, yOffset, zOffset));
            fireworkEmitter.isVisible = false;
            emitters.push(fireworkEmitter);

            const firework = new BABYLON.ParticleSystem(`firework${index}`, 180, scene);
            firework.particleTexture = new BABYLON.Texture(
                "https://raw.githubusercontent.com/BabylonJS/Babylon.js/master/packages/tools/playground/public/textures/flare.png",
                scene
            );
            firework.emitter = fireworkEmitter;

            const color = fireworkColors[index % fireworkColors.length];
            firework.color1 = color;
            firework.color2 = color.clone();
            firework.color2.a = 0.8;
            firework.colorDead = new BABYLON.Color4(color.r * 0.5, color.g * 0.5, color.b * 0.5, 0);

            firework.minSize = 1.5;
            firework.maxSize = 3;
            firework.minLifeTime = 0.8;
            firework.maxLifeTime = 1.5;

            firework.emitRate = 360;
            firework.blendMode = BABYLON.ParticleSystem.BLENDMODE_ONEONE;

            firework.minEmitPower = 15;
            firework.maxEmitPower = 25;

            // Spherical burst
            firework.createSphereEmitter(0.5);
            firework.gravity = new BABYLON.Vector3(0, -8, 0);

            firework.start();
            particleSystems.push(firework);

            // Stop after burst
            const stopTimeout = setTimeout(() => {
                firework.stop();
            }, 200);
            timeouts.push(stopTimeout);

            console.log(`🎆 Firework ${index + 1} launched!`);
        }, delay);
        timeouts.push(timeout);
    };

    // Launch fireworks at intervals
    for (let i = 0; i < fireworkCount; i++) {
        createFirework(i * 800 + Math.random() * 400, i);
    }

    // Create second wave of fireworks
    for (let i = 0; i < fireworkCount; i++) {
        createFirework((fireworkCount * 800) + i * 600 + Math.random() * 300, fireworkCount + i);
    }

    console.log("🎉 Victory celebration VFX started!");

    // Cleanup function
    const dispose = () => {
        timeouts.forEach(clearTimeout);
        particleSystems.forEach(ps => {
            ps.stop();
            ps.dispose();
        });
        emitters.forEach(e => e.dispose());
        console.log("🎉 Victory celebration VFX disposed");
    };

    // Auto cleanup after duration
    const cleanupTimeout = setTimeout(() => {
        dispose();
    }, duration * 1000);
    timeouts.push(cleanupTimeout);

    return { dispose };
}
