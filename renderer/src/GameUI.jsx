import React, { useEffect, useState } from 'react';

// Animated mask icons for the lobby display
const MASK_DISPLAY = [
    { icon: '🎭', name: 'CLASSIC', desc: 'Balanced' },
    { icon: '👹', name: 'ONI', desc: 'Damage Resist' },
    { icon: '🤖', name: 'TECH', desc: 'Fast Boost' },
    { icon: '🤡', name: 'CLOWN', desc: 'Speed Bursts' },
    { icon: '💀', name: 'SKULL', desc: '+Max Speed' }
];

export function GameUI({ gameState, gameTimer, winner, onCountdownTick }) {
    const [countdownPulse, setCountdownPulse] = useState(false);
    const [activeMaskIndex, setActiveMaskIndex] = useState(0);
    const [glitchText, setGlitchText] = useState(false);

    // Rotate through masks in lobby
    useEffect(() => {
        if (gameState === 'LOBBY') {
            const interval = setInterval(() => {
                setActiveMaskIndex(i => (i + 1) % MASK_DISPLAY.length);
            }, 2000);
            return () => clearInterval(interval);
        }
    }, [gameState]);

    // Glitch effect for mystery text
    useEffect(() => {
        if (gameState === 'LOBBY') {
            const interval = setInterval(() => {
                setGlitchText(true);
                setTimeout(() => setGlitchText(false), 150);
            }, 3000);
            return () => clearInterval(interval);
        }
    }, [gameState]);

    // Trigger pulse animation on countdown change
    useEffect(() => {
        if (gameState === 'COUNTDOWN' && gameTimer > 0) {
            setCountdownPulse(true);
            onCountdownTick?.(gameTimer); // Notify parent for sound
            const timer = setTimeout(() => setCountdownPulse(false), 300);
            return () => clearTimeout(timer);
        }
    }, [gameTimer, gameState, onCountdownTick]);

    if (gameState === 'LOBBY') {
        const activeMask = MASK_DISPLAY[activeMaskIndex];

        return (
            <div style={styles.overlay}>
                <div style={styles.lobbyBox}>
                    {/* Main Title with glow */}
                    <h1 style={styles.lobbyTitle}>
                        <span style={styles.titleGlow}>DEMOLITION</span>
                        <span style={styles.titleAccent}> ARENA</span>
                    </h1>

                    {/* Hidden Identity Section */}
                    <div style={styles.identitySection}>
                        <div style={styles.maskShowcase}>
                            {MASK_DISPLAY.map((mask, i) => (
                                <div
                                    key={mask.name}
                                    style={{
                                        ...styles.maskIcon,
                                        transform: i === activeMaskIndex ? 'scale(1.4)' : 'scale(0.9)',
                                        opacity: i === activeMaskIndex ? 1 : 0.3,
                                        filter: i === activeMaskIndex
                                            ? 'drop-shadow(0 0 15px #ff00ff) drop-shadow(0 0 30px #00ffff)'
                                            : 'none'
                                    }}
                                >
                                    {mask.icon}
                                </div>
                            ))}
                        </div>
                        <div style={styles.maskInfo}>
                            <span style={styles.maskName}>{activeMask.name}</span>
                            <span style={styles.maskDesc}>{activeMask.desc}</span>
                        </div>
                    </div>

                    {/* Scan to Join */}
                    <div style={styles.joinSection}>
                        <div style={styles.scanPrompt}>📱 SCAN TO JOIN</div>
                        <div style={styles.arrowRight}>➡️</div>
                    </div>

                    {/* Controls - cleaner layout */}
                    <div style={styles.controlsGrid}>
                        <div style={styles.controlItem}>
                            <span style={styles.controlIcon}>📱↔️</span>
                            <span style={styles.controlLabel}>TILT TO STEER</span>
                        </div>
                        <div style={styles.controlItem}>
                            <span style={styles.controlIcon}>👆</span>
                            <span style={styles.controlLabel}>TAP TO DRIVE</span>
                        </div>
                        <div style={styles.controlItem}>
                            <span style={styles.controlIcon}>⚡</span>
                            <span style={styles.controlLabel}>BOOST BUTTON</span>
                        </div>
                        <div style={styles.controlItem}>
                            <span style={styles.controlIcon}>🔫</span>
                            <span style={styles.controlLabel}>FIRE WEAPON</span>
                        </div>
                    </div>

                    {/* Lobby Countdown Timer */}
                    {gameTimer > 0 && (
                        <div style={styles.lobbyTimerContainer}>
                            <div style={styles.lobbyTimerLabel}>STARTING IN</div>
                            <div style={styles.lobbyTimerValue}>{gameTimer}s</div>
                        </div>
                    )}
                </div>

                {/* CSS Animations */}
                <style>{`
                    @keyframes maskPulse {
                        0%, 100% { filter: drop-shadow(0 0 10px #ff00ff); }
                        50% { filter: drop-shadow(0 0 25px #00ffff); }
                    }
                    @keyframes borderGlow {
                        0%, 100% { border-color: #00ffff; box-shadow: 0 0 30px rgba(0,255,255,0.4); }
                        50% { border-color: #ff00ff; box-shadow: 0 0 50px rgba(255,0,255,0.6); }
                    }
                    @keyframes floatArrow {
                        0%, 100% { transform: translateX(0); }
                        50% { transform: translateX(10px); }
                    }
                    @keyframes timerFlicker {
                        0%, 100% { opacity: 1; transform: scale(1); }
                        95% { opacity: 1; transform: scale(1); }
                        96% { opacity: 0.8; transform: scale(0.98); }
                        97% { opacity: 1; transform: scale(1.02); }
                        98% { opacity: 0.9; transform: scale(1); }
                    }
                `}</style>
            </div>
        );
    }

    if (gameState === 'COUNTDOWN') {
        const scale = countdownPulse ? 1.3 : 1;
        const color = gameTimer === 1 ? '#00ff00' : gameTimer === 2 ? '#ffff00' : '#ff0055';
        return (
            <div style={styles.centerOverlay}>
                <h1 style={{
                    ...styles.bigText,
                    fontSize: '15rem',
                    color: color,
                    transform: `scale(${scale})`,
                    transition: 'transform 0.15s ease-out, color 0.3s'
                }}>
                    {gameTimer === 0 ? 'GO!' : gameTimer}
                </h1>

            </div>
        );
    }

    if (gameState === 'WINNER') {
        return (
            <div style={styles.overlay}>
                <div style={{
                    backgroundColor: 'rgba(10, 0, 30, 0.95)',
                    border: '5px solid #ffd700',
                    padding: '50px 80px',
                    borderRadius: '24px',
                    textAlign: 'center',
                    animation: 'winnerGlow 1s ease-in-out infinite alternate',
                    boxShadow: '0 0 80px rgba(255,215,0,0.6), inset 0 0 60px rgba(255,215,0,0.1)'
                }}>
                    {/* Trophy */}
                    <div style={{
                        fontSize: '5rem',
                        marginBottom: 10,
                        animation: 'trophyBounce 0.6s ease-in-out infinite'
                    }}>👑</div>

                    {/* Victory Text */}
                    <h1 style={{
                        fontSize: '3.5rem',
                        color: '#ffd700',
                        fontFamily: '"Segoe UI", Arial, sans-serif',
                        fontWeight: 800,
                        letterSpacing: 6,
                        marginBottom: '20px',
                        textShadow: '0 0 20px #ffd700, 0 0 40px #ffd700'
                    }}>VICTORY!</h1>

                    {/* Winner Name - Big Reveal */}
                    <div style={{
                        fontSize: '4.5rem',
                        color: '#ffffff',
                        textShadow: '0 0 30px #00ff00, 0 0 60px #00ffff',
                        fontFamily: '"Segoe UI", "Roboto", "Helvetica", sans-serif',
                        fontWeight: 'bold',
                        letterSpacing: 4,
                        animation: 'winnerReveal 0.8s ease-out'
                    }}>
                        {winner || 'DRAW'}
                    </div>

                    {/* Subtitle */}
                    <div style={{
                        marginTop: 25,
                        fontSize: '1.2rem',
                        color: '#aaa',
                        fontFamily: '"Segoe UI", "Roboto", "Helvetica", sans-serif',
                        letterSpacing: 2
                    }}>
                        LAST ONE STANDING
                    </div>
                </div>
                <style>{`
                    @keyframes winnerGlow {
                        from { box-shadow: 0 0 60px rgba(255,215,0,0.5), 0 0 100px rgba(255,140,0,0.4); }
                        to { box-shadow: 0 0 100px rgba(255,215,0,0.8), 0 0 180px rgba(255,140,0,0.6); }
                    }
                    @keyframes trophyBounce {
                        0%, 100% { transform: translateY(0) rotate(-5deg); }
                        50% { transform: translateY(-10px) rotate(5deg); }
                    }
                    @keyframes winnerReveal {
                        0% { opacity: 0; transform: scale(0.5); letter-spacing: 30px; }
                        60% { transform: scale(1.1); }
                        100% { opacity: 1; transform: scale(1); letter-spacing: 4px; }
                    }
                `}</style>
            </div>
        );
    }

    // Racing UI - minimal for clutter-free gameplay
    return null;
}

const styles = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 2000
    },
    centerOverlay: {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 2000
    },

    // New Lobby Styles
    lobbyBox: {
        backgroundColor: 'rgba(5, 0, 20, 0.95)',
        border: '4px solid #00ffff',
        padding: '40px 60px',
        borderRadius: '24px',
        textAlign: 'center',
        boxShadow: '0 0 60px rgba(0,255,255,0.5), inset 0 0 60px rgba(255,0,255,0.1)',
        animation: 'borderGlow 3s ease-in-out infinite',
        maxWidth: '700px'
    },
    lobbyTitle: {
        fontSize: '3.5rem',
        fontFamily: '"Segoe UI", Arial, sans-serif',
        fontWeight: 800,
        marginBottom: '10px',
        letterSpacing: '4px'
    },
    titleGlow: {
        color: '#ffffff',
        textShadow: '0 0 10px #fff, 0 0 20px #00ffff, 0 0 40px #00ffff'
    },
    titleAccent: {
        color: '#ff00ff',
        textShadow: '0 0 10px #ff00ff, 0 0 30px #ff00ff'
    },

    // Identity Section
    identitySection: {
        margin: '30px 0',
        padding: '20px',
        background: 'linear-gradient(135deg, rgba(255,0,255,0.1), rgba(0,255,255,0.1))',
        borderRadius: '16px',
        border: '2px solid rgba(255,255,255,0.2)'
    },
    maskShowcase: {
        display: 'flex',
        justifyContent: 'center',
        gap: '20px',
        marginBottom: '15px'
    },
    maskIcon: {
        fontSize: '48px',
        transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
    },
    maskInfo: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
    },
    maskName: {
        fontSize: '1.4rem',
        fontWeight: 700,
        color: '#00ffff',
        fontFamily: '"Segoe UI", "Roboto", "Helvetica", sans-serif',
        letterSpacing: '3px',
        textShadow: '0 0 10px #00ffff'
    },
    maskDesc: {
        fontSize: '1rem',
        color: '#aaa',
        fontFamily: '"Segoe UI", "Roboto", "Helvetica", sans-serif'
    },

    // Mystery Banner
    mysteryBanner: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
        margin: '25px 0',
        padding: '20px 30px',
        background: 'linear-gradient(90deg, rgba(255,0,100,0.3), rgba(100,0,255,0.3))',
        borderRadius: '12px',
        border: '2px dashed rgba(255,255,255,0.4)',
        transition: 'transform 0.1s'
    },
    mysteryIcon: {
        fontSize: '32px',
        animation: 'maskPulse 2s ease-in-out infinite'
    },
    mysteryText: {
        display: 'flex',
        flexDirection: 'column',
        textAlign: 'center'
    },
    mysteryTitle: {
        fontSize: '1.5rem',
        fontWeight: 700,
        color: '#ffd700',
        fontFamily: '"Segoe UI", "Roboto", "Helvetica", sans-serif',
        letterSpacing: '2px',
        textShadow: '0 0 15px #ffd700'
    },
    mysterySubtext: {
        fontSize: '1.1rem',
        color: '#ffffff',
        fontFamily: '"Segoe UI", "Roboto", "Helvetica", sans-serif',
        marginTop: '6px',
        opacity: 0.9
    },

    // Join Section
    joinSection: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '15px',
        margin: '25px 0'
    },
    scanPrompt: {
        fontSize: '2rem',
        fontWeight: 700,
        color: '#00ff00',
        fontFamily: '"Segoe UI", "Roboto", "Helvetica", sans-serif',
        textShadow: '0 0 15px #00ff00, 0 0 30px #00ff00',
        letterSpacing: '2px'
    },
    arrowRight: {
        fontSize: '2.5rem',
        animation: 'floatArrow 1s ease-in-out infinite'
    },

    // Controls Grid
    controlsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '15px',
        marginTop: '20px'
    },
    controlItem: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        background: 'rgba(255,255,255,0.08)',
        borderRadius: '10px',
        border: '1px solid rgba(255,255,255,0.15)'
    },
    controlIcon: {
        fontSize: '1.5rem'
    },
    controlLabel: {
        fontSize: '1rem',
        fontWeight: 600,
        color: '#ffffff',
        fontFamily: '"Segoe UI", "Roboto", "Helvetica", sans-serif',
        letterSpacing: '1px'
    },

    // Lobby Timer Styles
    lobbyTimerContainer: {
        marginTop: '30px',
        padding: '15px',
        borderRadius: '12px',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(0, 255, 255, 0.3)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        animation: 'timerFlicker 2s infinite'
    },
    lobbyTimerLabel: {
        fontSize: '0.9rem',
        color: '#00ffff',
        fontWeight: 700,
        letterSpacing: '2px',
        marginBottom: '5px',
        opacity: 0.8
    },
    lobbyTimerValue: {
        fontSize: '2.5rem',
        color: '#ffffff',
        fontWeight: 800,
        fontFamily: '"Segoe UI", "Roboto", "Helvetica", sans-serif',
        textShadow: '0 0 10px #00ffff, 0 0 20px #00ffff'
    },

    // Legacy styles (kept for other states)
    box: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        border: '4px solid #00ffff',
        padding: '60px',
        borderRadius: '20px',
        textAlign: 'center',
        boxShadow: '0 0 50px #00ffff'
    },
    title: {
        fontSize: '3rem',
        color: '#00ffff',
        fontFamily: '"Segoe UI", "Roboto", "Helvetica", sans-serif',
        marginBottom: '20px',
        textShadow: '0 0 10px #00ffff'
    },
    subtitle: {
        fontSize: '1.5rem',
        color: '#ff00ff',
        fontFamily: '"Segoe UI", "Roboto", "Helvetica", sans-serif',
        marginBottom: '30px'
    },
    instruction: {
        fontSize: '1.5rem',
        color: '#ffffff',
        fontFamily: '"Segoe UI", "Roboto", "Helvetica", sans-serif',
        margin: '10px 0'
    },
    bigText: {
        fontFamily: '"Segoe UI", "Roboto", "Helvetica", sans-serif',
        fontWeight: 'bold',
        textShadow: '0 0 30px currentColor'
    }
};
