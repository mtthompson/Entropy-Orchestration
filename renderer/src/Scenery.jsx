import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function Scenery({ trackData, graphicsSettings }) {
    const envIntensity = graphicsSettings?.enableHDR ? 1.2 : 0.8;
    
    return (
        <group>
            {/* Giant Neon Sun with Rings */}
            <mesh position={[0, 35, -120]}>
                <circleGeometry args={[50, 64]} />
                <meshBasicMaterial color="#ff00aa" toneMapped={false} />
            </mesh>
            {/* Sun rings */}
            <NeonRing position={[0, 35, -118]} radius={55} color="#ff00ff" />
            <NeonRing position={[0, 35, -116]} radius={62} color="#ff0066" />

            {/* Sun Glow */}
            <pointLight position={[0, 40, -150]} intensity={3} color="#ff00aa" distance={250} castShadow={graphicsSettings?.shadowQuality > 0} />

            {/* Low Poly Mountains */}
            <Mountains envIntensity={envIntensity} />

            {/* Neon Palms Instanced */}
            <NeonPalms count={50} envIntensity={envIntensity} />

            {/* Floating Geometry / Debris */}
            <FloatingDebris />

            {/* Arena Spotlights */}
            <ArenaLights castShadow={graphicsSettings?.shadowQuality > 0} />

            {/* Laser Beams */}
            <LaserBeams />
        </group>
    );
}

// Animated Neon Ring
function NeonRing({ position, radius, color }) {
    const ref = useRef();

    useFrame((state) => {
        if (ref.current) {
            ref.current.rotation.z = state.clock.elapsedTime * 0.1;
        }
    });

    return (
        <mesh ref={ref} position={position} rotation={[0, 0, 0]}>
            <ringGeometry args={[radius, radius + 1, 64]} />
            <meshBasicMaterial color={color} transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
    );
}

// Pulsing Arena Spotlights
function ArenaLights({ castShadow }) {
    const lights = useMemo(() => {
        const arr = [];
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            arr.push({
                x: Math.cos(angle) * 90,
                z: Math.sin(angle) * 90,
                color: i % 2 === 0 ? '#ff00ff' : '#00ffff'
            });
        }
        return arr;
    }, []);

    return (
        <group>
            {lights.map((l, i) => (
                <PulsingSpotlight key={i} position={[l.x, 0, l.z]} color={l.color} castShadow={castShadow} />
            ))}
        </group>
    );
}

function PulsingSpotlight({ position, color, castShadow }) {
    const ref = useRef();
    const phase = useMemo(() => Math.random() * Math.PI * 2, []);

    useFrame((state) => {
        if (ref.current) {
            ref.current.intensity = 1 + Math.sin(state.clock.elapsedTime * 2 + phase) * 0.5;
        }
    });

    return (
        <group position={position}>
            {/* Light beam mesh */}
            <mesh rotation={[-Math.PI / 8, 0, 0]}>
                <cylinderGeometry args={[0.5, 8, 50, 8, 1, true]} />
                <meshBasicMaterial color={color} transparent opacity={0.15} side={THREE.DoubleSide} />
            </mesh>
            <pointLight ref={ref} color={color} intensity={1.5} distance={30} castShadow={castShadow} />
        </group>
    );
}

// Animated Laser Beams
function LaserBeams() {
    const ref = useRef();

    useFrame((state) => {
        if (ref.current) {
            ref.current.rotation.y = state.clock.elapsedTime * 0.3;
        }
    });

    return (
        <group ref={ref}>
            {[0, 1, 2, 3].map(i => {
                const angle = (i / 4) * Math.PI * 2;
                return (
                    <mesh key={i} position={[0, 80, 0]} rotation={[Math.PI / 3, angle, 0]}>
                        <cylinderGeometry args={[0.1, 0.1, 300, 4]} />
                        <meshBasicMaterial color="#00ff00" transparent opacity={0.3} />
                    </mesh>
                );
            })}
        </group>
    );
}


function Mountains({ envIntensity }) {
    const geometry = useMemo(() => {
        const geo = new THREE.PlaneGeometry(400, 80, 40, 10);
        const positions = geo.attributes.position;
        for (let i = 0; i < positions.count; i++) {
            // Randomize Z (which is Y after rotation) height
            positions.setZ(i, Math.random() * 20);
        }
        geo.computeVertexNormals();
        return geo;
    }, []);

    return (
        <mesh position={[0, 0, -150]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
            <primitive object={geometry} />
            <meshStandardMaterial
                color="#2a0a4e"
                wireframe
                emissive="#ff00ff"
                emissiveIntensity={0.2}
                envMapIntensity={envIntensity}
            />
        </mesh>
    );
}

function NeonPalms({ count, envIntensity }) {
    const meshRef = useRef();
    const dummy = useMemo(() => new THREE.Object3D(), []);

    // Generate random positions around the track
    const particles = useMemo(() => {
        const temp = [];
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            // Keep palms OUTSIDE the track area (min radius 100)
            const radius = 100 + Math.random() * 60; // 100-160 range
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            temp.push({ x, z, scale: 1.5 + Math.random() * 1.5 });
        }
        return temp;
    }, [count]);

    useEffect(() => {
        if (meshRef.current) {
            particles.forEach((p, i) => {
                dummy.position.set(p.x, 0, p.z);
                dummy.scale.set(p.scale, p.scale, p.scale);
                dummy.updateMatrix();
                meshRef.current.setMatrixAt(i, dummy.matrix);
            });
            meshRef.current.instanceMatrix.needsUpdate = true;
        }
    }, [particles, dummy]);

    return (
        <instancedMesh ref={meshRef} args={[null, null, count]} castShadow receiveShadow>
            <cylinderGeometry args={[1, 2, 30, 8]} />
            <meshStandardMaterial 
                color="#00ffff" 
                emissive="#00ffff" 
                emissiveIntensity={0.8}
                envMapIntensity={envIntensity}
                metalness={0.8}
                roughness={0.3}
            />
        </instancedMesh>
    );
}

function FloatingDebris() {
    const count = 50;
    const meshRef = useRef();

    useFrame((state) => {
        if (meshRef.current) {
            meshRef.current.rotation.y = state.clock.elapsedTime * 0.05;
        }
    });

    const particles = useMemo(() => {
        const temp = [];
        for (let i = 0; i < count; i++) {
            // Keep debris OUTSIDE play area (offset from center)
            const angle = Math.random() * Math.PI * 2;
            const r = 120 + Math.random() * 80; // 120-200 radius
            const x = Math.cos(angle) * r;
            const y = 15 + Math.random() * 40;
            const z = Math.sin(angle) * r;
            temp.push({ position: [x, y, z] });
        }
        return temp;
    }, []);

    return (
        <group ref={meshRef}>
            {particles.map((p, i) => (
                <mesh key={i} position={p.position}>
                    <octahedronGeometry args={[1, 0]} />
                    <meshBasicMaterial color="#ff00ff" wireframe />
                </mesh>
            ))}
        </group>
    );
}
