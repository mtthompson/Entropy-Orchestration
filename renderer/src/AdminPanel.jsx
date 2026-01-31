import React from 'react';
import { TrackCarousel } from './TrackCarousel';

export function AdminPanel({
    socket,
    tracks,
    currentTrack,
    cpuCount,
    gameState,
    showToast
}) {
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
