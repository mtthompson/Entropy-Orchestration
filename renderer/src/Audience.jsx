import React, { useRef, useMemo } from 'react';
import { generateAudiencePositions } from './AudiencePlacement';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// =============================================================================
// MII-LIKE AUDIENCE SYSTEM
// Instanced low-poly humanoid spectators in grandstands around the track
// =============================================================================

// Instanced crowd for performance (many spectators)
function InstancedCrowd({ data, count }) {
    const bodyMeshRef = useRef();
    const headMeshRef = useRef();
    const dummy = useMemo(() => new THREE.Object3D(), []);

    // Generate Clothing Colors (Bright/Varied)
    const bodyColors = useMemo(() => {
        const palette = ['#ff0066', '#00ffff', '#ffff00', '#00ff00', '#ff6600', '#6600ff', '#ffffff', '#ff00ff', '#3366ff', '#ff3333'];
        const arr = new Float32Array(count * 3);
        const tempColor = new THREE.Color();
        for (let i = 0; i < count; i++) {
            tempColor.set(palette[Math.floor(Math.random() * palette.length)]);
            // Vary brightness slightly
            tempColor.multiplyScalar(0.8 + Math.random() * 0.4);
            arr[i * 3] = tempColor.r;
            arr[i * 3 + 1] = tempColor.g;
            arr[i * 3 + 2] = tempColor.b;
        }
        return arr;
    }, [count]);

    // Generate Head/Skin Colors
    const headColors = useMemo(() => {
        // Diverse skin tones
        const skinTones = ['#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#ffdbac', '#5c3a1e'];
        // Mii-like fantasy colors too? Maybe keep it somewhat grounded or full alien. 
        // Let's mix realistic skin tones with some random fun ones since it's a sci-fi game
        const funColors = ['#A1C6EA', '#C8A2C8', '#D6F8D6']; // Light Alien skins
        const palette = [...skinTones, ...skinTones, ...funColors];

        const arr = new Float32Array(count * 3);
        const tempColor = new THREE.Color();
        for (let i = 0; i < count; i++) {
            tempColor.set(palette[Math.floor(Math.random() * palette.length)]);
            arr[i * 3] = tempColor.r;
            arr[i * 3 + 1] = tempColor.g;
            arr[i * 3 + 2] = tempColor.b;
        }
        return arr;
    }, [count]);

    useFrame((state) => {
        // We update both meshes with the same transforms (relative to their local offset)
        if (!bodyMeshRef.current || !headMeshRef.current) return;

        const t = state.clock.elapsedTime;
        data.forEach((item, i) => {
            const phase = i * 0.5;
            const jump = Math.sin(t * 3 + phase);
            const sway = Math.sin(t * 2 + phase) * 0.1;

            // Base Position
            const x = item.position[0];
            const y = item.position[1] + (jump > 0.85 ? (jump - 0.85) * 3 : 0);
            const z = item.position[2];

            // BODY TRANSFORM
            dummy.position.set(x, y, z);
            dummy.rotation.set(0, item.rotationY, sway);
            dummy.scale.setScalar(2.5); // Body scale
            dummy.updateMatrix();
            bodyMeshRef.current.setMatrixAt(i, dummy.matrix);

            // HEAD TRANSFORM
            // Head sits on top of body. 
            // Body height is ~2.5 units scaled. 
            // We need to offset head relative to the pivot.
            // Actually, simpler to just parent? No, instanced mesh doesn't parent easily.
            // We calculate head world pos.
            // Rotate the offset vector [0, height, 0] by the sway/rotation.

            // Simplified: Head follows body position but with local Y offset
            // Keep rotation sync so they sway together
            // Offset for head: roughly 0.8 (local) * 2.5 (scale) = ~2.0 units up?
            // Let's just visually tweak offset.
            // If origin is center of capsule, head is at y + half_height + radius?

            // Re-use dummy for head, just shift Y locally?
            // Warning: scaling applies to translation if we aren't careful? 
            // setScalar scales the whole matrix.

            // Let's set head position slightly higher based on 'up' vector rotated
            // Ideally we construct the matrix: Translation * Rotation * Scale
            // Head Position = BodyPosition + (UpVector * Offset * Rotation)

            // Hacky but fast way: Just put head higher. Sway might look slightly disconnected if extreme, 
            // but for simple swaying it's fine.

            // Better: Translate 0, 1.2, 0 in local space
            dummy.translateY(1.3); // Move up 1.3 units in LOCAL Y (which includes rotation)
            // Head scale slightly different?
            dummy.scale.setScalar(2.2); // Heads slightly smaller relative to giant body?
            dummy.updateMatrix();
            headMeshRef.current.setMatrixAt(i, dummy.matrix);
        });

        bodyMeshRef.current.instanceMatrix.needsUpdate = true;
        headMeshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <group>
            {/* BODY INSTANCES */}
            <instancedMesh ref={bodyMeshRef} args={[null, null, count]}>
                {/* Body: Capsule without top cap? Or just capsule */}
                <capsuleGeometry args={[0.3, 2.0, 4, 8]} />
                <meshStandardMaterial
                    vertexColors={true}
                    roughness={0.9}
                    metalness={0.0}
                    emissiveIntensity={0}
                />
                <instancedBufferAttribute attach="geometry-attributes-color" args={[bodyColors, 3]} />
            </instancedMesh>

            {/* HEAD INSTANCES */}
            <instancedMesh ref={headMeshRef} args={[null, null, count]}>
                <sphereGeometry args={[0.35, 8, 8]} />
                <meshStandardMaterial
                    vertexColors={true}
                    roughness={0.8}
                    metalness={0.1}
                    emissiveIntensity={0}
                />
                <instancedBufferAttribute attach="geometry-attributes-color" args={[headColors, 3]} />
            </instancedMesh>
        </group>
    );
}

// Main Audience component - places crowd clusters around track
export function Audience({ trackData }) {
    const floorWidth = trackData?.floorSize?.width || 300;
    const floorDepth = trackData?.floorSize?.depth || 300;

    // Generate all spectator positions
    const crowdData = useMemo(() => {
        // Get base cluster positions from logic
        const polygon = trackData?.outerPolygon || trackData?.floorPolygon;
        let clusters = [];

        if (polygon && polygon.length > 2) {
            clusters = generateAudiencePositions(polygon, 12, 18);
        } else {
            // Fallback circular clusters
            const radius = Math.max(floorWidth, floorDepth) * 0.52;
            const count = 48; // Increased from 8
            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2;
                clusters.push({
                    position: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius],
                    rotation: [0, -angle + Math.PI, 0] // Face center
                });
            }
        }

        // Expanded crowd points
        // For each cluster, generate a patch of spectators
        const allSpectators = [];

        clusters.forEach((cluster, clusterIndex) => {
            const cx = cluster.position[0];
            const cy = cluster.position[1];
            const cz = cluster.position[2];
            const rotY = cluster.rotation[1];

            // Smaller, more frequent clusters for better dispersion
            const rows = 1 + Math.floor(Math.random() * 2); // 1-2 rows
            const cols = 2 + Math.floor(Math.random() * 3); // 2-4 cols

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    // Local coords with more spread (2.5 units apart)
                    const lx = (c - cols / 2) * 2.5 + (Math.random() * 1.0);
                    const lz = (r - rows / 2) * 2.5 + (Math.random() * 1.0);

                    // Rotate local coords by rotY
                    const wx = lx * Math.cos(rotY) + lz * Math.sin(rotY);
                    const wz = -lx * Math.sin(rotY) + lz * Math.cos(rotY);

                    // Tiered height: Back rows (higher r) sit higher up
                    const tierHeight = r * 1.5;

                    allSpectators.push({
                        position: [cx + wx, cy + 2.5 + tierHeight, cz + wz],
                        rotationY: rotY + (Math.random() - 0.5) * 0.3 // Slight rotation jitter
                    });
                }
            }
        });

        return allSpectators;

    }, [trackData, floorWidth, floorDepth]);

    return (
        <group>
            <InstancedCrowd data={crowdData} count={crowdData.length} />
        </group>
    );
}

export default Audience;
