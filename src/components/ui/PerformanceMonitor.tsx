// src/components/ui/PerformanceMonitor.tsx
import React, { useEffect, useState, useRef } from 'react';
import * as BABYLON from '@babylonjs/core';
import { PERFORMANCE_CONFIG } from '../../config/performanceConfig';

interface PerformanceStats {
    fps: number;
    avgFps: number;
    minFps: number;
    maxFps: number;
    drawCalls: number;
    activeMeshes: number;
    activeIndices: number;
    activeFaces: number;
    activeParticles: number;
    gpuFrameTime: number;
    gpuFrameTimeAvg: number;
    totalMeshes: number;
    totalMaterials: number;
    totalTextures: number;
    memoryUsed: number;
}

// Access engine/scene from global window object
declare global {
    interface Window {
        __BABYLON_ENGINE__?: BABYLON.Engine;
        __BABYLON_SCENE__?: BABYLON.Scene;
    }
}

const PerformanceMonitor: React.FC = () => {
    const [stats, setStats] = useState<PerformanceStats | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isExpanded, setIsExpanded] = useState(true);
    
    // Load initial state from localStorage or use PERFORMANCE_CONFIG defaults
    const [scalingLevel, setScalingLevel] = useState<number>(() => {
        const saved = localStorage.getItem('perf_scaling');
        return saved ? parseFloat(saved) : (PERFORMANCE_CONFIG.defaultHardwareScaling || 2.0);
    });
    const [shadowsEnabled, setShadowsEnabled] = useState(() => {
        const saved = localStorage.getItem('perf_shadows');
        return saved !== null ? saved === 'true' : PERFORMANCE_CONFIG.shadowsEnabledByDefault;
    });
    const [standardMaterialsActive, setStandardMaterialsActive] = useState(() => {
        const saved = localStorage.getItem('perf_mats');
        return saved !== null ? saved === 'true' : PERFORMANCE_CONFIG.useStandardMaterialsByDefault;
    });
    const [debrisEnabled, setDebrisEnabled] = useState(() => {
        const saved = localStorage.getItem('perf_debris');
        return saved !== null ? saved === 'true' : true;
    });
    const [is1080pMode, setIs1080pMode] = useState(() => {
        const saved = localStorage.getItem('perf_display_mode');
        return saved === '1080p';
    });
    const [skyEnabled, setSkyEnabled] = useState(() => {
        const saved = localStorage.getItem('perf_sky');
        return saved !== null ? saved === 'true' : true;
    });
    const fpsHistoryRef = useRef<number[]>([]);
    const gpuHistoryRef = useRef<number[]>([]);
    const instrumentationRef = useRef<BABYLON.SceneInstrumentation | null>(null);

    useEffect(() => {
        // Wait for Babylon to initialize
        const checkInterval = setInterval(() => {
            const engine = window.__BABYLON_ENGINE__;
            const scene = window.__BABYLON_SCENE__;

            if (engine && scene) {
                clearInterval(checkInterval);
                initMonitoring(engine, scene);
            }
        }, 100);

        return () => {
            clearInterval(checkInterval);
            if (instrumentationRef.current) {
                instrumentationRef.current.dispose();
            }
        };
    }, []);

    const initMonitoring = (engine: BABYLON.Engine, scene: BABYLON.Scene) => {
        setScalingLevel(engine.getHardwareScalingLevel());
        
        // Enable instrumentation for detailed GPU timing
        const instrumentation = new BABYLON.SceneInstrumentation(scene);
        instrumentation.captureFrameTime = true;
        instrumentation.captureRenderTime = true;
        instrumentation.captureInterFrameTime = true;
        instrumentationRef.current = instrumentation;

        let frameCount = 0;

        const observer = scene.onAfterRenderObservable.add(() => {
            frameCount++;

            // Only update every ~15 frames for performance
            if (frameCount % 15 !== 0) return;

            const fps = engine.getFps();
            fpsHistoryRef.current.push(fps);
            if (fpsHistoryRef.current.length > 120) {
                fpsHistoryRef.current.shift();
            }

            const gpuTime = instrumentation.frameTimeCounter.current;
            gpuHistoryRef.current.push(gpuTime);
            if (gpuHistoryRef.current.length > 60) {
                gpuHistoryRef.current.shift();
            }

            const fpsHistory = fpsHistoryRef.current;
            const avgFps = fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length;
            const minFps = Math.min(...fpsHistory);
            const maxFps = Math.max(...fpsHistory);

            const gpuHistory = gpuHistoryRef.current;
            const gpuAvg = gpuHistory.reduce((a, b) => a + b, 0) / gpuHistory.length;

            // Get draw call info
            const drawCalls = (scene.getEngine() as any)._drawCalls?.current ?? 0;

            // Memory info (if available)
            let memoryUsed = 0;
            if ((performance as any).memory) {
                memoryUsed = (performance as any).memory.usedJSHeapSize / (1024 * 1024);
            }

            setStats({
                fps: Math.round(fps),
                avgFps: Math.round(avgFps),
                minFps: Math.round(minFps),
                maxFps: Math.round(maxFps),
                drawCalls,
                activeMeshes: scene.getActiveMeshes().length,
                activeIndices: scene.getActiveIndices(),
                activeFaces: Math.round(scene.getActiveIndices() / 3),
                activeParticles: scene.getActiveParticles(),
                gpuFrameTime: Math.round(gpuTime * 100) / 100,
                gpuFrameTimeAvg: Math.round(gpuAvg * 100) / 100,
                totalMeshes: scene.meshes.length,
                totalMaterials: scene.materials.length,
                totalTextures: scene.textures.length,
                memoryUsed: Math.round(memoryUsed),
            });
        });

        // Store observer for cleanup
        return () => {
            scene.onAfterRenderObservable.remove(observer);
        };
    };

    // Toggle visibility with backtick key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === '`' || e.key === '~') {
                setIsVisible(v => !v);
            }
            if (e.key === 'Tab' && e.shiftKey) {
                e.preventDefault();
                setIsExpanded(v => !v);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Apply saved settings automatically once engine/scene are ready
    useEffect(() => {
        const applySavedSettings = () => {
            const scene = window.__BABYLON_SCENE__;
            const engine = window.__BABYLON_ENGINE__;
            if (!scene || !engine) return;

            console.log("🛠️ Performance Monitor: Applying saved settings...");

            // 1. Apply Scaling
            engine.setHardwareScalingLevel(scalingLevel);

            // 2. Apply Shadows
            scene.shadowsEnabled = shadowsEnabled;
            scene.lights.forEach(light => {
                light.shadowEnabled = shadowsEnabled;
                const generators = (light as any)._shadowGenerators;
                if (generators) {
                    generators.forEach((gen: any) => {
                        if (gen.getShadowMap) {
                            gen.getShadowMap().refreshRate = shadowsEnabled ? 1 : 0;
                        }
                    });
                }
            });
            scene.meshes.forEach(mesh => {
                mesh.receiveShadows = shadowsEnabled;
            });

            // 3. Materials persistence is handled by the initial state of MaterialFactory 
            // and live toggle logic. We don't force a swap here as it's complex for live meshes,
            // but the factory already uses PERFORMANCE_CONFIG or can be updated to check localStorage.

            // 4. Apply Sky (CSS layer)
            const skyEl = document.getElementById('sky-background');
            if (skyEl && !skyEnabled) {
                skyEl.style.backgroundImage = 'none';
                skyEl.style.backgroundColor = '#4a90d9';
                skyEl.style.animation = 'none';
            }
        };

        const interval = setInterval(() => {
            if (window.__BABYLON_SCENE__ && window.__BABYLON_ENGINE__) {
                applySavedSettings();
                clearInterval(interval);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, []); // Only run once on mount to establish initial state from localStorage

    const handleHiddenTap = (e: React.PointerEvent<HTMLDivElement>) => {
        // Only trigger on primary pointer (first finger or main mouse click)
        if (!e.isPrimary) return;
        setIsVisible(v => !v);
    };

    if (!stats) return null;

    // Color coding for FPS
    const getFpsColor = (fps: number) => {
        if (fps >= 55) return '#4ade80'; // Green
        if (fps >= 30) return '#facc15'; // Yellow
        return '#f87171'; // Red
    };

    // Warning indicators
    const warnings: string[] = [];
    if (stats.fps < 30) warnings.push('⚠️ Low FPS');
    if (stats.drawCalls > 200) warnings.push('⚠️ High draw calls');
    if (stats.activeFaces > 100000) warnings.push('⚠️ High polygon count');
    if (stats.gpuFrameTimeAvg > 16.67) warnings.push('⚠️ GPU bound');

    const styles: React.CSSProperties = {
        position: 'absolute',
        top: '10px',
        left: '10px',
        background: 'rgba(0, 0, 0, 0.85)',
        color: '#fff',
        padding: '12px 16px',
        borderRadius: '8px',
        fontFamily: 'Consolas, Monaco, monospace',
        fontSize: '12px',
        lineHeight: '1.5',
        zIndex: 10000,
        pointerEvents: 'auto',
        userSelect: 'none',
        minWidth: isExpanded ? '280px' : '140px',
        backgroundColor: 'rgba(0, 0, 0, 0.9)', /* Solid background for performance */
        border: '1px solid rgba(255, 255, 255, 0.1)',
        cursor: 'pointer',
    };
    const toggleShadows = (e: React.MouseEvent) => {
        e.stopPropagation();
        const scene = window.__BABYLON_SCENE__;
        if (!scene) return;
        
        const newState = !shadowsEnabled;
        
        // 1. Global Scene Switch
        scene.shadowsEnabled = newState;
        
        // 2. Individual Mesh Switch
        scene.meshes.forEach(mesh => {
            mesh.receiveShadows = newState;
        });

        // 3. Shadow Generator Refresh Rate
        scene.lights.forEach(light => {
            light.shadowEnabled = newState;
            // Access the internal generators to stop their render loops
            const generators = (light as any)._shadowGenerators;
            if (generators) {
                generators.forEach((gen: any) => {
                    if (gen.getShadowMap) {
                        gen.getShadowMap().refreshRate = newState ? 1 : 0;
                    }
                });
            }
        });

        // 4. Force Shader Recompile (Strips shadow code from GPU)
        scene.materials.forEach(mat => {
            mat.markDirty();
        });

        setShadowsEnabled(newState);
        localStorage.setItem('perf_shadows', newState.toString());
        console.log(`🔦 Shadows Deep Purge: ${newState ? "ON" : "OFF"}`);
    };

    const toggleMaterials = (e: React.MouseEvent) => {
        e.stopPropagation();
        const scene = window.__BABYLON_SCENE__;
        if (!scene) return;

        const newState = !standardMaterialsActive;
        scene.meshes.forEach(mesh => {
            if (!mesh.material) return;

            // Store original in metadata if not already there
            mesh.metadata = mesh.metadata || {};

            if (newState) {
                // Switch to Standard (Optimized)
                if (mesh.material instanceof BABYLON.PBRMaterial) {
                    const pbr = mesh.material;
                    // Check if we already have a cached standard version
                    if (!mesh.metadata.cachedStandardMaterial) {
                        const std = new BABYLON.StandardMaterial(`std_${pbr.name}`, scene);
                        std.diffuseColor = pbr.albedoColor || BABYLON.Color3.White();
                        std.diffuseTexture = pbr.albedoTexture;
                        std.emissiveColor = pbr.emissiveColor || BABYLON.Color3.Black();
                        std.emissiveTexture = pbr.emissiveTexture;
                        std.bumpTexture = pbr.bumpTexture;
                        std.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
                        mesh.metadata.cachedStandardMaterial = std;
                        mesh.metadata.originalPBRMaterial = pbr;
                    }
                    mesh.material = mesh.metadata.cachedStandardMaterial;
                }
            } else {
                // Switch back to PBR (Original)
                if (mesh.metadata.originalPBRMaterial) {
                    mesh.material = mesh.metadata.originalPBRMaterial;
                }
            }
        });

        setStandardMaterialsActive(newState);
        localStorage.setItem('perf_mats', newState.toString());
        console.log(`🎨 Materials: ${newState ? "STANDARD" : "PBR"}`);
    };

    const toggleDebris = (e: React.MouseEvent) => {
        e.stopPropagation();
        const scene = window.__BABYLON_SCENE__;
        if (!scene) return;

        const newState = !debrisEnabled;
        scene.meshes.forEach(mesh => {
            if (mesh.name.startsWith('debris_')) {
                mesh.isVisible = newState;
            }
        });

        setDebrisEnabled(newState);
        localStorage.setItem('perf_debris', newState.toString());
        console.log(`✨ Fall Debris: ${newState ? "VISIBLE" : "HIDDEN"}`);
    };

    const handleToggleMode = (e: React.MouseEvent) => {
        e.stopPropagation();
        const newMode = !is1080pMode;
        setIs1080pMode(newMode);
        
        const modeString = newMode ? '1080p' : 'fullscreen';
        (window as any).__GAME_DISPLAY_MODE = modeString;
        localStorage.setItem('perf_display_mode', modeString);
        
        // Trigger a resize event to apply changes in babylonRunner
        window.dispatchEvent(new Event('resize'));
        console.log(`🖥️ Display Mode: ${modeString.toUpperCase()}`);
    };

    const toggleSky = (e: React.MouseEvent) => {
        e.stopPropagation();

        const newState = !skyEnabled;
        const skyEl = document.getElementById('sky-background');
        if (skyEl) {
            skyEl.style.backgroundColor = newState ? '#4a90d9' : 'transparent';
        }

        setSkyEnabled(newState);
        localStorage.setItem('perf_sky', newState.toString());
        console.log(`☁️ Sky: ${newState ? "VISIBLE" : "HIDDEN"}`);
    };

    return (
        <>
            {/* Hidden touch zone for touch devices (Single tap top right corner over the timer) */}
            <div 
                style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: '120px',
                    height: '120px',
                    zIndex: 20000,
                    cursor: 'pointer',
                    background: 'transparent',
                    pointerEvents: 'auto', // MUST force pointer events in case parent overlays block it!
                    touchAction: 'none'    // Prevent double-tap-to-zoom on mobile hardware
                }}
                onPointerDown={handleHiddenTap}
            />

            {isVisible && (
                <div style={styles} onClick={() => setIsExpanded(!isExpanded)}>
            {/* Main FPS Display */}
            <div style={{
                fontSize: '20px',
                fontWeight: 'bold',
                color: getFpsColor(stats.fps),
                marginBottom: '4px'
            }}>
                {stats.fps} FPS
            </div>

            {/* Compact Mode */}
            {!isExpanded && (
                <div style={{ color: '#888', fontSize: '10px' }}>
                    Draw: {stats.drawCalls} | Mesh: {stats.activeMeshes}
                    <br />
                    <span style={{ color: '#666' }}>Click to expand</span>
                </div>
            )}

            {/* Expanded Mode */}
            {isExpanded && (
                <>
                    {/* FPS Stats */}
                    <div style={{
                        borderTop: '1px solid rgba(255,255,255,0.1)',
                        paddingTop: '8px',
                        marginTop: '4px'
                    }}>
                        <div style={{ color: '#888' }}>
                            Avg: <span style={{ color: getFpsColor(stats.avgFps) }}>{stats.avgFps}</span>
                            {' | '}
                            Min: <span style={{ color: getFpsColor(stats.minFps) }}>{stats.minFps}</span>
                            {' | '}
                            Max: <span style={{ color: '#4ade80' }}>{stats.maxFps}</span>
                        </div>
                    </div>

                    {/* GPU Timing */}
                    <div style={{
                        borderTop: '1px solid rgba(255,255,255,0.1)',
                        paddingTop: '8px',
                        marginTop: '8px'
                    }}>
                        <div style={{ color: '#60a5fa', fontWeight: 'bold' }}>GPU Frame Time</div>
                        <div style={{ color: '#888' }}>
                            Current: {stats.gpuFrameTime.toFixed(2)}ms
                            <br />
                            Avg: {stats.gpuFrameTimeAvg.toFixed(2)}ms
                            {stats.gpuFrameTimeAvg > 16.67 &&
                                <span style={{ color: '#f87171' }}> (over budget!)</span>
                            }
                        </div>
                    </div>

                    {/* Draw Calls / Geometry */}
                    <div style={{
                        borderTop: '1px solid rgba(255,255,255,0.1)',
                        paddingTop: '8px',
                        marginTop: '8px'
                    }}>
                        <div style={{ color: '#60a5fa', fontWeight: 'bold' }}>Rendering</div>
                        <div style={{ color: '#888' }}>
                            Draw Calls: <span style={{ color: stats.drawCalls > 150 ? '#facc15' : '#4ade80' }}>
                                {stats.drawCalls}
                            </span>
                            <br />
                            Active Meshes: {stats.activeMeshes}
                            <br />
                            Active Triangles: {stats.activeFaces.toLocaleString()}
                            <br />
                            Active Particles: {stats.activeParticles}
                        </div>
                    </div>

                    {/* Scene Stats */}
                    <div style={{
                        borderTop: '1px solid rgba(255,255,255,0.1)',
                        paddingTop: '8px',
                        marginTop: '8px'
                    }}>
                        <div style={{ color: '#60a5fa', fontWeight: 'bold' }}>Scene</div>
                        <div style={{ color: '#888' }}>
                            Total Meshes: {stats.totalMeshes}
                            <br />
                            Materials: {stats.totalMaterials}
                            <br />
                            Textures: {stats.totalTextures}
                        </div>
                    </div>

                    {/* Memory */}
                    {stats.memoryUsed > 0 && (
                        <div style={{
                            borderTop: '1px solid rgba(255,255,255,0.1)',
                            paddingTop: '8px',
                            marginTop: '8px'
                        }}>
                            <div style={{ color: '#60a5fa', fontWeight: 'bold' }}>Memory</div>
                            <div style={{ color: '#888' }}>
                                JS Heap: {stats.memoryUsed} MB
                            </div>
                        </div>
                    )}

                    {/* Warnings */}
                    {warnings.length > 0 && (
                        <div style={{
                            borderTop: '1px solid rgba(255,255,255,0.1)',
                            paddingTop: '8px',
                            marginTop: '8px',
                            color: '#f87171'
                        }}>
                            {warnings.map((w, i) => <div key={i}>{w}</div>)}
                        </div>
                    )}

                    {/* Display & Scaling Controls */}
                    <div style={{
                        marginTop: '12px',
                        paddingTop: '8px',
                        borderTop: '1px solid rgba(255,255,255,0.1)',
                        textAlign: 'center'
                    }}>
                        {/* Hardware Scaling */}
                        <div style={{ color: '#60a5fa', fontWeight: 'bold', marginBottom: '8px' }}>
                            Hardware Scaling: {scalingLevel.toFixed(2)}x
                        </div>
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
                            {[1.0, 1.5, 2.0].map(level => (
                                <button
                                    key={level}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (window.__BABYLON_ENGINE__) {
                                            window.__BABYLON_ENGINE__.setHardwareScalingLevel(level);
                                            setScalingLevel(level);
                                            localStorage.setItem('perf_scaling', level.toString());
                                        }
                                    }}
                                    style={{
                                        flex: 1,
                                        background: Math.abs(scalingLevel - level) < 0.01 ? '#3b82f6' : '#4b5563',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        padding: '6px 0',
                                        fontSize: '11px',
                                        cursor: 'pointer',
                                        fontWeight: 'bold'
                                    }}
                                >
                                    {level.toFixed(1)}
                                </button>
                            ))}
                        </div>

                        {/* Render Toggles */}
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                            <button
                                onClick={toggleShadows}
                                style={{
                                    flex: 1,
                                    background: shadowsEnabled ? '#4ade80' : '#4b5563',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    padding: '6px 0',
                                    fontSize: '10px',
                                    cursor: 'pointer',
                                    fontWeight: 'bold'
                                }}
                            >
                                SHADOWS: {shadowsEnabled ? "ON" : "OFF"}
                            </button>
                            <button
                                onClick={toggleMaterials}
                                style={{
                                    flex: 1,
                                    background: standardMaterialsActive ? '#facc15' : '#4b5563',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    padding: '6px 0',
                                    fontSize: '10px',
                                    cursor: 'pointer',
                                    fontWeight: 'bold'
                                }}
                            >
                                MATS: {standardMaterialsActive ? "STD" : "PBR"}
                            </button>
                            <button
                                onClick={toggleDebris}
                                style={{
                                    flex: 1,
                                    background: debrisEnabled ? '#2dd4bf' : '#4b5563',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    padding: '6px 0',
                                    fontSize: '10px',
                                    cursor: 'pointer',
                                    fontWeight: 'bold'
                                }}
                            >
                                DEBRIS: {debrisEnabled ? "ON" : "OFF"}
                            </button>
                            <button
                                onClick={toggleSky}
                                style={{
                                    flex: 1,
                                    background: skyEnabled ? '#818cf8' : '#4b5563',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    padding: '6px 0',
                                    fontSize: '10px',
                                    cursor: 'pointer',
                                    fontWeight: 'bold'
                                }}
                            >
                                SKY: {skyEnabled ? "ON" : "OFF"}
                            </button>
                        </div>

                        {/* Mode Toggle Button */}
                        <button
                            onClick={handleToggleMode}
                            style={{
                                background: is1080pMode ? '#3b82f6' : '#4b5563',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '6px 12px',
                                fontSize: '11px',
                                cursor: 'pointer',
                                width: '100%',
                                fontFamily: 'inherit',
                                fontWeight: 'bold'
                            }}
                        >
                            {is1080pMode ? "SQUARE VIEW ACTIVE" : "ENABLE 1080P WINDOW"}
                        </button>
                    </div>

                    {/* Help */}
                    <div style={{
                        borderTop: '1px solid rgba(255,255,255,0.1)',
                        paddingTop: '8px',
                        marginTop: '8px',
                        color: '#666',
                        fontSize: '10px'
                    }}>
                        Press ` or tap top-right corner to toggle | Click to collapse
                    </div>
                </>
            )}
        </div>
        )}
        </>
    );
};

export default PerformanceMonitor;
