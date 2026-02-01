import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Trail, Stars, Environment, Html } from '@react-three/drei';
import { EffectComposer, Bloom, ChromaticAberration, Glitch, N8AO, DepthOfField, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, GlitchMode, ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { io } from 'socket.io-client';
import QRCode from 'react-qr-code';
import { Scenery } from './Scenery';
import { Audience } from './Audience';
import { TireSmoke, CollisionSparks, AmbientParticles, DustTrail, ParticleExplosion, SpeedLinesEffect } from './ParticleEffects';
import { GameUI } from './GameUI';
// import { useMidiAudio as useAudio } from './useMidiAudio';
import { useAudio } from './useAudio';

import { ToastNotification } from './ToastNotification';
import { AdminPanel } from './AdminPanel';
import { PerformanceOverlay } from './PerformanceOverlay';

// =============================================================================
// SOCKET CONNECTION
// =============================================================================
// In dev: connects to localhost:3000 with default /socket.io path
// In prod: renderer on subdomain connects to main domain at jam.gimongous.net/api
const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const SERVER_URL = isDev ? 'http://localhost:3000' : 'https://jam.gimongous.net';
const socketPath = isDev ? '/socket.io' : '/api/socket.io';
const socket = io(SERVER_URL, { query: { role: 'admin' }, path: socketPath });

const HILL_AMPLIFY = 0.0; // Disabled - flat terrain only

function getTerrainHeight(heightMap, x, z) {
    if (!heightMap || !heightMap.matrix) return 0;

    const { matrix, width, depth, elementSize, gridWidth, gridDepth } = heightMap;

    // Convert world coords to grid coords (Visual TerrainMesh stretches grid to fit width/depth)
    // To match visual mesh, we map [-width/2, width/2] to [0, gridWidth-1]
    const gridX = ((x + width / 2) / width) * (gridWidth - 1);
    const gridZ = ((z + depth / 2) / depth) * (gridDepth - 1);

    // Clamp to grid bounds
    const i0 = Math.max(0, Math.min(gridWidth - 2, Math.floor(gridX)));
    const j0 = Math.max(0, Math.min(gridDepth - 2, Math.floor(gridZ)));
    const i1 = i0 + 1;
    const j1 = j0 + 1;

    // Bilinear interpolation
    const fx = gridX - i0;
    const fz = gridZ - j0;

    const h00 = matrix[i0]?.[j0] || 0;
    const h10 = matrix[i1]?.[j0] || 0;
    const h01 = matrix[i0]?.[j1] || 0;
    const h11 = matrix[i1]?.[j1] || 0;

    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;

    return h0 * (1 - fz) + h1 * fz;
}

const SynthwaveGrid = React.memo(({ floorSize, graphicsSettings, theme }) => {
    const width = floorSize?.width || 250;
    const depth = floorSize?.depth || 250;
    const primaryColor = theme?.primaryColor || '#ff00ff';
    const floorColor = '#1a0a2e'; // Match TerrainMesh color

    return (
        <group>
            {/* Infinite base floor matching terrain color */}
            {/* Raised slightly to ensure it meets the terrain perfectly */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.0, 0]} receiveShadow>
                <planeGeometry args={[10000, 10000]} />
                <meshStandardMaterial
                    color={floorColor}
                    roughness={0.9}
                    metalness={0.1}
                />
            </mesh>
        </group>
    );
});

// =============================================================================
// TERRAIN MESH - Renders hills from heightmap data (off-track terrain)
// =============================================================================
const TerrainMesh = React.memo(({ heightMap, theme, graphicsSettings }) => {
    const meshRef = useRef();

    // Generate terrain geometry with vertex colors
    const geometry = useMemo(() => {
        if (!heightMap || !heightMap.matrix || heightMap.matrix.length === 0) {
            console.log('[TerrainMesh] No heightmap data');
            return null;
        }

        const { matrix, width, depth, gridWidth, gridDepth } = heightMap;
        const geo = new THREE.PlaneGeometry(
            width,
            depth,
            gridWidth - 1,
            gridDepth - 1
        );

        geo.rotateX(-Math.PI / 2);

        const positions = geo.attributes.position.array;
        const vertexCount = positions.length / 3;

        // Prepare color attribute
        const colors = new Float32Array(vertexCount * 3);
        const primaryColor = new THREE.Color(theme?.primaryColor || '#ff00ff');
        const secondaryColor = new THREE.Color(theme?.secondaryColor || '#00ffff');
        const terrainColor = new THREE.Color('#1a0a2e');

        let maxHeight = 0;
        for (let i = 0; i < gridWidth; i++) {
            for (let j = 0; j < gridDepth; j++) {
                const vertIdx = j * gridWidth + i;
                const posIdx = vertIdx * 3;

                if (matrix[i] && matrix[i][j] !== undefined) {
                    const h = matrix[i][j] * HILL_AMPLIFY;
                    positions[posIdx + 1] = h;
                    if (h > maxHeight) maxHeight = h;

                    // Assign color based on height/position
                    const hFactor = Math.max(0, Math.min(1, h / 15)); // Normalize height

                    // Blend from terrain color to primary at peaks
                    const color = terrainColor.clone().lerp(primaryColor, hFactor);

                    // Add some secondary color randomness at peaks
                    if (hFactor > 0.5) {
                        const noise = Math.sin(i * 0.5) * Math.cos(j * 0.5);
                        if (noise > 0.5) {
                            color.lerp(secondaryColor, (hFactor - 0.5) * 2);
                        }
                    }

                    colors[posIdx] = color.r;
                    colors[posIdx + 1] = color.g;
                    colors[posIdx + 2] = color.b;
                }
            }
        }

        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();
        geo.attributes.position.needsUpdate = true;

        return geo;
    }, [heightMap, theme]);

    if (!geometry) return null;

    return (
        <group>
            {/* Main terrain surface - using vertex colors */}
            <mesh
                ref={meshRef}
                geometry={geometry}
                position={[0, 0, 0]}
                receiveShadow
            >
                <meshStandardMaterial
                    vertexColors={true}
                    metalness={0.2}
                    roughness={0.8}
                    flatShading={true}
                />
            </mesh>

            {/* Wireframe overlay */}
            <mesh
                geometry={geometry}
                position={[0, 0.05, 0]}
            >
                <meshBasicMaterial
                    color={theme?.primaryColor || '#ff00ff'}
                    wireframe={true}
                    transparent={true}
                    opacity={0.15}
                />
            </mesh>
        </group>
    );
});

// =============================================================================
// TRACK SURFACE OVERLAY - Renders solid floor inside track boundaries
// =============================================================================
const StartLine = React.memo(({ startLine }) => {
    if (!startLine) return null;

    const { x1, z1, x2, z2 } = startLine;
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;
    const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(z2 - z1, 2));
    const angle = Math.atan2(z2 - z1, x2 - x1);

    return (
        <group position={[cx, 0.22, cz]} rotation={[0, -angle, 0]}>
            {/* Main Checkerboard Line */}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[length, 6]} />
                <meshStandardMaterial
                    color="#ffffff"
                    roughness={0.8}
                    metalness={0.1}
                    side={THREE.DoubleSide}
                />
            </mesh>
            {/* Checkered pattern overlay (approximate with strips) */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
                <planeGeometry args={[length, 6, Math.floor(length / 2), 2]} />
                <meshBasicMaterial
                    color="#000000"
                    wireframe={true}
                    transparent={true}
                    opacity={0.3}
                />
            </mesh>
            {/* Glowing poles at ends */}
            <mesh position={[-length / 2, 2.5, 0]}>
                <cylinderGeometry args={[0.3, 0.3, 5, 8]} />
                <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={2} />
            </mesh>
            <mesh position={[length / 2, 2.5, 0]}>
                <cylinderGeometry args={[0.3, 0.3, 5, 8]} />
                <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={2} />
            </mesh>
        </group>
    );
});

const TrackSurface = React.memo(({ trackData, theme }) => {
    const primaryColor = theme?.primaryColor || '#ff00ff';
    const secondaryColor = theme?.secondaryColor || '#00ffff';

    // Track floor color - bright enough to be clearly distinct from off-track
    const trackFloorColor = '#3a3a5e'; // Lighter blue-gray for track surface

    // Create geometry for arena (single polygon) or race track (outer with inner hole)
    const geometry = useMemo(() => {
        let resultGeo = null;

        // Arena: has floorPolygon (single closed polygon)
        if (trackData?.floorPolygon && trackData.floorPolygon.length >= 3) {
            const shape = new THREE.Shape();
            const pts = trackData.floorPolygon;
            shape.moveTo(pts[0].x, -pts[0].z);
            for (let i = 1; i < pts.length; i++) {
                shape.lineTo(pts[i].x, -pts[i].z);
            }
            shape.lineTo(pts[0].x, -pts[0].z);
            resultGeo = new THREE.ShapeGeometry(shape);
        }

        // Race track: has outerPolygon and innerPolygon
        else if (trackData?.outerPolygon && trackData?.innerPolygon &&
            trackData.outerPolygon.length >= 3 && trackData.innerPolygon.length >= 3) {
            const shape = new THREE.Shape();
            const outer = trackData.outerPolygon;
            const inner = trackData.innerPolygon;

            // Build outer boundary
            shape.moveTo(outer[0].x, -outer[0].z);
            for (let i = 1; i < outer.length; i++) {
                shape.lineTo(outer[i].x, -outer[i].z);
            }
            shape.lineTo(outer[0].x, -outer[0].z);

            // Create hole with inner boundary (reversed winding)
            const hole = new THREE.Path();
            hole.moveTo(inner[0].x, -inner[0].z);
            for (let i = inner.length - 1; i >= 0; i--) {
                hole.lineTo(inner[i].x, -inner[i].z);
            }
            shape.holes.push(hole);

            resultGeo = new THREE.ShapeGeometry(shape);
        }

        if (resultGeo && trackData.heightMap) {
            const posAttr = resultGeo.attributes.position;
            const vertex = new THREE.Vector3();
            // Apply heightmap displacement
            // NOTE: ShapeGeometry is on XY plane. We rotate it -90 on X to lie on XZ.
            // This means geometry Y becomes world -Z.
            // So we query height at (x, -y).
            for (let i = 0; i < posAttr.count; i++) {
                vertex.fromBufferAttribute(posAttr, i);
                const h = getTerrainHeight(trackData.heightMap, vertex.x, -vertex.y);
                const amplifiedH = h * HILL_AMPLIFY;
                // Set Z (which becomes Y after mesh rotation)
                posAttr.setZ(i, amplifiedH);
            }
            resultGeo.computeVertexNormals();
        }

        return resultGeo;
    }, [trackData?.floorPolygon, trackData?.outerPolygon, trackData?.innerPolygon, trackData?.heightMap]);

    if (!geometry) return null;

    return (
        <group>
            {/* Main track floor - solid and bright */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.20, 0]}>
                <primitive object={geometry} attach="geometry" />
                <meshStandardMaterial
                    color={trackFloorColor}
                    metalness={0.4}
                    roughness={0.6}
                />
            </mesh>

            {/* Start Line Overlay */}
            {trackData?.startLine && <StartLine startLine={trackData.startLine} />}
        </group>
    );
});

// =============================================================================
// MASK GEOMETRY SWITCHER - moved outside for performance
const Wheels = ({ blackMat, color }) => (
    <>
        <mesh position={[1.2, -0.4, 1.2]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.45, 0.45, 0.6, 12]} />
            {blackMat}
        </mesh>
        <mesh position={[-1.2, -0.4, 1.2]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.45, 0.45, 0.6, 12]} />
            {blackMat}
        </mesh>
        <mesh position={[1.2, -0.4, -1.2]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.45, 0.45, 0.6, 12]} />
            {blackMat}
        </mesh>
        <mesh position={[-1.2, -0.4, -1.2]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.45, 0.45, 0.6, 12]} />
            {blackMat}
        </mesh>
    </>
);

const GeometricModel = React.memo(({ maskType, color }) => {
    const mat = <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} metalness={0.9} roughness={0.3} />;
    const blackMat = <meshStandardMaterial color="#222" metalness={0.1} roughness={0.9} />;

    switch (maskType) {
        case 'Oni': // Spiky Aggressive
            return (
                <group>
                    <mesh position={[0, 0, 0]}>
                        <boxGeometry args={[2.4, 0.9, 3.7]} />
                        {mat}
                    </mesh>
                    <mesh position={[0.75, 0.75, 1.5]} rotation={[Math.PI / 4, 0, 0]}>
                        <coneGeometry args={[0.3, 1.2, 8]} />
                        {mat}
                    </mesh>
                    <mesh position={[-0.75, 0.75, 1.5]} rotation={[Math.PI / 4, 0, 0]}>
                        <coneGeometry args={[0.3, 1.2, 8]} />
                        {mat}
                    </mesh>
                    <Wheels blackMat={blackMat} color={color} />
                </group>
            );
        case 'Tech': // Boxy Cyberpunk
            return (
                <group>
                    <mesh position={[0, 0, 0]}>
                        <boxGeometry args={[2.1, 0.75, 4.5]} />
                        {mat}
                    </mesh>
                    <mesh position={[0, 0.6, -0.75]}>
                        <boxGeometry args={[1.5, 0.6, 1.8]} />
                        <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={0.5} />
                    </mesh>
                    <Wheels blackMat={blackMat} color={color} />
                </group>
            );
        case 'Clown': // Wacky Round - Fixed weird geometry
            return (
                <group>
                    <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                        <capsuleGeometry args={[1.0, 2.2, 4, 16]} />
                        {mat}
                    </mesh>
                    <mesh position={[0, 1.2, 0.5]}>
                        <sphereGeometry args={[0.6]} />
                        <meshStandardMaterial color="red" emissive="red" />
                    </mesh>
                    <Wheels blackMat={blackMat} color={color} />
                </group>
            );
        case 'Skull': // Sleek & Bony
            return (
                <group>
                    <mesh position={[0, -0.15, 0]}>
                        <boxGeometry args={[1.8, 0.6, 4.8]} />
                        {mat}
                    </mesh>
                    <mesh position={[0, -0.15, -2.7]} rotation={[Math.PI / 2, 0, 0]}>
                        <coneGeometry args={[0.9, 1.2, 4]} />
                        {mat}
                    </mesh>
                    {[1.5, 0.75, 0, -0.75, -1.5].map((z, i) => (
                        <group key={i}>
                            <mesh position={[1.2, -0.15, z]}>
                                <boxGeometry args={[0.6, 0.3, 0.3]} />
                                {mat}
                            </mesh>
                            <mesh position={[-1.2, -0.15, z]}>
                                <boxGeometry args={[0.6, 0.3, 0.3]} />
                                {mat}
                            </mesh>
                        </group>
                    ))}
                    <Wheels blackMat={blackMat} color={color} />
                </group>
            );
        case 'Classic':
        default: // Arcade Racer
            return (
                <group>
                    <mesh position={[0, -0.3, 0]}>
                        <boxGeometry args={[2.4, 0.75, 4.5]} />
                        {mat}
                    </mesh>
                    <mesh position={[0, 0.45, -0.3]}>
                        <boxGeometry args={[1.8, 0.75, 2.2]} />
                        {mat}
                    </mesh>
                    <mesh position={[0, 0.9, 1.8]}>
                        <boxGeometry args={[2.4, 0.15, 0.6]} />
                        {mat}
                    </mesh>
                    <Wheels blackMat={blackMat} color={color} />
                </group>
            );
    }
});

// =============================================================================
// CAR COMPONENT WITH TRAIL
// =============================================================================
const Car = React.memo(({ id, worldStateRef, color, maskType, isLocating }) => {
    const meshRef = useRef();
    const targetPos = useRef(new THREE.Vector3(0, 0, 0));
    const beaconRef = useRef();
    const [boost, setBoost] = useState(100); // Track boost level for speed lines

    // Memoize color to prevent recreation every render
    const trailColor = useMemo(() => new THREE.Color(color), [color]);

    // Track state for effects that need to be reactive
    const effectState = useRef({ hp: 100, velocity: { x: 0, y: 0, z: 0 } });

    useFrame((state, delta) => {
        const player = worldStateRef.current.players[id];
        if (!player || !player.position || !meshRef.current) return;

        const { position, velocity, q: quaternion, hp, boost } = player;
        targetPos.current.set(position.x, position.y, position.z);

        // Physics Interpolation
        meshRef.current.position.lerp(targetPos.current, 0.3);

        if (quaternion) {
            const physicsQuat = new THREE.Quaternion(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
            const correctionQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
            physicsQuat.multiply(correctionQuat);
            meshRef.current.quaternion.slerp(physicsQuat, 0.15);
        } else if (velocity && (Math.abs(velocity.x) > 0.1 || Math.abs(velocity.z) > 0.1)) {
            const targetRotY = Math.atan2(velocity.x, velocity.z);
            const currentRot = meshRef.current.rotation.y;
            meshRef.current.rotation.y += (targetRotY - currentRot) * 0.1;
        }

        // Locate & Damage effects
        if (isLocating) {
            const pulse = Math.sin(state.clock.elapsedTime * 10) * 0.5 + 1.5;
            meshRef.current.scale.lerp(new THREE.Vector3(3, 3, 3), 0.1);
            meshRef.current.children.forEach(c => {
                if (c.material) c.material.emissiveIntensity = pulse;
            });
            if (beaconRef.current) {
                beaconRef.current.material.opacity = Math.sin(state.clock.elapsedTime * 8) * 0.3 + 0.5;
            }
        } else {
            meshRef.current.scale.lerp(new THREE.Vector3(2, 2, 2), 0.1);
            const intensity = hp < 30 ? Math.sin(state.clock.elapsedTime * 20) * 0.5 + 1 : 0.5;
            meshRef.current.children.forEach((c) => {
                if (c.material) c.material.emissiveIntensity = intensity;
            });
        }

        // Speed effects
        const speed = velocity ? Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z) : 0;
        const ef = Math.min(1, speed / 20);
        if (flameRef.current) {
            flameRef.current.visible = ef > 0.1;
            if (ef > 0.1) {
                flameRef.current.scale.set(0.4 + ef * 0.3, 0.3 + ef * 0.2, 0.5 + ef * 1.5);
                flameRef.current.material.opacity = 0.6 + ef * 0.3;
            }
        }
        if (underglowRef.current) {
            underglowRef.current.intensity = 0.8 + ef * 0.5;
        }

        // Update effect refs for children
        effectState.current.velocity = velocity || { x: 0, y: 0, z: 0 };
        effectState.current.hp = hp;
        effectState.current.boost = boost || 0;
        effectState.current.showTireEffects = speed > 5;

        // Update boost state for speed lines effect
        setBoost(boost || 100);
    });

    const flameRef = useRef();
    const underglowRef = useRef();

    return (
        <Trail width={10} length={50} color={trailColor} attenuation={(t) => t * t}>
            <group ref={meshRef} castShadow receiveShadow>
                <GeometricModel maskType={maskType} color={color} />

                {/* Engine Flame Effect */}
                <mesh ref={flameRef} position={[0, 0.1, 1.5]} visible={false}>
                    <coneGeometry args={[1, 2, 8]} />
                    <meshBasicMaterial
                        color="#ff6600"
                        transparent
                        opacity={0.6}
                        blending={THREE.AdditiveBlending}
                    />
                </mesh>

                {/* Underglow */}
                <pointLight
                    ref={underglowRef}
                    position={[0, -0.5, 0]}
                    color={color}
                    intensity={0.8}
                    distance={6}
                />

                {/* Tire Smoke - always rendered, visibility controlled by ref */}
                <TireSmoke position={[1.2, 0, 1.2]} dataRef={effectState} color={color} />
                <TireSmoke position={[-1.2, 0, 1.2]} dataRef={effectState} color={color} />
                <DustTrail position={[0, 0, 1.5]} dataRef={effectState} color="#8b7355" />

                {/* Speed Lines when boosting */}
                <SpeedLinesEffect active={boost < 50} color={color} />

                {/* Locate Beacon */}
                {isLocating && (
                    <mesh ref={beaconRef} position={[0, 10, 0]}>
                        <cylinderGeometry args={[0.4, 0.8, 20, 8]} />
                        <meshStandardMaterial
                            color={color}
                            emissive={color}
                            emissiveIntensity={3}
                            transparent
                            opacity={0.6}
                            side={THREE.DoubleSide}
                        />
                    </mesh>
                )}
            </group>
        </Trail>
    );
});




// =============================================================================
// EXPLOSION PARTICLES (Moved to ParticleEffects.jsx)
// =============================================================================
// Old component removed, using ParticleExplosion instead

// =============================================================================
// POWERUP VISUAL
// =============================================================================
const Powerup = React.memo(({ position, type }) => {
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
        'Weapon': '#ff6600',
        '67Meme': '#67ff67'
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
                {typeof window !== 'undefined' && window.__preloadedAssets && window.__preloadedAssets.octahedronGeometry ? (
                    <primitive object={window.__preloadedAssets.octahedronGeometry} attach="geometry" />
                ) : (
                    <octahedronGeometry args={[0.9, 0]} />
                )}
                {typeof window !== 'undefined' && window.__preloadedAssets && window.__preloadedAssets.powerupMaterials && window.__preloadedAssets.powerupMaterials[type] ? (
                    <primitive object={window.__preloadedAssets.powerupMaterials[type]} attach="material" />
                ) : (
                    <meshStandardMaterial
                        color={color}
                        emissive={color}
                        emissiveIntensity={2}
                        wireframe
                    />
                )}
            </mesh>

            {/* Outer pulsing glow */}
            <mesh ref={glowRef}>
                {typeof window !== 'undefined' && window.__preloadedAssets && window.__preloadedAssets.sphereGeometry ? (
                    <primitive object={window.__preloadedAssets.sphereGeometry} attach="geometry" />
                ) : (
                    <sphereGeometry args={[1.2, 16, 16]} />
                )}
                {typeof window !== 'undefined' && window.__preloadedAssets && window.__preloadedAssets.powerupGlowMaterials && window.__preloadedAssets.powerupGlowMaterials[type] ? (
                    <primitive object={window.__preloadedAssets.powerupGlowMaterials[type]} attach="material" />
                ) : (
                    <meshBasicMaterial
                        color={color}
                        transparent
                        opacity={0.3}
                        blending={THREE.AdditiveBlending}
                    />
                )}
            </mesh>

            {/* Beacon ray shooting upward */}
            <mesh ref={beaconRef} position={[0, 10, 0]}>
                {typeof window !== 'undefined' && window.__preloadedAssets && window.__preloadedAssets.beaconGeometrySmall ? (
                    <primitive object={window.__preloadedAssets.beaconGeometrySmall} attach="geometry" />
                ) : (
                    <cylinderGeometry args={[0.1, 0.5, 20, 8]} />
                )}
                {typeof window !== 'undefined' && window.__preloadedAssets && window.__preloadedAssets.powerupBeaconMaterials && window.__preloadedAssets.powerupBeaconMaterials[type] ? (
                    <primitive object={window.__preloadedAssets.powerupBeaconMaterials[type]} attach="material" />
                ) : (
                    <meshBasicMaterial
                        color={color}
                        transparent
                        opacity={0.2}
                        blending={THREE.AdditiveBlending}
                    />
                )}
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
});

// =============================================================================
// TRAP VISUAL
// =============================================================================
const Trap = React.memo(({ position }) => {
    const meshRef = useRef();

    useFrame((state) => {
        if (meshRef.current) {
            meshRef.current.material.emissiveIntensity = Math.sin(state.clock.elapsedTime * 5) * 0.3 + 0.7;
        }
    });

    return (
        <mesh ref={meshRef} position={position}>
            {typeof window !== 'undefined' && window.__preloadedAssets && window.__preloadedAssets.trapGeometry ? (
                <primitive object={window.__preloadedAssets.trapGeometry} attach="geometry" />
            ) : (
                <boxGeometry args={[2, 1, 2]} />
            )}
            {typeof window !== 'undefined' && window.__preloadedAssets && window.__preloadedAssets.trapMaterial ? (
                <primitive object={window.__preloadedAssets.trapMaterial} attach="material" />
            ) : (
                <meshStandardMaterial
                    color="#ff0000"
                    emissive="#ff0000"
                    emissiveIntensity={0.5}
                    transparent
                    opacity={0.7}
                />
            )}
        </mesh>
    );
});

// =============================================================================
// PROJECTILE VISUAL
// =============================================================================
const Projectile = React.memo(({ id, worldStateRef, type }) => {
    const meshRef = useRef();
    const visible = useRef(true); // Using ref instead of state to avoid re-renders

    // Projectile colors based on type
    const color = type === 'missile' ? '#ff6600' : '#00aaff';

    useFrame((state, delta) => {
        if (!meshRef.current || !visible.current) return;

        // Position update from ref (60Hz)
        const proj = worldStateRef.current.projectiles?.[id];
        if (proj && proj.position) {
            meshRef.current.position.set(proj.position.x, proj.position.y, proj.position.z);
        } else {
            // Projectile no longer in world state
            visible.current = false;
        }

        // Animate glow
        const t = state.clock.elapsedTime;
        meshRef.current.material.emissiveIntensity = 2 + Math.sin(t * 20) * 0.5;

        // Rotate for effect
        meshRef.current.rotation.z += delta * 5;
    });

    if (!visible.current) return null;

    return (
        <group>
            {/* Main projectile body */}
            <mesh ref={meshRef}>
                {type === 'missile' ? (
                    typeof window !== 'undefined' && window.__preloadedAssets && window.__preloadedAssets.missileGeometry ? (
                        <primitive object={window.__preloadedAssets.missileGeometry} attach="geometry" />
                    ) : (
                        <coneGeometry args={[0.3, 1.2, 8]} />
                    )
                ) : (
                    typeof window !== 'undefined' && window.__preloadedAssets && window.__preloadedAssets.laserGeometry ? (
                        <primitive object={window.__preloadedAssets.laserGeometry} attach="geometry" />
                    ) : (
                        <cylinderGeometry args={[0.1, 0.1, 2, 8]} />
                    )
                )}
                {type === 'missile' ? (
                    typeof window !== 'undefined' && window.__preloadedAssets && window.__preloadedAssets.missileMaterial ? (
                        <primitive object={window.__preloadedAssets.missileMaterial} attach="material" />
                    ) : (
                        <meshStandardMaterial color="#ff6600" emissive="#ff6600" emissiveIntensity={2.5} />
                    )
                ) : (
                    typeof window !== 'undefined' && window.__preloadedAssets && window.__preloadedAssets.laserMaterial ? (
                        <primitive object={window.__preloadedAssets.laserMaterial} attach="material" />
                    ) : (
                        <meshStandardMaterial color="#00aaff" emissive="#00aaff" emissiveIntensity={2.5} />
                    )
                )}
            </mesh>

            {/* Glowing trail sphere */}
            <mesh position={[0, 0, 0.5]}>
                {typeof window !== 'undefined' && window.__preloadedAssets && window.__preloadedAssets.projectileTrailGeometry ? (
                    <primitive object={window.__preloadedAssets.projectileTrailGeometry} attach="geometry" />
                ) : (
                    <sphereGeometry args={[0.4, 8, 8]} />
                )}
                {typeof window !== 'undefined' && window.__preloadedAssets && window.__preloadedAssets.projectileTrailMaterial ? (
                    <primitive object={window.__preloadedAssets.projectileTrailMaterial} attach="material" color={color} />
                ) : (
                    <meshBasicMaterial
                        color={color}
                        transparent
                        opacity={0.6}
                        blending={THREE.AdditiveBlending}
                    />
                )}
            </mesh>

            {/* Point light for glow effect */}
            <pointLight color={color} intensity={2} distance={5} />
        </group>
    );
});

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
            top: 300,
            right: 20,
            background: 'rgba(0, 0, 0, 0.85)',
            borderRadius: 12,
            padding: 16,
            minWidth: 220,
            border: '2px solid #ff00ff',
            boxShadow: '0 0 30px rgba(255, 0, 255, 0.4)',
            zIndex: 3000
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
// Shows when a player is eliminated, revealing their true identity with drama!
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
                const scale = 1 + (age < 500 ? (1 - age / 500) * 0.2 : 0);
                const maskIcon = MASK_ICONS[elim.maskType] || '🎭';

                return (
                    <div key={elim.timestamp + i} style={{
                        background: 'linear-gradient(135deg, rgba(20,0,30,0.95), rgba(50,0,80,0.9))',
                        padding: '25px 50px',
                        borderRadius: 16,
                        textAlign: 'center',
                        fontFamily: '"Segoe UI", "Roboto", "Helvetica", sans-serif',
                        boxShadow: `0 0 50px ${elim.color}, 0 0 100px rgba(255,0,255,0.4)`,
                        border: `3px solid ${elim.color}`,
                        opacity: opacity,
                        transform: `scale(${scale})`,
                        animation: 'eliminationSlam 0.3s ease-out'
                    }}>
                        {/* Header */}
                        <div style={{
                            fontSize: 14,
                            letterSpacing: 4,
                            color: '#ff0055',
                            fontWeight: 600,
                            marginBottom: 8
                        }}>
                            💥 ELIMINATED 💥
                        </div>

                        {/* Icon */}
                        <div style={{
                            fontSize: 48,
                            marginBottom: 8,
                            filter: `drop-shadow(0 0 15px ${elim.color})`
                        }}>
                            {maskIcon}
                        </div>

                        {/* Name */}
                        <div style={{
                            fontSize: 32,
                            fontWeight: 700,
                            color: '#ffffff',
                            textShadow: `0 0 20px ${elim.color}`,
                            letterSpacing: 2
                        }}>
                            {elim.name}
                        </div>
                    </div>
                );
            })}

            <style>{`
                @keyframes eliminationSlam {
                    0% { transform: scale(1.5); opacity: 0; }
                    60% { transform: scale(0.95); }
                    100% { transform: scale(1); opacity: 1; }
                }
            `}</style>
        </div>
    );
}

// =============================================================================
// CHECKERED LINE (Start/Finish)
// =============================================================================
const CheckeredLine = React.memo(function CheckeredLine({ p1, p2, color1 = '#ffffff', color2 = '#000000' }) {
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

    const geometry = useMemo(() => new THREE.PlaneGeometry(length, 4), [length]);

    return (
        <group position={[centerX, 0.05, centerZ]} rotation={[-Math.PI / 2, 0, -angle]}>
            <mesh geometry={geometry}>
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
});

// =============================================================================
// TRACK WALL COMPONENT - Memoized for performance (NO useFrame per wall!)
// =============================================================================
const WALL_THICKNESS = 0.8; // Thin walls (match server physics)

const TrackWall = React.memo(function TrackWall({ wall, theme, heightMap }) {
    const wallColor = theme?.wallColor || '#ff00ff';
    const primaryColor = theme?.primaryColor || '#ff00ff';
    const secondaryColor = theme?.secondaryColor || '#00ffff';

    // Use pre-computed values - flat positioning to match server physics
    const { length, centerX, centerZ, angle, height } = useMemo(() => {
        const len = Math.sqrt(
            Math.pow(wall.x2 - wall.x1, 2) + Math.pow(wall.z2 - wall.z1, 2)
        );
        const ang = Math.atan2(wall.z2 - wall.z1, wall.x2 - wall.x1);

        return {
            length: len,
            centerX: (wall.x1 + wall.x2) / 2,
            centerZ: (wall.z1 + wall.z2) / 2,
            angle: ang,
            height: wall.height || 5
        };
    }, [wall]);

    // Memoize materials to prevent recreation
    const darkWallColor = useMemo(() =>
        '#' + new THREE.Color(wallColor).offsetHSL(0, 0, -0.3).getHexString(),
        [wallColor]
    );

    // REMOVED: useFrame animation per wall - was causing 6000+ callbacks/sec
    // Animation now handled by TrackBoundaries with a single shared useFrame

    return (
        <group position={[centerX, 0, centerZ]} rotation={[0, -angle, 0]}>
            {/* Main wall panel - positioned at height/2 so bottom sits at Y=0 */}
            <mesh position={[0, height / 2, 0]}>
                <boxGeometry args={[length, height, WALL_THICKNESS]} />
                <meshStandardMaterial
                    color={darkWallColor}
                    emissive={wallColor}
                    emissiveIntensity={0.6}
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

            {/* CORNER PILLAR - Visual joint to close gaps */}
            <mesh position={[-length / 2, height / 2, 0]}>
                <cylinderGeometry args={[0.55, 0.55, height, 12]} />
                <meshStandardMaterial
                    color={darkWallColor}
                    emissive={wallColor}
                    emissiveIntensity={0.5}
                    metalness={0.8}
                    roughness={0.2}
                />
            </mesh>
            {/* Pillar cap */}
            <mesh position={[-length / 2, height, 0]}>
                <cylinderGeometry args={[0.6, 0.6, 0.2, 12]} />
                <meshBasicMaterial color={primaryColor} />
            </mesh>
        </group>
    );
});


// =============================================================================
// TRACK BOUNDARIES - Container for all walls (Memoized)
// =============================================================================
const TrackBoundaries = React.memo(function TrackBoundaries({ boundaries, theme, heightMap }) {
    if (!boundaries) return null;
    return (
        <group>
            {boundaries.map((wall, i) => (
                <TrackWall key={`${wall.x1}-${wall.z1}-${wall.x2}-${wall.z2}`} wall={wall} theme={theme} heightMap={heightMap} />
            ))}
        </group>
    );
}, (prevProps, nextProps) => {
    // Custom comparison - only re-render if boundaries array reference changes or theme changes or heightMap changes
    return prevProps.boundaries === nextProps.boundaries &&
        prevProps.theme?.wallColor === nextProps.theme?.wallColor &&
        prevProps.theme?.primaryColor === nextProps.theme?.primaryColor &&
        prevProps.theme?.secondaryColor === nextProps.theme?.secondaryColor &&
        prevProps.heightMap === nextProps.heightMap;
});

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
// OFF-SCREEN INDICATOR FOR PLAYERS
// =============================================================================
function OffScreenIndicator({ players, gameState }) {
    const { camera, size } = useThree();
    const [offScreenPoints, setOffScreenPoints] = useState([]);

    useFrame(() => {
        const points = [];
        const isRacing = gameState === 'RACING' || gameState === 'COUNTDOWN' || gameState === 'DEMO';

        if (!isRacing) return;

        Object.entries(players).forEach(([id, player]) => {
            // Only show arrows for HUMAN players who are DRIVERS
            if (!player.position || player.isCPU || player.type !== 'driver') return;

            const pos = new THREE.Vector3(player.position.x, player.position.y, player.position.z);

            // Check if player is behind camera
            const toPlayer = pos.clone().sub(camera.position);
            const dot = toPlayer.dot(camera.getWorldDirection(new THREE.Vector3()));

            // Project to screen space
            pos.project(camera);

            const isOffScreen = Math.abs(pos.x) > 0.85 || Math.abs(pos.y) > 0.85 || dot < 0;

            if (isOffScreen) {
                // Clamp to edge of screen
                let sx = pos.x;
                let sy = pos.y;

                if (dot < 0) {
                    // Behind camera? Flip to front but keep direction
                    sx = -sx;
                    sy = -sy;
                }

                const mag = Math.max(Math.abs(sx), Math.abs(sy));
                sx /= mag;
                sy /= mag;

                // Protect UI areas (top/bottom more than sides)
                sx *= 0.88;
                sy *= 0.82;

                // Calculate rotation to point at player
                const angle = Math.atan2(sy, sx);

                points.push({
                    id,
                    x: sx * size.width / 2,
                    y: -sy * size.height / 2, // Flip Y for DOM
                    angle,
                    color: player.color,
                    name: player.name
                });
            }
        });

        if (JSON.stringify(points) !== JSON.stringify(offScreenPoints)) {
            setOffScreenPoints(points);
        }
    });

    if (offScreenPoints.length === 0) return null;

    return (
        <Html fullscreen pointerEvents="none">
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                {offScreenPoints.map(p => (
                    <div
                        key={p.id}
                        style={{
                            position: 'absolute',
                            left: `calc(50% + ${p.x}px)`,
                            top: `calc(50% + ${p.y}px)`,
                            width: 0,
                            height: 0,
                            borderTop: '10px solid transparent',
                            borderBottom: '10px solid transparent',
                            borderLeft: `20px solid ${p.color}`,
                            transform: `translate(-50%, -50%) rotate(${p.angle}rad)`,
                            filter: `drop-shadow(0 0 5px ${p.color})`,
                        }}
                    >
                        <div style={{
                            position: 'absolute',
                            left: -40,
                            top: 20,
                            color: 'white',
                            fontSize: 10,
                            fontWeight: 'bold',
                            textShadow: '1px 1px 2px black',
                            width: 60,
                            textAlign: 'center',
                            transform: `rotate(${-p.angle}rad)` // Keep text upright
                        }}>
                            {p.name}
                        </div>
                    </div>
                ))}
            </div>
        </Html>
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
            // Sort by race progress (laps + waypoints), highest first = leader
            const sorted = activePlayers.sort((a, b) => (b.raceProgress || 0) - (a.raceProgress || 0));
            const topPack = sorted.slice(0, 3);

            const avgX = topPack.reduce((sum, p) => sum + p.position.x, 0) / topPack.length;
            const avgZ = topPack.reduce((sum, p) => sum + p.position.z, 0) / topPack.length;

            camera.position.set(avgX, 25, avgZ + 35);
            camera.lookAt(avgX, 0, avgZ);
            initialized.current = true;
        }
    }, [players, camera]);

    useFrame((state, delta) => {
        // Follow action during racing states (including demo mode)
        const shouldFollow = gameState === 'RACING' || gameState === 'COUNTDOWN' || gameState === 'DEMO';

        if (!shouldFollow) {
            return;
        }

        // Get active players
        const activePlayers = Object.values(players).filter(p => p.type === 'driver' && p.position);

        if (activePlayers.length > 0) {
            // Sort by race progress descending - leader has most laps + waypoints completed
            let sorted = activePlayers.sort((a, b) => (b.raceProgress || 0) - (a.raceProgress || 0));

            // CRITICAL: Filter for human players only, UNLESS in DEMO mode
            const isDemo = gameState === 'DEMO';
            if (!isDemo) {
                const humans = sorted.filter(p => !p.isCPU);
                if (humans.length > 0) {
                    sorted = humans;
                }
            }

            // IMPROVED: Follow the centroid of top players to reduce jumping
            // Take top 4 players (or all if fewer) to keep more players on screen
            const packSize = Math.min(4, sorted.length);
            const pack = sorted.slice(0, packSize);

            // Calculate centroid of the pack
            const centroid = pack.reduce((acc, player) => {
                acc.x += player.position.x;
                acc.z += player.position.z;
                return acc;
            }, { x: 0, z: 0 });
            centroid.x /= pack.length;
            centroid.z /= pack.length;

            // Calculate pack spread to adjust camera distance
            const spread = Math.max(...pack.map(p => Math.sqrt((p.position.x - centroid.x)**2 + (p.position.z - centroid.z)**2)));
            
            // Dynamic camera distance: closer when players are spread out, farther when clustered
            const baseDist = 45;
            const minDist = 25;
            const spreadFactor = 0.5; // Adjust camera distance by half the spread
            const cameraDist = Math.max(minDist, baseDist - spread * spreadFactor);

            // Use the leader's direction for camera orientation
            const leader = sorted[0];
            let carForward = new THREE.Vector3(0, 0, -1); // Default forward is -Z in Three.js
            if (leader.q) {
                const q = new THREE.Quaternion(leader.q[0], leader.q[1], leader.q[2], leader.q[3]);
                carForward.applyQuaternion(q);
                carForward.y = 0; // Keep horizontal for camera logic
                carForward.normalize();
            }

            // Use velocity as fallback if quaternion is not available or car is not moving
            let heading = carForward.clone();
            if (leader.velocity) {
                const velDir = new THREE.Vector3(leader.velocity.x, 0, leader.velocity.z);
                if (velDir.length() > 5) {
                    heading.copy(velDir.normalize());
                }
            }

            // Smoothly update camera heading
            smoothVel.current.lerp(heading, 0.08);

            const cameraHeight = 20;

            // Position camera behind the pack's centroid
            targetPos.current.set(
                centroid.x - smoothVel.current.x * cameraDist,
                cameraHeight,
                centroid.z - smoothVel.current.z * cameraDist
            );

            // Look ahead in the leader's forward direction
            targetLookAt.current.set(
                centroid.x + smoothVel.current.x * 25,
                0,
                centroid.z + smoothVel.current.z * 25
            );
        }

        camera.position.lerp(targetPos.current, 0.03); // Slower lerp for smoother movement

        // Dynamic FOV based on pack spread and leader speed
        if (activePlayers.length > 0) {
            const sortedByProgress = activePlayers.sort((a, b) => (b.raceProgress || 0) - (a.raceProgress || 0));
            const leaderPlayer = sortedByProgress[0];
            if (leaderPlayer && leaderPlayer.velocity) {
                const speed = Math.sqrt(leaderPlayer.velocity.x ** 2 + leaderPlayer.velocity.z ** 2);
                const baseFov = 85; // Wider base FOV
                const maxFov = 110; // Wider max FOV
                const topSpeedScalar = 100; // Match server baseMaxSpeed
                const targetFov = baseFov + (Math.min(1, speed / topSpeedScalar) * (maxFov - baseFov));
                camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.05);
                camera.updateProjectionMatrix();
            }
        }

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
// DEBUG BOUNDARIES - Renders server physics bodies
// =============================================================================
function DebugBoundaries({ active }) {
    const [debugWalls, setDebugWalls] = useState([]);

    useEffect(() => {
        if (!active) return;

        const onDebugWalls = (data) => setDebugWalls(data);
        socket.on('debugWallPositions', onDebugWalls);

        return () => {
            socket.off('debugWallPositions', onDebugWalls);
        };
    }, [active]);

    // Clear on track change
    useEffect(() => {
        const onTrackData = () => setDebugWalls([]);
        socket.on('trackData', onTrackData);
        return () => socket.off('trackData', onTrackData);
    }, []);

    if (!active || debugWalls.length === 0) return null;

    return (
        <group>
            {debugWalls.map((wall, i) => (
                <mesh
                    key={i}
                    position={[wall.position.x, wall.position.y, wall.position.z]}
                    quaternion={[wall.quaternion.x, wall.quaternion.y, wall.quaternion.z, wall.quaternion.w]}
                >
                    <boxGeometry args={[wall.halfExtents.x * 2, wall.halfExtents.y * 2, wall.halfExtents.z * 2]} />
                    <meshBasicMaterial color="red" wireframe />
                </mesh>
            ))}
        </group>
    );
}

// =============================================================================
// MEMOIZED ITEM LAYERS - Prevents full list re-renders
// =============================================================================

const PowerupLayer = React.memo(({ powerups }) => {
    return (
        <group>
            {Object.entries(powerups || {}).map(([id, p]) => (
                <Powerup key={id} position={[p.position.x, p.position.y, p.position.z]} type={p.type} />
            ))}
        </group>
    );
});

const TrapLayer = React.memo(({ traps }) => {
    return (
        <group>
            {Object.entries(traps || {}).map(([id, t]) => (
                <Trap key={id} position={[t.position.x, t.position.y, t.position.z]} />
            ))}
        </group>
    );
});

const ProjectileLayer = React.memo(({ projectiles, worldStateRef }) => {
    return (
        <group>
            {Object.entries(projectiles || {}).map(([id, p]) => (
                <Projectile key={id} id={id} worldStateRef={worldStateRef} type={p.type} />
            ))}
        </group>
    );
});

// =============================================================================
// PRE-WARM LAYER - Primes GPU with all geometries/shaders at startup
// =============================================================================
const PreWarmLayer = React.memo(() => {
    const [warmed, setWarmed] = useState(false);
    const warmPos = [0, -100, 0]; // Render far below the world

    useEffect(() => {
        // Stay active for 2 seconds to ensure everything hits the GPU
        const timer = setTimeout(() => setWarmed(true), 2000);
        return () => clearTimeout(timer);
    }, []);

    if (warmed) return null;

    // Dummy ref for Projectile component
    const dummyRef = {
        current: {
            projectiles: {
                warm_proj: { position: { x: 0, y: -100, z: 0 } },
                warm_proj_m: { position: { x: 0, y: -100, z: 0 } }
            }
        }
    };

    return (
        <group position={warmPos}>
            {/* Render one of every major type */}
            <Powerup position={[0, 0, 0]} type="Repair" />
            <Powerup position={[2, 0, 0]} type="Boost" />
            <Powerup position={[4, 0, 0]} type="Weapon" />
            <Trap position={[-2, 0, 0]} />
            <Projectile id="warm_proj" worldStateRef={dummyRef} type="laser" />
            <Projectile id="warm_proj_m" worldStateRef={dummyRef} type="missile" />
        </group>
    );
});

// =============================================================================
// MAIN SCENE
// =============================================================================
function Scene({ worldState, worldStateRef, trackData, theme, setEngineRpm, gameState, isDemo, graphicsSettings, onPerformanceUpdate, locatingPlayers, damageSparks, removeDamageSpark, playSfx }) {
    const [explosions, setExplosions] = useState([]);
    const [showDebug, setShowDebug] = useState(false);
    const prevPlayersRef = useRef({});
    const { gl } = useThree();

    // Debug Toggle (F9)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'F9') {
                setShowDebug(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

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

    const handleRemoveDamageSpark = (id) => {
        setDamageSparks(sparks => sparks.filter(s => s.id !== id));
    };

    // Detect player damage for collision sparks
    useEffect(() => {
        const prevPlayers = prevPlayersRef.current;
        const currentPlayers = worldState.players || {};

        // Check for players that took damage (HP decreased)
        for (const [id, current] of Object.entries(currentPlayers)) {
            if (current.type === 'driver' && current.position && current.hp !== undefined) {
                const prev = prevPlayers[id];
                if (prev && prev.hp > current.hp && current.hp > 0) {
                    // Player took damage - create collision sparks and play sound
                    const damageAmount = prev.hp - current.hp;
                    setDamageSparks(sparks => [...sparks, {
                        id: `spark-${id}-${Date.now()}`,
                        position: [current.position.x, current.position.y, current.position.z],
                        color: '#ffaa00',
                        damage: damageAmount
                    }]);
                    playSfx('crash');
                }
            }
        }

        prevPlayersRef.current = { ...currentPlayers };
    }, [worldState.players, playSfx]);

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
            <color attach="background" args={['#1a0a2e']} />
            <fog attach="fog" args={['#1a0a2e', 30, 900]} />

            {/* HDR Environment Mapping */}
            {graphicsSettings?.enableHDR && (
                <Environment
                    preset={envPreset}
                    background={false}
                    environmentIntensity={1.0}
                />
            )}

            {/* Realistic Directional Lighting with Shadows */}
            <ambientLight intensity={0.6} />
            {graphicsSettings?.shadowQuality > 0 ? (
                <>
                    <directionalLight
                        position={[-30, 50, 30]}
                        intensity={2.5}
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
                        intensity={1.2}
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
                    <pointLight position={[0, 50, 0]} intensity={1.5} color="#ff00ff" />
                    <pointLight position={[20, 30, 20]} intensity={0.8} color="#00ffff" />
                </>
            )}

            <Stars radius={400} depth={100} count={3000} factor={4} saturation={0} fade speed={1} />

            <SynthwaveGrid floorSize={trackData?.floorSize} graphicsSettings={graphicsSettings} theme={theme} />

            {/* Terrain Hills - renders heightmap as 3D mesh */}
            {trackData?.heightMap && (
                <TerrainMesh heightMap={trackData.heightMap} theme={theme} graphicsSettings={graphicsSettings} />
            )}

            {/* Track Surface Overlay - distinguishes track from outer area */}
            <TrackSurface trackData={trackData} theme={theme} />

            <Scenery trackData={trackData} graphicsSettings={graphicsSettings} theme={theme} />

            {/* Mii-like Audience around the track */}
            <Audience trackData={trackData} theme={theme} />

            {/* Ambient Particle Effects */}
            <AmbientParticles theme={theme} />

            {/* Debug Walls (Server Physics) */}
            <DebugBoundaries active={showDebug} />

            {/* Track Walls */}
            <TrackBoundaries boundaries={trackData?.boundaries} theme={theme} heightMap={trackData?.heightMap} />

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
                <>
                    <CameraController players={worldState.players || {}} gameState={gameState} />
                    <OffScreenIndicator players={worldState.players || {}} gameState={gameState} />
                </>
            )}

            {/* Cars */}
            {Object.entries(worldState.players || {}).map(([id, player]) => {
                if (player.type !== 'driver' || !player.position) return null;
                return (
                    <Car
                        key={id}
                        id={id}
                        worldStateRef={worldStateRef}
                        color={player.color}
                        maskType={player.maskType}
                        isLocating={locatingPlayers?.[id] || false}
                    />
                );
            })}

            {/* Powerups */}
            <PowerupLayer powerups={worldState.powerups} />

            {/* Traps */}
            <TrapLayer traps={worldState.traps} />

            {/* Projectiles */}
            <ProjectileLayer projectiles={worldState.projectiles} worldStateRef={worldStateRef} />

            {/* Pre-warm shaders/geometries */}
            <PreWarmLayer />

            {/* Explosions */}
            {explosions.map(exp => (
                <ParticleExplosion
                    key={exp.id}
                    position={exp.position}
                    color={exp.color}
                    onComplete={() => removeExplosion(exp.id)}
                />
            ))}

            {/* Damage Collision Sparks */}
            {damageSparks.map(spark => (
                <CollisionSparks
                    key={spark.id}
                    position={spark.position}
                    color={spark.color}
                    active={true}
                    onComplete={() => removeDamageSpark(spark.id)}
                />
            ))}

            {/* Post Processing */}
            <EffectComposer multisampling={4} disableNormalPass={false}>
                {/* SSAO - Screen Space Ambient Occlusion */}
                {graphicsSettings?.enableSSAO && (
                    <N8AO
                        aoRadius={2}
                        intensity={1.5}
                        quality="performance"
                    />
                )}

                {/* SSR removed - causes WebGL context overflow crashes */}

                {/* Depth of Field */}
                {graphicsSettings?.enableDOF && (
                    <DepthOfField
                        focusDistance={0.02}
                        focalLength={0.05}
                        bokehScale={3}
                        height={480}
                    />
                )}

                {/* Bloom - Tuned for Neon Look */}
                {graphicsSettings?.enableBloom && (
                    <Bloom
                        intensity={graphicsSettings.bloomIntensity || 1.2} // Increased for "eye candy"
                        luminanceThreshold={0.4} // Lowered slightly to catch more neon
                        luminanceSmoothing={0.7}
                        mipmapBlur={true}
                        radius={0.7}
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
const QROverlay = React.memo(function QROverlay() {
    return (
        <div style={{
            position: 'fixed',
            top: 20,
            right: 20,
            padding: 20,
            backgroundColor: 'rgba(255, 255, 255, 0.98)',
            borderRadius: 16,
            boxShadow: '0 0 40px rgba(0, 255, 255, 0.6), 0 0 80px rgba(255, 0, 255, 0.4)',
            zIndex: 1000,
            border: '3px solid #00ffff',
            animation: 'qrPulse 2s ease-in-out infinite'
        }}>
            <div style={{
                textAlign: 'center',
                marginBottom: 10,
                fontFamily: '"Segoe UI", "Roboto", "Helvetica", sans-serif',
                fontSize: 12,
                fontWeight: 700,
                color: '#ff00ff',
                letterSpacing: 2
            }}>
                📱 SCAN TO PLAY
            </div>
            <QRCode value="https://jam.gimongous.net" size={140} />
            <div style={{
                textAlign: 'center',
                marginTop: 10,
                fontFamily: '"Segoe UI", "Roboto", "Helvetica", sans-serif',
                fontSize: 11,
                fontWeight: 600,
                color: '#0a0020'
            }}>
                jam.gimongous.net
            </div>
            <style>{`
                @keyframes qrPulse {
                    0%, 100% { box-shadow: 0 0 40px rgba(0,255,255,0.6), 0 0 80px rgba(255,0,255,0.4); }
                    50% { box-shadow: 0 0 60px rgba(0,255,255,0.8), 0 0 100px rgba(255,0,255,0.6); }
                }
            `}</style>
        </div>
    );
});

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

const PlayerList = React.memo(function PlayerList({ players, gameState }) {
    const activePlayers = Object.entries(players || {}).filter(([, p]) => p.type === 'driver');
    const isRacing = gameState === 'RACING' || gameState === 'COUNTDOWN';

    return (
        <div style={{
            position: 'fixed',
            top: 20,
            left: 20,
            fontFamily: '"Segoe UI", "Roboto", "Helvetica", sans-serif',
            zIndex: 1000,
            background: 'rgba(0, 0, 20, 0.85)',
            borderRadius: 12,
            padding: 16,
            border: isRacing ? '2px solid rgba(255,0,255,0.6)' : '2px solid rgba(0,255,255,0.4)',
            boxShadow: isRacing
                ? '0 0 20px rgba(255,0,255,0.3)'
                : '0 0 20px rgba(0,255,255,0.2)',
            minWidth: 200
        }}>
            {/* Header */}
            <div style={{
                fontSize: 12,
                marginBottom: 12,
                letterSpacing: 2,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: isRacing ? '#ff00ff' : '#00ffff',
                textShadow: isRacing ? '0 0 10px #ff00ff' : '0 0 10px #00ffff'
            }}>
                {isRacing ? (
                    <>
                        <span style={{ fontSize: 16 }}></span>
                        <span>RACERS</span>
                        <span style={{ marginLeft: 'auto', opacity: 0.8 }}>{activePlayers.length}</span>
                    </>
                ) : (
                    <>
                        <span>PLAYERS</span>
                        <span style={{ marginLeft: 'auto', opacity: 0.8 }}>{activePlayers.length}</span>
                    </>
                )}
            </div>

            {activePlayers.map(([id, player], index) => {
                // During race, hide real identity with masked name
                const displayName = isRacing
                    ? `RACER #${index + 1}`
                    : player.name;
                const maskIcon = MASK_ICONS[player.maskType] || '🎭';

                // Glow intensity based on HP
                const glowIntensity = player.hp / 100;
                const isLowHP = player.hp < 30;

                return (
                    <div key={id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        marginBottom: 8,
                        padding: '8px 10px',
                        background: isRacing
                            ? 'rgba(255,0,255,0.1)'
                            : 'rgba(255,255,255,0.05)',
                        borderRadius: 8,
                        border: isLowHP
                            ? '1px solid rgba(255,0,0,0.5)'
                            : '1px solid rgba(255,255,255,0.1)',
                        animation: isLowHP ? 'playerPulse 0.5s infinite' : 'none'
                    }}>
                        {/* Mask icon with glow */}
                        <span style={{
                            fontSize: 20,
                            filter: `drop-shadow(0 0 ${4 + glowIntensity * 8}px ${player.color})`,
                            opacity: 0.6 + glowIntensity * 0.4
                        }}>
                            {maskIcon}
                        </span>

                        {/* Name and HP */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: isRacing ? '#ccc' : '#fff',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                textShadow: isRacing
                                    ? 'none'
                                    : `0 0 8px ${player.color}`
                            }}>
                                {displayName}
                            </div>
                            <div style={{
                                width: '100%',
                                height: 5,
                                backgroundColor: 'rgba(255,255,255,0.1)',
                                borderRadius: 3,
                                overflow: 'hidden',
                                marginTop: 4
                            }}>
                                <div style={{
                                    width: `${player.hp}%`,
                                    height: '100%',
                                    backgroundColor: player.hp > 50 ? '#00ff00' : player.hp > 25 ? '#ffff00' : '#ff0000',
                                    transition: 'width 0.2s',
                                    boxShadow: `0 0 ${glowIntensity * 8}px currentColor`
                                }} />
                            </div>
                        </div>

                        {/* HP Number */}
                        <span style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: player.hp > 50 ? '#00ff00' : player.hp > 25 ? '#ffff00' : '#ff0000',
                            minWidth: 28,
                            textAlign: 'right'
                        }}>
                            {Math.round(player.hp)}
                        </span>
                    </div>
                );
            })}

            {/* CSS Animation for low HP pulse */}
            <style>{`
                @keyframes playerPulse {
                    0%, 100% { opacity: 1; border-color: rgba(255,0,0,0.5); }
                    50% { opacity: 0.7; border-color: rgba(255,0,0,0.8); }
                }
            `}</style>
        </div>
    );
});

// =============================================================================
// MAIN APP
// =============================================================================
export default function App() {
    const worldStateRef = useRef({
        players: {},
        powerups: {},
        traps: {},
        projectiles: {}
    });
    const [worldState, setWorldState] = useState({
        players: {},
        powerups: {},
        traps: {},
        projectiles: {}
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
    const [screenFlash, setScreenFlash] = useState(false); // Damage flash effect
    const [damageSparks, setDamageSparks] = useState([]); // Damage collision sparks
    const [locatingPlayers, setLocatingPlayers] = useState({}); // Track which players are being located
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

    // Track preloading cache for instant track switching (eliminates lag)
    const preloadedTracksRef = useRef(new Map()); // trackId -> { boundaries, theme, geometries }
    // General asset cache to avoid runtime shader/texture compilation stalls
    const preloadedAssetsRef = useRef({}); // explosionTexture, beaconMaterial, beaconGeometry, spriteMaterial

    // Graphics Settings with localStorage persistence
    const [graphicsSettings, setGraphicsSettings] = useState(() => {
        const SETTINGS_VERSION = 3; // Bump this when defaults change - v3: removed SSR
        const defaultSettings = {
            version: SETTINGS_VERSION,
            shadowQuality: 2048,
            enableHDR: true,
            enableSSAO: true,
            enableDOF: false,
            enableBloom: true,
            bloomIntensity: 0.8,
            toneMapping: 'ACES',
            particleLimit: 10000,
            showPerformance: isDev
        };

        try {
            const saved = localStorage.getItem('graphicsSettings');
            if (saved) {
                const parsed = JSON.parse(saved);
                // Reset if version mismatch or missing version
                if (parsed.version !== SETTINGS_VERSION) {
                    localStorage.removeItem('graphicsSettings');
                    return defaultSettings;
                }
                return parsed;
            }
        } catch (e) {
            localStorage.removeItem('graphicsSettings');
        }
        return defaultSettings;
    });

    // Save graphics settings to localStorage when changed
    useEffect(() => {
        localStorage.setItem('graphicsSettings', JSON.stringify(graphicsSettings));
    }, [graphicsSettings]);

    // Wake Lock to keep display active
    useEffect(() => {
        let wakeLock = null;

        const requestWakeLock = async () => {
            try {
                if ('wakeLock' in navigator) {
                    wakeLock = await navigator.wakeLock.request('screen');
                    console.log('Wake lock acquired');
                }
            } catch (err) {
                console.warn('Wake lock request failed:', err);
            }
        };

        requestWakeLock();

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && !wakeLock) {
                requestWakeLock();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (wakeLock) {
                wakeLock.release().then(() => {
                    console.log('Wake lock released');
                });
            }
        };
    }, []);

    // Preload visual/audio assets used by locate/explosion to prevent first-use hitches
    useEffect(() => {
        const cache = preloadedAssetsRef.current;
        try {
            // Explosion sprite texture
            const loader = new THREE.TextureLoader();
            loader.load('/explosion.png', (tex) => {
                try { tex.colorSpace = THREE.SRGBColorSpace; } catch (e) { }
                tex.needsUpdate = true;
                cache.explosionTexture = tex;
                // also set a sprite material for quick reuse
                cache.spriteMaterial = new THREE.SpriteMaterial({ map: tex, transparent: true });
                // expose globally for components that read window.__preloadedAssets
                window.__preloadedAssets = cache;
                console.log('[PRELOAD] explosion.png loaded');
            }, undefined, (err) => {
                console.warn('[PRELOAD] Failed to load explosion.png', err);
                window.__preloadedAssets = cache;
            });

            // Beacon material for locate (compile shader early)
            const beaconMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(trackTheme.primaryColor || '#ff00ff'),
                emissive: new THREE.Color(trackTheme.primaryColor || '#ff00ff'),
                emissiveIntensity: 3,
                transparent: true,
                opacity: 0.6,
                side: THREE.DoubleSide
            });
            beaconMat.needsUpdate = true;
            cache.beaconMaterial = beaconMat;

            // Precreate beacon geometry
            cache.beaconGeometry = new THREE.CylinderGeometry(0.4, 0.8, 20, 8);
            // Preload powerup materials/geometries to avoid shader compile on first spawn
            const POWERUP_COLORS = {
                'Repair': '#00ff00',
                'Boost': '#ffff00',
                'Shield': '#00ffff',
                'Ghost': '#ffffff',
                'Juggernaut': '#ff0066',
                'Weapon': '#ff6600',
                '67Meme': '#67ff67'
            };

            cache.powerupMaterials = {};
            cache.powerupGlowMaterials = {};
            cache.powerupBeaconMaterials = {};

            for (const [k, col] of Object.entries(POWERUP_COLORS)) {
                const mat = new THREE.MeshStandardMaterial({
                    color: new THREE.Color(col),
                    emissive: new THREE.Color(col),
                    emissiveIntensity: 2,
                    wireframe: true
                });
                mat.needsUpdate = true;
                cache.powerupMaterials[k] = mat;

                const glow = new THREE.MeshBasicMaterial({
                    color: new THREE.Color(col),
                    transparent: true,
                    opacity: 0.3,
                    blending: THREE.AdditiveBlending
                });
                cache.powerupGlowMaterials[k] = glow;

                const beacon = new THREE.MeshBasicMaterial({
                    color: new THREE.Color(col),
                    transparent: true,
                    opacity: 0.2,
                    blending: THREE.AdditiveBlending
                });
                cache.powerupBeaconMaterials[k] = beacon;
            }

            // Precreate common geometries used by powerups
            cache.octahedronGeometry = new THREE.OctahedronGeometry(0.9, 0);
            cache.sphereGeometry = new THREE.SphereGeometry(1.2, 16, 16);
            cache.beaconGeometrySmall = new THREE.CylinderGeometry(0.1, 0.5, 20, 8);

            // Trap & Projectile assets
            cache.trapGeometry = new THREE.BoxGeometry(2, 1, 2);
            cache.trapMaterial = new THREE.MeshStandardMaterial({
                color: "#ff0000",
                emissive: "#ff0000",
                emissiveIntensity: 0.5,
                transparent: true,
                opacity: 0.7
            });
            cache.missileGeometry = new THREE.ConeGeometry(0.3, 1.2, 8);
            cache.laserGeometry = new THREE.CylinderGeometry(0.1, 0.1, 2, 8);
            cache.projectileTrailGeometry = new THREE.SphereGeometry(0.4, 8, 8);
            cache.missileMaterial = new THREE.MeshStandardMaterial({
                color: "#ff6600",
                emissive: "#ff6600",
                emissiveIntensity: 2.5
            });
            cache.laserMaterial = new THREE.MeshStandardMaterial({
                color: "#00aaff",
                emissive: "#00aaff",
                emissiveIntensity: 2.5
            });
            cache.projectileTrailMaterial = new THREE.MeshBasicMaterial({
                transparent: true,
                opacity: 0.6,
                blending: THREE.AdditiveBlending
            });

            // expose cache immediately
            window.__preloadedAssets = cache;
        } catch (e) {
            console.warn('[PRELOAD] Asset preloading failed', e);
            window.__preloadedAssets = cache;
        }
    }, []);

    // Performance monitoring
    const [performanceStats, setPerformanceStats] = useState({ fps: 60, drawCalls: 0, particles: 0 });

    // Admin panel visibility
    const [adminPanelVisible, setAdminPanelVisible] = useState(true);

    // Audio Hook
    const { initAudio, playSfx, setMusicStyle, setEngineRpm } = useAudio(connected);

    // Toast helper
    const showToast = (message, type = 'info') => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev, { id, message, type, timestamp: Date.now() }]);
    };

    // Countdown tick handler - memoized to prevent re-renders
    const handleCountdownTick = React.useCallback((count) => {
        if (count > 0) playSfx('countdown');
    }, [playSfx]);

    // Damage spark removal handler
    const handleRemoveDamageSpark = React.useCallback((id) => {
        setDamageSparks(prev => prev.filter(spark => spark.id !== id));
    }, []);

    // Track player eliminations for reveal banner
    useEffect(() => {
        // Prevent elimination spam on game restart
        if (gameState.state === 'LOBBY') {
            prevPlayersRef.current = worldState.players || {};
            return;
        }

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
                } else if (current.hp < prev.hp && current.position) {
                    // Player took damage - add damage sparks
                    const damageAmount = prev.hp - current.hp;
                    setDamageSparks(sparks => [...sparks, {
                        id: Date.now() + Math.random(),
                        position: [current.position.x, current.position.y, current.position.z],
                        damage: damageAmount,
                        color: current.color || '#ffaa00', // Use player color or default orange
                        timestamp: Date.now()
                    }]);
                }
            }
        }

        // Update ref for next comparison
        prevPlayersRef.current = { ...currentPlayers };

        // Clean up old eliminations (older than 5 seconds)
        setEliminations(elims => elims.filter(e => Date.now() - e.timestamp < 5000));
    }, [worldState.players, playSfx, gameState.state]);

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
            // Delta compression handling
            let merged = null;
            if (state.isFull) {
                // Full state - expand compressed arrays to objects and cache
                merged = {
                    players: {},
                    powerups: state.powerups,
                    traps: state.traps,
                    projectiles: state.projectiles
                };

                for (const [id, player] of Object.entries(state.players)) {
                    merged.players[id] = {
                        position: player.p ? { x: player.p[0], y: player.p[1], z: player.p[2] } : null,
                        velocity: player.v ? { x: player.v[0], y: player.v[1], z: player.v[2] } : null,
                        q: player.q, // Include quaternion
                        hp: player.hp,
                        type: player.type,
                        maskType: player.maskType,
                        color: player.color,
                        name: player.name,
                        boost: player.boost,
                        isShielded: player.isShielded,
                        isGhost: player.isGhost,
                        isJuggernaut: player.isJuggernaut,
                        lapsCompleted: player.lapsCompleted,
                        waypointIndex: player.waypointIndex,
                        raceProgress: player.raceProgress,
                        isCPU: player.isCPU
                    };
                }
            } else {
                // Delta state - merge with cached full state
                const cache = worldStateRef.current.players || {};
                merged = {
                    players: {},
                    powerups: state.powerups,
                    traps: state.traps,
                    projectiles: state.projectiles
                };

                for (const [id, delta] of Object.entries(state.players)) {
                    const cached = cache[id] || {};
                    merged.players[id] = {
                        position: delta.p ? { x: delta.p[0], y: delta.p[1], z: delta.p[2] } : null,
                        velocity: delta.v ? { x: delta.v[0], y: delta.v[1], z: delta.v[2] } : null,
                        q: delta.q || cached.q, // Include quaternion from delta or cache
                        hp: delta.hp !== undefined ? delta.hp : cached.hp,
                        type: delta.type !== undefined ? delta.type : cached.type,
                        maskType: delta.maskType !== undefined ? delta.maskType : cached.maskType,
                        color: delta.color !== undefined ? delta.color : cached.color,
                        name: delta.name !== undefined ? delta.name : cached.name,
                        boost: delta.boost !== undefined ? delta.boost : cached.boost,
                        isShielded: delta.isShielded !== undefined ? delta.isShielded : cached.isShielded,
                        isGhost: delta.isGhost !== undefined ? delta.isGhost : cached.isGhost,
                        isJuggernaut: delta.isJuggernaut !== undefined ? delta.isJuggernaut : cached.isJuggernaut,
                        lapsCompleted: delta.lapsCompleted,
                        waypointIndex: delta.waypointIndex,
                        raceProgress: delta.raceProgress,
                        isCPU: delta.isCPU !== undefined ? delta.isCPU : cached.isCPU
                    };
                }
            }

            if (merged) {
                worldStateRef.current = merged;
                window.__playerCache = merged.players;
            }
        });

        // Sync worldStateRef to worldState state at a lower frequency (15Hz) for UI and list rendering
        const uiSyncInterval = setInterval(() => {
            setWorldState(worldStateRef.current);
        }, 66); // ~15Hz


        socket.on('gameState', (state) => {
            console.log('[DEBUG] Received gameState:', state);
            setGameState(state);

            // Clear eliminations on reset to avoid spam
            if (state.state === 'LOBBY' || state.state === 'COUNTDOWN') {
                setEliminations([]);
            }

            if (state.state === 'COUNTDOWN') playSfx('join'); // Ping on countdown
            if (state.state === 'WINNER') playSfx('boost'); // Victory sound
        });

        socket.on('trackData', (data) => {
            console.log('[DEBUG] Received trackData:', data.name);
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

        // Preload ALL track data for instant switching (no lag on game start)
        socket.on('allTracks', (tracks) => {
            console.log(`[PRELOAD] Received ${tracks.length} tracks for preloading`);
            const cache = preloadedTracksRef.current;

            for (const track of tracks) {
                // Pre-compute wall geometries and cache them
                const precomputedWalls = track.boundaries.map(wall => {
                    const length = Math.sqrt(
                        Math.pow(wall.x2 - wall.x1, 2) + Math.pow(wall.z2 - wall.z1, 2)
                    );
                    const centerX = (wall.x1 + wall.x2) / 2;
                    const centerZ = (wall.z1 + wall.z2) / 2;
                    const angle = Math.atan2(wall.z2 - wall.z1, wall.x2 - wall.x1);
                    const height = wall.height || 5;

                    return {
                        ...wall,
                        length,
                        centerX,
                        centerZ,
                        angle,
                        height
                    };
                });

                cache.set(track.id, {
                    id: track.id,
                    name: track.name,
                    boundaries: track.boundaries,
                    precomputedWalls,
                    floorSize: track.floorSize,
                    theme: track.theme
                });
            }
            console.log(`[PRELOAD] Cached ${cache.size} tracks`);
        });

        socket.on('cpuCount', (count) => {
            console.log('Received CPU count:', count);
            setCpuCount(count);
        });

        // Powerup memes
        socket.on('powerup', (data) => {
            if (data.type === '67Meme') {
                showToast('6 7', 'success');
            }
        });

        socket.on('damage', (data) => {
            playSfx('crash');
            // Trigger screen shake and flash based on damage amount
            const intensity = Math.min(1, (data?.damage || 20) / 50);
            setScreenShake(intensity);
            setScreenFlash(true);
            setTimeout(() => {
                setScreenShake(0);
                setScreenFlash(false);
            }, 200);
        });

        // Player locate feature - flash and scale car
        socket.on('playerLocating', (data) => {
            playSfx('locate');
            setLocatingPlayers(prev => ({ ...prev, [data.id]: true }));
            // Clear after 2.5 seconds
            setTimeout(() => {
                setLocatingPlayers(prev => {
                    const updated = { ...prev };
                    delete updated[data.id];
                    return updated;
                });
            }, 2500);
        });

        return () => {
            socket.off('trackData');
            socket.off('trackStyle');
            socket.off('leaderboard');
            socket.off('demoMode');
            socket.off('worldState');
            socket.off('gameState');
            socket.off('damage');
            socket.off('trackList');
            socket.off('cpuCount');
            socket.off('allTracks');
            socket.off('playerLocating');
            clearInterval(uiSyncInterval);
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
                case '_': // _ (same key as -)
                    socket.emit('removeCPU');
                    showToast('Removing CPU opponent', 'info');
                    break;
                case 'f': // Fire Weapon
                    socket.emit('fire');
                    break;
                    if (cpuCount > 0) {
                        socket.emit('removeCPU');
                        showToast('Removing CPU opponent', 'success');
                    } else {
                        showToast('No CPUs to remove', 'error');
                    }
                    break;
                case 'tab': // Tab - Toggle admin panel
                    e.preventDefault();
                    setAdminPanelVisible(v => !v);
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
                    worldStateRef={worldStateRef}
                    trackData={trackData}
                    theme={trackTheme}
                    setEngineRpm={setEngineRpm}
                    gameState={gameState.state}
                    isDemo={gameState.isDemo}
                    graphicsSettings={graphicsSettings}
                    onPerformanceUpdate={setPerformanceStats}
                    locatingPlayers={locatingPlayers}
                    damageSparks={damageSparks}
                    removeDamageSpark={handleRemoveDamageSpark}
                    playSfx={playSfx}
                />
            </Canvas>

            <ScreenFlash active={screenFlash} />

            <GameUI
                gameState={gameState.state}
                gameTimer={gameState.timer}
                winner={gameState.winner}
                onCountdownTick={handleCountdownTick}
            />
            <QROverlay />
            <PlayerList players={worldState.players} gameState={gameState.state} />
            <DemoModeIndicator active={demoMode} />
            <LeaderboardDisplay entries={leaderboard} visible={gameState.state === 'LOBBY' || demoMode} />
            <EliminationBanner eliminations={eliminations} />

            {/* HUD */}
            {gameState.state === 'RACING' && worldState.players[socket.id] && (
                <div style={{
                    position: 'fixed',
                    bottom: 20,
                    right: 20,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: 10,
                    padding: 20,
                    pointerEvents: 'none'
                }}>
                    {/* Active Powerups */}
                    <div style={{ display: 'flex', gap: 10 }}>
                        {worldState.players[socket.id].isShielded && (
                            <span style={{ fontSize: 32 }} title="Shield">🛡️</span>
                        )}
                        {worldState.players[socket.id].isGhost && (
                            <span style={{ fontSize: 32 }} title="Ghost">👻</span>
                        )}
                        {worldState.players[socket.id].isJuggernaut && (
                            <span style={{ fontSize: 32 }} title="Juggernaut">💪</span>
                        )}
                    </div>
                    {/* Ammo */}
                    <div style={{
                        color: typeof worldState.players[socket.id].ammo === 'number' && worldState.players[socket.id].ammo > 0 ? '#ff00ff' : '#555',
                        fontSize: 24,
                        fontWeight: 'bold',
                        textShadow: '0 0 10px #ff00ff'
                    }}>
                        AMMO: {worldState.players[socket.id].ammo || 0}
                    </div>
                </div>
            )}

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
                visible={adminPanelVisible}
                onToggleVisible={() => setAdminPanelVisible(v => !v)}
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
                    fontFamily: '"Segoe UI", "Roboto", "Helvetica", sans-serif',
                    borderRadius: 8,
                    zIndex: 1000
                }}>
                    ⚠️ DISCONNECTED FROM SERVER
                </div>
            )}
        </div>
    );
}
