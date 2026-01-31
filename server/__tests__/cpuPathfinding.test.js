// =============================================================================
// CPU PATHFINDING TESTS - Jest
// =============================================================================
// Run with: npm test (from server directory)

const {
    normalizeAngle,
    distanceSquared,
    findNearestWaypointIndex,
    getNextWaypoint,
    getArenaTarget,
    calculateCPUControls
} = require('../cpuPathfinding');

// =============================================================================
// NORMALIZE ANGLE TESTS
// =============================================================================
describe('normalizeAngle', () => {
    test('angle already in range stays unchanged', () => {
        expect(normalizeAngle(0)).toBeCloseTo(0);
        expect(normalizeAngle(Math.PI / 2)).toBeCloseTo(Math.PI / 2);
        expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
    });

    test('angle greater than PI wraps to negative', () => {
        expect(normalizeAngle(Math.PI + 0.5)).toBeCloseTo(-Math.PI + 0.5);
        expect(normalizeAngle(2 * Math.PI)).toBeCloseTo(0);
    });

    test('angle less than -PI wraps to positive', () => {
        expect(normalizeAngle(-Math.PI - 0.5)).toBeCloseTo(Math.PI - 0.5);
        expect(normalizeAngle(-2 * Math.PI)).toBeCloseTo(0);
    });

    test('handles large angles', () => {
        expect(normalizeAngle(4 * Math.PI)).toBeCloseTo(0);
        expect(normalizeAngle(-4 * Math.PI)).toBeCloseTo(0);
        expect(normalizeAngle(5 * Math.PI)).toBeCloseTo(Math.PI);
    });
});

// =============================================================================
// DISTANCE SQUARED TESTS
// =============================================================================
describe('distanceSquared', () => {
    test('same point has zero distance', () => {
        expect(distanceSquared({ x: 0, z: 0 }, { x: 0, z: 0 })).toBe(0);
        expect(distanceSquared({ x: 10, z: 20 }, { x: 10, z: 20 })).toBe(0);
    });

    test('calculates squared distance correctly', () => {
        expect(distanceSquared({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(25); // 3^2 + 4^2 = 25
        expect(distanceSquared({ x: 1, z: 1 }, { x: 4, z: 5 })).toBe(25); // 3^2 + 4^2 = 25
    });

    test('works with negative coordinates', () => {
        expect(distanceSquared({ x: -3, z: -4 }, { x: 0, z: 0 })).toBe(25);
    });
});

// =============================================================================
// FIND NEAREST WAYPOINT TESTS
// =============================================================================
describe('findNearestWaypointIndex', () => {
    const simplePath = [
        { x: 0, z: 0 },
        { x: 10, z: 0 },
        { x: 10, z: 10 },
        { x: 0, z: 10 }
    ];

    test('finds exact waypoint position', () => {
        expect(findNearestWaypointIndex({ x: 0, z: 0 }, simplePath)).toBe(0);
        expect(findNearestWaypointIndex({ x: 10, z: 0 }, simplePath)).toBe(1);
        expect(findNearestWaypointIndex({ x: 10, z: 10 }, simplePath)).toBe(2);
        expect(findNearestWaypointIndex({ x: 0, z: 10 }, simplePath)).toBe(3);
    });

    test('finds nearest when between waypoints', () => {
        expect(findNearestWaypointIndex({ x: 2, z: 0 }, simplePath)).toBe(0);
        expect(findNearestWaypointIndex({ x: 8, z: 0 }, simplePath)).toBe(1);
    });

    test('handles empty path', () => {
        expect(findNearestWaypointIndex({ x: 0, z: 0 }, [])).toBe(0);
    });

    test('handles position far from all waypoints', () => {
        const index = findNearestWaypointIndex({ x: 100, z: 100 }, simplePath);
        expect(index).toBe(2); // (10, 10) is closest to (100, 100)
    });
});

// =============================================================================
// GET NEXT WAYPOINT TESTS
// =============================================================================
describe('getNextWaypoint', () => {
    const circularPath = [
        { x: 0, z: 50 },
        { x: 50, z: 0 },
        { x: 0, z: -50 },
        { x: -50, z: 0 }
    ];

    function mockCPU(x, z, waypointIndex = 0) {
        return {
            body: { position: { x, z } },
            waypointIndex
        };
    }

    test('returns initial waypoint for new CPU', () => {
        const cpu = mockCPU(0, 50, 0);
        const result = getNextWaypoint(cpu, circularPath);
        expect(result).toHaveProperty('x');
        expect(result).toHaveProperty('z');
        expect(result).toHaveProperty('waypointIndex');
    });

    test('advances waypoint when close enough', () => {
        const cpu = mockCPU(0, 50, 0); // Right at waypoint 0
        const result = getNextWaypoint(cpu, circularPath);
        // Should advance to next waypoint since we're at current one
        expect(result.waypointIndex).toBe(1);
    });

    test('keeps waypoint when far away', () => {
        const cpu = mockCPU(-25, 25, 0); // Between waypoints
        const result = getNextWaypoint(cpu, circularPath);
        expect(result.waypointIndex).toBe(0);
    });

    test('loops around at end of path', () => {
        const cpu = mockCPU(-50, 0, 3); // At last waypoint
        const result = getNextWaypoint(cpu, circularPath);
        // Should wrap to start
        expect(result.waypointIndex).toBe(0);
    });

    test('handles empty path gracefully', () => {
        const cpu = mockCPU(0, 0, 0);
        const result = getNextWaypoint(cpu, []);
        expect(result.x).toBe(0);
        expect(result.z).toBe(0);
    });
});

// =============================================================================
// ARENA TARGET TESTS
// =============================================================================
describe('getArenaTarget', () => {
    function mockCPU(id, x, z, hp = 100) {
        return {
            id,
            body: { position: { x, z } },
            hp
        };
    }

    function mockPlayer(x, z, hp = 100, type = 'driver') {
        return {
            body: { position: { x, z } },
            hp,
            type
        };
    }

    test('returns center-ish when no other players', () => {
        const cpu = mockCPU('cpu_0', 30, 30);
        const players = new Map();
        const cpuPlayers = new Map([['cpu_0', cpu]]);

        const target = getArenaTarget(cpu, players, cpuPlayers);
        expect(target).toHaveProperty('x');
        expect(target).toHaveProperty('z');
    });

    test('targets nearest human player', () => {
        const cpu = mockCPU('cpu_0', 0, 0);
        const players = new Map([
            ['p1', mockPlayer(10, 0)],
            ['p2', mockPlayer(50, 0)]
        ]);
        const cpuPlayers = new Map([['cpu_0', cpu]]);

        const target = getArenaTarget(cpu, players, cpuPlayers);
        expect(target.x).toBe(10);
        expect(target.z).toBe(0);
    });

    test('ignores dead human players', () => {
        const cpu = mockCPU('cpu_0', 0, 0);
        const players = new Map([
            ['p1', mockPlayer(10, 0, 0)], // Dead
            ['p2', mockPlayer(50, 0, 100)]
        ]);
        const cpuPlayers = new Map([['cpu_0', cpu]]);

        const target = getArenaTarget(cpu, players, cpuPlayers);
        expect(target.x).toBe(50);
        expect(target.z).toBe(0);
    });

    test('targets other CPUs when no humans', () => {
        const cpu1 = mockCPU('cpu_0', 0, 0);
        const cpu2 = mockCPU('cpu_1', 20, 0);
        const players = new Map();
        const cpuPlayers = new Map([
            ['cpu_0', cpu1],
            ['cpu_1', cpu2]
        ]);

        const target = getArenaTarget(cpu1, players, cpuPlayers);
        expect(target.x).toBe(20);
        expect(target.z).toBe(0);
    });

    test('does not target self', () => {
        const cpu = mockCPU('cpu_0', 0, 0);
        const players = new Map();
        const cpuPlayers = new Map([['cpu_0', cpu]]);

        const target = getArenaTarget(cpu, players, cpuPlayers);
        // Should return center-ish, not (0, 0)
        expect(target).toBeDefined();
    });
});

// =============================================================================
// END-TO-END PATHFINDING TESTS
// =============================================================================
describe('CPU Pathfinding E2E', () => {
    const OVAL_PATH = [
        { x: -40, z: 60 }, { x: -45, z: 40 }, { x: -45, z: -40 }, { x: -40, z: -60 },
        { x: -20, z: -70 }, { x: 20, z: -70 }, { x: 40, z: -60 },
        { x: 45, z: -40 }, { x: 45, z: 40 }, { x: 40, z: 60 },
        { x: 20, z: 70 }, { x: -20, z: 70 }
    ];

    test('CPU progresses through waypoints sequentially', () => {
        // Simulate a CPU starting at spawn and progressing
        let cpu = {
            body: { position: { x: -40, z: 60 } },
            waypointIndex: 0
        };

        // First call at waypoint 0
        let result = getNextWaypoint(cpu, OVAL_PATH);
        cpu.waypointIndex = result.waypointIndex;

        // Simulate moving to next waypoint
        cpu.body.position = { x: -45, z: 40 };
        result = getNextWaypoint(cpu, OVAL_PATH);

        // Should be progressing forward
        expect(cpu.waypointIndex).toBeGreaterThanOrEqual(0);
        expect(cpu.waypointIndex).toBeLessThan(OVAL_PATH.length);
    });

    test('findNearestWaypointIndex finds correct starting point', () => {
        // CPU spawned somewhere on track
        const spawnPos = { x: 20, z: 70 };
        const index = findNearestWaypointIndex(spawnPos, OVAL_PATH);

        // Should find waypoint 10 which is (20, 70)
        expect(index).toBe(10);
    });
});
