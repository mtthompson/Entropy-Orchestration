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
function isNearTrack(worldX, worldZ, trackPath, trackWidth) {
    if (!trackPath || trackPath.length < 2) return 0;
    
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
        
        if (dist < trackWidth) {
            const blend = Math.max(0, (dist - trackWidth * 0.7) / (trackWidth * 0.3));
            return 1 - blend;
        }
    }
    return 0;
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
            const worldX = (i / resolution) - width / 2;
            const worldZ = (j / resolution) - depth / 2;
            
            const trackInfluence = isNearTrack(worldX, worldZ, trackPath, trackWidth);
            
            if (trackInfluence > 0.9) {
                matrix[i].push(0);
            } else {
                const noise1 = Math.sin(worldX * hillFrequency) * Math.cos(worldZ * hillFrequency);
                const noise2 = Math.sin(worldX * hillFrequency * 2.3 + 1.5) * Math.cos(worldZ * hillFrequency * 1.7 + 0.8);
                const combinedNoise = (noise1 + noise2 * 0.5) / 1.5;
                
                const height = combinedNoise * hillScale * (1 - trackInfluence);
                matrix[i].push(Math.max(0, height));
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
