import React from 'react';

export function GameUI({ gameState, gameTimer, winner }) {
    if (gameState === 'LOBBY') {
        // Only show if NOT counting down (Timer 0). If Timer > 0, we are transitioning.
        // Wait, startCountdown sets state to 'COUNTDOWN' immediately.
        // So this block only shows if state is literally 'LOBBY'.
        // If state is 'LOBBY' and timer is 0, we are waiting.
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
                </div>
            </div>
        );
    }

    if (gameState === 'COUNTDOWN') {
        return (
            <div style={styles.centerOverlay}>
                <h1 style={{ ...styles.bigText, fontSize: '15rem', color: '#ff0055' }}>
                    {gameTimer}
                </h1>
            </div>
        );
    }

    if (gameState === 'WINNER') {
        return (
            <div style={styles.overlay}>
                <div style={styles.box}>
                    <h1 style={styles.title}>WINNER!</h1>
                    <div style={{ fontSize: '4rem', color: '#00ff00', textShadow: '0 0 20px #00ff00' }}>
                        {winner || 'DRAW'}
                    </div>
                </div>
            </div>
        );
    }

    // Racing UI (Timer?) - Maybe just show nothing for clutter-free gameplay
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
