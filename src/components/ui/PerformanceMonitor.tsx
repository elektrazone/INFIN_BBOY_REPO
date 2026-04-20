// src/components/ui/PerformanceMonitor.tsx
import React, { useEffect, useState, useRef } from 'react';
import * as BABYLON from '@babylonjs/core';

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
    const [is1080pMode, setIs1080pMode] = useState(
        (window as any).__GAME_DISPLAY_MODE === 'windowed-1080'
    );
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
    const handleToggleMode = (e: React.MouseEvent) => {
        e.stopPropagation(); // prevent collapsing the menu
        const newMode = is1080pMode ? 'fullscreen' : 'windowed-1080';
        (window as any).__GAME_DISPLAY_MODE = newMode;
        setIs1080pMode(!is1080pMode);
        
        // Trigger a synthetic resize event to force babylonRunner.ts 
        // to re-evaluate applyCanvasSize() immediately
        window.dispatchEvent(new Event('resize'));
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

                    {/* Mode Toggle Button */}
                    <div style={{
                        marginTop: '12px',
                        paddingTop: '8px',
                        borderTop: '1px solid rgba(255,255,255,0.1)',
                        textAlign: 'center'
                    }}>
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
