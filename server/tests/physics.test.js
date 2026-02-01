const {
    world,
    players,
    cpuPlayers,
    projectiles,
    powerups,
    traps,
    createPlayerBody,
    updatePlayerPhysics,
    gameLoop,
    setGameState,
    TICK_RATE
} = require('../index');

const CANNON = require('cannon-es');

describe('Gameplay Physics', () => {
    beforeEach(() => {
        // Clear all timers
        jest.clearAllTimers();
        jest.runOnlyPendingTimers();
        
        // Clear all physics bodies
        const bodies = [...world.bodies];
        bodies.forEach(b => world.removeBody(b));
        
        // Clear all global collections
        players.clear();
        cpuPlayers.clear();
        projectiles.clear();
        powerups.clear();
        traps.clear();
        
        // Reset game state
        setGameState('LOBBY');
        
        // Add ground plane
        const groundShape = new CANNON.Plane();
        const groundBody = new CANNON.Body({ mass: 0 });
        groundBody.addShape(groundShape);
        groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        world.addBody(groundBody);
    });

    afterEach(() => {
        // Clear all timers after each test
        jest.clearAllTimers();
        jest.runOnlyPendingTimers();
    });

    test('Car accelerates when throttle is applied', () => {
        const playerId = 'test_p1';
        const player = {
            id: playerId,
            name: 'TestDriver',
            type: 'driver',
            maskType: 'Classic',
            hp: 100,
            boost: 100,
            input: { steering: 0, throttle: 1, boost: false }
        };
        players.set(playerId, player);

        // Create Physics Body
        // Assuming (0,0,0) is safe, function handles spawn height
        createPlayerBody(player, 0, 0, 0);

        const initialZ = player.body.position.z;

        // Single tick update manually or via gameLoop
        // We can call updatePlayerPhysics directly to isolate logic, 
        // OR call gameLoop to test integration. gameLoop might have side effects (io.emit).
        // Let's call updatePlayerPhysics first to verify logic.

        updatePlayerPhysics(player, player.input);
        world.step(1 / 60);

        // Velocity should increase
        // Forward is -Z in this game (usually) or aligned with rotation.
        // Rotation 0 means facing -Z? 
        // Let's check velocity magnitude.

        expect(player.body.velocity.length()).toBeGreaterThan(0.01);

        // Move forward (negative Z)
        // With acceleration 95, 1/60s -> velocity ~1.5
        // Position change ~ 1.5 * 1/60 ~ 0.025

        // Let's simulate 1 second
        for (let i = 0; i < 60; i++) {
            updatePlayerPhysics(player, player.input);
            world.step(1 / 60);
        }

        console.log(`Final Velocity: ${player.body.velocity.length()}`);
        console.log(`Pos Z: ${initialZ} -> ${player.body.position.z}`);

        expect(player.body.velocity.length()).toBeGreaterThan(30); // Should reach reasonable speed
        expect(player.body.position.z).toBeLessThan(initialZ); // Moved 'forward' (assuming -Z)
    });

    test('Gravity works - car falls to ground', () => {
        const playerId = 'test_fall';
        const player = {
            id: playerId,
            name: 'FallGuy',
            type: 'driver',
            hp: 100,
            input: { steering: 0, throttle: 0, boost: false }
        };
        players.set(playerId, player);

        createPlayerBody(player, 10, 10, 0); // X=10, Z=10
        // Manually lift it higher to test gravity
        player.body.position.y = 10;
        player.body.velocity.set(0, 0, 0);

        // Step physics
        for (let i = 0; i < 120; i++) { // 2 seconds
            world.step(1 / 60);
        }

        // Should be near ground (approx 1.2 height)
        expect(player.body.position.y).toBeLessThan(5);
        expect(player.body.position.y).toBeGreaterThan(0);
        // Velocity Y should be near 0 (settled)
        expect(Math.abs(player.body.velocity.y)).toBeLessThan(1);
    });

    test('Car steering changes rotation', () => {
        const playerId = 'test_steer';
        const player = {
            id: playerId,
            name: 'DriftKing',
            type: 'driver',
            hp: 100,
            // Need throttle to steer (steering depends on speed usually?)
            // updatePlayerPhysics logic: `const steerRate = baseTurnRate * speedDampen...`
            input: { steering: 1, throttle: 1, boost: false }
        };
        players.set(playerId, player);
        createPlayerBody(player, 0, 0, 0);

        const initialYaw = player.yaw || 0;

        // Run for a bit
        for (let i = 0; i < 30; i++) {
            updatePlayerPhysics(player, player.input);
            world.step(1 / 60);
        }

        expect(player.yaw).not.toBe(initialYaw);
        // Steering 1 should decrease yaw (yawDelta = -steering...)
        expect(player.yaw).toBeLessThan(initialYaw);
    });
});
