import React, { useEffect } from 'react';
import { useGameStore } from '../../store/gameStore';
import { FireworksOverlay } from './vfx/FireworksOverlay';
import { CoinIcon } from './HudIcons';

/**
 * CONFIGURAZIONE VIDEO
 * I valori di offset sono ora in PERCENTUALE rispetto al contenitore
 */
const VIDEO_CONFIG = {
    scale: 0.8,
    offsetX: 0,    // % orizzontale
    offsetY: 18    // % verticale (approx 150px su schermi medi)
};

/**
 * CONFIGURAZIONE BANDIERA
 * I valori di offset sono ora in PERCENTUALE rispetto al contenitore
 */
const FLAG_CONFIG = {
    scale: 0.6,
    offsetX: -14,  // % orizzontale (approx -70px)
    offsetY: -28   // % verticale (approx -240px)
};

/**
 * CONFIGURAZIONE PULSANTE RESTART
 * Qui puoi regolare tutto a tuo piacimento
 */
const BUTTON_CONFIG = {
    width: '50%',       // Larghezza in % così scala con lo schermo
    top: '5%',          // Distanza dal bordo superiore
    left: '70%',        // Centratura orizzontale
    zIndex: 10          // Deve stare sopra il video
};

export const OutroScreen: React.FC = () => {
    const score = useGameStore((state) => state.score);
    const coinCount = useGameStore((state) => state.coinCount);

    useEffect(() => {
        // Stop BabylonJS render loop immediately to save resources
        // and prevent interference with React overlay
        console.log("🛑 Dispatching stopRenderLoop for Victory Screen");
        window.dispatchEvent(new Event("stopRenderLoop"));
    }, []);

    return (
        <div className="outro-screen">
            {/* Livello 1: VFX */}
            <FireworksOverlay />

            {/* Livello 1.5: Overlay Image */}
            <img
                src="/OutroOverlay.png"
                alt="Outro Overlay"
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'fill',
                    pointerEvents: 'none',
                    zIndex: 2 // Layer 2: Above VFX
                }}
            />

            {/* Livello 2.5: Flag Video */}
            <video
                src="/flag.webm"
                autoPlay
                muted
                loop
                playsInline
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    pointerEvents: 'none',
                    zIndex: 3, // Layer 3: Above Overlay
                    // Translate usa ora le percentuali (%) invece dei px
                    transform: `translate(calc(-50% + ${FLAG_CONFIG.offsetX}%), calc(-50% + ${FLAG_CONFIG.offsetY}%)) scale(${FLAG_CONFIG.scale})`
                }}
            />

            {/* Livello 2: Video */}
            <video
                src="/DanceOutro.webm"
                autoPlay
                muted
                playsInline
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    pointerEvents: 'none',
                    zIndex: 4, // Layer 4: Above Flag
                    // Translate usa ora le percentuali (%) invece dei px
                    transform: `translate(calc(-50% + ${VIDEO_CONFIG.offsetX}%), calc(-50% + ${VIDEO_CONFIG.offsetY}%)) scale(${VIDEO_CONFIG.scale})`
                }}
            />

            {/* Livello 2.7: Final Score Display */}
            <div className="victory-score-container" style={{
                position: 'absolute',
                top: '68%',
                left: '20%',
                transform: 'translate(-50%, -50%)',
                zIndex: 15,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px'
            }}>
                <div className="victory-score-label" style={{
                    color: '#ffd700',
                    fontSize: '1.2rem',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    letterSpacing: '2px',
                    textShadow: '0 2px 4px rgba(0,0,0,0.5)'
                }}>Final Score</div>
                <div className="victory-score-value" style={{
                    color: 'white',
                    fontSize: '3.5rem',
                    fontWeight: '900',
                    textShadow: '0 4px 10px rgba(0,0,0,0.8), 0 0 20px rgba(255,215,0,0.4)',
                    fontFamily: 'Inter, sans-serif'
                }}>{score.toLocaleString()}</div>
                
                <div className="victory-coins" style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    backgroundColor: 'rgba(0,0,0,0.4)',
                    padding: '8px 20px',
                    borderRadius: '20px',
                    border: '1px solid rgba(255,215,0,0.3)'
                }}>
                    <div style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CoinIcon className="hud-icon" />
                    </div>
                    <span style={{ 
                        color: '#ffd700', 
                        fontSize: '1.5rem', 
                        fontWeight: '800' 
                    }}>{coinCount}</span>
                </div>
            </div>

            {/* Livello 3: Play Again Button */}
            <img
                src="/PlayAgainButton.png"
                alt="Restart"
                onClick={() => window.location.reload()}
                style={{
                    position: 'absolute',
                    // Posizionamento
                    top: BUTTON_CONFIG.top,
                    left: BUTTON_CONFIG.left,
                    transform: 'translateX(-50%)', // Centra perfettamente l'immagine rispetto alla sua larghezza

                    // Dimensioni
                    width: BUTTON_CONFIG.width,
                    height: 'auto', // Mantiene le proporzioni originali dell'immagine

                    // Interazione e Stile
                    cursor: 'pointer',
                    zIndex: BUTTON_CONFIG.zIndex, // Layer 3 (10): Topmost
                    pointerEvents: 'auto' // Fondamentale per ricevere il click
                }}
            />
        </div>
    );
};