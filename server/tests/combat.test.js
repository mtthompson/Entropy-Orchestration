const {
    world,
    players,
    createPlayerBody,
    gameLoop,
    createProjectile,
    projectiles
} = require('../index');
const CANNON = require('cannon-es');

describe('Combat System', () => {
    beforeEach(() => {
        const bodies = [...world.bodies];
        bodies.forEach(b => world.removeBody(b));
        projectiles.clear();
        players.clear();
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
