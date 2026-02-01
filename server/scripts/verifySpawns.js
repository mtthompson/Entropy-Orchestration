const { getAllTracks, getTrackById } = require('../tracks');
const { generateHeightMap, getTerrainHeight, getTerrainPreset } = require('../terrain');

// Configuration
const REQUIRED_CLEARANCE = 2.0; // Spawns must be at least this high above terrain (before +4 offset)
const MAX_SLOPE = 0.5; // Max height difference between nearby points (rough slope check)

function verifyTrack(track) {
    console.log(`Verifying Track: ${track.name} (${track.id})`);

    // 1. Generate Terrain for Track
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
            trackWidth: 55
        }
    );

    let failures = 0;

    // 2. Check Each Spawn Point
    track.spawnPoints.forEach((spawn, index) => {
        const terrainY = getTerrainHeight(heightMap, spawn.x, spawn.z);
        // We add +4 in index.js, so raw spawn should be reasonable relative to terrain.
        // Actually, tracks.js defines x/z. The GAME adds height.
        // We want to ensure spawn.x, spawn.z is on "flat" ground (terrainY approx 0 or consistent).

        // Check if spawn is inside a hill (terrainY > 1 ?? what ensures it's flat?)
        // If terrainY is high, it means the spawn is on a hill.
        // If it's a race track, it SHOULD be on the track path (terrainY ~ 0).
        // If it's an arena, it might be anywhere.

        // Issue: "Inside hills" means the terrain is higher than the car's foot position?
        // With +4 offset, we are likely safe, but let's check if the terrain is unexpectedly high
        // which might indicate spawning inside a wall or steep hill.

        // Slope check: Sample surrounding points
        const d = 2.0;
        const h1 = getTerrainHeight(heightMap, spawn.x + d, spawn.z);
        const h2 = getTerrainHeight(heightMap, spawn.x - d, spawn.z);
        const h3 = getTerrainHeight(heightMap, spawn.x, spawn.z + d);
        const h4 = getTerrainHeight(heightMap, spawn.x, spawn.z - d);

        const maxDiff = Math.max(
            Math.abs(h1 - terrainY),
            Math.abs(h2 - terrainY),
            Math.abs(h3 - terrainY),
            Math.abs(h4 - terrainY)
        );

        const isFlat = maxDiff < MAX_SLOPE;
        const isOnTrack = terrainY < 1.0; // Assuming track level is ~0 (which it is in terrain.js)

        // For RACE tracks, spawns should be on the track (height ~ 0)
        if (track.type === 'race') {
            if (terrainY > 2.0) {
                console.error(`  [FAIL] Spawn ${index} is on high terrain (y=${terrainY.toFixed(2)}). Should be on track (y~0).`);
                failures++;
            }
        }

        // For ANY track, ground shouldn't be super steep at spawn
        if (!isFlat) {
            console.warn(`  [WARN] Spawn ${index} is on steep ground (slope=${maxDiff.toFixed(2)}).`);
            // Not necessarily a failure, but risky.
        }
    });

    if (failures === 0) {
        console.log(`  [PASS] All ${track.spawnPoints.length} spawns valid.`);
        return true;
    } else {
        console.log(`  [FAIL] ${failures} invalid spawns found.`);
        return false;
    }
}

function run() {
    const tracks = getAllTracks();
    let totalFailures = 0;

    tracks.forEach(track => {
        if (!verifyTrack(track)) {
            totalFailures++;
        }
    });

    if (totalFailures > 0) {
        console.error(`\nverification failed: ${totalFailures} tracks have invalid spawns.`);
        process.exit(1);
    } else {
        console.log('\nAll tracks passed verification!');
        process.exit(0);
    }
}

run();
