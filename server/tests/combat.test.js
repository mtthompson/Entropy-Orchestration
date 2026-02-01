const {
    world,
    players,
    cpuPlayers,
    projectiles,
    powerups,
    traps,
    createPlayerBody,
    gameLoop,
    createProjectile,
    setGameState
} = require('../index');
const CANNON = require('cannon-es');

describe('Combat System', () => {
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

    test('Projectile travels and hits target', () => {
        const shooter = {
            id: 'shooter', type: 'driver', hp: 100, name: 'Shooter', maskType: 'Classic',
            input: { steering: 0, throttle: 0, boost: false }
        };
        players.set('shooter', shooter);
        createPlayerBody(shooter, 0, 2, 0);
        shooter.body.position.set(0, 1, 10);
        shooter.body.quaternion.setFromEuler(0, 0, 0); // Face -Z

        const target = {
            id: 'target', type: 'driver', hp: 100, name: 'Target', maskType: 'Classic',
            input: { steering: 0, throttle: 0, boost: false }
        };
        players.set('target', target);
        createPlayerBody(target, 0, 2, 0);
        target.body.position.set(0, 1, 0);

        // Spawn projectile
        const forward = new CANNON.Vec3(0, 0, -1);
        // Ensure spawn is outside shooter body (radius 1.5)
        createProjectile('shooter', 'Missile', { x: 0, y: 1, z: 8 }, forward);

        // Set game state to allow projectile updates
        setGameState('RACING');

        // Run Loop
        let hit = false;
        for (let i = 0; i < 60; i++) {
            gameLoop();
            if (projectiles.size === 0) {
                hit = true;
                break;
            }
        }

        // Projectile should be removed on hit
        expect(hit).toBe(true);
        expect(target.hp).toBeLessThan(100);
    });
});
