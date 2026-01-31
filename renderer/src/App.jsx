import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Trail, Stars } from '@react-three/drei';
import { EffectComposer, Bloom, ChromaticAberration, Glitch } from '@react-three/postprocessing';
import { BlendFunction, GlitchMode } from 'postprocessing';
import * as THREE from 'three';
import { io } from 'socket.io-client';
import QRCode from 'react-qr-code';

// =============================================================================
// SOCKET CONNECTION
// =============================================================================
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';
const socket = io(SERVER_URL, { query: { role: 'admin' } });

// =============================================================================
// SYNTHWAVE GRID FLOOR
// =============================================================================
function SynthwaveGrid() {
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
            <planeGeometry args={[200, 200]} />
            <meshBasicMaterial color="#1a0a2e" side={THREE.DoubleSide} />
        </mesh>
    );
}

// =============================================================================
// CAR COMPONENT WITH TRAIL
// =============================================================================
function Car({ position, velocity, color, hp, isDying }) {
    const meshRef = useRef();
    const targetPos = useRef(new THREE.Vector3(...position));

    useEffect(() => {
        targetPos.current.set(position[0], position[1], position[2]);
    }, [position]);

    useFrame((state, delta) => {
        if (meshRef.current) {
            meshRef.current.position.lerp(targetPos.current, 0.3);

            // Damage flicker when low HP
            if (hp < 30) {
                meshRef.current.material.emissiveIntensity = Math.sin(state.clock.elapsedTime * 20) * 0.5 + 1;
            }
        }
    });

    const trailColor = new THREE.Color(color);

    return (
        <Trail
            width={2}
            length={8}
            color={trailColor}
            attenuation={(t) => t * t}
        >
            <mesh ref={meshRef} position={position}>
                <sphereGeometry args={[1, 16, 16]} />
                <meshStandardMaterial
                    color={color}
                    emissive={color}
                    emissiveIntensity={0.5}
                    metalness={0.8}
                    roughness={0.2}
                />
            </mesh>
        </Trail>
    );
}

// =============================================================================
// EXPLOSION PARTICLES
// =============================================================================
function Explosion({ position, color, onComplete }) {
    const particlesRef = useRef();
    const [particles] = useState(() => {
        const count = 50;
        const positions = new Float32Array(count * 3);
        const velocities = [];

        for (let i = 0; i < count; i++) {
            positions[i * 3] = position[0];
            positions[i * 3 + 1] = position[1];
            positions[i * 3 + 2] = position[2];

            velocities.push({
                x: (Math.random() - 0.5) * 20,
                y: Math.random() * 15,
                z: (Math.random() - 0.5) * 20
            });
        }

        return { positions, velocities, count };
    });

    const [life, setLife] = useState(1);

    useFrame((state, delta) => {
        if (particlesRef.current && life > 0) {
            const positions = particlesRef.current.geometry.attributes.position.array;

            for (let i = 0; i < particles.count; i++) {
                positions[i * 3] += particles.velocities[i].x * delta;
                positions[i * 3 + 1] += particles.velocities[i].y * delta;
                positions[i * 3 + 2] += particles.velocities[i].z * delta;
                particles.velocities[i].y -= 20 * delta; // Gravity
            }

            particlesRef.current.geometry.attributes.position.needsUpdate = true;
            particlesRef.current.material.opacity = life;

            setLife(l => l - delta * 0.8);

            if (life <= 0) onComplete?.();
        }
    });

    return (
        <points ref={particlesRef}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={particles.count}
                    array={particles.positions}
                    itemSize={3}
                />
            </bufferGeometry>
            <pointsMaterial
                size={0.5}
                color={color}
                transparent
                opacity={life}
                blending={THREE.AdditiveBlending}
            />
        </points>
    );
}

// =============================================================================
// POWERUP VISUAL
// =============================================================================
function Powerup({ position, type }) {
    const meshRef = useRef();
    const color = type === 'Repair' ? '#00ff00' : '#ffff00';

    useFrame((state) => {
        if (meshRef.current) {
            meshRef.current.rotation.y = state.clock.elapsedTime * 2;
            meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 3) * 0.3;
        }
    });

    return (
        <mesh ref={meshRef} position={position}>
            <octahedronGeometry args={[0.8, 0]} />
            <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={1}
                wireframe
            />
        </mesh>
    );
}

// =============================================================================
// TRAP VISUAL
// =============================================================================
function Trap({ position }) {
    const meshRef = useRef();

    useFrame((state) => {
        if (meshRef.current) {
            meshRef.current.material.emissiveIntensity = Math.sin(state.clock.elapsedTime * 5) * 0.3 + 0.7;
        }
    });

    return (
        <mesh ref={meshRef} position={position}>
            <boxGeometry args={[2, 1, 2]} />
            <meshStandardMaterial
                color="#ff0000"
                emissive="#ff0000"
                emissiveIntensity={0.5}
                transparent
                opacity={0.7}
            />
        </mesh>
    );
}

// =============================================================================
// CAMERA CONTROLLER - PACK LEADER CAM
// =============================================================================
function CameraController({ players }) {
    const { camera } = useThree();
    const targetPos = useRef(new THREE.Vector3(0, 20, 30));

    useFrame(() => {
        // Get top 3 players by Z position (leaders)
        const activePlayers = Object.values(players).filter(p => p.type === 'driver' && p.position);

        if (activePlayers.length > 0) {
            const sorted = activePlayers.sort((a, b) => a.position.z - b.position.z);
            const top3 = sorted.slice(0, 3);

            const avgX = top3.reduce((sum, p) => sum + p.position.x, 0) / top3.length;
            const avgZ = top3.reduce((sum, p) => sum + p.position.z, 0) / top3.length;

            targetPos.current.set(avgX, 25, avgZ + 35);
        }

        camera.position.lerp(targetPos.current, 0.02);
        camera.lookAt(targetPos.current.x, 0, targetPos.current.z - 35);
    });

    return null;
}

// =============================================================================
// MAIN SCENE
// =============================================================================
function Scene({ worldState }) {
    const [explosions, setExplosions] = useState([]);
    const prevPlayersRef = useRef({});

    // Detect player eliminations for explosions
    useEffect(() => {
        const prevPlayers = prevPlayersRef.current;
        const currentPlayers = worldState.players || {};

        // Check for players that died (were drivers, now drones or removed)
        for (const [id, prev] of Object.entries(prevPlayers)) {
            if (prev.type === 'driver' && prev.position) {
                const current = currentPlayers[id];
                if (!current || current.type === 'drone') {
                    // Player died - create explosion
                    setExplosions(exps => [...exps, {
                        id: `exp-${id}-${Date.now()}`,
                        position: [prev.position.x, prev.position.y, prev.position.z],
                        color: prev.color
                    }]);
                }
            }
        }

        prevPlayersRef.current = { ...currentPlayers };
    }, [worldState.players]);

    const removeExplosion = (id) => {
        setExplosions(exps => exps.filter(e => e.id !== id));
    };

    return (
        <>
            <color attach="background" args={['#0a0012']} />
            <fog attach="fog" args={['#0a0012', 30, 100]} />

            <ambientLight intensity={0.2} />
            <pointLight position={[0, 50, 0]} intensity={1} color="#ff00ff" />
            <pointLight position={[20, 30, 20]} intensity={0.5} color="#00ffff" />

            <Stars radius={100} depth={50} count={2000} factor={4} saturation={0} fade speed={1} />

            <SynthwaveGrid />

            <CameraController players={worldState.players || {}} />

            {/* Cars */}
            {Object.entries(worldState.players || {}).map(([id, player]) => {
                if (player.type !== 'driver' || !player.position) return null;
                return (
                    <Car
                        key={id}
                        position={[player.position.x, player.position.y, player.position.z]}
                        velocity={player.velocity}
                        color={player.color}
                        hp={player.hp}
                    />
                );
            })}

            {/* Powerups */}
            {Object.entries(worldState.powerups || {}).map(([id, powerup]) => (
                <Powerup
                    key={id}
                    position={[powerup.position.x, powerup.position.y, powerup.position.z]}
                    type={powerup.type}
                />
            ))}

            {/* Traps */}
            {Object.entries(worldState.traps || {}).map(([id, trap]) => (
                <Trap
                    key={id}
                    position={[trap.position.x, trap.position.y, trap.position.z]}
                />
            ))}

            {/* Explosions */}
            {explosions.map(exp => (
                <Explosion
                    key={exp.id}
                    position={exp.position}
                    color={exp.color}
                    onComplete={() => removeExplosion(exp.id)}
                />
            ))}

            {/* Post Processing */}
            <EffectComposer>
                <Bloom
                    intensity={0.8}
                    luminanceThreshold={0.4}
                    luminanceSmoothing={0.9}
                />
                <ChromaticAberration
                    blendFunction={BlendFunction.NORMAL}
                    offset={[0.001, 0.001]}
                />
            </EffectComposer>
        </>
    );
}

// =============================================================================
// QR OVERLAY
// =============================================================================
function QROverlay() {
    return (
        <div style={{
            position: 'fixed',
            top: 20,
            right: 20,
            padding: 16,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderRadius: 12,
            boxShadow: '0 0 30px rgba(255, 0, 255, 0.5)',
            zIndex: 1000
        }}>
            <QRCode value="https://jam.gimongous.net" size={120} />
            <div style={{
                textAlign: 'center',
                marginTop: 8,
                fontFamily: 'monospace',
                fontSize: 10,
                color: '#0a0012'
            }}>
                jam.gimongous.net
            </div>
        </div>
    );
}

// =============================================================================
// PLAYER LIST OVERLAY
// =============================================================================
function PlayerList({ players }) {
    const activePlayers = Object.entries(players || {}).filter(([, p]) => p.type === 'driver');

    return (
        <div style={{
            position: 'fixed',
            top: 20,
            left: 20,
            fontFamily: 'monospace',
            color: '#fff',
            textShadow: '0 0 10px #ff00ff',
            zIndex: 1000
        }}>
            <div style={{ fontSize: 14, marginBottom: 8, opacity: 0.7 }}>
                PLAYERS: {activePlayers.length}
            </div>
            {activePlayers.map(([id, player]) => (
                <div key={id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 4
                }}>
                    <div style={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        backgroundColor: player.color,
                        boxShadow: `0 0 10px ${player.color}`
                    }} />
                    <span style={{ fontSize: 12 }}>{player.name}</span>
                    <div style={{
                        width: 60,
                        height: 6,
                        backgroundColor: '#333',
                        borderRadius: 3,
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            width: `${player.hp}%`,
                            height: '100%',
                            backgroundColor: player.hp > 50 ? '#00ff00' : player.hp > 25 ? '#ffff00' : '#ff0000',
                            transition: 'width 0.2s'
                        }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

// =============================================================================
// MAIN APP
// =============================================================================
export default function App() {
    const [worldState, setWorldState] = useState({
        players: {},
        powerups: {},
        traps: {}
    });
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        socket.on('connect', () => {
            console.log('Connected to server');
            setConnected(true);
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from server');
            setConnected(false);
        });

        socket.on('worldState', (state) => {
            setWorldState(state);
        });

        return () => {
            socket.off('connect');
            socket.off('disconnect');
            socket.off('worldState');
        };
    }, []);

    return (
        <div style={{ width: '100vw', height: '100vh' }}>
            <Canvas
                camera={{ position: [0, 20, 30], fov: 60 }}
                gl={{ antialias: true, alpha: false }}
            >
                <Scene worldState={worldState} />
            </Canvas>

            <QROverlay />
            <PlayerList players={worldState.players} />

            {!connected && (
                <div style={{
                    position: 'fixed',
                    bottom: 20,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    padding: '10px 20px',
                    backgroundColor: 'rgba(255, 0, 0, 0.8)',
                    color: '#fff',
                    fontFamily: 'monospace',
                    borderRadius: 8,
                    zIndex: 1000
                }}>
                    ⚠️ DISCONNECTED FROM SERVER
                </div>
            )}
        </div>
    );
}
