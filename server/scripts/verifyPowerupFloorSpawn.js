const { getAllTracks, getTrackById, getRandomPointOnTrack } = require('../tracks');
const { generateHeightMap, getTerrainHeight, getTerrainPreset } = require('../terrain');

/**
 * Verify Power-up Floor Spawn
 * Ensures power-ups only spawn on the track floor surface (terrain height = 0)
 */

// Check if a position is on the track floor (flat ground)
function isOnTrackFloor(track, x, z) {
    const preset = getTerrainPreset(track.id, track.type);
    const floorSize = track.floorSize || { width: 300, depth: 300 };
    const terrainWidth = floorSize.width * 1.2;
    const terrainDepth = floorSize.depth * 1.2;

    const heightMap = generateHeightMap(
        terrainWidth,
        terrainDepth,
        preset.resolution,
        {
            hillScale: preset.hillScale,
            hillFrequency: preset.hillFrequency,
            trackPath: track.path,
            trackWidth: track.width || 50,
            trackType: track.type,
            trackRadius: track.radius
        }
    );

    const height = getTerrainHeight(heightMap, x, z);
    return Math.abs(height) < 0.1; // Allow small floating point errors
}

// Get list of power-up spawn position issues
function getPowerupFloorIssues(track, sampleCount = 100) {
    const issues = [];

    for (let i = 0; i < sampleCount; i++) {
        const pos = getRandomPointOnTrack(track);
        if (!isOnTrackFloor(track, pos.x, pos.z)) {
            issues.push({
                track: track.name,
                x: pos.x,
                z: pos.z,
                terrainHeight: getTerrainHeight(
                    generateHeightMap(
                        (track.floorSize?.width || 300) * 1.2,
                        (track.floorSize?.depth || 300) * 1.2,
                        getTerrainPreset(track.id, track.type).resolution,
                        {
                            hillScale: getTerrainPreset(track.id, track.type).hillScale,
                            hillFrequency: getTerrainPreset(track.id, track.type).hillFrequency,
                            trackPath: track.path,
                            trackWidth: track.width || 50,
                            trackType: track.type,
                            trackRadius: track.radius
                        }
                    ),
                    pos.x,
                    pos.z
                )
            });
        }
    }

    return issues;
}

// Main verification
function verifyPowerupFloorSpawn() {
    console.log('Verifying power-up floor spawning for all tracks...\n');

    const TRACKS = getAllTracks();
    let totalIssues = 0;

    TRACKS.forEach(track => {
        console.log(`Checking track: ${track.name} (${track.id})`);
        const issues = getPowerupFloorIssues(track);
        issues.forEach(issue => {
            console.log(`  ❌ Power-up at (${issue.x.toFixed(1)}, ${issue.z.toFixed(1)}) spawned on terrain height ${issue.terrainHeight.toFixed(2)}`);
        });
        if (issues.length === 0) {
            console.log(`  ✅ All power-ups spawn on floor`);
        } else {
            console.log(`  ⚠️  ${issues.length} power-ups spawned off floor`);
            totalIssues += issues.length;
        }
        console.log('');
    });

    if (totalIssues === 0) {
        console.log('🎉 All power-ups spawn on track floor!');
        process.exit(0);
    } else {
        console.log(`❌ Found ${totalIssues} power-up floor spawn issues`);
        process.exit(1);
    }
}

if (require.main === module) {
    verifyPowerupFloorSpawn();
}

module.exports = { verifyPowerupFloorSpawn, isOnTrackFloor, getPowerupFloorIssues };