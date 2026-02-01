const {
    world,
    players,
    createPlayerBody,
    gameLoop,
    powerups
} = require('../index');
const CANNON = require('cannon-es');

describe('Powerups', () => {
    beforeEach(() => {
        const bodies = [...world.bodies];
        bodies.forEach(b => world.removeBody(b));
        powerups.clear();
        players.clear();
    });

    test('Player picks up powerup', () => {
        const p1 = {
            id: 'p1', type: 'driver', hp: 50, name: 'P1', maskType: 'Classic',
            input: { steering: 0, throttle: 0, boost: false }
        };
        players.set('p1', p1);
        createPlayerBody(p1, 0, 0, 0);
        p1.body.position.set(10, 1, 10);

        // Manually spawn powerup with Body
        const pId = 'purp_test';

        // Body required for collision check
        const pBody = new CANNON.Body({
            mass: 0,
            shape: new CANNON.Sphere(1.5),
            isTrigger: true
        });
        pBody.position.set(10, 1, 10);
        world.addBody(pBody);

        const powerup = {
            id: pId,
            body: pBody,
            type: 'Repair',
            position: { x: 10, y: 1, z: 10 },
            createdAt: Date.now()
        };
        powerups.set(pId, powerup);

        // Run loop
        gameLoop();

        // Check pickup logic
        expect(powerups.has(pId)).toBe(false);
        expect(p1.hp).toBeGreaterThan(50);

        // Clean up body if not removed (gameLoop removes it on pickup)
        if (world.bodies.includes(pBody)) {
            world.removeBody(pBody);
        }
    });
});
