import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// =============================================================================
// THEMED SCENERY SYSTEM
// Different scenery elements based on track theme
// =============================================================================

export function Scenery({ trackData, graphicsSettings, theme }) {
    const sceneryType = theme?.sceneryType || 'stadium';
    const envIntensity = graphicsSettings?.enableHDR ? 1.2 : 0.8;
    
    return (
        <group>
            {/* Sun/Sky - varies by theme */}
            <ThemeSky theme={theme} sceneryType={sceneryType} />
            
            {/* Theme-specific scenery */}
            {sceneryType === 'stadium' && <StadiumScenery envIntensity={envIntensity} theme={theme} />}
            {sceneryType === 'industrial' && <IndustrialScenery envIntensity={envIntensity} theme={theme} />}
            {sceneryType === 'neon_forest' && <NeonForestScenery envIntensity={envIntensity} theme={theme} />}
            {sceneryType === 'nature' && <NatureScenery envIntensity={envIntensity} theme={theme} />}
            {sceneryType === 'volcanic' && <VolcanicScenery envIntensity={envIntensity} theme={theme} />}
            {sceneryType === 'dragon' && <DragonScenery envIntensity={envIntensity} theme={theme} />}
            {sceneryType === 'mystic' && <MysticScenery envIntensity={envIntensity} theme={theme} />}
            {sceneryType === 'classic' && <ClassicScenery envIntensity={envIntensity} theme={theme} />}
            {sceneryType === 'warning' && <WarningScenery envIntensity={envIntensity} theme={theme} />}
            {sceneryType === 'speed' && <SpeedScenery envIntensity={envIntensity} theme={theme} />}
            {sceneryType === 'roman' && <RomanScenery envIntensity={envIntensity} theme={theme} />}
            {sceneryType === 'prison' && <PrisonScenery envIntensity={envIntensity} theme={theme} />}
            
            {/* Floating 67 Memes - keep the easter egg */}
            <Scattered67s />
            
            {/* Common elements */}
            <FloatingDebris color={theme?.primaryColor || '#ff00ff'} />
        </group>
    );
}

// Theme-specific sky/sun
function ThemeSky({ theme }) {
    const color = theme?.primaryColor || '#ff00ff';
    const secondaryColor = theme?.secondaryColor || '#00ffff';
    
    return (
        <group>
            {/* Giant neon sun */}
            <mesh position={[0, 35, -150]}>
                <circleGeometry args={[50, 64]} />
                <meshBasicMaterial color={color} toneMapped={false} />
            </mesh>
            {/* Sun rings */}
            <NeonRing position={[0, 35, -148]} radius={55} color={color} />
            <NeonRing position={[0, 35, -146]} radius={62} color={secondaryColor} />
            {/* Sun glow */}
            <pointLight position={[0, 40, -150]} intensity={3} color={color} distance={300} />
        </group>
    );
}

// Stadium - spotlights, grandstands feel
function StadiumScenery({ envIntensity, theme }) {
    return (
        <group>
            <ArenaLights color1={theme?.primaryColor} color2={theme?.secondaryColor} />
            <Mountains envIntensity={envIntensity} color="#2a0a4e" />
            <LaserBeams color={theme?.secondaryColor || '#00ff00'} />
            <NeonPalms count={30} envIntensity={envIntensity} color={theme?.primaryColor} />
        </group>
    );
}

// Industrial - metal beams, smoke stacks
function IndustrialScenery({ envIntensity, theme }) {
    const beams = useMemo(() => {
        const arr = [];
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            arr.push({
                x: Math.cos(angle) * 130,
                z: Math.sin(angle) * 130,
                height: 30 + Math.random() * 20,
                rotation: Math.random() * 0.3
            });
        }
        return arr;
    }, []);
    
    return (
        <group>
            {beams.map((beam, i) => (
                <group key={i} position={[beam.x, 0, beam.z]}>
                    <mesh position={[0, beam.height / 2, 0]}>
                        <boxGeometry args={[2, beam.height, 2]} />
                        <meshStandardMaterial color="#444" metalness={0.9} roughness={0.3} />
                    </mesh>
                    <mesh position={[0, beam.height, 0]} rotation={[0, beam.rotation, Math.PI / 4]}>
                        <boxGeometry args={[1, 15, 1]} />
                        <meshStandardMaterial color="#333" metalness={0.9} roughness={0.3} />
                    </mesh>
                    <pointLight position={[0, beam.height, 0]} color={theme?.primaryColor || '#ff6600'} intensity={0.5} distance={20} />
                </group>
            ))}
            <SmokeStacks />
        </group>
    );
}

function SmokeStacks() {
    return (
        <group>
            {[-100, 100].map((x, i) => (
                <group key={i} position={[x, 0, -130]}>
                    <mesh position={[0, 25, 0]}>
                        <cylinderGeometry args={[5, 8, 50, 12]} />
                        <meshStandardMaterial color="#333" metalness={0.8} roughness={0.5} />
                    </mesh>
                    <pointLight position={[0, 50, 0]} color="#ff3300" intensity={0.8} distance={30} />
                </group>
            ))}
        </group>
    );
}

// Neon Forest - glowing trees
function NeonForestScenery({ envIntensity, theme }) {
    const trees = useMemo(() => {
        const arr = [];
        for (let i = 0; i < 50; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 110 + Math.random() * 80;
            arr.push({
                x: Math.cos(angle) * radius,
                z: Math.sin(angle) * radius,
                height: 15 + Math.random() * 25,
                color: Math.random() > 0.5 ? theme?.primaryColor : theme?.secondaryColor
            });
        }
        return arr;
    }, [theme]);
    
    return (
        <group>
            {trees.map((tree, i) => (
                <NeonTree key={i} position={[tree.x, 0, tree.z]} height={tree.height} color={tree.color || '#00ff88'} />
            ))}
        </group>
    );
}

function NeonTree({ position, height, color }) {
    return (
        <group position={position}>
            <mesh position={[0, height / 2, 0]}>
                <cylinderGeometry args={[0.3, 0.5, height, 6]} />
                <meshStandardMaterial color="#331a00" />
            </mesh>
            {[0.6, 0.75, 0.9].map((h, i) => (
                <mesh key={i} position={[0, height * h, 0]}>
                    <coneGeometry args={[3 - i, 5 - i, 6]} />
                    <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} transparent opacity={0.8} />
                </mesh>
            ))}
            <pointLight position={[0, height * 0.7, 0]} color={color} intensity={0.3} distance={15} />
        </group>
    );
}

// Nature - stylized plants
function NatureScenery({ envIntensity, theme }) {
    return (
        <group>
            <NeonForestScenery envIntensity={envIntensity} theme={{ ...theme, primaryColor: '#88ff00', secondaryColor: '#ffffff' }} />
            <Mountains envIntensity={envIntensity} color="#1a4400" />
        </group>
    );
}

// Volcanic - lava pools, rocks
function VolcanicScenery({ envIntensity, theme }) {
    const rocks = useMemo(() => {
        const arr = [];
        for (let i = 0; i < 25; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 100 + Math.random() * 100;
            arr.push({
                x: Math.cos(angle) * radius,
                z: Math.sin(angle) * radius,
                scale: 2 + Math.random() * 5
            });
        }
        return arr;
    }, []);
    
    return (
        <group>
            {rocks.map((rock, i) => (
                <mesh key={i} position={[rock.x, rock.scale / 2, rock.z]}>
                    <dodecahedronGeometry args={[rock.scale, 0]} />
                    <meshStandardMaterial color="#2a1a0a" roughness={0.9} />
                </mesh>
            ))}
            <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[150, 280, 32]} />
                <meshBasicMaterial color="#ff3300" transparent opacity={0.25} />
            </mesh>
            <pointLight position={[0, 5, 0]} color="#ff3300" intensity={2} distance={100} />
        </group>
    );
}

// Dragon/Oriental - floating lanterns (BATCHED ANIMATION)
function DragonScenery({ envIntensity, theme }) {
    const groupRef = useRef();
    const lanterns = useMemo(() => {
        const arr = [];
        for (let i = 0; i < 24; i++) {
            const angle = (i / 24) * Math.PI * 2;
            const radius = 90 + (i % 2) * 30;
            arr.push({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, baseY: 8 + Math.sin(i) * 2, phase: i * 0.5 });
        }
        return arr;
    }, []);
    
    // Single useFrame for all lanterns via parent group bobbing
    useFrame((state) => {
        if (groupRef.current) {
            groupRef.current.position.y = Math.sin(state.clock.elapsedTime) * 0.5;
        }
    });
    
    return (
        <group ref={groupRef}>
            {lanterns.map((l, i) => (
                <Lantern key={i} position={[l.x, l.baseY, l.z]} color={theme?.primaryColor || '#ff0000'} />
            ))}
            <Mountains envIntensity={envIntensity} color="#4a0000" />
        </group>
    );
}

// Static Lantern - no individual useFrame!
function Lantern({ position, color }) {
    return (
        <group position={position}>
            <mesh>
                <cylinderGeometry args={[0.8, 0.8, 1.5, 8]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} transparent opacity={0.9} />
            </mesh>
            <pointLight color={color} intensity={0.5} distance={15} />
        </group>
    );
}

// Mystic - floating crystals (BATCHED ANIMATION)
function MysticScenery({ envIntensity, theme }) {
    const groupRef = useRef();
    const crystals = useMemo(() => {
        const arr = [];
        for (let i = 0; i < 35; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 80 + Math.random() * 100;
            arr.push({
                x: Math.cos(angle) * radius,
                y: 5 + Math.random() * 30,
                z: Math.sin(angle) * radius,
                scale: 1 + Math.random() * 3,
                color: Math.random() > 0.5 ? theme?.primaryColor : theme?.secondaryColor
            });
        }
        return arr;
    }, [theme]);
    
    // Single useFrame rotates entire group instead of 35 individual hooks
    useFrame((state) => {
        if (groupRef.current) {
            groupRef.current.rotation.y = state.clock.elapsedTime * 0.5;
            groupRef.current.position.y = Math.sin(state.clock.elapsedTime) * 2;
        }
    });
    
    return (
        <group ref={groupRef}>
            {crystals.map((c, i) => (
                <FloatingCrystal key={i} position={[c.x, c.y, c.z]} scale={c.scale} color={c.color || '#6600ff'} />
            ))}
        </group>
    );
}

// Static FloatingCrystal - no individual useFrame!
function FloatingCrystal({ position, scale, color }) {
    return (
        <mesh position={position} scale={scale}>
            <octahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} transparent opacity={0.8} />
        </mesh>
    );
}

// Classic racing - checkered flags, banners
function ClassicScenery({ envIntensity, theme }) {
    return (
        <group>
            <ArenaLights color1="#ffffff" color2="#ff0000" />
            <Mountains envIntensity={envIntensity} color="#333" />
            <NeonPalms count={20} envIntensity={envIntensity} color="#ffffff" />
        </group>
    );
}

// Warning - hazard signs
function WarningScenery({ envIntensity, theme }) {
    const barriers = useMemo(() => {
        const arr = [];
        for (let i = 0; i < 16; i++) {
            const angle = (i / 16) * Math.PI * 2;
            arr.push({ x: Math.cos(angle) * 120, z: Math.sin(angle) * 120, rot: (i / 16) * Math.PI * 2 });
        }
        return arr;
    }, []);
    
    return (
        <group>
            {barriers.map((b, i) => (
                <HazardBarrier key={i} position={[b.x, 0, b.z]} rotation={[0, b.rot, 0]} />
            ))}
            <ArenaLights color1="#ffff00" color2="#ff0000" />
        </group>
    );
}

function HazardBarrier({ position, rotation }) {
    return (
        <group position={position} rotation={rotation}>
            <mesh position={[0, 2, 0]}>
                <boxGeometry args={[4, 4, 0.5]} />
                <meshStandardMaterial color="#ffff00" emissive="#ffff00" emissiveIntensity={0.3} />
            </mesh>
        </group>
    );
}

// Speed - motion blur panels
function SpeedScenery({ envIntensity, theme }) {
    return (
        <group>
            <ArenaLights color1={theme?.primaryColor || '#00aaff'} color2={theme?.secondaryColor || '#00ffff'} />
            <LaserBeams color={theme?.primaryColor || '#00aaff'} count={8} />
        </group>
    );
}

// Roman - pillars, torches
function RomanScenery({ envIntensity, theme }) {
    const pillars = useMemo(() => {
        const arr = [];
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            arr.push({ x: Math.cos(angle) * 110, z: Math.sin(angle) * 110 });
        }
        return arr;
    }, []);
    
    return (
        <group>
            {pillars.map((p, i) => (
                <RomanPillar key={i} position={[p.x, 0, p.z]} />
            ))}
        </group>
    );
}

function RomanPillar({ position }) {
    return (
        <group position={position}>
            <mesh position={[0, 1, 0]}>
                <cylinderGeometry args={[2.5, 3, 2, 8]} />
                <meshStandardMaterial color="#d4a574" />
            </mesh>
            <mesh position={[0, 15, 0]}>
                <cylinderGeometry args={[1.5, 2, 26, 8]} />
                <meshStandardMaterial color="#e8d4b8" />
            </mesh>
            <mesh position={[0, 29, 0]}>
                <cylinderGeometry args={[3, 1.5, 2, 8]} />
                <meshStandardMaterial color="#d4a574" />
            </mesh>
            <pointLight position={[0, 30, 0]} color="#ff6600" intensity={1} distance={30} />
        </group>
    );
}

// Prison - chain link, oppressive
function PrisonScenery({ envIntensity, theme }) {
    return (
        <group>
            <ArenaLights color1="#666666" color2="#ff0000" />
            <Mountains envIntensity={envIntensity} color="#1a1a1a" />
        </group>
    );
}

// =============================================================================
// SHARED SCENERY COMPONENTS
// =============================================================================

function NeonRing({ position, radius, color }) {
    const ref = useRef();
    useFrame((state) => {
        if (ref.current) ref.current.rotation.z = state.clock.elapsedTime * 0.1;
    });
    return (
        <mesh ref={ref} position={position}>
            <ringGeometry args={[radius, radius + 1, 64]} />
            <meshBasicMaterial color={color} transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
    );
}

function ArenaLights({ color1 = '#ff00ff', color2 = '#00ffff', castShadow = false }) {
    const lights = useMemo(() => {
        const arr = [];
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            arr.push({ x: Math.cos(angle) * 100, z: Math.sin(angle) * 100, color: i % 2 === 0 ? color1 : color2, phase: i * 0.5 });
        }
        return arr;
    }, [color1, color2]);

    return (
        <group>
            {lights.map((l, i) => (
                <PulsingSpotlight key={i} position={[l.x, 0, l.z]} color={l.color} phase={l.phase} castShadow={castShadow} />
            ))}
        </group>
    );
}

function PulsingSpotlight({ position, color, phase, castShadow }) {
    const ref = useRef();
    useFrame((state) => {
        if (ref.current) ref.current.intensity = 1 + Math.sin(state.clock.elapsedTime * 2 + phase) * 0.5;
    });

    return (
        <group position={position}>
            <mesh rotation={[-Math.PI / 8, 0, 0]}>
                <cylinderGeometry args={[0.5, 8, 50, 8, 1, true]} />
                <meshBasicMaterial color={color} transparent opacity={0.12} side={THREE.DoubleSide} />
            </mesh>
            <pointLight ref={ref} color={color} intensity={1.5} distance={40} castShadow={castShadow} />
        </group>
    );
}

function LaserBeams({ color = '#00ff00', count = 4 }) {
    const ref = useRef();
    useFrame((state) => {
        if (ref.current) ref.current.rotation.y = state.clock.elapsedTime * 0.3;
    });

    return (
        <group ref={ref}>
            {Array(count).fill(0).map((_, i) => (
                <mesh key={i} position={[0, 80, 0]} rotation={[Math.PI / 3, (i / count) * Math.PI * 2, 0]}>
                    <cylinderGeometry args={[0.1, 0.1, 300, 4]} />
                    <meshBasicMaterial color={color} transparent opacity={0.3} />
                </mesh>
            ))}
        </group>
    );
}

function Mountains({ envIntensity, color = '#2a0a4e' }) {
    const geometry = useMemo(() => {
        const geo = new THREE.PlaneGeometry(500, 100, 50, 12);
        const positions = geo.attributes.position;
        for (let i = 0; i < positions.count; i++) {
            positions.setZ(i, Math.random() * 25);
        }
        geo.computeVertexNormals();
        return geo;
    }, []);

    return (
        <mesh position={[0, 0, -180]} rotation={[-Math.PI / 2, 0, 0]}>
            <primitive object={geometry} />
            <meshStandardMaterial color={color} wireframe emissive={color} emissiveIntensity={0.2} envMapIntensity={envIntensity} />
        </mesh>
    );
}

function NeonPalms({ count = 50, envIntensity, color = '#00ffff' }) {
    const meshRef = useRef();
    const dummy = useMemo(() => new THREE.Object3D(), []);

    const particles = useMemo(() => {
        const temp = [];
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const radius = 110 + Math.random() * 70;
            temp.push({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, scale: 1.5 + Math.random() * 1.5 });
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
        <instancedMesh ref={meshRef} args={[null, null, count]}>
            <cylinderGeometry args={[1, 2, 30, 6]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} envMapIntensity={envIntensity} metalness={0.8} roughness={0.3} />
        </instancedMesh>
    );
}

function FloatingDebris({ color = '#ff00ff' }) {
    const meshRef = useRef();
    useFrame((state) => {
        if (meshRef.current) meshRef.current.rotation.y = state.clock.elapsedTime * 0.05;
    });

    const particles = useMemo(() => {
        const temp = [];
        for (let i = 0; i < 25; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 130 + Math.random() * 80;
            temp.push({ position: [Math.cos(angle) * r, 15 + Math.random() * 40, Math.sin(angle) * r] });
        }
        return temp;
    }, []);

    return (
        <group ref={meshRef}>
            {particles.map((p, i) => (
                <mesh key={i} position={p.position}>
                    <octahedronGeometry args={[1, 0]} />
                    <meshBasicMaterial color={color} wireframe />
                </mesh>
            ))}
        </group>
    );
}

// =============================================================================
// EASTER EGG - Floating 67s (BATCHED - single useFrame for all)
// =============================================================================

// Static 67 - no individual useFrame
function Floating67({ position, scale = 1 }) {
    const color = '#67ff67';
    
    return (
        <group position={position} scale={scale}>
            {/* Number "6" */}
            <group position={[-2.5, 0, 0]}>
                <mesh position={[0, 2, 0]}><boxGeometry args={[2, 0.5, 0.5]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} /></mesh>
                <mesh position={[0, 0, 0]}><boxGeometry args={[2, 0.5, 0.5]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} /></mesh>
                <mesh position={[0, -2, 0]}><boxGeometry args={[2, 0.5, 0.5]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} /></mesh>
                <mesh position={[-0.75, 0, 0]}><boxGeometry args={[0.5, 4.5, 0.5]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} /></mesh>
                <mesh position={[0.75, -1, 0]}><boxGeometry args={[0.5, 2.5, 0.5]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} /></mesh>
            </group>
            {/* Number "7" */}
            <group position={[2.5, 0, 0]}>
                <mesh position={[0, 2, 0]}><boxGeometry args={[2, 0.5, 0.5]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} /></mesh>
                <mesh position={[0.5, 0, 0]} rotation={[0, 0, 0.2]}><boxGeometry args={[0.5, 4.5, 0.5]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} /></mesh>
            </group>
            <pointLight color={color} intensity={2} distance={15} />
        </group>
    );
}

// Parent handles all animation with single useFrame
function Scattered67s() {
    const groupRef = useRef();
    
    // Single useFrame animates entire group (rotation + bob)
    useFrame((state) => {
        if (groupRef.current) {
            groupRef.current.rotation.y = state.clock.elapsedTime * 0.1;
            groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 2;
        }
    });
    
    const positions = useMemo(() => {
        const temp = [];
        for (let i = 0; i < 10; i++) {
            const angle = (i / 10) * Math.PI * 2 + Math.random() * 0.5;
            const r = 100 + Math.random() * 80;
            temp.push({ position: [Math.cos(angle) * r, 25 + Math.random() * 30, Math.sin(angle) * r], scale: 1 + Math.random() * 1.5 });
        }
        return temp;
    }, []);
    
    return (
        <group ref={groupRef}>
            {positions.map((p, i) => (
                <Floating67 key={i} position={p.position} scale={p.scale} />
            ))}
        </group>
    );
}
