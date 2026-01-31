import React from 'react';
import { TrackCarousel } from './TrackCarousel';

export function AdminPanel({
    socket,
    tracks,
    currentTrack,
    cpuCount,
    gameState,
    showToast,
    graphicsSettings,
    onGraphicsChange,
    performanceStats
}) {
    const [showGraphics, setShowGraphics] = React.useState(false);
    // Debug logging
    React.useEffect(() => {
        console.log('[AdminPanel] Props updated:', { tracksCount: tracks?.length, currentTrack: currentTrack?.name, cpuCount, gameState });
    }, [tracks, currentTrack, cpuCount, gameState]);

    const handleStartGame = () => {
        if (gameState === 'LOBBY') {
            socket.emit('startGame');
            showToast('Starting game...', 'info');
        } else {
            showToast('Game already in progress', 'error');
        }
    };

    const handleRestartGame = () => {
        socket.emit('restartGame');
        showToast('Restarting game...', 'info');
    };

    const handleAddCPU = () => {
        socket.emit('addCPU');
        showToast('Adding CPU opponent', 'success');
    };

    const handleRemoveCPU = () => {
        if (cpuCount > 0) {
            socket.emit('removeCPU');
            showToast('Removing CPU opponent', 'success');
        } else {
            showToast('No CPUs to remove', 'error');
        }
    };

    const handleChangeTrack = (trackId) => {
        socket.emit('changeTrack', trackId);
        const track = tracks.find(t => t.id === trackId);
        showToast(`Changing to ${track?.name || 'track'}`, 'info');
    };

    const handleGraphicsPreset = (preset) => {
        const presets = {
            Low: {
                shadowQuality: 1024,
                enableHDR: false,
                enableSSAO: false,
                enableDOF: false,
                enableBloom: true,
                bloomIntensity: 0.5,
                toneMapping: 'None',
                particleLimit: 3000,
                showPerformance: true
            },
            Medium: {
                shadowQuality: 2048,
                enableHDR: true,
                enableSSAO: true,
                enableDOF: false,
                enableBloom: true,
                bloomIntensity: 0.8,
                toneMapping: 'Reinhard',
                particleLimit: 7000,
                showPerformance: true
            },
            High: {
                shadowQuality: 4096,
                enableHDR: true,
                enableSSAO: true,
                enableDOF: false,
                enableBloom: true,
                bloomIntensity: 0.8,
                toneMapping: 'ACES',
                particleLimit: 15000,
                showPerformance: true
            }
        };
        onGraphicsChange(presets[preset]);
        showToast(`Graphics: ${preset} preset applied`, 'success');
    };

    return (
        <>
            <style>{`
                @keyframes adminPanelGlow {
                    0%, 100% { box-shadow: 0 0 30px rgba(255, 0, 255, 0.4); }
                    50% { box-shadow: 0 0 40px rgba(255, 0, 255, 0.6); }
                }
            `}</style>
            <div style={{
                position: 'fixed',
                bottom: '20px',
                right: '20px',
                width: '280px',
                background: 'rgba(0, 0, 0, 0.85)',
                border: '2px solid #ff00ff',
                borderRadius: '12px',
                padding: '16px',
                zIndex: 1500,
                animation: 'adminPanelGlow 2s ease-in-out infinite',
                fontFamily: 'monospace'
            }}>
                {/* Header */}
                <div style={{
                    color: '#ff00ff',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    letterSpacing: '3px',
                    marginBottom: '16px',
                    textAlign: 'center',
                    textShadow: '0 0 10px #ff00ff'
                }}>
                    🎮 ADMIN CONTROLS
                </div>

                {/* Game Control Buttons */}
                <div style={{
                    display: 'flex',
                    gap: '8px',
                    marginBottom: '16px'
                }}>
                    <button
                        onClick={handleStartGame}
                        style={{
                            flex: 1,
                            background: gameState === 'LOBBY' ? 'rgba(0, 255, 0, 0.2)' : 'rgba(100, 100, 100, 0.2)',
                            border: `2px solid ${gameState === 'LOBBY' ? '#00ff00' : '#666'}`,
                            borderRadius: '6px',
                            color: gameState === 'LOBBY' ? '#00ff00' : '#666',
                            fontFamily: 'monospace',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            padding: '8px 4px',
                            cursor: gameState === 'LOBBY' ? 'pointer' : 'not-allowed',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            if (gameState === 'LOBBY') {
                                e.target.style.background = 'rgba(0, 255, 0, 0.4)';
                                e.target.style.boxShadow = '0 0 15px #00ff00';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (gameState === 'LOBBY') {
                                e.target.style.background = 'rgba(0, 255, 0, 0.2)';
                                e.target.style.boxShadow = 'none';
                            }
                        }}
                    >
                        Start
                    </button>

                    <button
                        onClick={handleRestartGame}
                        style={{
                            flex: 1,
                            background: 'rgba(255, 100, 0, 0.2)',
                            border: '2px solid #ff6600',
                            borderRadius: '6px',
                            color: '#ff6600',
                            fontFamily: 'monospace',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            padding: '8px 4px',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            e.target.style.background = 'rgba(255, 100, 0, 0.4)';
                            e.target.style.boxShadow = '0 0 15px #ff6600';
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.background = 'rgba(255, 100, 0, 0.2)';
                            e.target.style.boxShadow = 'none';
                        }}
                    >
                        Restart
                    </button>
                </div>

                {/* CPU Counter */}
                <div style={{
                    marginBottom: '16px',
                    paddingBottom: '16px',
                    borderBottom: '1px solid rgba(255, 0, 255, 0.3)'
                }}>
                    <div style={{
                        color: '#00ffff',
                        fontSize: '11px',
                        marginBottom: '8px',
                        textTransform: 'uppercase',
                        letterSpacing: '2px'
                    }}>
                        CPU Opponents
                    </div>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                    }}>
                        <button
                            onClick={handleRemoveCPU}
                            disabled={cpuCount === 0}
                            style={{
                                background: cpuCount > 0 ? 'rgba(255, 0, 255, 0.2)' : 'rgba(100, 100, 100, 0.2)',
                                border: `2px solid ${cpuCount > 0 ? '#ff00ff' : '#666'}`,
                                borderRadius: '4px',
                                color: cpuCount > 0 ? '#ff00ff' : '#666',
                                fontFamily: 'monospace',
                                fontSize: '16px',
                                fontWeight: 'bold',
                                width: '40px',
                                height: '40px',
                                cursor: cpuCount > 0 ? 'pointer' : 'not-allowed',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                if (cpuCount > 0) {
                                    e.target.style.background = 'rgba(255, 0, 255, 0.4)';
                                    e.target.style.boxShadow = '0 0 10px #ff00ff';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (cpuCount > 0) {
                                    e.target.style.background = 'rgba(255, 0, 255, 0.2)';
                                    e.target.style.boxShadow = 'none';
                                }
                            }}
                        >
                            −
                        </button>

                        <div style={{
                            flex: 1,
                            textAlign: 'center',
                            color: '#fff',
                            fontSize: '24px',
                            fontWeight: 'bold',
                            textShadow: '0 0 10px #00ffff'
                        }}>
                            {cpuCount}
                        </div>

                        <button
                            onClick={handleAddCPU}
                            style={{
                                background: 'rgba(255, 0, 255, 0.2)',
                                border: '2px solid #ff00ff',
                                borderRadius: '4px',
                                color: '#ff00ff',
                                fontFamily: 'monospace',
                                fontSize: '16px',
                                fontWeight: 'bold',
                                width: '40px',
                                height: '40px',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                e.target.style.background = 'rgba(255, 0, 255, 0.4)';
                                e.target.style.boxShadow = '0 0 10px #ff00ff';
                            }}
                            onMouseLeave={(e) => {
                                e.target.style.background = 'rgba(255, 0, 255, 0.2)';
                                e.target.style.boxShadow = 'none';
                            }}
                        >
                            +
                        </button>
                    </div>
                </div>

                {/* Track Selection */}
                <div>
                    <div style={{
                        color: '#00ffff',
                        fontSize: '11px',
                        marginBottom: '8px',
                        textTransform: 'uppercase',
                        letterSpacing: '2px'
                    }}>
                        Track Selection
                    </div>
                    <TrackCarousel
                        tracks={tracks}
                        currentTrack={currentTrack}
                        onSelectTrack={handleChangeTrack}
                    />
                </div>

                {/* Graphics Settings */}
                <div style={{
                    marginTop: '16px',
                    paddingTop: '16px',
                    borderTop: '1px solid rgba(255, 0, 255, 0.3)'
                }}>
                    <div 
                        onClick={() => setShowGraphics(!showGraphics)}
                        style={{
                            color: '#00ffff',
                            fontSize: '11px',
                            marginBottom: '8px',
                            textTransform: 'uppercase',
                            letterSpacing: '2px',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}
                    >
                        <span>🎨 Graphics Settings</span>
                        <span style={{ fontSize: '16px' }}>{showGraphics ? '▼' : '▶'}</span>
                    </div>

                    {showGraphics && (
                        <div style={{ marginTop: '12px' }}>
                            {/* Quick Presets */}
                            <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
                                {['Low', 'Medium', 'High'].map(preset => (
                                    <button
                                        key={preset}
                                        onClick={() => handleGraphicsPreset(preset)}
                                        style={{
                                            flex: 1,
                                            background: 'rgba(0, 255, 255, 0.2)',
                                            border: '1px solid #00ffff',
                                            borderRadius: '4px',
                                            color: '#00ffff',
                                            fontFamily: 'monospace',
                                            fontSize: '9px',
                                            padding: '4px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {preset}
                                    </button>
                                ))}
                            </div>

                            {/* Individual Settings */}
                            <div style={{ fontSize: '10px', color: '#ccc', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {/* Shadow Quality */}
                                <div>
                                    <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span>Shadows:</span>
                                        <span style={{ color: '#00ffff' }}>{graphicsSettings.shadowQuality}</span>
                                    </label>
                                    <select
                                        value={graphicsSettings.shadowQuality}
                                        onChange={(e) => onGraphicsChange({ ...graphicsSettings, shadowQuality: Number(e.target.value) })}
                                        style={{
                                            width: '100%',
                                            background: '#111',
                                            color: '#00ffff',
                                            border: '1px solid #00ffff',
                                            borderRadius: '4px',
                                            padding: '4px',
                                            fontFamily: 'monospace',
                                            fontSize: '10px'
                                        }}
                                    >
                                        <option value={0}>Off</option>
                                        <option value={1024}>1024</option>
                                        <option value={2048}>2048</option>
                                        <option value={4096}>4096</option>
                                    </select>
                                </div>

                                {/* Toggles */}
                                {[
                                    { key: 'enableHDR', label: 'HDR Environment' },
                                    { key: 'enableSSAO', label: 'SSAO' },
                                    { key: 'enableDOF', label: 'Depth of Field' },
                                    { key: 'enableBloom', label: 'Bloom' },
                                    { key: 'showPerformance', label: 'Performance Overlay' }
                                ].map(({ key, label }) => (
                                    <label key={key} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={graphicsSettings[key]}
                                            onChange={(e) => onGraphicsChange({ ...graphicsSettings, [key]: e.target.checked })}
                                            style={{ marginRight: '8px' }}
                                        />
                                        <span>{label}</span>
                                    </label>
                                ))}

                                {/* Bloom Intensity */}
                                {graphicsSettings.enableBloom && (
                                    <div>
                                        <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <span>Bloom Intensity:</span>
                                            <span style={{ color: '#00ffff' }}>{graphicsSettings.bloomIntensity.toFixed(1)}</span>
                                        </label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="2"
                                            step="0.1"
                                            value={graphicsSettings.bloomIntensity}
                                            onChange={(e) => onGraphicsChange({ ...graphicsSettings, bloomIntensity: Number(e.target.value) })}
                                            style={{ width: '100%' }}
                                        />
                                    </div>
                                )}

                                {/* Tone Mapping */}
                                <div>
                                    <label style={{ display: 'block', marginBottom: '4px' }}>Tone Mapping:</label>
                                    <select
                                        value={graphicsSettings.toneMapping}
                                        onChange={(e) => onGraphicsChange({ ...graphicsSettings, toneMapping: e.target.value })}
                                        style={{
                                            width: '100%',
                                            background: '#111',
                                            color: '#00ffff',
                                            border: '1px solid #00ffff',
                                            borderRadius: '4px',
                                            padding: '4px',
                                            fontFamily: 'monospace',
                                            fontSize: '10px'
                                        }}
                                    >
                                        <option value="None">None</option>
                                        <option value="LINEAR">Linear</option>
                                        <option value="REINHARD">Reinhard</option>
                                        <option value="REINHARD2">Reinhard2</option>
                                        <option value="REINHARD2_ADAPTIVE">Reinhard2 Adaptive</option>
                                        <option value="UNCHARTED2">Uncharted2</option>
                                        <option value="OPTIMIZED_CINEON">Optimized Cineon</option>
                                        <option value="ACES_FILMIC">ACES Filmic</option>
                                    </select>
                                </div>

                                {/* Particle Limit */}
                                <div>
                                    <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span>Particle Limit:</span>
                                        <span style={{ color: '#00ffff' }}>{graphicsSettings.particleLimit}</span>
                                    </label>
                                    <input
                                        type="range"
                                        min="1000"
                                        max="15000"
                                        step="1000"
                                        value={graphicsSettings.particleLimit}
                                        onChange={(e) => onGraphicsChange({ ...graphicsSettings, particleLimit: Number(e.target.value) })}
                                        style={{ width: '100%' }}
                                    />
                                </div>

                                {/* FPS Display */}
                                {performanceStats && (
                                    <div style={{
                                        marginTop: '8px',
                                        padding: '8px',
                                        background: 'rgba(0, 255, 0, 0.1)',
                                        borderRadius: '4px',
                                        fontSize: '9px',
                                        display: 'flex',
                                        justifyContent: 'space-between'
                                    }}>
                                        <span>FPS: <strong>{performanceStats.fps}</strong></span>
                                        <span>Draws: <strong>{performanceStats.drawCalls}</strong></span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Keyboard Shortcuts Hint */}
                <div style={{
                    marginTop: '16px',
                    paddingTop: '12px',
                    borderTop: '1px solid rgba(255, 0, 255, 0.3)',
                    color: '#888',
                    fontSize: '9px',
                    textAlign: 'center',
                    lineHeight: '1.4'
                }}>
                    SPACE: Start | R: Restart<br/>
                    +/-: CPU | ←→: Browse Tracks
                </div>
            </div>
        </>
    );
}
