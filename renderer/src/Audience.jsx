import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// =============================================================================
// MII-LIKE AUDIENCE SYSTEM
// Instanced low-poly humanoid spectators in grandstands around the track
// =============================================================================

// Single Mii-like character (used for small counts)
function MiiCharacter({ position, color, scale = 1, phase = 0 }) {
    const groupRef = useRef();
    
    useFrame((state) => {
        if (groupRef.current) {
            // Gentle swaying animation
            groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 2 + phase) * 0.1;
            // Occasional jumping
            const jump = Math.sin(state.clock.elapsedTime * 4 + phase);
            groupRef.current.position.y = position[1] + (jump > 0.9 ? (jump - 0.9) * 2 : 0);
        }
    });
    
    return (
        <group ref={groupRef} position={position} scale={scale}>
            {/* Head - sphere */}
            <mesh position={[0, 1.4, 0]}>
                <sphereGeometry args={[0.3, 8, 6]} />
                <meshStandardMaterial color="#ffd5b5" />
            </mesh>
            {/* Body */}
            <mesh position={[0, 0.8, 0]}>
                <capsuleGeometry args={[0.25, 0.5, 4, 8]} />
                <meshStandardMaterial color={color} />
            </mesh>
            {/* Arms */}
            <mesh position={[0.35, 0.9, 0]} rotation={[0, 0, -0.3]}>
                <capsuleGeometry args={[0.08, 0.3, 4, 6]} />
                <meshStandardMaterial color="#ffd5b5" />
            </mesh>
            <mesh position={[-0.35, 0.9, 0]} rotation={[0, 0, 0.3]}>
                <capsuleGeometry args={[0.08, 0.3, 4, 6]} />
                <meshStandardMaterial color="#ffd5b5" />
            </mesh>
            {/* Legs */}
            <mesh position={[0.12, 0.25, 0]}>
                <capsuleGeometry args={[0.1, 0.3, 4, 6]} />
                <meshStandardMaterial color="#333" />
            </mesh>
            <mesh position={[-0.12, 0.25, 0]}>
                <capsuleGeometry args={[0.1, 0.3, 4, 6]} />
                <meshStandardMaterial color="#333" />
            </mesh>
        </group>
    );
}

// Instanced crowd for performance (many spectators)
function InstancedCrowd({ positions, colors, count }) {
    const meshRef = useRef();
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const colorArray = useMemo(() => new Float32Array(count * 3), [count]);
    
    // Set up instances
    useMemo(() => {
        positions.forEach((pos, i) => {
            dummy.position.set(pos.x, pos.y, pos.z);
            dummy.scale.setScalar(0.8 + Math.random() * 0.2);
            dummy.updateMatrix();
            
            // Set color
            const color = new THREE.Color(colors[i % colors.length]);
            colorArray[i * 3] = color.r;
            colorArray[i * 3 + 1] = color.g;
            colorArray[i * 3 + 2] = color.b;
        });
    }, [positions, colors, dummy, colorArray]);
    
    useFrame((state) => {
        if (!meshRef.current) return;
        
        const t = state.clock.elapsedTime;
        positions.forEach((pos, i) => {
            // Animate each instance
            const phase = i * 0.5;
            const jump = Math.sin(t * 3 + phase);
            const sway = Math.sin(t * 2 + phase) * 0.1;
            
            dummy.position.set(pos.x, pos.y + (jump > 0.85 ? (jump - 0.85) * 3 : 0), pos.z);
            dummy.rotation.z = sway;
            dummy.scale.setScalar(0.8);
            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
    });
    
    return (
        <instancedMesh ref={meshRef} args={[null, null, count]}>
            <capsuleGeometry args={[0.3, 1.2, 4, 8]} />
            <meshStandardMaterial vertexColors={false} color="#ff6699" />
        </instancedMesh>
    );
}

// Grandstand structure with seating
function Grandstand({ position, rotation, rows = 3, seatsPerRow = 10, theme }) {
    const colors = useMemo(() => {
        const palette = ['#ff0066', '#00ffff', '#ffff00', '#00ff00', '#ff6600', '#6600ff', '#ffffff', '#ff00ff'];
        return Array(rows * seatsPerRow).fill(0).map(() => 
            palette[Math.floor(Math.random() * palette.length)]
        );
    }, [rows, seatsPerRow]);
    
    const seats = useMemo(() => {
        const arr = [];
        for (let row = 0; row < rows; row++) {
            for (let seat = 0; seat < seatsPerRow; seat++) {
                arr.push({
                    x: (seat - seatsPerRow / 2) * 1.2,
                    y: row * 1.8 + 0.5,
                    z: row * 1.0,
                    color: colors[row * seatsPerRow + seat],
                    phase: Math.random() * Math.PI * 2
                });
            }
        }
        return arr;
    }, [rows, seatsPerRow, colors]);
    
    const structureColor = theme?.wallColor || '#333';
    
    return (
        <group position={position} rotation={rotation}>
            {/* Grandstand structure - stepped seating */}
            {Array(rows).fill(0).map((_, row) => (
                <mesh key={row} position={[0, row * 0.9, row * 0.5]}>
                    <boxGeometry args={[seatsPerRow * 1.3, 0.8, 1.2]} />
                    <meshStandardMaterial color="#1a1a1a" metalness={0.5} roughness={0.8} />
                </mesh>
            ))}
            
            {/* Back wall */}
            <mesh position={[0, rows * 1.2, rows * 0.6]}>
                <boxGeometry args={[seatsPerRow * 1.4, rows * 2.5, 0.3]} />
                <meshStandardMaterial color={structureColor} metalness={0.6} roughness={0.5} />
            </mesh>
            
            {/* Side walls */}
            <mesh position={[-seatsPerRow * 0.65, rows * 0.8, rows * 0.3]}>
                <boxGeometry args={[0.3, rows * 2, rows * 1.2]} />
                <meshStandardMaterial color={structureColor} metalness={0.6} roughness={0.5} />
            </mesh>
            <mesh position={[seatsPerRow * 0.65, rows * 0.8, rows * 0.3]}>
                <boxGeometry args={[0.3, rows * 2, rows * 1.2]} />
                <meshStandardMaterial color={structureColor} metalness={0.6} roughness={0.5} />
            </mesh>
            
            {/* Spectators */}
            {seats.map((seat, i) => (
                <MiiCharacter 
                    key={i}
                    position={[seat.x, seat.y, seat.z - rows * 0.2]}
                    color={seat.color}
                    scale={0.7}
                    phase={seat.phase}
                />
            ))}
            
            {/* Railing */}
            <mesh position={[0, 0.8, -0.5]}>
                <boxGeometry args={[seatsPerRow * 1.3, 0.1, 0.05]} />
                <meshStandardMaterial color="#888" metalness={0.8} />
            </mesh>
        </group>
    );
}

// Main Audience component - places grandstands around track
export function Audience({ trackData, theme }) {
    const floorWidth = trackData?.floorSize?.width || 300;
    const floorDepth = trackData?.floorSize?.depth || 300;
    
    // Position grandstands around the perimeter
    const grandstands = useMemo(() => {
        const stands = [];
        const radius = Math.max(floorWidth, floorDepth) * 0.52;
        const count = 4; // 4 grandstands around track
        
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 + Math.PI / 4;
            stands.push({
                position: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius],
                rotation: [0, -angle + Math.PI, 0],
                rows: 3 + Math.floor(Math.random() * 2),
                seats: 8 + Math.floor(Math.random() * 5)
            });
        }
        return stands;
    }, [floorWidth, floorDepth]);
    
    return (
        <group>
            {grandstands.map((stand, i) => (
                <Grandstand
                    key={i}
                    position={stand.position}
                    rotation={stand.rotation}
                    rows={stand.rows}
                    seatsPerRow={stand.seats}
                    theme={theme}
                />
            ))}
        </group>
    );
}

export default Audience;
