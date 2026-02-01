const { getAllTracks } = require('../tracks');
const { generateHeightMap, getTerrainHeight, getTerrainPreset } = require('../terrain');

describe('Spawn Point Verification', () => {
    const tracks = getAllTracks();

    tracks.forEach(track => {
        test(`Track ${track.id} (${track.name}) should have valid spawn points`, () => {
            // 1. Generate Terrain
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

            // 2. Validate Spawns
            track.spawnPoints.forEach((spawn, index) => {
                const terrainY = getTerrainHeight(heightMap, spawn.x, spawn.z);

                // Rule 1: Spawns on Race Tracks must be on the flat track surface (height ~0)
                // We allow some tolerance, say < 2.0 units
                if (track.type === 'race') {
                    expect(terrainY).toBeLessThan(2.0);
                }

                // Rule 2: Slope check - terrain shouldn't change drastically under the car
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

                // Slope shouldn't be insane (car shouldn't spawn on a cliff edge)
                // 3.0 height diff over 2.0 units is steep but maybe drivable.
                expect(maxDiff).toBeLessThan(5.0);
            });
        });
    });
});
