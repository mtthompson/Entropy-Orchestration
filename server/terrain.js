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
        if (!trackPath || trackPath.length < 2) return 0;
        
        // Check distance to track center line
        for (let i = 0; i < trackPath.length; i++) {
            const p1 = trackPath[i];
            const p2 = trackPath[(i + 1) % trackPath.length];
            
            // Point-to-line-segment distance
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
            
            if (dist < trackWidth) {
                // Smoothly blend from track (flat) to terrain
                const blend = Math.max(0, (dist - trackWidth * 0.7) / (trackWidth * 0.3));
                return 1 - blend;
            }
        }
        return 0;
    };

    // Generate heights
    for (let i = 0; i < gridWidth; i++) {
        matrix.push([]);
        for (let j = 0; j < gridDepth; j++) {
            // Convert grid to world coordinates
            const worldX = (i / resolution) - width / 2;
            const worldZ = (j / resolution) - depth / 2;
            
            // Check if near track (should be flat)
            const trackInfluence = isNearTrack(worldX, worldZ);
            
            if (trackInfluence > 0.9) {
                // On track - completely flat
                matrix[i].push(0);
            } else {
                // Off track - generate terrain
                // Use sine waves for smooth, predictable hills
                const noise1 = Math.sin(worldX * hillFrequency) * Math.cos(worldZ * hillFrequency);
                const noise2 = Math.sin(worldX * hillFrequency * 2.3 + 1.5) * Math.cos(worldZ * hillFrequency * 1.7 + 0.8);
                const combinedNoise = (noise1 + noise2 * 0.5) / 1.5;
                
                // Apply height, blended by track influence
                const height = combinedNoise * hillScale * (1 - trackInfluence);
                matrix[i].push(Math.max(0, height)); // No negative heights (no holes)
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
    // Race tracks - flat track surface with hills outside
    race_gentle: {
        hillScale: 2,
        hillFrequency: 0.015,
        resolution: 0.1
    },
    race_hilly: {
        hillScale: 4,
        hillFrequency: 0.02,
        resolution: 0.1
    },
    // Arenas - mostly flat with gentle undulations
    arena_flat: {
        hillScale: 1,
        hillFrequency: 0.01,
        resolution: 0.08
    },
    arena_bumpy: {
        hillScale: 2,
        hillFrequency: 0.025,
        resolution: 0.1
    },
    // Special themes
    volcanic: {
        hillScale: 5,
        hillFrequency: 0.03,
        resolution: 0.12
    },
    nature: {
        hillScale: 3,
        hillFrequency: 0.018,
        resolution: 0.1
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
