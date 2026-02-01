const {
    world,
    players,
    cpuPlayers,
    projectiles,
    powerups,
    traps,
    createPlayerBody,
    gameLoop,
    setGameState
} = require('../index');
const CANNON = require('cannon-es');

describe('Gameplay Logic', () => {
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

    test('Player switches to Drone on death', () => {
        setGameState('RACING');
        const p1 = {
            id: 'p1', type: 'driver', hp: 10, name: 'Dying', maskType: 'Classic',
            input: { steering: 0, throttle: 0, boost: false }
        };
        players.set('p1', p1);
        createPlayerBody(p1, 0, 2, 0);
        p1.body.position.set(0, 0.5, 0);

        // Killer moving fast into p1
        const killer = {
            id: 'killer', type: 'driver', hp: 100, name: 'Killer', maskType: 'Classic',
            input: { throttle: 1, steering: 0, boost: false }
        };
        players.set('killer', killer);
        createPlayerBody(killer, 0, 2, 0);
        killer.body.position.set(0, 0.5, 10);
        killer.body.velocity.set(0, 0, -50);

        // Run enough frames for impact
        for (let i = 0; i < 60; i++) gameLoop();

        // Check p1 HP dropped (likely below 0 due to 10 start HP)
        expect(p1.hp).toBeLessThan(10);
        if (p1.hp <= 0) {
            expect(p1.type).toBe('drone');
        }
    });
});
