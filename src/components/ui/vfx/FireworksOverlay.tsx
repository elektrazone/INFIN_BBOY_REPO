import React, { useEffect, useState } from 'react';
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import { loadFireworksPreset } from "@tsparticles/preset-fireworks";
import type { Engine } from "@tsparticles/engine";

export const FireworksOverlay: React.FC = () => {
    const [init, setInit] = useState(false);

    useEffect(() => {
        initParticlesEngine(async (engine: Engine) => {
            await loadSlim(engine);
            await loadFireworksPreset(engine);
        }).then(() => {
            setInit(true);
        });

        // Setup custom fading fireworks audio
        const audio = new Audio("/sounds/sfx_fireworks.wav");
        audio.volume = 1.0; // Pushed to max safe limit (should sit just under the actual music dynamically)
        audio.loop = true;
        
        audio.play().catch(e => console.warn("Audio blocked:", e));
        
        const fadeInterval = setInterval(() => {
            if (audio.volume > 0.02) {
                audio.volume -= 0.02; // Slower fade (50 steps instead of 16)
            } else {
                audio.volume = 0;
                audio.pause();
                clearInterval(fadeInterval);
            }
        }, 500); // Volume reaches 0 after roughly 25 seconds

        return () => {
            clearInterval(fadeInterval);
            audio.pause();
            audio.src = "";
        };
    }, []);

    const options = {
        preset: "fireworks",
        fullScreen: { enable: false },
        sounds: { enable: false } // Disable native preset pops
    };

    if (!init) {
        return null;
    }

    return (
        <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 15,
            mixBlendMode: 'screen' // ✨ MAGICAL VFX TRICK: This makes all black pixels completely invisible!
        }}>
            <Particles
                id="tsparticles"
                options={options}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                }}
            />
        </div>
    );
};
