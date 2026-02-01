const CANNON = require('cannon-es');

describe('CPU Spawn Logic Verification', () => {
    // Mock track spawn point
    // Rotation 0 means facing +Z (or whatever canonical forward is)
    // We expect "backward" to be -Z and "lateral" to be X
    const spawn0 = { x: 0, z: 0, rotation: 0 };
    const spawn90 = { x: 0, z: 0, rotation: Math.PI / 2 }; // Facing -X? or +X? Math.sin(PI/2) = 1 (X)

    // Extracted logic from server/index.js for testing
    function calculateSpawnPos(index, spawn) {
        // Lateral offset: alternate left/right
        const lateralOffset = ((index % 2) * 2 - 1) * (4 + Math.floor(index / 2) * 3);
        // Backward offset: stagger them back
        const backwardOffset = 5 + (index * 8); // Positive value

        const yaw = spawn.rotation || 0;

        // Forward vector approximation from code
        const forwardX = Math.sin(yaw);
        const forwardZ = Math.cos(yaw);

        // Right vector (90 deg clockwise)
        const rightX = Math.cos(yaw);
        const rightZ = -Math.sin(yaw);

        // Final World Position
        // Move laterally along Right vector
        // Move backward (negative Forward) along Forward vector
        const finalX = spawn.x + (rightX * lateralOffset) - (forwardX * backwardOffset);
        const finalZ = spawn.z + (rightZ * lateralOffset) - (forwardZ * backwardOffset);

        return { x: finalX, z: finalZ };
    }

    test('Spawn 0 (yaw=0) offsets correctly', () => {
        // Yaw 0: Forward(0, 1), Right(1, 0)
        // CPU 0: Lateral -4, Backward 5
        // Expected: x = 0 + (1*-4) - (0*5) = -4
        //           z = 0 + (0*-4) - (1*5) = -5
        const pos = calculateSpawnPos(0, spawn0);
        expect(pos.x).toBeCloseTo(-4);
        expect(pos.z).toBeCloseTo(-5);
    });

    test('Spawn 1 (yaw=0) offsets correctly', () => {
        // CPU 1: Lateral +4, Backward 13 (5 + 1*8)
        // Expected: x = 4, z = -13
        const pos = calculateSpawnPos(1, spawn0);
        expect(pos.x).toBeCloseTo(4);
        expect(pos.z).toBeCloseTo(-13);
    });

    test('Spawn 0 (yaw=PI/2) offsets correctly', () => {
        // Yaw PI/2: Forward(1, 0), Right(0, -1)
        // CPU 0: Lateral -4, Backward 5
        // Expected: x = 0 + (0*-4) - (1*5) = -5  (Backward along X)
        //           z = 0 + (-1*-4) - (0*5) = 4  (Lateral along Z)
        // So spawns "left" (positive Z) and "back" (negative X) relative to facing +X
        const pos = calculateSpawnPos(0, spawn90);
        expect(pos.x).toBeCloseTo(-5);
        expect(pos.z).toBeCloseTo(4);
    });
});
