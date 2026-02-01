/**
 * Terrain Generation Worker Thread
 * Offloads heavy heightmap generation from main thread
 */
const { parentPort, workerData } = require('worker_threads');

const workerId = workerData?.workerId || 0;

// =============================================================================
// TERRAIN GENERATION (isolated from terrain.js)
// =============================================================================

/**
 * Check distance from point to track path
 */
function isNearTrack(worldX, worldZ, trackPath, trackWidth, options = {}) {
    // 1. Arena Clearance (Radius-based)
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

    // 2. Track Path Clearance
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
        const safeZone = trackWidth * 1.8;
        const blendZone = trackWidth * 3.5;

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
}

// Fractal noise function for more variation (Must match main thread logic)
function getNoiseHeight(x, z, scale, freq) {
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
}

/**
 * Generate heightmap matrix for cannon-es Heightfield
 */
function generateHeightMap(width, depth, resolution, options) {
    const {
        hillScale = 3,
        hillFrequency = 0.02,
        trackPath = null,
        trackWidth = 50,
        seed = 12345
    } = options;

    const gridWidth = Math.ceil(width * resolution);
    const gridDepth = Math.ceil(depth * resolution);
    const elementSize = 1 / resolution;

    const matrix = [];

    for (let i = 0; i < gridWidth; i++) {
        matrix.push([]);
        for (let j = 0; j < gridDepth; j++) {
            const worldX = (i / resolution) - (width / 2);
            const worldZ = (j / resolution) - (depth / 2);

            const influence = isNearTrack(worldX, worldZ, trackPath, trackWidth, options);

            if (influence >= 1.0) {
                matrix[i].push(0);
            } else {
                let h = getNoiseHeight(worldX, worldZ, hillScale, hillFrequency);
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
        depth
    };
}

/**
 * Get terrain preset by track ID
 */
function getTerrainPreset(trackId) {
    const presets = {
        track_01: { hillScale: 4, hillFrequency: 0.02, trackWidth: 60 },
        track_02: { hillScale: 2, hillFrequency: 0.03, trackWidth: 50 },
        track_03: { hillScale: 6, hillFrequency: 0.015, trackWidth: 55 },
        track_04: { hillScale: 3, hillFrequency: 0.025, trackWidth: 50 },
        track_05: { hillScale: 8, hillFrequency: 0.018, trackWidth: 65 },
        track_06: { hillScale: 5, hillFrequency: 0.02, trackWidth: 55 },
        track_07: { hillScale: 4, hillFrequency: 0.022, trackWidth: 50 },
        track_08: { hillScale: 2, hillFrequency: 0.03, trackWidth: 60 },
        track_09: { hillScale: 5, hillFrequency: 0.02, trackWidth: 50 },
        track_10: { hillScale: 3, hillFrequency: 0.025, trackWidth: 55 },
        track_11: { hillScale: 6, hillFrequency: 0.015, trackWidth: 70 },
        track_12: { hillScale: 4, hillFrequency: 0.02, trackWidth: 45 }
    };

    return presets[trackId] || { hillScale: 3, hillFrequency: 0.02, trackWidth: 50 };
}

// =============================================================================
// MESSAGE HANDLER
// =============================================================================

parentPort.on('message', (message) => {
    const { taskId, type, payload } = message;

    try {
        let result;

        switch (type) {
            case 'generateHeightMap': {
                const { width, depth, resolution, options, trackId } = payload;

                // Merge preset with provided options
                const preset = trackId ? getTerrainPreset(trackId) : {};
                const mergedOptions = { ...preset, ...options };

                console.log(`[TerrainWorker ${workerId}] Generating heightmap ${width}x${depth} @ ${resolution} res`);
                const startTime = Date.now();

                result = generateHeightMap(width, depth, resolution, mergedOptions);

                console.log(`[TerrainWorker ${workerId}] Heightmap complete in ${Date.now() - startTime}ms`);
                break;
            }

            case 'generateBatch': {
                // Generate multiple heightmaps (for pre-loading)
                const { tracks } = payload;

                result = tracks.map(track => ({
                    trackId: track.trackId,
                    heightMap: generateHeightMap(
                        track.width,
                        track.depth,
                        track.resolution,
                        { ...getTerrainPreset(track.trackId), ...track.options }
                    )
                }));
                break;
            }

            default:
                throw new Error(`Unknown task type: ${type}`);
        }

        parentPort.postMessage({ taskId, data: result });

    } catch (error) {
        console.error(`[TerrainWorker ${workerId}] Error:`, error);
        parentPort.postMessage({ taskId, error: error.message });
    }
});

console.log(`[TerrainWorker ${workerId}] Ready`);
