import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { particleWorkerAPI } from './hooks/useParticleWorker';

// =============================================================================
// PARTICLE EFFECTS SYSTEM
// Tire smoke, collision sparks, powerup bursts, ambient particles
// With optional Web Worker offloading for heavy computations
// =============================================================================

// Check if worker is available (singleton check)
const useWorker = particleWorkerAPI.isAvailable();

// Tire smoke particles - shown during drifting/boosting
export function TireSmoke({ position, active, color = '#888888', intensity = 1 }) {
    const particlesRef = useRef();
    const count = 30;
    
    const particles = useMemo(() => {
        const positions = new Float32Array(count * 3);
        const velocities = [];
        const lifetimes = [];
        
        for (let i = 0; i < count; i++) {
            positions[i * 3] = 0;
            positions[i * 3 + 1] = 0;
            positions[i * 3 + 2] = 0;
            velocities.push({ x: 0, y: 0, z: 0 });
            lifetimes.push(0);
        }
        return { positions, velocities, lifetimes, count };
    }, []);
    
    useFrame((state, delta) => {
        if (!particlesRef.current) return;
        
        const pos = particlesRef.current.geometry.attributes.position;
        
        for (let i = 0; i < particles.count; i++) {
            particles.lifetimes[i] -= delta;
            
            if (particles.lifetimes[i] <= 0 && active) {
                // Respawn particle at position
                pos.setXYZ(i, 
                    position[0] + (Math.random() - 0.5) * 1.5, 
                    position[1] + 0.2, 
                    position[2] + (Math.random() - 0.5) * 1.5
                );
                particles.velocities[i] = {
                    x: (Math.random() - 0.5) * 2 * intensity,
                    y: Math.random() * 2 + 1,
                    z: (Math.random() - 0.5) * 2 * intensity
                };
                particles.lifetimes[i] = Math.random() * 0.4 + 0.2;
            } else if (particles.lifetimes[i] > 0) {
                // Update position
                const v = particles.velocities[i];
                pos.setXYZ(i,
                    pos.getX(i) + v.x * delta,
                    pos.getY(i) + v.y * delta,
                    pos.getZ(i) + v.z * delta
                );
                v.y -= 3 * delta; // Light gravity
            }
        }
        pos.needsUpdate = true;
        
        // Fade when not active
        particlesRef.current.material.opacity = active ? 0.5 : Math.max(0, particlesRef.current.material.opacity - delta * 2);
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
                size={0.6}
                color={color}
                transparent
                opacity={0.5}
                blending={THREE.NormalBlending}
                depthWrite={false}
            />
        </points>
    );
}

// Collision sparks - burst effect on impact
export function CollisionSparks({ position, active, color = '#ffaa00', onComplete }) {
    const particlesRef = useRef();
    const [visible, setVisible] = useState(true);
    const startTime = useRef(Date.now());
    const count = 25;
    
    const particles = useMemo(() => {
        const positions = new Float32Array(count * 3);
        const velocities = [];
        
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const elevation = Math.random() * Math.PI * 0.5;
            const speed = Math.random() * 20 + 10;
            velocities.push({
                x: Math.cos(angle) * Math.cos(elevation) * speed,
                y: Math.sin(elevation) * speed + 5,
                z: Math.sin(angle) * Math.cos(elevation) * speed
            });
            positions[i * 3] = position[0];
            positions[i * 3 + 1] = position[1];
            positions[i * 3 + 2] = position[2];
        }
        return { positions, velocities, count };
    }, [position]);
    
    useFrame((state, delta) => {
        if (!particlesRef.current || !visible) return;
        
        const age = (Date.now() - startTime.current) / 1000;
        if (age > 0.4) {
            setVisible(false);
            onComplete?.();
            return;
        }
        
        const pos = particlesRef.current.geometry.attributes.position;
        
        for (let i = 0; i < particles.count; i++) {
            const v = particles.velocities[i];
            pos.setXYZ(i,
                pos.getX(i) + v.x * delta,
                pos.getY(i) + v.y * delta,
                pos.getZ(i) + v.z * delta
            );
            v.y -= 40 * delta; // Strong gravity
        }
        pos.needsUpdate = true;
        particlesRef.current.material.opacity = 1 - age * 2.5;
    });
    
    if (!visible || !active) return null;
    
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
                size={0.25}
                color={color}
                transparent
                opacity={1}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
            />
        </points>
    );
}

// Powerup pickup burst effect
export function PowerupBurst({ position, color = '#00ff00', onComplete }) {
    const ringsRef = useRef([]);
    const [visible, setVisible] = useState(true);
    const startTime = useRef(Date.now());
    
    useFrame(() => {
        const age = (Date.now() - startTime.current) / 1000;
        if (age > 0.5) {
            setVisible(false);
            onComplete?.();
            return;
        }
        
        ringsRef.current.forEach((ring, i) => {
            if (ring) {
                const scale = 1 + age * (8 + i * 3);
                ring.scale.set(scale, scale, 1);
                ring.material.opacity = (1 - age * 2) * 0.6;
            }
        });
    });
    
    if (!visible) return null;
    
    return (
        <group position={position}>
            {[0, 1, 2].map((i) => (
                <mesh 
                    key={i} 
                    ref={(el) => ringsRef.current[i] = el}
                    rotation={[Math.PI / 2, 0, 0]}
                    position={[0, i * 0.5, 0]}
                >
                    <ringGeometry args={[0.8, 1, 16]} />
                    <meshBasicMaterial 
                        color={color} 
                        transparent 
                        opacity={0.6} 
                        side={THREE.DoubleSide}
                        blending={THREE.AdditiveBlending}
                    />
                </mesh>
            ))}
        </group>
    );
}

// Ambient particles (dust, fireflies, embers based on theme)
export function AmbientParticles({ type = 'dust', bounds, count = 80 }) {
    const particlesRef = useRef();
    const { width = 200, depth = 200 } = bounds || {};
    
    const particles = useMemo(() => {
        const positions = new Float32Array(count * 3);
        const speeds = [];
        
        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * width;
            positions[i * 3 + 1] = Math.random() * 25 + 3;
            positions[i * 3 + 2] = (Math.random() - 0.5) * depth;
            speeds.push(Math.random() * 0.5 + 0.2);
        }
        return { positions, speeds };
    }, [count, width, depth]);
    
    const { color, size, glow } = useMemo(() => {
        switch (type) {
            case 'fireflies': return { color: '#88ff88', size: 0.4, glow: true };
            case 'embers': return { color: '#ff6600', size: 0.3, glow: true };
            case 'sparks': return { color: '#ffff00', size: 0.25, glow: true };
            case 'magic': return { color: '#ff00ff', size: 0.35, glow: true };
            case 'leaves': return { color: '#88ff00', size: 0.5, glow: false };
            case 'confetti': return { color: '#ff00ff', size: 0.4, glow: false };
            case 'flames': return { color: '#ff3300', size: 0.35, glow: true };
            case 'electricity': return { color: '#00ffff', size: 0.2, glow: true };
            case 'speedlines': return { color: '#00aaff', size: 0.15, glow: true };
            default: return { color: '#ffffff', size: 0.2, glow: false };
        }
    }, [type]);
    
    useFrame((state) => {
        if (!particlesRef.current) return;
        const t = state.clock.elapsedTime;
        
        const pos = particlesRef.current.geometry.attributes.position;
        for (let i = 0; i < count; i++) {
            const speed = particles.speeds[i];
            
            // Gentle floating motion
            pos.setY(i, pos.getY(i) + Math.sin(t * speed + i) * 0.02);
            pos.setX(i, pos.getX(i) + Math.cos(t * 0.3 + i * 0.1) * 0.01);
            
            // Wrap around bounds
            if (pos.getY(i) > 30) pos.setY(i, 3);
            if (pos.getY(i) < 2) pos.setY(i, 28);
        }
        pos.needsUpdate = true;
        
        // Pulsing for glowing particles
        if (glow) {
            particlesRef.current.material.opacity = 0.5 + Math.sin(t * 3) * 0.2;
        }
    });
    
    return (
        <points ref={particlesRef}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={count}
                    array={particles.positions}
                    itemSize={3}
                />
            </bufferGeometry>
            <pointsMaterial
                size={size}
                color={color}
                transparent
                opacity={0.6}
                blending={glow ? THREE.AdditiveBlending : THREE.NormalBlending}
                depthWrite={false}
            />
        </points>
    );
}

// Speed lines effect (when boosting)
export function SpeedLinesEffect({ active, cameraPosition, color = '#ffffff' }) {
    const linesRef = useRef();
    const count = 60;
    
    const particles = useMemo(() => {
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 60;
            positions[i * 3 + 1] = Math.random() * 20 + 5;
            positions[i * 3 + 2] = Math.random() * -80 - 20;
        }
        return positions;
    }, []);
    
    useFrame((state, delta) => {
        if (!linesRef.current || !active) return;
        
        const pos = linesRef.current.geometry.attributes.position;
        for (let i = 0; i < count; i++) {
            pos.setZ(i, pos.getZ(i) + 100 * delta);
            if (pos.getZ(i) > 30) {
                pos.setZ(i, Math.random() * -80 - 40);
                pos.setX(i, (Math.random() - 0.5) * 60);
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
                    count={count}
                    array={particles}
                    itemSize={3}
                />
            </bufferGeometry>
            <pointsMaterial
                size={0.4}
                color={color}
                transparent
                opacity={0.7}
                blending={THREE.AdditiveBlending}
                sizeAttenuation={true}
            />
        </points>
    );
}

// Car trail dust kicked up behind vehicles
export function DustTrail({ position, velocity, active, color = '#8b7355' }) {
    const particlesRef = useRef();
    const count = 20;
    
    const particles = useMemo(() => {
        const positions = new Float32Array(count * 3);
        const ages = new Float32Array(count);
        const velocities = [];
        
        for (let i = 0; i < count; i++) {
            positions[i * 3] = 0;
            positions[i * 3 + 1] = 0;
            positions[i * 3 + 2] = 0;
            ages[i] = 0;
            velocities.push({ x: 0, y: 0, z: 0 });
        }
        return { positions, ages, velocities };
    }, []);
    
    const spawnIndex = useRef(0);
    
    useFrame((state, delta) => {
        if (!particlesRef.current) return;
        
        const pos = particlesRef.current.geometry.attributes.position;
        const speed = velocity ? Math.sqrt(velocity.x ** 2 + velocity.z ** 2) : 0;
        
        // Spawn new particles when moving
        if (active && speed > 5) {
            const idx = spawnIndex.current % count;
            pos.setXYZ(idx, position[0], position[1] + 0.1, position[2]);
            particles.ages[idx] = 1;
            particles.velocities[idx] = {
                x: (Math.random() - 0.5) * 2 - (velocity?.x || 0) * 0.1,
                y: Math.random() * 2 + 0.5,
                z: (Math.random() - 0.5) * 2 - (velocity?.z || 0) * 0.1
            };
            spawnIndex.current++;
        }
        
        // Update all particles
        for (let i = 0; i < count; i++) {
            if (particles.ages[i] > 0) {
                particles.ages[i] -= delta * 2;
                const v = particles.velocities[i];
                pos.setXYZ(i,
                    pos.getX(i) + v.x * delta,
                    pos.getY(i) + v.y * delta,
                    pos.getZ(i) + v.z * delta
                );
                v.y -= 2 * delta;
            }
        }
        pos.needsUpdate = true;
    });
    
    return (
        <points ref={particlesRef}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={count}
                    array={particles.positions}
                    itemSize={3}
                />
            </bufferGeometry>
            <pointsMaterial
                size={0.5}
                color={color}
                transparent
                opacity={0.4}
                depthWrite={false}
            />
        </points>
    );
}

export default {
    TireSmoke,
    CollisionSparks,
    PowerupBurst,
    AmbientParticles,
    SpeedLinesEffect,
    DustTrail
};
