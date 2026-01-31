import React, { useEffect, useState } from 'react';

export function GameUI({ gameState, gameTimer, winner, onCountdownTick }) {
    const [countdownPulse, setCountdownPulse] = useState(false);

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
        return (
            <div style={styles.overlay}>
                <div style={styles.box}>
                    <h1 style={styles.title}>WAITING FOR PLAYERS</h1>
                    <div style={styles.subtitle}>Scan QR Code to Join</div>
                    <div style={{ marginTop: 20 }}>
                        <div style={styles.instruction}>🏎️  Tilt to Steer</div>
                        <div style={styles.instruction}>👆  Tap/Hold to Drive</div>
                        <div style={styles.instruction}>⚡  Tap Top to Boost</div>
                    </div>
                    <div style={{ marginTop: 30, fontSize: '1rem', opacity: 0.6, fontFamily: 'monospace' }}>
                        🎭 Your identity is hidden until elimination
                    </div>
                </div>
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
                    ...styles.box,
                    animation: 'winnerGlow 1s ease-in-out infinite alternate',
                    borderColor: '#ffd700'
                }}>
                    <div style={{ fontSize: '4rem', marginBottom: 10 }}>👑</div>
                    <h1 style={{ ...styles.title, color: '#ffd700' }}>WINNER!</h1>
                    <div style={{
                        fontSize: '4rem',
                        color: '#00ff00',
                        textShadow: '0 0 20px #00ff00, 0 0 40px #00ff00',
                        fontFamily: 'monospace',
                        fontWeight: 'bold'
                    }}>
                        {winner || 'DRAW'}
                    </div>
                    <div style={{ marginTop: 20, fontSize: '1.2rem', opacity: 0.7, fontFamily: 'monospace' }}>
                        🎭 UNMASKED CHAMPION
                    </div>
                </div>
                <style>{`
                    @keyframes winnerGlow {
                        from { box-shadow: 0 0 50px #ffd700, 0 0 100px #ff8c00; }
                        to { box-shadow: 0 0 80px #ffd700, 0 0 150px #ff8c00; }
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
        fontFamily: 'monospace',
        marginBottom: '20px',
        textShadow: '0 0 10px #00ffff'
    },
    subtitle: {
        fontSize: '1.5rem',
        color: '#ff00ff',
        fontFamily: 'monospace',
        marginBottom: '30px'
    },
    instruction: {
        fontSize: '1.5rem',
        color: '#ffffff',
        fontFamily: 'monospace',
        margin: '10px 0'
    },
    bigText: {
        fontFamily: 'monospace',
        fontWeight: 'bold',
        textShadow: '0 0 30px currentColor'
    }
};
