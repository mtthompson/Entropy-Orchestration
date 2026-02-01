
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
        maskType: 'Classic',
        isConsumingBoost: false // Initialize
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
        // Note: Logic is: player.boost = Math.max(0, player.boost - 1.0);
        expect(player.boost).toBe(49);
        expect(player.isConsumingBoost).toBe(true);
    });

    test('Boost should regenerate when inactive', () => {
        const player = createMockPlayer();
        player.input = { steering: 0, throttle: 1, boost: false };
        player.boost = 50;

        updatePlayerPhysics(player, player.input);

        // Logic: player.boost = Math.min(100, player.boost + 0.4);
        expect(player.boost).toBe(50.4);
        expect(player.isConsumingBoost).toBe(false);
    });

    test('Boost should drain until 0 if start condition met', () => {
        const player = createMockPlayer();
        player.boost = 1.0; // Low boost
        player.isConsumingBoost = true; // Was boosting
        player.input = { steering: 0, throttle: 1, boost: true };

        updatePlayerPhysics(player, player.input);

        expect(player.boost).toBe(0);
        expect(player.isConsumingBoost).toBe(true);

        // Next tick - still holding boost, but empty
        updatePlayerPhysics(player, player.input);

        // Should stay at 0 and flag should persist as long as we "try" to boost?
        // Wait, if boost is 0, logic: 
        // if (player.isConsumingBoost && player.boost > 0) -> false (boost is 0)
        // else if (player.boost >= 10) -> false (0 < 10)
        // So isBoosting becomes false.

        // Let's verify this transition
        expect(player.boost).toBe(0.4); // It regenerated because isBoosting became false!
        expect(player.isConsumingBoost).toBe(false);
    });

    test('Boost should NOT start if below threshold', () => {
        const player = createMockPlayer();
        player.boost = 5.0; // Below threshold of 10
        player.isConsumingBoost = false; // Not currently boosting
        player.input = { steering: 0, throttle: 1, boost: true };

        updatePlayerPhysics(player, player.input);

        // Should NOT boost
        // Logic: 
        // isConsumingBoost (false) && boost > 0 -> false
        // boost >= 10 -> false
        // -> isBoosting = false
        // -> Regen path

        expect(player.boost).toBe(5.4); // Regenerated instead of consumed
        expect(player.isConsumingBoost).toBe(false);
    });

    test('Boost SHOULD start if above threshold', () => {
        const player = createMockPlayer();
        player.boost = 10.0; // At threshold
        player.isConsumingBoost = false;
        player.input = { steering: 0, throttle: 1, boost: true };

        updatePlayerPhysics(player, player.input);

        // Should boost
        // Logic: boost >= 10 -> true

        expect(player.boost).toBe(9.0); // Consumed
        expect(player.isConsumingBoost).toBe(true);
    });
});
