const { generateHeightMap } = require('../terrain');
const { getTrackById, getAllTracks } = require('../tracks');

// Simple verification script
function verifyTerrainClearance() {
    console.log('Verifying terrain clearance for tracks...');
    const tracks = getAllTracks().slice(0, 3); // Check first 3 tracks

    let allPassed = true;

    for (const track of tracks) {
        if (!track.path) continue; // Skip Arenas for this specific path check

        console.log(`Checking ${track.name} (${track.id})...`);
        const width = track.floorSize.width;
        const depth = track.floorSize.depth;
        const trackWidth = track.width || 50;

        // Generate heightmap with same parameters as server
        const heightMap = generateHeightMap(width, depth, 0.5, {
            trackPath: track.path,
            trackWidth: trackWidth,
            hillScale: 10 // exaggerated to detect leaks
        });

        // Check points along the path
        // We want to check points exactly on the edge of the track width
        let failures = 0;
        const checkPoints = 20;

        for (let i = 0; i < heightMap.matrix.length; i++) {
            for (let j = 0; j < heightMap.matrix[i].length; j++) {
                // skip full scan, just sampling
            }
        }

        // Sampling approach: Pick points along the track center + offset
        for (let i = 0; i < track.path.length - 1; i++) {
            const p1 = track.path[i];
            const p2 = track.path[i + 1];

            // Midpoint
            const midX = (p1.x + p2.x) / 2;
            const midZ = (p1.z + p2.z) / 2;

            // Tangent/Normal to check width edge
            const dx = p2.x - p1.x;
            const dz = p2.z - p1.z;
            const len = Math.sqrt(dx * dx + dz * dz);
            const nx = -dz / len;
            const nz = dx / len;

            // Check EXACTLY at edge (should be 0 height)
            const edgeX = midX + nx * trackWidth * 0.95; // 95% to be safe inside flat zone
            const edgeZ = midZ + nz * trackWidth * 0.95;

            const h = getTerrainHeightMock(heightMap, edgeX, edgeZ);
            if (h > 0.1) {
                console.error(`  FAILURE: High terrain at track edge! ${h.toFixed(2)} at ${edgeX.toFixed(0)},${edgeZ.toFixed(0)}`);
                failures++;
            }
        }

        if (failures === 0) {
            console.log(`  PASS: ${track.name} is clear.`);
        } else {
            console.error(`  FAIL: ${track.name} has ${failures} clipping points.`);
            allPassed = false;
        }
    }

    if (allPassed) {
        console.log('SUCCESS: All checked tracks have valid clearance.');
    } else {
        console.error('FAILURE: Some tracks have clipping issues.');
        process.exit(1);
    }
}

// Duplicate helper from terrain.js because we can't easily require the internal one if not exported
function getTerrainHeightMock(heightMap, x, z) {
    const { matrix, width, depth, elementSize, gridWidth, gridDepth } = heightMap;
    const gridX = (x + width / 2) / elementSize;
    const gridZ = (z + depth / 2) / elementSize;
    const i0 = Math.max(0, Math.min(gridWidth - 2, Math.floor(gridX)));
    const j0 = Math.max(0, Math.min(gridDepth - 2, Math.floor(gridZ)));
    return matrix[i0][j0]; // Simple nearest neighbor for this check is enough to detect non-zero
}

verifyTerrainClearance();
