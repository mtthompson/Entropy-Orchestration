import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

// =============================================================================
// SOCKET CONNECTION
// =============================================================================
// In dev: connects to localhost:3000 with default /socket.io path
// In prod: connects to same host with /api/socket.io path (tailscale strips /api, routes to server)
const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const SERVER_URL = isDev ? 'http://localhost:3000' : window.location.origin;
const socketPath = isDev ? '/socket.io' : '/api/socket.io';
console.log('[DEBUG] Connecting to SERVER_URL:', SERVER_URL, 'path:', socketPath);
const socket = io(SERVER_URL, { query: { role: 'controller' }, path: socketPath });
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
        textAlign: 'center',
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
const MASKS = ['Classic', 'Oni', 'Tech', 'Clown', 'Skull'];

function LobbyScreen({ onJoin, savedIdentity = {}, serverTimer = 0, serverState = 'LOBBY', hasJoined = false }) {
    const [name, setName] = useState(savedIdentity.name || '');
    const [maskIndex, setMaskIndex] = useState(() => {
        const savedMask = savedIdentity.maskType || 'Classic';
        const idx = MASKS.indexOf(savedMask);
        return idx >= 0 ? idx : 0;
    });
    const [isJoining, setIsJoining] = useState(false);

    const handleJoin = () => {
        if (name.trim() && !isJoining && serverState !== 'COUNTDOWN' && !hasJoined) {
            setIsJoining(true);
            onJoin(name.trim(), MASKS[maskIndex]);
        }
    };

    const nextMask = () => setMaskIndex((i) => (i + 1) % MASKS.length);
    const prevMask = () => setMaskIndex((i) => (i - 1 + MASKS.length) % MASKS.length);

    const isButtonDisabled = !name.trim() || isJoining || serverState === 'COUNTDOWN' || hasJoined;

    return (
        <div style={styles.container('#ff00ff')}>
            <h1 style={styles.title}>Entropy Orchestration</h1>

            {/* Lobby Timer */}
            {serverTimer > 0 && (
                <div style={{
                    marginBottom: 20,
                    fontSize: 18,
                    color: '#00ffff',
                    fontWeight: 600,
                    textShadow: '0 0 10px #00ffff'
                }}>
                    Starting in {serverTimer}s...
                </div>
            )}

            {/* Mask Selector */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                marginBottom: 30,
                background: 'rgba(255,255,255,0.1)',
                padding: '10px 20px',
                borderRadius: 12
            }}>
                <button
                    onClick={prevMask}
                    style={{ background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer' }}
                >◀</button>
                <div style={{ textAlign: 'center', width: 100 }}>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>MASK</div>
                    <div style={{ fontSize: 20, fontWeight: 'bold', color: '#00ffff' }}>{MASKS[maskIndex]}</div>
                </div>
                <button
                    onClick={nextMask}
                    style={{ background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer' }}
                >▶</button>
            </div>

            {/* UI State: Joined vs Not Joined */}
            {hasJoined ? (
                <div style={{
                    background: 'rgba(0, 255, 0, 0.1)',
                    border: '2px solid #00ff00',
                    padding: '24px',
                    borderRadius: 16,
                    textAlign: 'center',
                    width: '100%',
                    maxWidth: 300,
                    boxShadow: '0 0 20px rgba(0, 255, 0, 0.2)'
                }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#00ff00', textTransform: 'uppercase', letterSpacing: 2 }}>Joined</div>
                    <div style={{ fontSize: 14, opacity: 0.7, marginTop: 10 }}>Ready to race! Waiting for others...</div>
                </div>
            ) : (
                <>
                    <input
                        type="text"
                        placeholder="Enter your name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        style={styles.input}
                        maxLength={12}
                    />

                    <button
                        style={{
                            ...styles.button('#ff00ff'),
                            opacity: isButtonDisabled ? 0.5 : 1,
                            cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
                            filter: isButtonDisabled ? 'grayscale(0.8)' : 'none'
                        }}
                        onClick={handleJoin}
                        onTouchEnd={(e) => {
                            e.preventDefault();
                            if (!isButtonDisabled) handleJoin();
                        }}
                        disabled={isButtonDisabled}
                    >
                        {serverState === 'COUNTDOWN' ? 'GET READY...' : isJoining ? 'Joining...' : 'Join Race'}
                    </button>
                </>
            )}
        </div>
    );
}

// =============================================================================
// DRIVING SCREEN
// =============================================================================
function DrivingScreen({ playerState }) {
    const [, forceUpdate] = useState(0);
    const [locateCooldown, setLocateCooldown] = useState(0);
    const inputRef = useRef({ steering: 0, throttle: 0, boost: false });
    const lastSentRef = useRef({ steering: 0, throttle: 0, boost: false });

    // Locate cooldown timer
    useEffect(() => {
        if (locateCooldown > 0) {
            const timer = setTimeout(() => setLocateCooldown(c => c - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [locateCooldown]);

    const handleLocate = () => {
        if (locateCooldown > 0) return;
        socket.emit('locateMe');
        setLocateCooldown(5);
        vibrate([100, 50, 100]);
    };

    // Device orientation for steering
    useEffect(() => {
        const handleOrientation = (e) => {
            const tilt = e.gamma || 0;
            // Full 180° tilt range: 90 degrees left/right for full steering
            const normalized = Math.max(-1, Math.min(1, tilt / 90));
            inputRef.current.steering = normalized;
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

        const handleKeyDown = (e) => {
            const key = e.key.toLowerCase();
            keysPressed.add(key);
            updateFromKeys();

            // Fire weapon with F key
            if (key === 'f') handleFire();
        };

        const handleKeyUp = (e) => {
            const key = e.key.toLowerCase();
            keysPressed.delete(key);
            updateFromKeys();
        };

        const updateFromKeys = () => {
            // Throttle
            inputRef.current.throttle = (keysPressed.has('w') || keysPressed.has('arrowup')) ? 1 : 0;

            // Boost
            inputRef.current.boost = keysPressed.has(' ');

            // Steering
            let steer = 0;
            if (keysPressed.has('a') || keysPressed.has('arrowleft')) steer -= 1;
            if (keysPressed.has('d') || keysPressed.has('arrowright')) steer += 1;
            inputRef.current.steering = steer;

            forceUpdate(n => n + 1); // Update UI
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    // Send input at 30Hz - runs once, uses refs
    useEffect(() => {
        console.log('[CONTROLLER] Starting input loop');

        const interval = setInterval(() => {
            const input = { ...inputRef.current };

            // Always send while throttling/boosting, or if changed
            const shouldSend = input.throttle > 0 || input.boost ||
                input.steering !== lastSentRef.current.steering ||
                input.throttle !== lastSentRef.current.throttle ||
                input.boost !== lastSentRef.current.boost;

            if (shouldSend) {
                console.log('[CONTROLLER] Input:', input);
                socket.emit('input', input);
                lastSentRef.current = { ...input };
            }
        }, 33);

        return () => {
            console.log('[CONTROLLER] Stopping input loop');
            clearInterval(interval);
        };
    }, []); // Empty deps - runs once

    const handleThrottleStart = (e) => {
        e.preventDefault();
        inputRef.current.throttle = 1;
        forceUpdate(n => n + 1);
        vibrate(10);
    };

    const handleThrottleEnd = (e) => {
        e.preventDefault();
        inputRef.current.throttle = 0;
        forceUpdate(n => n + 1);
    };

    const handleBoostStart = (e) => {
        e.preventDefault();
        inputRef.current.boost = true;
        forceUpdate(n => n + 1);
        vibrate([50, 30, 50]);
    };

    const handleBoostEnd = (e) => {
        e.preventDefault();
        inputRef.current.boost = false;
        forceUpdate(n => n + 1);
    };

    const handleFire = () => {
        if (playerState?.ammo > 0) {
            socket.emit('fire');
            vibrate([30, 20, 30]);
        }
    };

    const hp = playerState?.hp ?? 100;
    const boost = playerState?.boost ?? 100;
    const ammo = playerState?.ammo ?? 0;
    const weaponType = playerState?.weaponType || 'none';
    const color = playerState?.color || '#ff00ff';
    const isThrottling = inputRef.current.throttle > 0;
    const isBoosting = inputRef.current.boost;
    const steering = inputRef.current.steering;
    const heldItem = playerState?.heldItem;
    const activePowerup = playerState?.activePowerup;

    const handleUseItem = () => {
        if (heldItem) {
            socket.emit('useItem');
            vibrate(50);
        }
    };

    return (
        <div style={styles.container(color)}>
            {/* Health Bar */}
            <div style={{ position: 'relative', ...styles.healthBar.container }}>
                <div style={styles.healthBar.fill(hp, color)} />
                <div style={styles.healthBar.text}>{hp} HP</div>

                {/* Active Powerup Indicator */}
                {activePowerup && (
                    <div style={{
                        position: 'absolute',
                        right: -10,
                        top: -10,
                        padding: '4px 8px',
                        background: '#ff00ff',
                        borderRadius: 20,
                        fontSize: 10,
                        fontWeight: 900,
                        border: '2px solid white',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        boxShadow: '0 0 10px #ff00ff'
                    }}>
                        <span>{activePowerup.type === 'Shield' ? '🛡️' : activePowerup.type === 'Ghost' ? '👻' : '🦾'}</span>
                        <span>{Math.ceil(activePowerup.r / 1000)}s</span>
                    </div>
                )}
            </div>

            {/* Boost Meter */}
            <div style={styles.boostMeter.label}>BOOST</div>
            <div style={styles.boostMeter.container}>
                <div style={styles.boostMeter.fill(boost)} />
            </div>

            {/* Ammo & Locate Row */}
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 12,
                marginTop: 10
            }}>
                {/* Ammo Display */}
                {ammo > 0 && (
                    <div style={{
                        padding: '8px 16px',
                        background: weaponType === 'missile' ? 'rgba(255,100,0,0.3)' : 'rgba(0,200,255,0.3)',
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10
                    }}>
                        <span style={{ fontSize: 20 }}>{weaponType === 'missile' ? '🚀' : '⚡'}</span>
                        <span style={{ fontWeight: 700 }}>{ammo}</span>
                    </div>
                )}

                {/* Locate Button */}
                <div
                    style={{
                        padding: '8px 14px',
                        background: locateCooldown > 0
                            ? 'rgba(100, 100, 100, 0.5)'
                            : 'linear-gradient(135deg, #ffaa00 0%, #ff6600 100%)',
                        borderRadius: 8,
                        border: '2px solid #ffaa00',
                        cursor: locateCooldown > 0 ? 'not-allowed' : 'pointer',
                        opacity: locateCooldown > 0 ? 0.6 : 1,
                        fontWeight: 700,
                        fontSize: 13,
                        boxShadow: locateCooldown > 0 ? 'none' : '0 0 10px rgba(255, 170, 0, 0.4)',
                        transition: 'all 0.2s ease'
                    }}
                    onTouchStart={(e) => { e.preventDefault(); handleLocate(); }}
                    onClick={handleLocate}
                >
                    📍 {locateCooldown > 0 ? locateCooldown : 'FIND'}
                </div>
            </div>

            {/* Steering Indicator */}
            <div style={{ marginTop: 30, marginBottom: 20, textAlign: 'center' }}>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>TILT TO STEER (or A/D keys)</div>
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

            {/* Held Item & Use Button */}
            {heldItem && (
                <div style={{
                    position: 'fixed',
                    right: 20,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 10
                }}>
                    <div style={{
                        width: 70,
                        height: 70,
                        background: 'linear-gradient(135deg, #00ffaa 0%, #00cc88 100%)',
                        borderRadius: '50%',
                        border: '3px solid #ffffff',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        boxShadow: '0 0 20px rgba(0, 255, 170, 0.5)',
                        color: '#000',
                        fontSize: 12,
                        fontWeight: 900,
                        cursor: 'pointer',
                        transition: 'transform 0.1s active'
                    }}
                        onTouchStart={(e) => { e.preventDefault(); handleUseItem(); }}
                        onClick={handleUseItem}
                    >
                        <span style={{ fontSize: 28 }}>
                            {heldItem === 'Repair' ? '🔧' :
                                heldItem === 'Shield' ? '🛡️' :
                                    heldItem === 'Ghost' ? '👻' :
                                        heldItem === 'Juggernaut' ? '🦾' :
                                            heldItem === 'Boost' ? '💨' :
                                                heldItem === '67Meme' ? '🏆' : '📦'}
                        </span>
                        <span>USE</span>
                    </div>
                </div>
            )}

            {/* Controls */}
            <div style={styles.controls}>
                {/* Fire Button (only shows when have ammo) */}
                {ammo > 0 && (
                    <div
                        style={{
                            ...styles.throttleZone(false),
                            height: 60,
                            background: weaponType === 'missile'
                                ? 'linear-gradient(135deg, #ff6600 0%, #ff3300 100%)'
                                : 'linear-gradient(135deg, #00aaff 0%, #0066ff 100%)',
                            border: `3px solid ${weaponType === 'missile' ? '#ff6600' : '#00aaff'}`
                        }}
                        onTouchStart={(e) => { e.preventDefault(); handleFire(); }}
                        onClick={handleFire}
                    >
                        {weaponType === 'missile' ? '🚀' : '⚡'} FIRE (F)
                    </div>
                )}

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
// RESULTS SCREEN - Shown when game ends (WINNER state)
// =============================================================================
function ResultsScreen({ winner, countdown, onBackToLobby }) {
    return (
        <div style={styles.container('#ffd700')}>
            <div style={{
                fontSize: 64,
                marginBottom: 20
            }}>
                🏆
            </div>

            <h2 style={{
                fontSize: 28,
                fontWeight: 700,
                marginBottom: 10,
                textTransform: 'uppercase',
                letterSpacing: 2,
                textShadow: '0 0 20px #ffd700'
            }}>
                GAME OVER
            </h2>

            {winner && (
                <div style={{
                    fontSize: 22,
                    fontWeight: 600,
                    marginBottom: 30,
                    color: '#ffd700',
                    textShadow: '0 0 10px #ffd700'
                }}>
                    Winner: {winner}
                </div>
            )}

            <p style={{
                fontSize: 16,
                opacity: 0.7,
                marginBottom: 20
            }}>
                Returning to lobby in {countdown}s...
            </p>

            <button
                style={{
                    ...styles.button('#ffd700'),
                    marginTop: 20
                }}
                onClick={onBackToLobby}
                onTouchEnd={(e) => {
                    e.preventDefault();
                    onBackToLobby();
                }}
            >
                Back to Lobby
            </button>
        </div>
    );
}

// =============================================================================
// MAIN APP
// =============================================================================
export default function App() {
    const [gameState, setGameState] = useState('lobby'); // lobby, driving, drone, results
    const [serverState, setServerState] = useState('LOBBY'); // LOBBY, COUNTDOWN, RACING, WINNER
    const [playerState, setPlayerState] = useState(null);
    const [playerId, setPlayerId] = useState(null);
    const [winner, setWinner] = useState(null);
    const [serverTimer, setServerTimer] = useState(0); // Track server's timer
    const [demoMessage, setDemoMessage] = useState(null);
    const missingTicksRef = useRef(0); // Track consecutive ticks where player is missing
    const dismissedResultsRef = useRef(false); // Track if user manually dismissed results

    // Load saved name/mask from localStorage for pre-fill
    const getSavedIdentity = () => {
        try {
            return {
                name: localStorage.getItem('entropy_lastName') || '',
                maskType: localStorage.getItem('entropy_lastMask') || 'Classic'
            };
        } catch {
            return { name: '', maskType: 'Classic' };
        }
    };

    // Reset to lobby state
    const resetToLobby = useCallback((message = null) => {
        setGameState('lobby');
        setPlayerId(null);
        setPlayerState(null);
        setWinner(null);
        setServerTimer(0);
        missingTicksRef.current = 0;
        dismissedResultsRef.current = false; // Reset dismissal flag
        if (message) {
            setDemoMessage(message);
            setTimeout(() => setDemoMessage(null), 3000);
        }
    }, []);

    // Manual dismissal of results screen
    const handleDismissResults = () => {
        dismissedResultsRef.current = true;
        resetToLobby();
    };

    useEffect(() => {
        socket.on('joined', ({ id, color, hp }) => {
            console.log('[CONTROLLER] Successfully joined! ID:', id);
            setPlayerId(id);
            setPlayerState({ color, hp, boost: 100, ammo: 0, weaponType: 'none' });

            // Only transition to driving screen if the race is starting or in progress
            // Late joiners (RACING) or start of race (COUNTDOWN) go straight in.
            // Lobby joiners stay in lobby view to see status.
            if (serverState !== 'LOBBY') {
                setGameState('driving');
            }

            missingTicksRef.current = 0;
            dismissedResultsRef.current = false; // Reset dismissal flag
            vibrate(100);
        });

        socket.on('damage', ({ hp, damage }) => {
            setPlayerState(prev => ({ ...prev, hp }));
            // Haptic feedback on damage
            vibrate([100, 50, 100]);
        });

        socket.on('powerup', ({ type, ammo, weaponType }) => {
            if (ammo !== undefined && weaponType !== undefined) {
                setPlayerState(prev => ({ ...prev, ammo, weaponType }));
            }
            vibrate(type === 'Repair' ? [50, 50, 50] : [200]);
        });

        socket.on('becameDrone', () => {
            setGameState('drone');
            vibrate([500, 200, 500]);
        });

        socket.on('wallHit', ({ intensity }) => {
            // Haptic feedback based on impact intensity
            const duration = Math.floor(30 + intensity * 70);
            vibrate(duration);
        });

        // Handle server game state changes (LOBBY, COUNTDOWN, RACING, WINNER)
        socket.on('gameState', ({ state, timer, winner: gameWinner }) => {
            console.log('[CONTROLLER] Server gameState:', state, 'timer:', timer, 'winner:', gameWinner);

            // Sync states
            setServerTimer(timer || 0);
            setServerState(state);

            if (state === 'WINNER') {
                // Only show results if NOT dismissed
                if (!dismissedResultsRef.current) {
                    setWinner(gameWinner || 'Unknown');
                    setGameState('results');
                    // Only vibrate once when entering state
                    if (gameState !== 'results') {
                        vibrate([100, 100, 100, 100, 300]);
                    }
                }
            } else if (state === 'LOBBY') {
                // Server returned to lobby - reset controller if we were in results
                // OR if we were in driving/drone but are no longer in the game (handled by worldState/missingTicks)
                if (gameState === 'results') {
                    resetToLobby();
                }
            } else if (state === 'RACING' || state === 'COUNTDOWN') {
                // Ensure dismissed flag is reset when new game starts
                dismissedResultsRef.current = false;

                // Transition joined players to driving screen
                if (playerId && gameState === 'lobby') {
                    console.log('[CONTROLLER] Joining race in progress/starting');
                    setGameState('driving');
                }
            }
        });

        // Handle demo mode activation
        socket.on('demoMode', ({ active }) => {
            console.log('[CONTROLLER] Demo mode:', active);
            if (active && (gameState === 'driving' || gameState === 'drone')) {
                // Demo mode started while player was in game - return to lobby
                resetToLobby('Demo mode started - rejoin to play!');
            }
        });

        // Handle socket disconnect - reset to lobby
        socket.on('disconnect', (reason) => {
            console.log('[CONTROLLER] Disconnected:', reason);
            // Only reset if we were in-game (not already in lobby)
            if (gameState !== 'lobby') {
                resetToLobby('Connection lost - please rejoin');
            }
        });

        return () => {
            socket.off('joined');
            socket.off('damage');
            socket.off('powerup');
            socket.off('becameDrone');
            socket.off('wallHit');
            socket.off('gameState');
            socket.off('demoMode');
            socket.off('disconnect');
        };
    }, [gameState, resetToLobby, serverState, playerId]);

    // Separate useEffect for worldState to properly track player presence
    useEffect(() => {
        const handleWorldState = (state) => {
            if (playerId && (gameState === 'driving' || gameState === 'drone')) {
                if (state.players[playerId]) {
                    // Player found - update state and reset missing counter
                    const player = state.players[playerId];
                    setPlayerState(prev => {
                        const newState = { ...prev, ...player };

                        // Handle properties that might be arrays/objects if they ever become such,
                        // but for now simple spread handles p, v, q, hp, boost, ammo, weaponType

                        // Special handling to ensure we don't lose color/name from delta if server omits them
                        if (!player.color && prev?.color) newState.color = prev.color;
                        if (!player.name && prev?.name) newState.name = prev.name;

                        return newState;
                    });
                    missingTicksRef.current = 0;
                } else {
                    // Player not in worldState - increment missing counter
                    missingTicksRef.current++;

                    // After 3 ticks (~150ms at 60Hz), assume player is gone
                    if (missingTicksRef.current >= 3) {
                        console.log('[CONTROLLER] Player missing from worldState for 3+ ticks, resetting');
                        resetToLobby();
                    }
                }
            }
        };

        socket.on('worldState', handleWorldState);
        return () => socket.off('worldState', handleWorldState);
    }, [playerId, gameState, resetToLobby]);

    const handleJoin = (name, maskType) => {
        // Save to localStorage for pre-fill on reconnect
        try {
            localStorage.setItem('entropy_lastName', name);
            localStorage.setItem('entropy_lastMask', maskType);
        } catch { /* ignore storage errors */ }

        socket.emit('join', { name, maskType });
    };

    // Render demo message toast if present
    const renderDemoToast = () => {
        if (!demoMessage) return null;
        return (
            <div style={{
                position: 'fixed',
                top: 20,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(255, 100, 0, 0.9)',
                color: '#fff',
                padding: '12px 24px',
                borderRadius: 8,
                fontWeight: 600,
                zIndex: 1000,
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
            }}>
                {demoMessage}
            </div>
        );
    };

    switch (gameState) {
        case 'lobby':
            return (
                <>
                    {renderDemoToast()}
                    <LobbyScreen
                        onJoin={handleJoin}
                        savedIdentity={getSavedIdentity()}
                        serverTimer={serverTimer}
                        serverState={serverState}
                        hasJoined={!!playerId}
                    />
                </>
            );
        case 'driving':
            return <DrivingScreen playerState={playerState} />;
        case 'drone':
            return <DroneScreen />;
        case 'results':
            return (
                <ResultsScreen
                    winner={winner}
                    countdown={serverTimer}
                    onBackToLobby={handleDismissResults}
                />
            );
        default:
            return (
                <LobbyScreen
                    onJoin={handleJoin}
                    savedIdentity={getSavedIdentity()}
                    serverTimer={serverTimer}
                    serverState={serverState}
                    hasJoined={!!playerId}
                />
            );
    }
}
