const { getAllTracks } = require('../server/tracks');
const { generateHeightMap, getTerrainHeight, getTerrainPreset } = require('../server/terrain');

// Tolerance for height check (spawn points should be very close to floor level)
const HEIGHT_TOLERANCE = 0.5; // Allow up to 0.5 units deviation from floor

/**
 * Check if a point is inside a polygon using ray casting algorithm
 * @param {number} px - Point X coordinate
 * @param {number} pz - Point Z coordinate
 * @param {Array} boundaries - Array of boundary segments with x1,z1,x2,z2
 * @returns {boolean} True if point is inside polygon
 */
function isPointInPolygon(px, pz, boundaries) {
    let inside = false;

    for (const boundary of boundaries) {
        const x1 = boundary.x1, z1 = boundary.z1;
        const x2 = boundary.x2, z2 = boundary.z2;

        // Check if point is on boundary (consider as inside)
        if ((px - x1) * (z2 - z1) === (pz - z1) * (x2 - x1) &&
            Math.min(x1, x2) <= px && px <= Math.max(x1, x2) &&
            Math.min(z1, z2) <= pz && pz <= Math.max(z1, z2)) {
            return true;
        }

        // Ray casting algorithm
        if ((z1 > pz) !== (z2 > pz) &&
            (px < x1 + (x2 - x1) * (pz - z1) / (z2 - z1))) {
            inside = !inside;
        }
    }

    return inside;
}

/**
 * Validate that all spawn points for a track are on the track floor and within bounds
 * @param {object} track - Track object with spawnPoints, path, width, boundaries, etc.
 * @returns {object} Validation result with valid boolean and issues array
 */
function validateSpawnFloorHeights(track) {
    const issues = [];
    let allValid = true;

    if (!track.spawnPoints || track.spawnPoints.length === 0) {
        issues.push('No spawn points defined');
        return { valid: false, issues };
    }

    // Get terrain configuration for this track
    const terrainPreset = getTerrainPreset(track.id, track.type);

    // Generate height map for the track
    const heightMap = generateHeightMap(
        track.floorSize.width,
        track.floorSize.depth,
        terrainPreset.resolution,
        {
            ...terrainPreset,
            trackPath: track.path,
            trackWidth: track.width,
            spawnPoints: track.spawnPoints,
            trackType: track.type,
            trackRadius: track.radius
        }
    );

    // Check each spawn point
    for (let i = 0; i < track.spawnPoints.length; i++) {
        const spawn = track.spawnPoints[i];

        // Check height
        const height = getTerrainHeight(heightMap, spawn.x, spawn.z);
        if (Math.abs(height) > HEIGHT_TOLERANCE) {
            issues.push(`Spawn ${i + 1} at (${spawn.x.toFixed(1)}, ${spawn.z.toFixed(1)}) has height ${height.toFixed(2)} (expected ~0)`);
            allValid = false;
        }

        // Check bounds
        if (track.boundaries && track.boundaries.length > 0) {
            const isInside = isPointInPolygon(spawn.x, spawn.z, track.boundaries);
            if (!isInside) {
                issues.push(`Spawn ${i + 1} at (${spawn.x.toFixed(1)}, ${spawn.z.toFixed(1)}) is outside track boundaries`);
                allValid = false;
            }
        } else {
            issues.push(`Track has no boundaries defined for bounds checking`);
            allValid = false;
        }
    }

    return { valid: allValid, issues };
}

function main() {
    console.log('🏁 SPAWN POINT FLOOR & BOUNDS VALIDATION SUITE 🏁');
    console.log('Checking that all spawn points are on the track floor and within bounds...\n');

    const tracks = getAllTracks();
    let passed = 0;
    let failed = 0;

    for (const track of tracks) {
        const result = validateSpawnFloorHeights(track);
        if (result.valid) {
            console.log(`✅ ${track.name} - All spawn points valid`);
            passed++;
        } else {
            console.log(`❌ ${track.name} - ${result.issues.length} issue(s) found:`);
            result.issues.forEach(issue => console.log(`   - ${issue}`));
            failed++;
        }
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log('FINAL RESULTS');
    console.log(`${'='.repeat(70)}`);
    console.log(`Passed: ${passed}/${tracks.length}`);
    console.log(`Failed: ${failed}/${tracks.length}`);

    if (failed > 0) {
        console.log('\n❌ Some tracks have spawn points with issues.');
        console.log('This may cause physics issues or visual glitches.');
    } else {
        console.log('\n✅ All spawn points are properly positioned on the track floor and within bounds!');
    }
}

if (require.main === module) {
    main();
}

module.exports = { validateSpawnFloorHeights };