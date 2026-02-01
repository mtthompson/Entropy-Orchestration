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
            {sceneryType === 'stadium' && <StadiumScenery envIntensity={envIntensity} theme={theme} trackData={trackData} />}
            {sceneryType === 'industrial' && <IndustrialScenery envIntensity={envIntensity} theme={theme} trackData={trackData} />}
            {sceneryType === 'neon_forest' && <NeonForestScenery envIntensity={envIntensity} theme={theme} />}
            {sceneryType === 'nature' && <NatureScenery envIntensity={envIntensity} theme={theme} />}
            {sceneryType === 'volcanic' && <VolcanicScenery envIntensity={envIntensity} theme={theme} />}
            {sceneryType === 'dragon' && <DragonScenery envIntensity={envIntensity} theme={theme} />}
            {sceneryType === 'mystic' && <MysticScenery envIntensity={envIntensity} theme={theme} />}
            {sceneryType === 'classic' && <ClassicScenery envIntensity={envIntensity} theme={theme} trackData={trackData} />}
            {sceneryType === 'warning' && <WarningScenery envIntensity={envIntensity} theme={theme} />}
            {sceneryType === 'speed' && <SpeedScenery envIntensity={envIntensity} theme={theme} />}
            {sceneryType === 'roman' && <RomanScenery envIntensity={envIntensity} theme={theme} trackData={trackData} />}
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
function StadiumScenery({ envIntensity, theme, trackData }) {
    return (
        <group>
            <ArenaLights color1={theme?.primaryColor} color2={theme?.secondaryColor} trackData={trackData} />
            <Mountains envIntensity={envIntensity} color="#2a0a4e" />
            <LaserBeams color={theme?.secondaryColor || '#00ff00'} trackData={trackData} />
            <NeonPalms count={40} envIntensity={envIntensity} color={theme?.primaryColor} trackData={trackData} />
        </group>
    );
}

// Industrial - metal beams, smoke stacks (INSTANCED)
function IndustrialScenery({ envIntensity, theme, trackData }) {
    const mainBeamRef = useRef();
    const crossBeamRef = useRef();
    const dummy = useMemo(() => new THREE.Object3D(), []);

    const beams = useMemo(() => {
        const arr = [];
        let radius = 130; // Default
        if (trackData) {
            const isArena = trackData.type === 'arena';
            if (isArena) {
                radius = (trackData.radius || 100) * 1.5 + 20;
            } else if (trackData.floorSize) {
                const floorRadius = Math.max(trackData.floorSize.width, trackData.floorSize.depth) / 2;
                radius = floorRadius + 30;
            }
        }
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            arr.push({
                x: Math.cos(angle) * radius,
                z: Math.sin(angle) * radius,
                height: 30 + Math.random() * 20,
                rotation: Math.random() * 0.3
            });
        }
        return arr;
    }, [trackData]);

    useEffect(() => {
        if (mainBeamRef.current && crossBeamRef.current) {
            beams.forEach((beam, i) => {
                // Main Beam
                dummy.position.set(beam.x, beam.height / 2, beam.z);
                dummy.scale.set(2, beam.height, 2);
                dummy.rotation.set(0, 0, 0);
                dummy.updateMatrix();
                mainBeamRef.current.setMatrixAt(i, dummy.matrix);

                // Cross Beam
                dummy.position.set(beam.x, beam.height, beam.z);
                dummy.scale.set(1, 15, 1);
                dummy.rotation.set(0, beam.rotation, Math.PI / 4);
                dummy.updateMatrix();
                crossBeamRef.current.setMatrixAt(i, dummy.matrix);
            });
            mainBeamRef.current.instanceMatrix.needsUpdate = true;
            crossBeamRef.current.instanceMatrix.needsUpdate = true;
        }
    }, [beams, dummy]);

    return (
        <group>
            <instancedMesh ref={mainBeamRef} args={[null, null, beams.length]} frustumCulled={false}>
                <boxGeometry args={[1, 1, 1]} /> {/* Scaled in matrix */}
                <meshStandardMaterial color="#444" metalness={0.9} roughness={0.3} />
            </instancedMesh>
            <instancedMesh ref={crossBeamRef} args={[null, null, beams.length]} frustumCulled={false}>
                <boxGeometry args={[1, 1, 1]} /> {/* Scaled in matrix */}
                <meshStandardMaterial color="#333" metalness={0.9} roughness={0.3} />
            </instancedMesh>
            {beams.map((beam, i) => (
                <pointLight key={i} position={[beam.x, beam.height, beam.z]} color={theme?.primaryColor || '#ff6600'} intensity={0.5} distance={20} />
            ))}
            <SmokeStacks trackData={trackData} />
        </group>
    );
}

function SmokeStacks({ trackData }) {
    const positions = useMemo(() => {
        if (!trackData || !trackData.floorSize) return [[-100, -130], [100, -130]];
        const floorRadius = Math.max(trackData.floorSize.width, trackData.floorSize.depth) / 2;
        const stackZ = -floorRadius - 20;
        return [[-floorRadius - 20, stackZ], [floorRadius + 20, stackZ]];
    }, [trackData]);

    return (
        <group>
            {positions.map((pos, i) => (
                <group key={i} position={[pos[0], 0, pos[1]]}>
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

// Neon Forest - glowing trees (INSTANCED)
function NeonForestScenery({ envIntensity, theme }) {
    const trunkRef = useRef();
    const leafRefs = [useRef(), useRef(), useRef()];
    const dummy = useMemo(() => new THREE.Object3D(), []);

    const trees = useMemo(() => {
        const arr = [];
        for (let i = 0; i < 50; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 110 + Math.random() * 80;
            arr.push({
                x: Math.cos(angle) * radius,
                z: Math.sin(angle) * radius,
                height: 15 + Math.random() * 25,
                color: Math.random() > 0.5 ? theme?.primaryColor : theme?.secondaryColor,
                rot: Math.random() * Math.PI
            });
        }
        return arr;
    }, [theme]);

    useEffect(() => {
        if (trunkRef.current && leafRefs.every(r => r.current)) {
            trees.forEach((tree, i) => {
                const col = new THREE.Color(tree.color);

                // Trunk
                dummy.position.set(tree.x, tree.height / 2, tree.z);
                dummy.scale.set(1, tree.height, 1);
                dummy.rotation.set(0, 0, 0);
                dummy.updateMatrix();
                trunkRef.current.setMatrixAt(i, dummy.matrix);

                // Leaves (3 levels)
                [0.6, 0.75, 0.9].forEach((h, level) => {
                    const leafRef = leafRefs[level];
                    dummy.position.set(tree.x, tree.height * h, tree.z);
                    dummy.scale.set(1, 1, 1);
                    dummy.rotation.set(0, tree.rot, 0);
                    dummy.updateMatrix();
                    leafRef.current.setMatrixAt(i, dummy.matrix);
                    leafRef.current.setColorAt(i, col);
                });
            });
            trunkRef.current.instanceMatrix.needsUpdate = true;
            leafRefs.forEach(r => {
                r.current.instanceMatrix.needsUpdate = true;
                if (r.current.instanceColor) r.current.instanceColor.needsUpdate = true;
            });
        }
    }, [trees, dummy]);

    // Animate pulsing glow
    useFrame((state) => {
        const time = state.clock.elapsedTime;
        leafRefs.forEach((ref, i) => {
            if (ref.current && ref.current.material) {
                // Pulse breathing effect
                ref.current.material.emissiveIntensity = 0.5 + Math.sin(time * 2 + i) * 0.2;
            }
        });
    });

    return (
        <group>
            <instancedMesh ref={trunkRef} args={[null, null, trees.length]} frustumCulled={false}>
                <cylinderGeometry args={[0.3, 0.5, 1, 6]} /> {/* Scaled in matrix? No, height varies */}
                <meshStandardMaterial color="#331a00" />
            </instancedMesh>
            {[0, 1, 2].map(level => (
                <instancedMesh key={level} ref={leafRefs[level]} args={[null, null, trees.length]} frustumCulled={false}>
                    <coneGeometry args={[3 - level, 5 - level, 6]} />
                    <meshStandardMaterial emissiveIntensity={0.5} transparent opacity={0.8} />
                </instancedMesh>
            ))}
            {/* Lights are too many for point lights (50), so we rely on emissive glow */}
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

// Volcanic - lava pools, rocks (INSTANCED)
function VolcanicScenery({ envIntensity, theme }) {
    const meshRef = useRef();
    const dummy = useMemo(() => new THREE.Object3D(), []);

    const rocks = useMemo(() => {
        const arr = [];
        for (let i = 0; i < 25; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 100 + Math.random() * 100;
            arr.push({
                x: Math.cos(angle) * radius,
                z: Math.sin(angle) * radius,
                scale: 2 + Math.random() * 5,
                rot: Math.random() * Math.PI
            });
        }
        return arr;
    }, []);

    useEffect(() => {
        if (meshRef.current) {
            rocks.forEach((rock, i) => {
                dummy.position.set(rock.x, rock.scale / 2, rock.z);
                dummy.scale.set(rock.scale, rock.scale, rock.scale);
                dummy.rotation.set(rock.rot, rock.rot, rock.rot);
                dummy.updateMatrix();
                meshRef.current.setMatrixAt(i, dummy.matrix);
            });
            meshRef.current.instanceMatrix.needsUpdate = true;
        }
    }, [rocks, dummy]);

    return (
        <group>
            <instancedMesh ref={meshRef} args={[null, null, rocks.length]} frustumCulled={false}>
                <dodecahedronGeometry args={[1, 0]} /> {/* Scaled in matrix */}
                <meshStandardMaterial color="#2a1a0a" roughness={0.9} />
            </instancedMesh>
            <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[150, 280, 32]} />
                <meshBasicMaterial color="#ff3300" transparent opacity={0.25} />
            </mesh>
            <pointLight position={[0, 5, 0]} color="#ff3300" intensity={2} distance={100} />
        </group>
    );
}

// Dragon/Oriental - floating lanterns (BATCHED ANIMATION)
// Keep as is, already optimized by parent group bobbing and few lanterns (24)

// Mystic - floating crystals (INSTANCED)
function MysticScenery({ envIntensity, theme }) {
    const groupRef = useRef();
    const meshRef = useRef();
    const dummy = useMemo(() => new THREE.Object3D(), []);

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
                color: Math.random() > 0.5 ? theme?.primaryColor : theme?.secondaryColor,
                rot: Math.random() * Math.PI
            });
        }
        return arr;
    }, [theme]);

    useEffect(() => {
        if (meshRef.current) {
            crystals.forEach((c, i) => {
                const col = new THREE.Color(c.color || '#6600ff');
                dummy.position.set(c.x, c.y, c.z);
                dummy.scale.set(c.scale, c.scale, c.scale);
                dummy.rotation.set(0, c.rot, 0);
                dummy.updateMatrix();
                meshRef.current.setMatrixAt(i, dummy.matrix);
                meshRef.current.setColorAt(i, col);
            });
            meshRef.current.instanceMatrix.needsUpdate = true;
            if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
        }
    }, [crystals, dummy]);

    // Single useFrame rotates entire group instead of individual hooks
    useFrame((state) => {
        if (groupRef.current) {
            groupRef.current.rotation.y = state.clock.elapsedTime * 0.5;
            groupRef.current.position.y = Math.sin(state.clock.elapsedTime) * 2;
        }
    });

    return (
        <group ref={groupRef}>
            <instancedMesh ref={meshRef} args={[null, null, crystals.length]} frustumCulled={false}>
                <octahedronGeometry args={[1, 0]} />
                <meshStandardMaterial emissiveIntensity={0.6} transparent opacity={0.8} />
            </instancedMesh>
        </group>
    );
}

// Classic racing - checkered flags, banners
function ClassicScenery({ envIntensity, theme, trackData }) {
    return (
        <group>
            <ArenaLights color1="#ffffff" color2="#ff0000" />
            <Mountains envIntensity={envIntensity} color="#333" />
            <NeonPalms count={30} envIntensity={envIntensity} color="#ffffff" trackData={trackData} />
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

// Roman - pillars, torches (INSTANCED)
function RomanScenery({ envIntensity, theme, trackData }) {
    const meshRefBase = useRef();
    const meshRefShaft = useRef();
    const meshRefTop = useRef();
    const meshRefTopper = useRef(); // New topper
    const dummy = useMemo(() => new THREE.Object3D(), []);

    const pillars = useMemo(() => {
        const arr = [];
        const isArena = trackData?.type === 'arena';
        const arenaRadius = trackData?.radius || 100;

        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            let radius = isArena ? (arenaRadius * 1.5 + 20) : 130;

            // Base color
            const baseC = i % 3 === 0 ? theme?.primaryColor : (i % 3 === 1 ? theme?.secondaryColor : "#e8d4b8");
            const c = new THREE.Color(baseC);
            // VARYING COLOR: Randomize hue/sat slightly
            c.offsetHSL((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.2, 0);

            arr.push({
                x: Math.cos(angle) * radius,
                z: Math.sin(angle) * radius,
                color: c, // Use the proper Color object
                scale: 1 + Math.random() * 0.3 // Slight height variation
            });
        }
        return arr;
    }, [trackData, theme]);

    useEffect(() => {
        if (meshRefBase.current && meshRefShaft.current && meshRefTop.current && meshRefTopper.current) {
            pillars.forEach((p, i) => {
                // Base
                dummy.position.set(p.x, 1, p.z);
                dummy.scale.set(1, 1, 1);
                dummy.rotation.set(0, 0, 0);
                dummy.updateMatrix();
                meshRefBase.current.setMatrixAt(i, dummy.matrix);

                // Shaft
                dummy.position.set(p.x, 15 * p.scale, p.z);
                dummy.scale.set(1, 1 * p.scale, 1);
                dummy.updateMatrix();
                meshRefShaft.current.setMatrixAt(i, dummy.matrix);
                meshRefShaft.current.setColorAt(i, p.color);

                // Top
                dummy.position.set(p.x, 29 * p.scale, p.z);
                dummy.scale.set(1, 1, 1);
                dummy.updateMatrix();
                meshRefTop.current.setMatrixAt(i, dummy.matrix);

                // Topper (Gem/Orb)
                dummy.position.set(p.x, 32 * p.scale, p.z);
                dummy.scale.set(1.5, 1.5, 1.5);
                dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
                dummy.updateMatrix();
                meshRefTopper.current.setMatrixAt(i, dummy.matrix);
                meshRefTopper.current.setColorAt(i, p.color); // Matches shaft but maybe brighter?
            });
            meshRefBase.current.instanceMatrix.needsUpdate = true;
            meshRefShaft.current.instanceMatrix.needsUpdate = true;
            meshRefShaft.current.instanceColor.needsUpdate = true;
            meshRefTop.current.instanceMatrix.needsUpdate = true;
            meshRefTopper.current.instanceMatrix.needsUpdate = true;
            meshRefTopper.current.instanceColor.needsUpdate = true;
        }
    }, [pillars, dummy]);

    // Animate Toppers
    useFrame((state) => {
        if (meshRefTopper.current) {
            meshRefTopper.current.rotation.y = state.clock.elapsedTime * 0.5;
            // Pulse emission
            if (meshRefTopper.current.material) {
                meshRefTopper.current.material.emissiveIntensity = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.5;
            }
        }
    });

    return (
        <group>
            <instancedMesh ref={meshRefBase} args={[null, null, pillars.length]} frustumCulled={false}>
                <cylinderGeometry args={[2.5, 3, 2, 8]} />
                <meshStandardMaterial color="#d4a574" />
            </instancedMesh>
            <instancedMesh ref={meshRefShaft} args={[null, null, pillars.length]} frustumCulled={false}>
                <cylinderGeometry args={[1.5, 2, 26, 8]} />
                <meshStandardMaterial />
            </instancedMesh>
            <instancedMesh ref={meshRefTop} args={[null, null, pillars.length]} frustumCulled={false}>
                <cylinderGeometry args={[3, 1.5, 2, 8]} />
                <meshStandardMaterial color="#d4a574" />
            </instancedMesh>
            <instancedMesh ref={meshRefTopper} args={[null, null, pillars.length]} frustumCulled={false}>
                <octahedronGeometry args={[1, 0]} />
                <meshStandardMaterial emissive="#ffffff" emissiveIntensity={1} toneMapped={false} />
            </instancedMesh>

            {/* Point lights for each pillar */}
            {pillars.map((p, i) => (
                <pointLight key={i} position={[p.x, 35 * p.scale, p.z]} color={p.color} intensity={2} distance={40} />
            ))}
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

function ArenaLights({ color1 = '#ff00ff', color2 = '#00ffff', castShadow = false, trackData }) {
    const lights = useMemo(() => {
        const arr = [];
        let radius = 100; // Default for arenas
        if (trackData && trackData.type === 'race' && trackData.floorSize) {
            // For race tracks, place outside floor
            const floorRadius = Math.max(trackData.floorSize.width, trackData.floorSize.depth) / 2;
            radius = floorRadius + 20;
        }
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            arr.push({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, color: i % 2 === 0 ? color1 : color2, phase: i * 0.5 });
        }
        return arr;
    }, [color1, color2, trackData]);

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

function LaserBeams({ color = '#00ff00', count = 4, trackData }) {
    const ref = useRef();
    useFrame((state) => {
        if (ref.current) ref.current.rotation.y = state.clock.elapsedTime * 0.3;
    });

    const beamPositions = useMemo(() => {
        if (!trackData || trackData.type === 'arena' || !trackData.floorSize) {
            return Array(count).fill([0, 80, 0]); // Center for arenas or default
        } else {
            // For race tracks, place outside
            const floorRadius = Math.max(trackData.floorSize.width, trackData.floorSize.depth) / 2;
            const radius = floorRadius + 30;
            return Array(count).fill([radius, 80, 0]); // At edge
        }
    }, [count, trackData]);

    return (
        <group ref={ref}>
            {beamPositions.map((pos, i) => (
                <mesh key={i} position={pos} rotation={[Math.PI / 3, (i / count) * Math.PI * 2, 0]}>
                    <cylinderGeometry args={[0.1, 0.1, 300, 4]} />
                    <meshBasicMaterial color={color} transparent opacity={0.3} />
                </mesh>
            ))}
        </group>
    );
}

function Mountains({ envIntensity, color = '#2a0a4e' }) {
    return (
        <group>
            {/* Layer 1: Closest, most detailed */}
            <MountainLayer
                radius={350}
                height={90}
                color={color}
                envIntensity={envIntensity}
                seed={1}
                opacity={1.0}
                rotationOffset={0}
            />
            {/* Layer 2: Transition layer */}
            <MountainLayer
                radius={450}
                height={115}
                color={new THREE.Color(color).multiplyScalar(0.85).getStyle()}
                envIntensity={envIntensity}
                seed={4}
                opacity={0.9}
                rotationOffset={1.5}
            />
            {/* Layer 3: Mid-distance, darker */}
            <MountainLayer
                radius={600}
                height={160}
                color={new THREE.Color(color).multiplyScalar(0.7).getStyle()}
                envIntensity={envIntensity}
                seed={2}
                opacity={0.8}
                rotationOffset={3.0}
            />
            {/* Layer 4: Farthest, massive silhouette */}
            <MountainLayer
                radius={850}
                height={250}
                color={new THREE.Color(color).multiplyScalar(0.4).getStyle()}
                envIntensity={envIntensity}
                seed={3}
                opacity={0.6}
                rotationOffset={4.5}
            />
        </group>
    );
}

function MountainLayer({ radius, height, color, envIntensity, seed, opacity, rotationOffset = 0 }) {
    const geometry = useMemo(() => {
        const geo = new THREE.CylinderGeometry(radius, radius, height, 128, 16, true);
        const positions = geo.attributes.position;
        const vertex = new THREE.Vector3();

        for (let i = 0; i < positions.count; i++) {
            vertex.fromBufferAttribute(positions, i);
            const angle = Math.atan2(vertex.z, vertex.x);
            const yNorm = (vertex.y + height / 2) / height;

            if (yNorm > 0.1) {
                // Vary noise by seed
                const noise1 = Math.sin(angle * (6 + seed)) + Math.cos(angle * (13 + seed)) * 0.5;
                const noise2 = Math.sin(angle * (25 + seed * 5)) * 0.3 + Math.cos(angle * (50 + seed)) * 0.1;

                const displacement = (noise1 * 40) + (noise2 * 10);
                const heightMod = yNorm * ((noise1 * (height * 0.3)) + (noise2 * 10));

                const scale = 1 + (displacement / radius) * yNorm;
                vertex.x *= scale;
                vertex.z *= scale;
                vertex.y += heightMod;
            }
            positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }

        geo.computeVertexNormals();
        return geo;
    }, [radius, height, seed]);

    return (
        <mesh position={[0, -20, 0]} rotation={[0, rotationOffset, 0]}>
            <primitive object={geometry} />
            <meshStandardMaterial
                color={color}
                flatShading={true}
                emissive={color}
                emissiveIntensity={0.2 + opacity * 0.3} // Farthest layers glow less? Or more? Adjusted to blend.
                envMapIntensity={envIntensity}
                side={THREE.BackSide}
                transparent={opacity < 1}
                opacity={opacity}
            />
        </mesh>
    );
}

function NeonPalms({ count = 50, envIntensity, color = '#00ffff', trackData }) {
    const meshRef = useRef();
    const dummy = useMemo(() => new THREE.Object3D(), []);

    const particles = useMemo(() => {
        const temp = [];
        const trackWidth = trackData?.width || 50;
        const isArena = trackData?.type === 'arena';
        const arenaRadius = trackData?.radius || 100;

        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            let radius;

            if (isArena) {
                radius = arenaRadius * 1.5 + Math.random() * 50;
            } else {
                // Place outside the floor bounds
                if (trackData && trackData.floorSize) {
                    const floorRadius = Math.max(trackData.floorSize.width, trackData.floorSize.depth) / 2;
                    radius = floorRadius + 50 + Math.random() * 50; // Outside floor + margin
                } else {
                    radius = 100 + Math.random() * 50; // Default radius when trackData is not available
                }
            }

            temp.push({
                x: Math.cos(angle) * radius,
                z: Math.sin(angle) * radius,
                scale: 1.5 + Math.random() * 1.5,
                colorMod: Math.random() // Used for color variation
            });
        }
        return temp;
    }, [count, trackData]);

    useEffect(() => {
        if (meshRef.current) {
            const baseColor = new THREE.Color(color);
            const altColor = new THREE.Color('#ffffff');

            particles.forEach((p, i) => {
                dummy.position.set(p.x, 0, p.z);
                dummy.scale.set(p.scale, p.scale, p.scale);
                dummy.rotation.y = Math.random() * Math.PI;
                dummy.updateMatrix();
                meshRef.current.setMatrixAt(i, dummy.matrix);

                // Varied colors
                const finalColor = baseColor.clone();
                if (p.colorMod > 0.7) {
                    finalColor.lerp(altColor, (p.colorMod - 0.7) * 2);
                }
                meshRef.current.setColorAt(i, finalColor);
            });
            meshRef.current.instanceMatrix.needsUpdate = true;
            if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
        }
    }, [particles, dummy, color]);

    useFrame((state) => {
        if (meshRef.current && meshRef.current.material) {
            meshRef.current.material.emissiveIntensity = 0.6 + Math.sin(state.clock.elapsedTime * 3) * 0.3;
        }
    });

    return (
        <instancedMesh ref={meshRef} args={[null, null, count]} frustumCulled={false}>
            <cylinderGeometry args={[1, 2, 30, 6]} />
            <meshStandardMaterial emissive={color} emissiveIntensity={0.6} envMapIntensity={envIntensity} metalness={0.8} roughness={0.3} />
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

// Floating 67 with independent 6 and 7 bobbing
function Floating67({ position, scale = 1 }) {
    const color = '#67ff67';
    const sixRef = useRef();
    const sevenRef = useRef();

    // Animate 6 and 7 independently
    useFrame((state) => {
        if (sixRef.current) {
            sixRef.current.position.y = Math.sin(state.clock.elapsedTime * 2.0 + position[0] * 0.1) * 0.5;
        }
        if (sevenRef.current) {
            sevenRef.current.position.y = Math.sin(state.clock.elapsedTime * 2.0 + position[2] * 0.1 + Math.PI) * 0.5;
        }
    });

    return (
        <group position={position} scale={scale}>
            {/* Number "6" */}
            <group ref={sixRef} position={[-2.5, 0, 0]}>
                <mesh position={[0, 2, 0]}><boxGeometry args={[2, 0.5, 0.5]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} /></mesh>
                <mesh position={[0, 0, 0]}><boxGeometry args={[2, 0.5, 0.5]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} /></mesh>
                <mesh position={[0, -2, 0]}><boxGeometry args={[2, 0.5, 0.5]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} /></mesh>
                <mesh position={[-0.75, 0, 0]}><boxGeometry args={[0.5, 4.5, 0.5]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} /></mesh>
                <mesh position={[0.75, -1, 0]}><boxGeometry args={[0.5, 2.5, 0.5]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} /></mesh>
            </group>
            {/* Number "7" */}
            <group ref={sevenRef} position={[2.5, 0, 0]}>
                <mesh position={[0, 2, 0]}><boxGeometry args={[2, 0.5, 0.5]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} /></mesh>
                <mesh position={[0.35, 0, 0]} rotation={[0, 0, -0.3]}><boxGeometry args={[0.5, 4.5, 0.5]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} /></mesh>
            </group>
            <pointLight color={color} intensity={2} distance={15} />
        </group>
    );
}

// Parent handles all animation with single useFrame
function Scattered67s() {
    const groupRef = useRef();

    // Single useFrame animates entire group (rotation)
    useFrame((state) => {
        if (groupRef.current) {
            groupRef.current.rotation.y = state.clock.elapsedTime * 0.1;
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
