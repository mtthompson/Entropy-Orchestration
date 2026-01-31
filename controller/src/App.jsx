import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

// =============================================================================
// SOCKET CONNECTION
// =============================================================================
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';
console.log('[DEBUG] Connecting to SERVER_URL:', SERVER_URL);
const socket = io(SERVER_URL, { query: { role: 'controller' } });
socket.on('connect', () => console.log('[DEBUG] Socket connected! ID:', socket.id));
socket.on('connect_error', (err) => console.error('[DEBUG] Socket connection error:', err.message));
socket.on('disconnect', (reason) => console.log('[DEBUG] Socket disconnected:', reason));

// =============================================================================
// STYLES
// =============================================================================
const styles = {
    container: (bgColor) => ({
        width: '100vw',
        height: '100vh',
        background: `linear-gradient(135deg, ${bgColor}22 0%, #0a0012 100%)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        color: '#fff',
        fontFamily: "'Segoe UI', system-ui, sans-serif"
    }),
    title: {
        fontSize: 28,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 4,
        marginBottom: 40,
        textShadow: '0 0 20px #ff00ff, 0 0 40px #ff00ff'
    },
    input: {
        width: '100%',
        maxWidth: 300,
        padding: '16px 24px',
        fontSize: 18,
        border: 'none',
        borderRadius: 12,
        background: 'rgba(255,255,255,0.1)',
        color: '#fff',
        textAlign: 'center',
        marginBottom: 20,
        outline: 'none'
    },
    button: (color) => ({
        width: '100%',
        maxWidth: 300,
        padding: '18px 24px',
        fontSize: 20,
        fontWeight: 700,
        border: 'none',
        borderRadius: 12,
        background: `linear-gradient(135deg, ${color} 0%, ${color}88 100%)`,
        color: '#fff',
        cursor: 'pointer',
        textTransform: 'uppercase',
        letterSpacing: 2,
        boxShadow: `0 0 30px ${color}66`,
        transition: 'transform 0.1s, box-shadow 0.1s'
    }),
    healthBar: {
        container: {
            width: '90%',
            maxWidth: 400,
            height: 40,
            background: 'rgba(0,0,0,0.5)',
            borderRadius: 20,
            overflow: 'hidden',
            marginBottom: 20,
            border: '2px solid rgba(255,255,255,0.2)'
        },
        fill: (hp, color) => ({
            width: `${hp}%`,
            height: '100%',
            background: hp > 50
                ? `linear-gradient(90deg, #00ff00, #88ff00)`
                : hp > 25
                    ? `linear-gradient(90deg, #ffff00, #ff8800)`
                    : `linear-gradient(90deg, #ff0000, #ff4400)`,
            transition: 'width 0.2s',
            boxShadow: hp <= 25 ? '0 0 20px #ff0000' : 'none'
        }),
        text: {
            position: 'absolute',
            width: '100%',
            textAlign: 'center',
            lineHeight: '40px',
            fontWeight: 700,
            fontSize: 18,
            textShadow: '0 0 5px #000'
        }
    },
    controls: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
        flex: 1,
        width: '100%',
        justifyContent: 'flex-end',
        paddingBottom: 40
    },
    throttleZone: (isPressed) => ({
        width: '80%',
        maxWidth: 350,
        height: 200,
        borderRadius: 20,
        background: isPressed
            ? 'linear-gradient(135deg, #00ffff 0%, #0088ff 100%)'
            : 'rgba(0, 255, 255, 0.2)',
        border: '3px solid #00ffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 24,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 2,
        transition: 'background 0.1s',
        userSelect: 'none'
    }),
    boostMeter: {
        container: {
            width: '80%',
            maxWidth: 350,
            height: 20,
            background: 'rgba(0,0,0,0.3)',
            borderRadius: 10,
            overflow: 'hidden',
            marginTop: 10
        },
        fill: (boost) => ({
            width: `${boost}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #ff00ff, #ff66ff)',
            transition: 'width 0.1s'
        }),
        label: {
            fontSize: 12,
            opacity: 0.7,
            marginBottom: 4,
            textTransform: 'uppercase',
            letterSpacing: 1
        }
    },
    steeringIndicator: (steering) => ({
        width: 60,
        height: 60,
        borderRadius: '50%',
        border: '3px solid #ff00ff',
        position: 'relative',
        marginBottom: 20
    }),
    droneButton: (onCooldown) => ({
        width: '80%',
        maxWidth: 350,
        height: 150,
        borderRadius: 20,
        background: onCooldown
            ? 'rgba(100, 100, 100, 0.3)'
            : 'linear-gradient(135deg, #ff0000 0%, #ff6600 100%)',
        border: `3px solid ${onCooldown ? '#666' : '#ff0000'}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 24,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: onCooldown ? '#666' : '#fff',
        cursor: onCooldown ? 'not-allowed' : 'pointer',
        boxShadow: onCooldown ? 'none' : '0 0 40px rgba(255,0,0,0.5)'
    })
};

// =============================================================================
// HAPTIC FEEDBACK
// =============================================================================
function vibrate(pattern) {
    if (navigator.vibrate) {
        navigator.vibrate(pattern);
    }
}

// =============================================================================
// LOBBY SCREEN
// =============================================================================
function LobbyScreen({ onJoin }) {
    const [name, setName] = useState('');

    const handleJoin = () => {
        console.log('[DEBUG] handleJoin called, name:', name, 'trimmed:', name.trim());
        if (name.trim()) {
            console.log('[DEBUG] Calling onJoin with:', name.trim());
            onJoin(name.trim());
        } else {
            console.log('[DEBUG] Name is empty, not joining');
        }
    };

    return (
        <div style={styles.container('#ff00ff')}>
            <h1 style={styles.title}>Entropy</h1>

            <input
                type="text"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={styles.input}
                maxLength={12}
                autoFocus
            />

            <button
                style={styles.button('#ff00ff')}
                onClick={handleJoin}
                onTouchEnd={(e) => {
                    e.preventDefault();
                    handleJoin();
                }}
            >
                Join Race
            </button>
        </div>
    );
}

// =============================================================================
// DRIVING SCREEN
// =============================================================================
function DrivingScreen({ playerState }) {
    const [isThrottling, setIsThrottling] = useState(false);
    const [isBoosting, setIsBoosting] = useState(false);
    const [steering, setSteering] = useState(0);
    const lastInputRef = useRef({ steering: 0, throttle: 0, boost: false });

    // Device orientation for steering
    useEffect(() => {
        const handleOrientation = (e) => {
            // gamma is the left-to-right tilt in degrees
            const tilt = e.gamma || 0;
            // Clamp to -30 to 30 degrees, normalize to -1 to 1
            const normalized = Math.max(-1, Math.min(1, tilt / 30));
            setSteering(normalized);
        };

        if (window.DeviceOrientationEvent) {
            window.addEventListener('deviceorientation', handleOrientation);
        }

        return () => {
            window.removeEventListener('deviceorientation', handleOrientation);
        };
    }, []);

    // Keyboard controls for desktop testing
    useEffect(() => {
        const keysPressed = new Set();

        const updateFromKeys = () => {
            // Throttle: W or ArrowUp
            if (keysPressed.has('w') || keysPressed.has('arrowup')) {
                setIsThrottling(true);
            } else {
                setIsThrottling(false);
            }

            // Boost: Space
            if (keysPressed.has(' ')) {
                setIsBoosting(true);
            } else {
                setIsBoosting(false);
            }

            // Steering: A/D or ArrowLeft/ArrowRight
            let steer = 0;
            if (keysPressed.has('a') || keysPressed.has('arrowleft')) steer -= 1;
            if (keysPressed.has('d') || keysPressed.has('arrowright')) steer += 1;
            setSteering(steer);
        };

        const handleKeyDown = (e) => {
            keysPressed.add(e.key.toLowerCase());
            updateFromKeys();
        };

        const handleKeyUp = (e) => {
            keysPressed.delete(e.key.toLowerCase());
            updateFromKeys();
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    // Send input at 30Hz
    useEffect(() => {
        const interval = setInterval(() => {
            const input = {
                steering,
                throttle: isThrottling ? 1 : 0,
                boost: isBoosting
            };

            // Only send if changed
            if (
                input.steering !== lastInputRef.current.steering ||
                input.throttle !== lastInputRef.current.throttle ||
                input.boost !== lastInputRef.current.boost
            ) {
                socket.emit('input', input);
                lastInputRef.current = input;
            }
        }, 33);

        return () => clearInterval(interval);
    }, [steering, isThrottling, isBoosting]);

    const handleThrottleStart = (e) => {
        e.preventDefault();
        setIsThrottling(true);
        vibrate(10);
    };

    const handleThrottleEnd = (e) => {
        e.preventDefault();
        setIsThrottling(false);
    };

    const handleBoostStart = (e) => {
        e.preventDefault();
        setIsBoosting(true);
        vibrate([50, 30, 50]);
    };

    const handleBoostEnd = (e) => {
        e.preventDefault();
        setIsBoosting(false);
    };

    const hp = playerState?.hp ?? 100;
    const boost = playerState?.boost ?? 100;
    const color = playerState?.color || '#ff00ff';

    return (
        <div style={styles.container(color)}>
            {/* Health Bar */}
            <div style={{ position: 'relative', ...styles.healthBar.container }}>
                <div style={styles.healthBar.fill(hp, color)} />
                <div style={styles.healthBar.text}>{hp} HP</div>
            </div>

            {/* Boost Meter */}
            <div style={styles.boostMeter.label}>BOOST</div>
            <div style={styles.boostMeter.container}>
                <div style={styles.boostMeter.fill(boost)} />
            </div>

            {/* Steering Indicator */}
            <div style={{ marginTop: 30, marginBottom: 20, textAlign: 'center' }}>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>TILT TO STEER</div>
                <div style={{
                    width: 100,
                    height: 10,
                    background: 'rgba(255,255,255,0.2)',
                    borderRadius: 5,
                    position: 'relative',
                    margin: '0 auto'
                }}>
                    <div style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: '#ff00ff',
                        position: 'absolute',
                        top: -5,
                        left: `${50 + steering * 40}%`,
                        transform: 'translateX(-50%)',
                        boxShadow: '0 0 15px #ff00ff'
                    }} />
                </div>
            </div>

            {/* Controls */}
            <div style={styles.controls}>
                {/* Boost Zone (top) */}
                <div
                    style={{
                        ...styles.throttleZone(isBoosting),
                        height: 80,
                        background: isBoosting
                            ? 'linear-gradient(135deg, #ff00ff 0%, #ff66ff 100%)'
                            : 'rgba(255, 0, 255, 0.2)',
                        border: '3px solid #ff00ff'
                    }}
                    onTouchStart={handleBoostStart}
                    onTouchEnd={handleBoostEnd}
                    onMouseDown={handleBoostStart}
                    onMouseUp={handleBoostEnd}
                    onMouseLeave={handleBoostEnd}
                >
                    ⚡ BOOST
                </div>

                {/* Throttle Zone (bottom) */}
                <div
                    style={styles.throttleZone(isThrottling)}
                    onTouchStart={handleThrottleStart}
                    onTouchEnd={handleThrottleEnd}
                    onMouseDown={handleThrottleStart}
                    onMouseUp={handleThrottleEnd}
                    onMouseLeave={handleThrottleEnd}
                >
                    🏎️ THROTTLE
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// DRONE SCREEN
// =============================================================================
function DroneScreen() {
    const [cooldown, setCooldown] = useState(0);
    const [targetPos, setTargetPos] = useState({ x: 0, z: 0 });

    // Cooldown timer
    useEffect(() => {
        if (cooldown > 0) {
            const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [cooldown]);

    const handleDropTrap = () => {
        if (cooldown > 0) return;

        // Random position near center of arena
        const x = (Math.random() - 0.5) * 30;
        const z = (Math.random() - 0.5) * 30;

        socket.emit('spawnTrap', { x, z });
        setCooldown(5);
        vibrate([100, 50, 100, 50, 100]);
    };

    return (
        <div style={styles.container('#666666')}>
            <div style={{
                fontSize: 48,
                marginBottom: 20
            }}>
                👻
            </div>

            <h2 style={{
                fontSize: 24,
                fontWeight: 700,
                marginBottom: 10,
                opacity: 0.8
            }}>
                SPECTATOR MODE
            </h2>

            <p style={{
                fontSize: 14,
                opacity: 0.6,
                marginBottom: 40,
                textAlign: 'center'
            }}>
                You've been eliminated!<br />
                Drop traps to mess with survivors.
            </p>

            <div
                style={styles.droneButton(cooldown > 0)}
                onClick={handleDropTrap}
                onTouchStart={(e) => {
                    e.preventDefault();
                    handleDropTrap();
                }}
            >
                {cooldown > 0 ? (
                    <>
                        <span style={{ fontSize: 36 }}>⏳</span>
                        <span style={{ marginTop: 10 }}>{cooldown}s</span>
                    </>
                ) : (
                    <>
                        <span style={{ fontSize: 36 }}>💣</span>
                        <span style={{ marginTop: 10 }}>DROP TRAP</span>
                    </>
                )}
            </div>
        </div>
    );
}

// =============================================================================
// MAIN APP
// =============================================================================
export default function App() {
    const [gameState, setGameState] = useState('lobby'); // lobby, driving, drone
    const [playerState, setPlayerState] = useState(null);
    const [playerId, setPlayerId] = useState(null);

    useEffect(() => {
        socket.on('joined', ({ id, color, hp }) => {
            setPlayerId(id);
            setPlayerState({ color, hp, boost: 100 });
            setGameState('driving');
            vibrate(100);
        });

        socket.on('damage', ({ hp, damage }) => {
            setPlayerState(prev => ({ ...prev, hp }));
            // Haptic feedback on damage
            vibrate([100, 50, 100]);
        });

        socket.on('powerup', ({ type }) => {
            vibrate(type === 'Repair' ? [50, 50, 50] : [200]);
        });

        socket.on('becameDrone', () => {
            setGameState('drone');
            vibrate([500, 200, 500]);
        });

        socket.on('worldState', (state) => {
            if (playerId && state.players[playerId]) {
                const player = state.players[playerId];
                setPlayerState(prev => ({
                    ...prev,
                    hp: player.hp,
                    boost: player.boost
                }));
            }
        });

        return () => {
            socket.off('joined');
            socket.off('damage');
            socket.off('powerup');
            socket.off('becameDrone');
            socket.off('worldState');
        };
    }, [playerId]);

    const handleJoin = (name) => {
        socket.emit('join', { name });
    };

    switch (gameState) {
        case 'lobby':
            return <LobbyScreen onJoin={handleJoin} />;
        case 'driving':
            return <DrivingScreen playerState={playerState} />;
        case 'drone':
            return <DroneScreen />;
        default:
            return <LobbyScreen onJoin={handleJoin} />;
    }
}
