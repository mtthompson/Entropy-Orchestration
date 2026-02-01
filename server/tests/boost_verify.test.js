
const CANNON = require('cannon-es');
// Mocking the server/index.js dependencies if needed, but we essentially want to test the logic inside updatePlayerPhysics
// We can copy the relevant logic into a test harness or try to import it.
// Since server/index.js runs a server on import if main, we need to be careful.
// Checking the file content, it has `if (require.main === module)` guard so it's safe to require.

const { updatePlayerPhysics } = require('../index');

// Mock helper
function createMockPlayer() {
    const body = new CANNON.Body({
        mass: 50,
        position: new CANNON.Vec3(0, 0, 0)
    });
    // Add quaternion
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), 0);

    return {
        id: 'test_player',
        type: 'driver',
        body: body,
        boost: 50, // Start with half boost
        input: { steering: 0, throttle: 0, boost: false },
        speed: 0,
        yaw: 0,
        maskType: 'Classic'
    };
}

describe('Boost Logic Verification', () => {
    test('Boost should consume when active', () => {
        const player = createMockPlayer();
        player.input = { steering: 0, throttle: 1, boost: true };

        // Initial state
        expect(player.boost).toBe(50);

        // Run one tick
        updatePlayerPhysics(player, player.input);

        // Should have consumed boost (1.0 per tick)
        expect(player.boost).toBe(49);
    });

    test('Boost should regenerate when inactive', () => {
        const player = createMockPlayer();
        player.input = { steering: 0, throttle: 1, boost: false };
        player.boost = 50;

        updatePlayerPhysics(player, player.input);

        // Logic: player.boost = Math.min(100, player.boost + 0.4);
        expect(player.boost).toBe(50.4);
    });

    test('Boost should drain until 0 when active', () => {
        const player = createMockPlayer();
        player.boost = 1.0;
        player.input = { steering: 0, throttle: 1, boost: true };

        updatePlayerPhysics(player, player.input);

        expect(player.boost).toBe(0);

        // Next tick - still holding boost, but empty - should stay at 0
        updatePlayerPhysics(player, player.input);

        // Should stay at 0 since boost input is still true
        expect(player.boost).toBe(0);
    });

    test('Boost should consume even at low levels', () => {
        const player = createMockPlayer();
        player.boost = 0.5; // Low boost
        player.input = { steering: 0, throttle: 1, boost: true };

        updatePlayerPhysics(player, player.input);

        // Should consume to 0
        expect(player.boost).toBe(0);
    });

    test('Boost should regenerate to max', () => {
        const player = createMockPlayer();
        player.boost = 99.5;
        player.input = { steering: 0, throttle: 1, boost: false };

        updatePlayerPhysics(player, player.input);

        // Should approach 100
        expect(player.boost).toBe(99.9);

        // Another tick to reach 100
        updatePlayerPhysics(player, player.input);
        expect(player.boost).toBe(100);
    });
});
