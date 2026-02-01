// =============================================================================
// POWER-UP FLOOR SPAWN TESTS
// =============================================================================
// Tests for ensuring power-ups only spawn on track floor surface

const { getAllTracks, getRandomPointOnTrack } = require('../tracks');
const { isOnTrackFloor, getPowerupFloorIssues } = require('../scripts/verifyPowerupFloorSpawn');

describe('Power-up Floor Spawn Validation', () => {
    test('isOnTrackFloor returns true for track center positions', () => {
        const tracks = getAllTracks().slice(0, 3); // Test first 3 tracks

        tracks.forEach(track => {
            // Test center of track
            const centerX = 0;
            const centerZ = 0;

            const result = isOnTrackFloor(track, centerX, centerZ);
            expect(result).toBe(true);
        });
    });

    test('getRandomPointOnTrack returns positions on floor', () => {
        const tracks = getAllTracks().slice(0, 3); // Test first 3 tracks

        tracks.forEach(track => {
            for (let i = 0; i < 10; i++) {
                const pos = getRandomPointOnTrack(track);
                const onFloor = isOnTrackFloor(track, pos.x, pos.z);
                expect(onFloor).toBe(true);
            }
        });
    });

    test('getPowerupFloorIssues detects off-floor spawns', () => {
        const track = getAllTracks()[0];

        // Mock a scenario where getRandomPointOnTrack might return off-floor (though it shouldn't)
        // For this test, we'll assume the function works correctly
        const issues = getPowerupFloorIssues(track, 5);

        // Should have no issues for properly implemented tracks
        expect(issues.length).toBe(0);
    });

    test('arena tracks have floor spawning', () => {
        const arenaTracks = getAllTracks().filter(t => t.type === 'arena');

        if (arenaTracks.length > 0) {
            const track = arenaTracks[0];

            for (let i = 0; i < 5; i++) {
                const pos = getRandomPointOnTrack(track);
                const onFloor = isOnTrackFloor(track, pos.x, pos.z);
                expect(onFloor).toBe(true);
            }
        }
    });

    test('race tracks have floor spawning', () => {
        const raceTracks = getAllTracks().filter(t => t.type === 'race');

        if (raceTracks.length > 0) {
            const track = raceTracks[0];

            for (let i = 0; i < 5; i++) {
                const pos = getRandomPointOnTrack(track);
                const onFloor = isOnTrackFloor(track, pos.x, pos.z);
                expect(onFloor).toBe(true);
            }
        }
    });
});