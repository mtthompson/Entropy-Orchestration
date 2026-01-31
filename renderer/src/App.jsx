import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Trail, Stars, Environment } from '@react-three/drei';
import { EffectComposer, Bloom, ChromaticAberration, Glitch, N8AO, SSR, DepthOfField, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, GlitchMode, ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { io } from 'socket.io-client';
import QRCode from 'react-qr-code';
import { Scenery } from './Scenery';
import { GameUI } from './GameUI';
import { useAudio } from './useAudio';
import { ToastNotification } from './ToastNotification';
import { AdminPanel } from './AdminPanel';
import { PerformanceOverlay } from './PerformanceOverlay';

// =============================================================================
// SOCKET CONNECTION
// =============================================================================
// In dev: connects to localhost:3000 with default /socket.io path
// In prod: connects to same host with /api/socket.io path (tailscale strips /api, routes to server)
const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const SERVER_URL = isDev ? 'http://localhost:3000' : window.location.origin;
const socketPath = isDev ? '/socket.io' : '/api/socket.io';
const socket = io(SERVER_URL, { query: { role: 'admin' }, path: socketPath });

// =============================================================================
// SYNTHWAVE GRID FLOOR - Enhanced with Shader
// =============================================================================
function SynthwaveGrid({ floorSize, graphicsSettings, theme }) {
    const width = floorSize?.width || 250;
    const depth = floorSize?.depth || 250;
    
    // Use theme colors or fallback to defaults
    const primaryColor = theme?.primaryColor || '#ff00ff';
    const secondaryColor = theme?.secondaryColor || '#00ffff';
    const floorColor = theme?.floorColor || '#0a051a';
    const meshRef = useRef();
    const gridRef = useRef();

    // Animated grid scroll effect
    useFrame((state) => {
        if (gridRef.current) {
            gridRef.current.position.z = (state.clock.elapsedTime * 5) % 10 - 5;
        }
    });

    const envIntensity = graphicsSettings?.enableHDR ? 1.2 : 0.5;

    return (
        <group>
            {/* Reflective base floor */}
            <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
                <planeGeometry args={[width * 1.5, depth * 1.5, 64, 64]} />
                <meshStandardMaterial
                    color={floorColor}
                    metalness={1.0}
                    roughness={0.2}
                    envMapIntensity={envIntensity}
                />
            </mesh>

            {/* Animated grid lines - multiple layers for depth */}
            <group ref={gridRef}>
                <gridHelper
                    args={[Math.max(width, depth) * 1.5, 60, primaryColor, new THREE.Color(primaryColor).offsetHSL(0, 0, -0.2).getHexString()]}
                    position={[0, 0.02, 0]}
                />
            </group>

            {/* Secondary grid for parallax effect */}
            <gridHelper
                args={[Math.max(width, depth), 30, secondaryColor, new THREE.Color(secondaryColor).offsetHSL(0, 0, -0.2).getHexString()]}
                position={[0, 0.03, 0]}
            />

            {/* Fog floor edge glow */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
                <ringGeometry args={[Math.max(width, depth) * 0.5, Math.max(width, depth) * 0.8, 64]} />
                <meshBasicMaterial color={primaryColor} transparent opacity={0.1} side={THREE.DoubleSide} />
            </mesh>
        </group>
    );
}

// =============================================================================
// CAR COMPONENT WITH TRAIL
// =============================================================================
function Car({ position, velocity, color, hp, isDying, maskType }) {
    const meshRef = useRef();
    const targetPos = useRef(new THREE.Vector3(...position));

    useEffect(() => {
        targetPos.current.set(position[0], position[1], position[2]);
    }, [position]);

    useFrame((state, delta) => {
        if (meshRef.current) {
            meshRef.current.position.lerp(targetPos.current, 0.3);
            if (hp < 30) {
                // Flash whole group?
                meshRef.current.children.forEach(c => {
                    if (c.material) c.material.emissiveIntensity = Math.sin(state.clock.elapsedTime * 20) * 0.5 + 1;
                });
            }
            // Rotate based on movement 
            if (Math.abs(velocity.x) > 0.1 || Math.abs(velocity.z) > 0.1) {
                meshRef.current.rotation.y = Math.atan2(velocity.x, velocity.z);
            }
        }
    });

    const trailColor = new THREE.Color(color);

    // MASK GEOMETRY SWITCHER
    const GeometricModel = () => {
        const mat = <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} metalness={0.9} roughness={0.3} />;
        const blackMat = <meshStandardMaterial color="#222" metalness={0.1} roughness={0.9} />;

        const Wheels = () => (
            <>
                <mesh position={[0.8, -0.3, 0.8]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.3, 0.3, 0.4, 12]} />
                    {blackMat}
                </mesh>
                <mesh position={[-0.8, -0.3, 0.8]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.3, 0.3, 0.4, 12]} />
                    {blackMat}
                </mesh>
                <mesh position={[0.8, -0.3, -0.8]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.3, 0.3, 0.4, 12]} />
                    {blackMat}
                </mesh>
                <mesh position={[-0.8, -0.3, -0.8]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.3, 0.3, 0.4, 12]} />
                    {blackMat}
                </mesh>
            </>
        );

        switch (maskType) {
            case 'Oni': // Spiky Aggressive
                return (
                    <group>
                        {/* Body */}
                        <mesh position={[0, 0, 0]}>
                            <boxGeometry args={[1.6, 0.6, 2.5]} />
                            {mat}
                        </mesh>
                        {/* Horns */}
                        <mesh position={[0.5, 0.5, 1]} rotation={[Math.PI / 4, 0, 0]}>
                            <coneGeometry args={[0.2, 0.8, 8]} />
                            {mat}
                        </mesh>
                        <mesh position={[-0.5, 0.5, 1]} rotation={[Math.PI / 4, 0, 0]}>
                            <coneGeometry args={[0.2, 0.8, 8]} />
                            {mat}
                        </mesh>
                        <Wheels />
                    </group>
                );
            case 'Tech': // Boxy Cyberpunk
                return (
                    <group>
                        <mesh position={[0, 0, 0]}>
                            <boxGeometry args={[1.4, 0.5, 3]} />
                            {mat}
                        </mesh>
                        <mesh position={[0, 0.4, -0.5]}>
                            <boxGeometry args={[1.0, 0.4, 1.2]} />
                            <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={0.5} />
                        </mesh>
                        <Wheels />
                    </group>
                );
            case 'Clown': // Wacky Round
                return (
                    <group>
                        <mesh position={[0, 0, 0]}>
                            <capsuleGeometry args={[0.7, 1.5, 4, 8]} rotation={[Math.PI / 2, 0, 0]} /> {/* Capsule need latest drei or three? three has it. */}
                            {/* Fallback to cylinder/sphere if capsule fails: Sphere scale */}
                            <sphereGeometry args={[1, 16, 16]} />
                            {mat}
                        </mesh>
                        <mesh position={[0, 0.8, 0]}>
                            <sphereGeometry args={[0.4]} />
                            <meshStandardMaterial color="red" emissive="red" />
                        </mesh>
                        <Wheels />
                    </group>
                );
            case 'Classic':
            default: // Arcade Racer
                return (
                    <group>
                        <mesh position={[0, -0.2, 0]}>
                            <boxGeometry args={[1.6, 0.5, 3]} />
                            {mat}
                        </mesh>
                        <mesh position={[0, 0.3, -0.2]}>
                            <boxGeometry args={[1.2, 0.5, 1.5]} />
                            {mat}
                        </mesh>
                        {/* Spoiler */}
                        <mesh position={[0, 0.6, 1.2]}>
                            <boxGeometry args={[1.6, 0.1, 0.4]} />
                            {mat}
                        </mesh>
                        <Wheels />
                    </group>
                );
        }
    };

    // Calculate speed for visual effects - use ref to avoid re-renders every frame
    const engineFlameRef = useRef(0);
    const flameRef = useRef();
    const underglowRef = useRef();

    useFrame((state) => {
        if (meshRef.current && velocity) {
            // Pulse effect based on speed
            const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
            engineFlameRef.current = Math.min(1, speed / 20);
            
            // Update flame mesh directly without state
            if (flameRef.current) {
                const ef = engineFlameRef.current;
                flameRef.current.visible = ef > 0.1;
                if (ef > 0.1) {
                    flameRef.current.scale.set(0.4 + ef * 0.3, 0.3 + ef * 0.2, 0.5 + ef * 1.5);
                    flameRef.current.material.opacity = 0.6 + ef * 0.3;
                }
            }
            if (underglowRef.current) {
                underglowRef.current.intensity = 0.8 + engineFlameRef.current * 0.5;
            }
        }
    });

    return (
        <Trail width={3} length={10} color={trailColor} attenuation={(t) => t * t}>
            <group ref={meshRef} position={position} castShadow receiveShadow>
                <GeometricModel />

                {/* Engine Flame Effect - controlled via ref */}
                <mesh ref={flameRef} position={[0, 0.1, 1.5]} visible={false}>
                    <coneGeometry args={[1, 2, 8]} />
                    <meshBasicMaterial
                        color="#ff6600"
                        transparent
                        opacity={0.6}
                        blending={THREE.AdditiveBlending}
                    />
                </mesh>

                {/* Underglow - controlled via ref */}
                <pointLight
                    ref={underglowRef}
                    position={[0, -0.5, 0]}
                    color={color}
                    intensity={0.8}
                    distance={6}
                />
            </group>
        </Trail>
    );
}

// =============================================================================
// EXPLOSION PARTICLES
// =============================================================================
// =============================================================================
// EXPLOSION PARTICLES (SPRITE BASED)
// =============================================================================
function Explosion({ position, color, onComplete }) {
    const texture = useMemo(() => new THREE.TextureLoader().load('/explosion.png'), []);
    const lifeRef = useRef(1);
    const spriteRef = useRef();
    const completedRef = useRef(false);

    useFrame((state, delta) => {
        if (completedRef.current) return;
        
        lifeRef.current -= delta * 2;
        
        if (lifeRef.current <= 0) {
            completedRef.current = true;
            onComplete?.();
            return;
        }
        
        // Update sprite directly without state
        if (spriteRef.current) {
            const life = lifeRef.current;
            const scale = 5 + (1 - life) * 5;
            spriteRef.current.scale.set(scale, scale, 1);
            spriteRef.current.material.opacity = life;
        }
    });

    return (
        <group position={position}>
            <sprite ref={spriteRef} scale={[5, 5, 1]}>
                <spriteMaterial map={texture} color={color} transparent opacity={1} blending={THREE.AdditiveBlending} />
            </sprite>
        </group>
    );
}

// =============================================================================
// POWERUP VISUAL
// =============================================================================
function Powerup({ position, type }) {
    const meshRef = useRef();
    const glowRef = useRef();
    const beaconRef = useRef();

    // Color based on powerup type
    const POWERUP_COLORS = {
        'Repair': '#00ff00',
        'Boost': '#ffff00',
        'Shield': '#00ffff',
        'Ghost': '#ffffff',
        'Juggernaut': '#ff0066',
        'Weapon': '#ff6600'
    };
    const color = POWERUP_COLORS[type] || '#ff00ff';

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        if (meshRef.current) {
            meshRef.current.rotation.y = t * 3;
            meshRef.current.rotation.x = Math.sin(t * 2) * 0.3;
            meshRef.current.position.y = position[1] + Math.sin(t * 3) * 0.5 + 0.5;
        }
        if (glowRef.current) {
            glowRef.current.scale.setScalar(1.5 + Math.sin(t * 6) * 0.3);
            glowRef.current.material.opacity = 0.3 + Math.sin(t * 8) * 0.2;
        }
        if (beaconRef.current) {
            beaconRef.current.material.opacity = 0.15 + Math.sin(t * 4) * 0.1;
        }
    });

    return (
        <group position={position}>
            {/* Main pickup mesh */}
            <mesh ref={meshRef}>
                <octahedronGeometry args={[0.9, 0]} />
                <meshStandardMaterial
                    color={color}
                    emissive={color}
                    emissiveIntensity={2}
                    wireframe
                />
            </mesh>

            {/* Outer pulsing glow */}
            <mesh ref={glowRef}>
                <sphereGeometry args={[1.2, 16, 16]} />
                <meshBasicMaterial
                    color={color}
                    transparent
                    opacity={0.3}
                    blending={THREE.AdditiveBlending}
                />
            </mesh>

            {/* Beacon ray shooting upward */}
            <mesh ref={beaconRef} position={[0, 10, 0]}>
                <cylinderGeometry args={[0.1, 0.5, 20, 8]} />
                <meshBasicMaterial
                    color={color}
                    transparent
                    opacity={0.2}
                    blending={THREE.AdditiveBlending}
                />
            </mesh>

            {/* Animated rings */}
            <mesh position={[0, 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <ringGeometry args={[1.5, 1.7, 16]} />
                <meshBasicMaterial color={color} transparent opacity={0.5} side={THREE.DoubleSide} />
            </mesh>

            {/* Point light for area effect */}
            <pointLight color={color} intensity={1.5} distance={8} />
        </group>
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
// PROJECTILE VISUAL
// =============================================================================
function Projectile({ position, direction, type }) {
    const meshRef = useRef();
    const startTime = useRef(Date.now());
    const [visible, setVisible] = useState(true);

    // Projectile colors based on type
    const color = type === 'missile' ? '#ff6600' : '#00aaff';

    useFrame((state, delta) => {
        if (!meshRef.current || !visible) return;

        // Move projectile forward
        const speed = type === 'missile' ? 60 : 100;
        meshRef.current.position.x += direction.x * speed * delta;
        meshRef.current.position.z += direction.z * speed * delta;

        // Animate glow
        const t = state.clock.elapsedTime;
        meshRef.current.material.emissiveIntensity = 2 + Math.sin(t * 20) * 0.5;

        // Auto-hide after 2 seconds
        if (Date.now() - startTime.current > 2000) {
            setVisible(false);
        }
    });

    if (!visible) return null;

    return (
        <group position={position}>
            {/* Main projectile body */}
            <mesh ref={meshRef}>
                {type === 'missile' ? (
                    <coneGeometry args={[0.3, 1.2, 8]} />
                ) : (
                    <cylinderGeometry args={[0.1, 0.1, 2, 8]} />
                )}
                <meshStandardMaterial
                    color={color}
                    emissive={color}
                    emissiveIntensity={2.5}
                />
            </mesh>

            {/* Glowing trail sphere */}
            <mesh position={[0, 0, 0.5]}>
                <sphereGeometry args={[0.4, 8, 8]} />
                <meshBasicMaterial
                    color={color}
                    transparent
                    opacity={0.6}
                    blending={THREE.AdditiveBlending}
                />
            </mesh>

            {/* Point light for glow effect */}
            <pointLight color={color} intensity={2} distance={5} />
        </group>
    );
}

// =============================================================================
// DEMO MODE INDICATOR
// =============================================================================
function DemoModeIndicator({ active }) {
    if (!active) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'linear-gradient(135deg, #ff00ff88, #00ffff88)',
            borderRadius: 12,
            padding: '12px 30px',
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: 6,
            textTransform: 'uppercase',
            color: '#fff',
            textShadow: '0 0 20px #ff00ff, 0 0 40px #00ffff',
            animation: 'pulse 1s ease-in-out infinite',
            zIndex: 1000
        }}>
            DEMO MODE
        </div>
    );
}

// =============================================================================
// LEADERBOARD DISPLAY
// =============================================================================
function LeaderboardDisplay({ entries, visible }) {
    if (!visible || entries.length === 0) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 100,
            right: 20,
            background: 'rgba(0, 0, 0, 0.85)',
            borderRadius: 12,
            padding: 16,
            minWidth: 220,
            border: '2px solid #ff00ff',
            boxShadow: '0 0 30px rgba(255, 0, 255, 0.4)',
            zIndex: 900
        }}>
            <div style={{
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: 3,
                textTransform: 'uppercase',
                color: '#ff00ff',
                marginBottom: 12,
                textAlign: 'center'
            }}>
                🏆 LEADERBOARD
            </div>
            {entries.slice(0, 5).map((entry, i) => (
                <div key={entry.name} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 0',
                    borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.1)' : 'none',
                    color: i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#fff'
                }}>
                    <span style={{ fontWeight: 600 }}>
                        {i === 0 ? '👑' : i + 1 + '.'} {entry.name}
                    </span>
                    <span style={{ opacity: 0.8, fontSize: 12 }}>
                        {entry.wins}W / {entry.kills}K
                    </span>
                </div>
            ))}
        </div>
    );
}

// =============================================================================
// ELIMINATION REVEAL BANNER
// =============================================================================
// Shows when a player is eliminated, revealing their true identity
function EliminationBanner({ eliminations }) {
    // eliminations is an array of { name, maskType, color, timestamp }
    const visibleEliminations = eliminations.filter(e =>
        Date.now() - e.timestamp < 4000 // Show for 4 seconds
    );

    if (visibleEliminations.length === 0) return null;

    return (
        <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 2000,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            pointerEvents: 'none'
        }}>
            {visibleEliminations.map((elim, i) => {
                const age = Date.now() - elim.timestamp;
                const opacity = Math.max(0, 1 - (age / 4000));
                const scale = 1 + (age < 500 ? (1 - age / 500) * 0.3 : 0);
                const maskIcon = MASK_ICONS[elim.maskType] || '🎭';

                return (
                    <div key={elim.timestamp + i} style={{
                        background: 'linear-gradient(135deg, rgba(255,0,100,0.9), rgba(100,0,255,0.8))',
                        padding: '20px 40px',
                        borderRadius: 12,
                        textAlign: 'center',
                        fontFamily: 'monospace',
                        boxShadow: `0 0 40px ${elim.color}, 0 0 80px rgba(255,0,255,0.5)`,
                        border: `3px solid ${elim.color}`,
                        opacity: opacity,
                        transform: `scale(${scale})`,
                        animation: 'eliminationPulse 0.5s ease-out'
                    }}>
                        <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 4 }}>
                            💀 UNMASKED 💀
                        </div>
                        <div style={{ fontSize: 32, marginBottom: 4 }}>
                            {maskIcon}
                        </div>
                        <div style={{
                            fontSize: 24,
                            fontWeight: 700,
                            color: elim.color,
                            textShadow: `0 0 20px ${elim.color}`
                        }}>
                            {elim.name}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                            WAS ELIMINATED
                        </div>
                    </div>
                );
            })}

            <style>{`
                @keyframes eliminationPulse {
                    0% { transform: scale(1.5); opacity: 0; }
                    50% { transform: scale(1.1); }
                    100% { transform: scale(1); opacity: 1; }
                }
            `}</style>
        </div>
    );
}

// =============================================================================
// CHECKERED LINE (Start/Finish)
// =============================================================================
function CheckeredLine({ p1, p2, color1 = '#ffffff', color2 = '#000000' }) {
    // Calculate position, rotation, length
    const length = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.z - p1.z, 2));
    const centerX = (p1.x + p2.x) / 2;
    const centerZ = (p1.z + p2.z) / 2;
    const angle = Math.atan2(p2.z - p1.z, p2.x - p1.x);

    // Create a texture for checkerboard
    const texture = useMemo(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = color1;
        ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = color2;
        ctx.fillRect(0, 0, 32, 32);
        ctx.fillRect(32, 32, 32, 32);
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }, [color1, color2]);

    texture.repeat.set(length / 2, 1);

    return (
        <group position={[centerX, 0.05, centerZ]} rotation={[-Math.PI / 2, 0, -angle]}>
            <mesh>
                <planeGeometry args={[length, 4]} />
                <meshBasicMaterial map={texture} side={THREE.DoubleSide} />
            </mesh>
            {/* Poles */}
            <mesh position={[-length / 2, 2, 2]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.2, 0.2, 4]} />
                <meshStandardMaterial color="#fff" />
            </mesh>
            <mesh position={[length / 2, 2, 2]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.2, 0.2, 4]} />
                <meshStandardMaterial color="#fff" />
            </mesh>
            {/* Flag Banner */}
            <mesh position={[0, 4, 2]} rotation={[Math.PI / 2, 0, 0]}>
                <boxGeometry args={[length, 1, 0.1]} />
                <meshStandardMaterial color="#333" />
            </mesh>
        </group>
    );
}

// =============================================================================
// TRACK WALL COMPONENT
// =============================================================================
function TrackWall({ wall, theme }) {
    const wallColor = theme?.wallColor || '#ff00ff';
    const primaryColor = theme?.primaryColor || '#ff00ff';
    const secondaryColor = theme?.secondaryColor || '#00ffff';
    const meshRef = useRef();
    const scanRef = useRef();

    // Calculate wall dimensions and position
    const length = Math.sqrt(
        Math.pow(wall.x2 - wall.x1, 2) + Math.pow(wall.z2 - wall.z1, 2)
    );
    const centerX = (wall.x1 + wall.x2) / 2;
    const centerZ = (wall.z1 + wall.z2) / 2;
    const angle = Math.atan2(wall.z2 - wall.z1, wall.x2 - wall.x1);
    const height = wall.height || 5;

    // Animate glow and scan line
    useFrame((state) => {
        if (meshRef.current) {
            meshRef.current.material.emissiveIntensity =
                0.5 + Math.sin(state.clock.elapsedTime * 2) * 0.3;
        }
        if (scanRef.current) {
            // Scan line moves up and down
            scanRef.current.position.y = (Math.sin(state.clock.elapsedTime * 3) * 0.4 + 0.5) * height;
        }
    });

    return (
        <group position={[centerX, 0, centerZ]} rotation={[0, -angle, 0]}>
            {/* Main wall panel */}
            <mesh ref={meshRef} position={[0, height / 2, 0]}>
                <boxGeometry args={[length, height, 0.08]} />
                <meshStandardMaterial
                    color={new THREE.Color(wallColor).offsetHSL(0, 0, -0.3).getHexString()}
                    emissive={wallColor}
                    emissiveIntensity={0.5}
                    metalness={0.8}
                    roughness={0.2}
                    side={THREE.DoubleSide}
                />
            </mesh>

            {/* Neon edge frame - top */}
            <mesh position={[0, height, 0]}>
                <boxGeometry args={[length + 0.1, 0.15, 0.12]} />
                <meshBasicMaterial color={primaryColor} />
            </mesh>

            {/* Neon edge frame - bottom */}
            <mesh position={[0, 0.08, 0]}>
                <boxGeometry args={[length + 0.1, 0.15, 0.12]} />
                <meshBasicMaterial color={secondaryColor} />
            </mesh>

            {/* Animated scan line */}
            <mesh ref={scanRef} position={[0, height / 2, 0.05]}>
                <planeGeometry args={[length - 0.2, 0.1]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
            </mesh>

            {/* Glow light */}
            <pointLight
                position={[0, height / 2, 0.5]}
                color={primaryColor}
                intensity={0.3}
                distance={8}
            />
        </group>
    );
}


// =============================================================================
// TRACK BOUNDARIES - Container for all walls
// =============================================================================
function TrackBoundaries({ boundaries, theme }) {
    if (!boundaries) return null;
    return (
        <group>
            {boundaries.map((wall, i) => (
                <TrackWall key={i} wall={wall} theme={theme} />
            ))}
        </group>
    );
}

// =============================================================================
// CAMERA SHAKE EFFECT
// =============================================================================
function CameraShake({ intensity = 0 }) {
    const { camera } = useThree();
    const originalPos = useRef(new THREE.Vector3());
    const isShaking = useRef(false);

    useEffect(() => {
        if (intensity > 0 && !isShaking.current) {
            originalPos.current.copy(camera.position);
            isShaking.current = true;
        }
    }, [intensity, camera]);

    useFrame(() => {
        if (intensity > 0) {
            const shake = intensity * 0.5;
            camera.position.x = originalPos.current.x + (Math.random() - 0.5) * shake;
            camera.position.y = originalPos.current.y + (Math.random() - 0.5) * shake * 0.5;
            camera.position.z = originalPos.current.z + (Math.random() - 0.5) * shake;
        } else if (isShaking.current) {
            isShaking.current = false;
        }
    });

    return null;
}

// =============================================================================
// SPEED LINES EFFECT (During Boost)
// =============================================================================
function SpeedLines({ active, color = '#ffffff' }) {
    const linesRef = useRef();
    const positions = useMemo(() => {
        const pts = [];
        for (let i = 0; i < 50; i++) {
            pts.push(
                (Math.random() - 0.5) * 80,  // x
                Math.random() * 30 + 5,       // y
                Math.random() * -100 - 20     // z (behind camera)
            );
        }
        return new Float32Array(pts);
    }, []);

    useFrame((state, delta) => {
        if (!linesRef.current || !active) return;

        const pos = linesRef.current.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            pos.setZ(i, pos.getZ(i) + 80 * delta);
            if (pos.getZ(i) > 50) {
                pos.setZ(i, Math.random() * -100 - 50);
                pos.setX(i, (Math.random() - 0.5) * 80);
            }
        }
        pos.needsUpdate = true;
    });

    if (!active) return null;

    return (
        <points ref={linesRef}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={50}
                    array={positions}
                    itemSize={3}
                />
            </bufferGeometry>
            <pointsMaterial
                size={0.5}
                color={color}
                transparent
                opacity={0.8}
                blending={THREE.AdditiveBlending}
            />
        </points>
    );
}

// =============================================================================
// SCREEN FLASH EFFECT (On Damage)
// =============================================================================
function ScreenFlash({ active, color = '#ff0000' }) {
    const [opacity, setOpacity] = useState(0);

    useEffect(() => {
        if (active) {
            setOpacity(0.4);
            const timer = setTimeout(() => setOpacity(0), 150);
            return () => clearTimeout(timer);
        }
    }, [active]);

    if (opacity === 0) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: color,
            opacity: opacity,
            pointerEvents: 'none',
            transition: 'opacity 0.15s',
            zIndex: 2000
        }} />
    );
}

// =============================================================================
// LOBBY FLYING CAMERA - Orbits the track while waiting
// =============================================================================
function FlyingCamera({ trackData }) {
    const { camera } = useThree();
    const timeRef = useRef(0);

    // Initialize camera position immediately on mount
    useEffect(() => {
        const trackWidth = trackData?.floorSize?.width || 250;
        const trackDepth = trackData?.floorSize?.depth || 250;
        const radius = Math.max(trackWidth, trackDepth) * 0.6;
        
        // Set initial position
        camera.position.set(radius * 1.2, 30, 0);
        camera.lookAt(0, 5, 0);
    }, [camera, trackData]);

    useFrame((state, delta) => {
        timeRef.current += delta * 0.3; // Slow orbit speed
        const t = timeRef.current;

        // Get track dimensions for orbiting
        const trackWidth = trackData?.floorSize?.width || 250;
        const trackDepth = trackData?.floorSize?.depth || 250;
        const radius = Math.max(trackWidth, trackDepth) * 0.6;

        // Calculate orbit position - figure-8 pattern for dynamic feel
        const x = Math.cos(t) * radius * 1.2;
        const z = Math.sin(t * 2) * radius * 0.5; // Double frequency for figure-8
        const y = 30 + Math.sin(t * 0.5) * 10; // Gentle up/down motion

        camera.position.set(x, y, z);
        
        // Look at center with slight offset for dynamic feel
        camera.lookAt(
            Math.sin(t * 0.5) * 20,
            5,
            Math.cos(t * 0.5) * 20
        );
    });

    return null;
}

// =============================================================================
// CAMERA CONTROLLER - PACK LEADER CAM
// =============================================================================
function CameraController({ players, gameState }) {
    const { camera } = useThree();
    const targetPos = useRef(new THREE.Vector3(0, 20, 30));
    const targetLookAt = useRef(new THREE.Vector3(0, 0, -30));
    // Smooth velocity for camera
    const smoothVel = useRef(new THREE.Vector3(0, 0, -1));
    const initialized = useRef(false);

    // Initialize camera position immediately when players are available
    useEffect(() => {
        const activePlayers = Object.values(players).filter(p => p.type === 'driver' && p.position);
        
        if (activePlayers.length > 0 && !initialized.current) {
            const sorted = activePlayers.sort((a, b) => a.position.z - b.position.z);
            const topPack = sorted.slice(0, 3);
            
            const avgX = topPack.reduce((sum, p) => sum + p.position.x, 0) / topPack.length;
            const avgZ = topPack.reduce((sum, p) => sum + p.position.z, 0) / topPack.length;
            
            camera.position.set(avgX, 25, avgZ + 35);
            camera.lookAt(avgX, 0, avgZ);
            initialized.current = true;
        }
    }, [players, camera]);

    useFrame((state, delta) => {
        // During demo mode, follow action even in LOBBY state
        // Otherwise, only follow during active game states
        const shouldFollow = gameState === 'PLAYING' || gameState === 'COUNTDOWN';
        if (!shouldFollow) {
            return;
        }

        // Get top 3 players by Z position
        const activePlayers = Object.values(players).filter(p => p.type === 'driver' && p.position);

        if (activePlayers.length > 0) {
            const sorted = activePlayers.sort((a, b) => a.position.z - b.position.z);
            const topPack = sorted.slice(0, 3);

            // Calculate center of pack
            const avgX = topPack.reduce((sum, p) => sum + p.position.x, 0) / topPack.length;
            const avgZ = topPack.reduce((sum, p) => sum + p.position.z, 0) / topPack.length;

            // Calculate average velocity of pack
            let avgVelX = 0;
            let avgVelZ = 0;
            let count = 0;

            for (const p of topPack) {
                if (p.velocity) {
                    avgVelX += p.velocity.x;
                    avgVelZ += p.velocity.z;
                    count++;
                }
            }

            if (count > 0) {
                avgVelX /= count;
                avgVelZ /= count;
            }

            // Update smooth velocity
            const currentDir = new THREE.Vector3(avgVelX, 0, avgVelZ);
            // If moving fast enough, update direction
            if (currentDir.length() > 5) {
                currentDir.normalize();
                smoothVel.current.lerp(currentDir, 0.05);
            }

            // Camera Offset: behind movement direction
            const cameraDist = 35;
            const cameraHeight = 25;

            // Position camera behind pack
            targetPos.current.set(
                avgX - smoothVel.current.x * cameraDist,
                cameraHeight,
                avgZ - smoothVel.current.z * cameraDist
            );

            // Look ahead of pack
            targetLookAt.current.set(
                avgX + smoothVel.current.x * 20,
                0,
                avgZ + smoothVel.current.z * 20
            );
        }

        camera.position.lerp(targetPos.current, 0.05);

        // Smooth lookAt
        const currentLook = new THREE.Vector3();
        camera.getWorldDirection(currentLook);
        const lookTarget = targetLookAt.current.clone().sub(camera.position).normalize();
        currentLook.lerp(lookTarget, 0.05);
        const focusPoint = camera.position.clone().add(currentLook.multiplyScalar(10));

        camera.lookAt(focusPoint);
    });

    return null;
}

// =============================================================================
// MAIN SCENE
// =============================================================================
function Scene({ worldState, trackData, theme, setEngineRpm, gameState, isDemo, graphicsSettings, onPerformanceUpdate }) {
    const [explosions, setExplosions] = useState([]);
    const prevPlayersRef = useRef({});
    const { gl } = useThree();
    
    // Performance monitoring
    const lastTime = useRef(performance.now());
    const frameCount = useRef(0);
    const fpsBuffer = useRef([]);
    
    useFrame(() => {
        const now = performance.now();
        const delta = now - lastTime.current;
        
        if (delta > 0) {
            const fps = 1000 / delta;
            fpsBuffer.current.push(fps);
            if (fpsBuffer.current.length > 60) fpsBuffer.current.shift();
            
            frameCount.current++;
            if (frameCount.current % 30 === 0) {
                const avgFps = Math.round(fpsBuffer.current.reduce((a, b) => a + b, 0) / fpsBuffer.current.length);
                onPerformanceUpdate?.({
                    fps: avgFps,
                    drawCalls: gl.info.render.calls,
                    particles: 0 // Will be updated by particle system
                });
            }
        }
        lastTime.current = now;
    });

    // Engine audio reactive to average player velocity
    useEffect(() => {
        if (!setEngineRpm) return;
        const players = Object.values(worldState.players || {});
        const drivers = players.filter(p => p.type === 'driver' && p.velocity);

        if (drivers.length > 0) {
            // Calculate average velocity magnitude
            const avgVelocity = drivers.reduce((sum, p) => {
                const vMag = Math.sqrt(p.velocity.x ** 2 + p.velocity.z ** 2);
                return sum + vMag;
            }, 0) / drivers.length;

            // Map velocity (0-40) to RPM (0-1)
            const rpm = Math.min(1, avgVelocity / 40);
            setEngineRpm(rpm);
        }
    }, [worldState.players, setEngineRpm]);

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

    // Track-specific HDR environment presets
    const envPresetMap = {
        'stadium': 'sunset',
        'industrial': 'warehouse',
        'neon_forest': 'forest',
        'nature': 'park',
        'volcanic': 'night',
        'dragon': 'dawn',
        'mystic': 'park',
        'classic': 'city',
        'warning': 'apartment',
        'speed': 'studio',
        'roman': 'dawn',
        'prison': 'lobby'
    };
    
    const envPreset = trackData?.theme?.sceneryType 
        ? envPresetMap[trackData.theme.sceneryType] || 'sunset'
        : 'sunset';

    return (
        <>
            <color attach="background" args={['#0a0012']} />
            <fog attach="fog" args={['#0a0012', 30, 250]} />

            {/* HDR Environment Mapping */}
            {graphicsSettings?.enableHDR && (
                <Environment 
                    preset={envPreset}
                    background={false}
                    environmentIntensity={0.8}
                />
            )}

            {/* Realistic Directional Lighting with Shadows */}
            <ambientLight intensity={0.3} />
            {graphicsSettings?.shadowQuality > 0 ? (
                <>
                    <directionalLight
                        position={[-30, 50, 30]}
                        intensity={1.5}
                        color="#ffffff"
                        castShadow
                        shadow-mapSize-width={graphicsSettings.shadowQuality}
                        shadow-mapSize-height={graphicsSettings.shadowQuality}
                        shadow-camera-left={-80}
                        shadow-camera-right={80}
                        shadow-camera-top={80}
                        shadow-camera-bottom={-80}
                        shadow-camera-near={0.1}
                        shadow-camera-far={200}
                        shadow-bias={-0.0001}
                        shadow-normalBias={0.02}
                    />
                    <directionalLight
                        position={[30, 40, -30]}
                        intensity={0.8}
                        color="#ff00ff"
                        castShadow
                        shadow-mapSize-width={graphicsSettings.shadowQuality}
                        shadow-mapSize-height={graphicsSettings.shadowQuality}
                        shadow-camera-left={-80}
                        shadow-camera-right={80}
                        shadow-camera-top={80}
                        shadow-camera-bottom={-80}
                        shadow-bias={-0.0001}
                    />
                </>
            ) : (
                <>
                    <pointLight position={[0, 50, 0]} intensity={1} color="#ff00ff" />
                    <pointLight position={[20, 30, 20]} intensity={0.5} color="#00ffff" />
                </>
            )}

            <Stars radius={100} depth={50} count={2000} factor={4} saturation={0} fade speed={1} />

            <SynthwaveGrid floorSize={trackData?.floorSize} graphicsSettings={graphicsSettings} theme={theme} />
            <Scenery trackData={trackData} graphicsSettings={graphicsSettings} />

            {/* Track Walls */}
            <TrackBoundaries boundaries={trackData?.boundaries} theme={theme} />

            {/* Start/Finish Lines */}
            {trackData?.startLine && (
                <CheckeredLine
                    p1={{ x: trackData.startLine.x1, z: trackData.startLine.z1 }}
                    p2={{ x: trackData.startLine.x2, z: trackData.startLine.z2 }}
                    color1="#00ff00" color2="#ffffff"
                />
            )}
            {trackData?.finishLine && (
                <CheckeredLine
                    p1={{ x: trackData.finishLine.x1, z: trackData.finishLine.z1 }}
                    p2={{ x: trackData.finishLine.x2, z: trackData.finishLine.z2 }}
                />
            )}

            {/* Camera system - Flying camera for lobby (non-demo), pack-following for active game and demo mode */}
            {gameState === 'LOBBY' && !isDemo ? (
                <FlyingCamera trackData={trackData} />
            ) : (
                <CameraController players={worldState.players || {}} gameState={gameState} />
            )}

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
                        maskType={player.maskType}
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

            {/* Post Processing - RTX 4070 Enhanced */}
            <EffectComposer multisampling={8}>
                {/* SSAO - Screen Space Ambient Occlusion */}
                {graphicsSettings?.enableSSAO && (
                    <N8AO 
                        aoRadius={2}
                        intensity={1.5}
                        quality="performance"
                    />
                )}

                {/* SSR - Screen Space Reflections */}
                {graphicsSettings?.enableSSR && (
                    <SSR
                        intensity={0.45}
                        exponent={1}
                        distance={10}
                        fade={2}
                        roughnessFade={1}
                        thickness={10}
                        ior={1.45}
                        maxRoughness={1}
                        maxDepthDifference={10}
                        blend={0.95}
                        correction={1}
                        correctionRadius={1}
                        blur={0.5}
                        blurKernel={1}
                        blurSharpness={10}
                    />
                )}

                {/* Depth of Field */}
                {graphicsSettings?.enableDOF && (
                    <DepthOfField
                        focusDistance={0.02}
                        focalLength={0.05}
                        bokehScale={3}
                        height={480}
                    />
                )}

                {/* Bloom */}
                {graphicsSettings?.enableBloom && (
                    <Bloom
                        intensity={graphicsSettings.bloomIntensity || 0.8}
                        luminanceThreshold={0.3}
                        luminanceSmoothing={0.8}
                        mipmapBlur={true}
                        radius={0.8}
                    />
                )}

                {/* Tone Mapping */}
                {graphicsSettings?.toneMapping && graphicsSettings.toneMapping !== 'None' && (
                    <ToneMapping 
                        mode={ToneMappingMode[graphicsSettings.toneMapping] || ToneMappingMode.ACES_FILMIC} 
                    />
                )}

                {/* Chromatic Aberration */}
                <ChromaticAberration
                    blendFunction={BlendFunction.NORMAL}
                    offset={[0.0005, 0.0005]}
                />
                
                {/* Vignette for cinematic look */}
                <Vignette 
                    offset={0.5}
                    darkness={0.5}
                    eskil={false}
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
// Mask Icons by type
const MASK_ICONS = {
    Classic: '🎭',
    Oni: '👹',
    Tech: '🤖',
    Clown: '🤡',
    Skull: '💀'
};

function PlayerList({ players, gameState }) {
    const activePlayers = Object.entries(players || {}).filter(([, p]) => p.type === 'driver');
    const isRacing = gameState === 'RACING' || gameState === 'COUNTDOWN';

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
                {isRacing ? '🎭 MASKED RACERS' : 'PLAYERS'}: {activePlayers.length}
            </div>
            {activePlayers.map(([id, player], index) => {
                // During race, hide real identity
                const displayName = isRacing
                    ? `MASKED RACER #${index + 1}`
                    : player.name;
                const maskIcon = MASK_ICONS[player.maskType] || '🎭';

                // Glow intensity based on HP
                const glowIntensity = player.hp / 100;
                const isLowHP = player.hp < 30;

                return (
                    <div key={id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 4,
                        animation: isLowHP ? 'pulse 0.5s infinite' : 'none'
                    }}>
                        {/* Mask icon instead of color dot */}
                        <span style={{
                            fontSize: 16,
                            filter: `drop-shadow(0 0 ${4 + glowIntensity * 6}px ${player.color})`,
                            opacity: 0.5 + glowIntensity * 0.5
                        }}>
                            {maskIcon}
                        </span>
                        <span style={{
                            fontSize: 12,
                            color: isRacing ? '#aaa' : '#fff'
                        }}>
                            {displayName}
                        </span>
                        <div style={{
                            width: 60,
                            height: 6,
                            backgroundColor: '#333',
                            borderRadius: 3,
                            overflow: 'hidden',
                            boxShadow: isLowHP ? '0 0 8px #ff0000' : 'none'
                        }}>
                            <div style={{
                                width: `${player.hp}%`,
                                height: '100%',
                                backgroundColor: player.hp > 50 ? '#00ff00' : player.hp > 25 ? '#ffff00' : '#ff0000',
                                transition: 'width 0.2s',
                                boxShadow: `inset 0 0 ${glowIntensity * 10}px rgba(255,255,255,0.3)`
                            }} />
                        </div>
                    </div>
                );
            })}

            {/* CSS Animation for low HP pulse */}
            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `}</style>
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
    const [gameState, setGameState] = useState({
        state: 'LOBBY',
        timer: 0,
        winner: null,
        isDemo: false
    });
    const [trackData, setTrackData] = useState(null);
    const [connected, setConnected] = useState(false);
    const [projectiles, setProjectiles] = useState([]);
    const [leaderboard, setLeaderboard] = useState([]);
    const [demoMode, setDemoMode] = useState(false);
    const [eliminations, setEliminations] = useState([]);
    const [screenShake, setScreenShake] = useState(0); // 0-1 intensity
    const [trackTheme, setTrackTheme] = useState({
        primaryColor: '#ff00ff',
        secondaryColor: '#00ffff',
        floorColor: '#0a051a',
        gridColor: '#ff00ff',
        wallColor: '#ff00ff',
        skyColor: '#0a0020'
    });
    const prevPlayersRef = useRef({});

    // Admin state
    const [trackList, setTrackList] = useState([]);
    const [cpuCount, setCpuCount] = useState(0);
    const [toasts, setToasts] = useState([]);

    // Graphics Settings with localStorage persistence
    const [graphicsSettings, setGraphicsSettings] = useState(() => {
        const saved = localStorage.getItem('graphicsSettings');
        return saved ? JSON.parse(saved) : {
            shadowQuality: 2048,
            enableHDR: true,
            enableSSAO: true,
            enableSSR: true,
            enableDOF: false,
            enableBloom: true,
            bloomIntensity: 0.8,
            toneMapping: 'ACES',
            particleLimit: 10000,
            showPerformance: false
        };
    });

    // Save graphics settings to localStorage when changed
    useEffect(() => {
        localStorage.setItem('graphicsSettings', JSON.stringify(graphicsSettings));
    }, [graphicsSettings]);

    // Performance monitoring
    const [performanceStats, setPerformanceStats] = useState({ fps: 60, drawCalls: 0, particles: 0 });

    // Audio Hook
    const { initAudio, playSfx, setMusicStyle, setEngineRpm } = useAudio(connected);

    // Toast helper
    const showToast = (message, type = 'info') => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev, { id, message, type, timestamp: Date.now() }]);
    };

    // Track player eliminations for reveal banner
    useEffect(() => {
        const prevPlayers = prevPlayersRef.current;
        const currentPlayers = worldState.players || {};

        // Check for players that were drivers but are now drones/eliminated
        for (const [id, prev] of Object.entries(prevPlayers)) {
            if (prev.type === 'driver' && prev.hp > 0) {
                const current = currentPlayers[id];
                if (!current || current.type === 'drone' || current.hp <= 0) {
                    // Player was eliminated - add to eliminations
                    setEliminations(elims => [...elims, {
                        name: prev.name,
                        maskType: prev.maskType,
                        color: prev.color,
                        timestamp: Date.now()
                    }]);
                    playSfx('explosion');
                }
            }
        }

        // Update ref for next comparison
        prevPlayersRef.current = { ...currentPlayers };

        // Clean up old eliminations (older than 5 seconds)
        setEliminations(elims => elims.filter(e => Date.now() - e.timestamp < 5000));
    }, [worldState.players, playSfx]);

    useEffect(() => {
        socket.on('connect', () => {
            console.log('Connected to server');
            setConnected(true);
            playSfx('join');
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from server');
            setConnected(false);
        });

        socket.on('worldState', (state) => {
            setWorldState(state);
        });

        socket.on('gameState', (state) => {
            setGameState(state);
            if (state.state === 'COUNTDOWN') playSfx('join'); // Ping on countdown
            if (state.state === 'WINNER') playSfx('boost'); // Victory sound
        });

        socket.on('trackData', (data) => {
            console.log('Received track data:', data.name);
            setTrackData(data);
        });

        // Track style with theme colors
        socket.on('trackStyle', (data) => {
            console.log('Track style:', data.trackName, 'Theme:', data.theme);
            if (setMusicStyle) setMusicStyle(data.trackId);
            // Update theme colors if provided
            if (data.theme) {
                setTrackTheme({
                    primaryColor: data.theme.primaryColor || '#ff00ff',
                    secondaryColor: data.theme.secondaryColor || '#00ffff',
                    floorColor: data.theme.floorColor || '#0a051a',
                    gridColor: data.theme.gridColor || '#ff00ff',
                    wallColor: data.theme.wallColor || '#ff00ff',
                    skyColor: data.theme.skyColor || '#0a0020'
                });
            }
        });

        // Leaderboard updates
        socket.on('leaderboard', (data) => {
            setLeaderboard(data);
        });

        // Demo mode indicator
        socket.on('demoMode', (data) => {
            setDemoMode(data.active);
        });

        // Admin-specific events
        socket.on('trackList', (data) => {
            console.log('Received track list:', data.length);
            setTrackList(data);
        });

        socket.on('cpuCount', (count) => {
            console.log('Received CPU count:', count);
            setCpuCount(count);
        });

        // Projectile fired events
        socket.on('projectileFired', (data) => {
            setProjectiles(prev => [...prev, {
                id: Date.now(),
                position: data.position,
                direction: data.direction,
                type: data.type,
                ownerId: data.ownerId
            }]);
        });

        socket.on('damage', (data) => {
            playSfx('crash');
            // Trigger screen shake based on damage amount
            const intensity = Math.min(1, (data?.damage || 20) / 50);
            setScreenShake(intensity);
            setTimeout(() => setScreenShake(0), 200);
        });

        return () => {
            socket.off('trackData');
            socket.off('trackStyle');
            socket.off('leaderboard');
            socket.off('demoMode');
            socket.off('projectileFired');
            socket.off('connect');
            socket.off('disconnect');
            socket.off('worldState');
            socket.off('gameState');
            socket.off('damage');
            socket.off('trackList');
            socket.off('cpuCount');
        };
    }, [playSfx, setMusicStyle]);

    // Keyboard shortcuts for admin controls
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Ignore if user is typing in an input field
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            switch (e.key.toLowerCase()) {
                case ' ': // Space - Start game
                    e.preventDefault();
                    if (gameState.state === 'LOBBY') {
                        socket.emit('startGame');
                        showToast('Starting game...', 'info');
                    }
                    break;
                case 'r': // R - Restart game
                    socket.emit('restartGame');
                    showToast('Restarting game...', 'info');
                    break;
                case '+': // + - Add CPU
                case '=': // = (same key as +)
                    socket.emit('addCPU');
                    showToast('Adding CPU opponent', 'success');
                    break;
                case '-': // - - Remove CPU
                case '_': // _ (same key as -)
                    if (cpuCount > 0) {
                        socket.emit('removeCPU');
                        showToast('Removing CPU opponent', 'success');
                    } else {
                        showToast('No CPUs to remove', 'error');
                    }
                    break;
                default:
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [gameState.state, cpuCount]);

    // Calculate shake offset
    const shakeX = screenShake * (Math.random() - 0.5) * 20;
    const shakeY = screenShake * (Math.random() - 0.5) * 20;

    return (
        <div style={{
            width: '100vw',
            height: '100vh',
            transform: screenShake > 0 ? `translate(${shakeX}px, ${shakeY}px)` : 'none',
            transition: 'transform 0.05s ease-out'
        }} onClick={initAudio}>
            <Canvas
                camera={{ position: [0, 20, 30], fov: 60 }}
                gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
                shadows={graphicsSettings.shadowQuality > 0}
                onCreated={({ gl }) => {
                    if (graphicsSettings.shadowQuality > 0) {
                        gl.shadowMap.enabled = true;
                        gl.shadowMap.type = THREE.PCFSoftShadowMap;
                    }
                }}
            >
                <Scene 
                    worldState={worldState} 
                    trackData={trackData}
                    theme={trackTheme}
                    setEngineRpm={setEngineRpm}
                    gameState={gameState.state}
                    isDemo={gameState.isDemo}
                    graphicsSettings={graphicsSettings}
                    onPerformanceUpdate={setPerformanceStats}
                />
            </Canvas>

            <GameUI
                gameState={gameState.state}
                gameTimer={gameState.timer}
                winner={gameState.winner}
                onCountdownTick={(count) => count > 0 && playSfx('countdown')}
            />
            <QROverlay />
            <PlayerList players={worldState.players} gameState={gameState.state} />
            <DemoModeIndicator active={demoMode} />
            <LeaderboardDisplay entries={leaderboard} visible={gameState.state === 'LOBBY' || demoMode} />
            <EliminationBanner eliminations={eliminations} />

            {/* Admin UI */}
            <ToastNotification toasts={toasts} setToasts={setToasts} />
            <PerformanceOverlay stats={performanceStats} visible={graphicsSettings.showPerformance} />
            <AdminPanel
                socket={socket}
                tracks={trackList}
                currentTrack={trackData}
                cpuCount={cpuCount}
                gameState={gameState.state}
                showToast={showToast}
                graphicsSettings={graphicsSettings}
                onGraphicsChange={setGraphicsSettings}
                performanceStats={performanceStats}
            />

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
