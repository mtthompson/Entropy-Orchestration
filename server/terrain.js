// =============================================================================
// TERRAIN HEIGHT SYSTEM
// Provides height maps for physics and rendering
// =============================================================================

/**
 * Generate a simple height map for terrain
 * @param {number} width - Width in world units
 * @param {number} depth - Depth in world units
 * @param {number} resolution - Grid resolution (points per unit)
 * @param {object} options - Configuration options
 * @returns {object} Height map data
 */
function generateHeightMap(width, depth, resolution = 0.2, options = {}) {
    const {
        hillScale = 3,        // Max height of hills
        hillFrequency = 0.02, // Frequency of hills (lower = broader)
        trackPath = null,     // Track path for creating flat racing surface
        trackWidth = 50,      // Width of flat track area
        spawnPoints = [],     // Array of spawn points to flatten
        seed = 12345          // Seed for deterministic generation
    } = options;

    // Calculate grid dimensions
    const gridWidth = Math.ceil(width * resolution);
    const gridDepth = Math.ceil(depth * resolution);
    const elementSize = 1 / resolution;

    // Create height matrix (2D array for cannon-es Heightfield)
    const matrix = [];

    // Pre-calculate track influence for each grid point
    const isNearTrack = (worldX, worldZ) => {
        // 1. Check Spawn Points boundaries (Flatten area around spawns)
        if (spawnPoints && spawnPoints.length > 0) {
            for (const spawn of spawnPoints) {
                const dist = Math.sqrt((worldX - spawn.x) ** 2 + (worldZ - spawn.z) ** 2);
                const spawnRadius = 30.0; // Bit larger to be safe

                if (dist < spawnRadius) {
                    const blend = Math.max(0, (dist - spawnRadius * 0.5) / (spawnRadius * 0.5));
                    return 1 - blend;
                }
            }
        }

        // 2. Arena Clearance (Radius-based)
        if (options.trackType === 'arena' && options.trackRadius) {
            const dist = Math.sqrt(worldX ** 2 + worldZ ** 2);
            const safeZone = options.trackRadius * 1.2;
            const blendZone = options.trackRadius * 2.0;

            if (dist < blendZone) {
                if (dist < safeZone) return 1.0;
                const blendRange = blendZone - safeZone;
                return 1.0 - ((dist - safeZone) / blendRange);
            }
            return 0;
        }

        if (!trackPath || trackPath.length < 2) return 0;

        // 3. Track Path Clearance
        let minInfluence = 0;
        for (let i = 0; i < trackPath.length; i++) {
            const p1 = trackPath[i];
            const p2 = trackPath[(i + 1) % trackPath.length];

            const dx = p2.x - p1.x;
            const dz = p2.z - p1.z;
            const len = Math.sqrt(dx * dx + dz * dz);
            if (len === 0) continue;

            const t = Math.max(0, Math.min(1,
                ((worldX - p1.x) * dx + (worldZ - p1.z) * dz) / (len * len)
            ));

            const projX = p1.x + t * dx;
            const projZ = p1.z + t * dz;
            const dist = Math.sqrt((worldX - projX) ** 2 + (worldZ - projZ) ** 2);

            // Move hills further out for visibility and safety
            const safeZone = trackWidth * 1.8; // Increased from 1.5
            const blendZone = trackWidth * 3.5; // Increased from 3.0

            if (dist < blendZone) {
                let influence = 1.0;
                if (dist > safeZone) {
                    const blendRange = blendZone - safeZone;
                    influence = 1.0 - ((dist - safeZone) / blendRange);
                }
                minInfluence = Math.max(minInfluence, influence);
            }
        }
        return minInfluence;
    };

    // Fractal noise function for more variation
    const getNoiseHeight = (x, z, scale, freq) => {
        // Layer 1: Base hills
        const n1 = Math.sin(x * freq) * Math.cos(z * freq * 0.8);

        // Layer 2: Smaller details
        const freq2 = freq * 2.5;
        const n2 = Math.sin(x * freq2 + 1.2) * Math.sin(z * freq2 - 0.5);

        // Layer 3: Extra variation
        const freq3 = freq * 0.6;
        const n3 = Math.cos(x * freq3 * 1.5 + z * freq3);

        // Combine
        let val = (n1 + n2 * 0.4 + n3 * 0.8);

        // "Pillar" / "Cone" terrain effect: power the positive values to sharpen peaks
        if (val > 0) {
            val = Math.pow(val, 2.5) * 1.5;
        } else {
            val = -Math.pow(Math.abs(val), 1.5); // Depressions stay smoother
        }

        return val * scale;
    };

    // Generate heights
    for (let i = 0; i < gridWidth; i++) {
        matrix.push([]);
        for (let j = 0; j < gridDepth; j++) {
            const worldX = (i / resolution) - (width / 2);
            const worldZ = (j / resolution) - (depth / 2);

            const influence = isNearTrack(worldX, worldZ);

            if (influence >= 1.0) {
                matrix[i].push(0);
            } else {
                let h = getNoiseHeight(worldX, worldZ, hillScale, hillFrequency);
                // Apply influence (1.0 = flat, 0.0 = full height)
                h *= (1.0 - influence);
                matrix[i].push(h);
            }
        }
    }

    return {
        matrix,
        gridWidth,
        gridDepth,
        elementSize,
        width,
        depth,
        hillScale
    };
}

/**
 * Get terrain height at a specific world position
 * @param {object} heightMap - Height map data from generateHeightMap
 * @param {number} x - World X coordinate
 * @param {number} z - World Z coordinate
 * @returns {number} Height at that position
 */
function getTerrainHeight(heightMap, x, z) {
    if (!heightMap || !heightMap.matrix) return 0;

    const { matrix, width, depth, elementSize, gridWidth, gridDepth } = heightMap;

    // Convert world coords to grid coords
    const gridX = (x + width / 2) / elementSize;
    const gridZ = (z + depth / 2) / elementSize;

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

/**
 * Create height map configuration for different track types
 */
const TERRAIN_PRESETS = {
    // Race tracks - flat track surface with prominent hills outside
    race_gentle: {
        hillScale: 5,
        hillFrequency: 0.012,
        resolution: 0.15
    },
    race_hilly: {
        hillScale: 8,
        hillFrequency: 0.018,
        resolution: 0.15
    },
    // Arenas - noticeable undulations
    arena_flat: {
        hillScale: 3,
        hillFrequency: 0.01,
        resolution: 0.12
    },
    arena_bumpy: {
        hillScale: 6,
        hillFrequency: 0.02,
        resolution: 0.15
    },
    // Special themes
    volcanic: {
        hillScale: 10,
        hillFrequency: 0.025,
        resolution: 0.18
    },
    nature: {
        hillScale: 7,
        hillFrequency: 0.015,
        resolution: 0.15
    }
};

/**
 * Get terrain preset for a track ID
 */
function getTerrainPreset(trackId, trackType) {
    const presets = {
        'track_01': 'race_gentle',   // Stadium Oval
        'track_02': 'arena_flat',    // Thunder Dome
        'track_03': 'race_hilly',    // Switchback
        'track_04': 'nature',        // Cloverleaf
        'track_05': 'volcanic',      // Hexagon Heat
        'track_06': 'race_hilly',    // Dragon's Tail
        'track_07': 'arena_bumpy',   // The Octagon
        'track_08': 'race_gentle',   // Grand Prix
        'track_09': 'arena_flat',    // Triangle Terror
        'track_10': 'race_gentle',   // Velocity Strip
        'track_11': 'arena_bumpy',   // The Coliseum
        'track_12': 'arena_flat'     // The Cage
    };

    const presetName = presets[trackId] || (trackType === 'race' ? 'race_gentle' : 'arena_flat');
    return TERRAIN_PRESETS[presetName];
}

module.exports = {
    generateHeightMap,
    getTerrainHeight,
    getTerrainPreset,
    TERRAIN_PRESETS
};
