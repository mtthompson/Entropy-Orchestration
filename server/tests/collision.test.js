// Mock global timers before requiring the module
global.setTimeout = jest.fn(() => ({}));
global.setInterval = jest.fn(() => ({}));
global.clearTimeout = jest.fn();
global.clearInterval = jest.fn();

const {
    world,
    players,
    cpuPlayers,
    projectiles,
    powerups,
    traps,
    createPlayerBody,
    gameLoop,
    setGameState,
    TICK_RATE
} = require('../index');

const CANNON = require('cannon-es');

describe('Collision Mechanics', () => {
    beforeEach(() => {
        // Clear all timers
        jest.clearAllTimers();
        
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
    });

    test('Head-on collision causes damage and bounce', () => {
        setGameState('RACING');
        const p1 = {
            id: 'p1', type: 'driver', hp: 100, name: 'P1', maskType: 'Classic',
            input: { steering: 0, throttle: 1, boost: false }
        };
        players.set('p1', p1);
        // Face -PI/2 to move +X
        createPlayerBody(p1, -5, 2, -Math.PI / 2);
        p1.body.position.set(-5, 0, 0);
        p1.body.velocity.set(20, 0, 0);

        const p2 = {
            id: 'p2', type: 'driver', hp: 100, name: 'P2', maskType: 'Classic',
            input: { steering: 0, throttle: 1, boost: false }
        };
        players.set('p2', p2);
        // Face +PI/2 to move -X
        createPlayerBody(p2, 5, 2, Math.PI / 2);
        p2.body.position.set(5, 0, 0);
        p2.body.velocity.set(-20, 0, 0);

        let collided = false;
        const initialCombinedHp = p1.hp + p2.hp;

        for (let i = 0; i < 120; i++) { // Increased from 60 to 120 ticks
            gameLoop();
            if (p1.hp < 100 || p2.hp < 100) collided = true;
        }

        expect(collided).toBe(true);
        expect(p1.hp + p2.hp).toBeLessThan(initialCombinedHp);
    });

    test('Rear-end collision (Ramming) deals extra damage to victim', () => {
        const attacker = {
            id: 'atk', type: 'driver', hp: 100, name: 'Attacker', maskType: 'Classic',
            input: { steering: 0, throttle: 1, boost: false }
        };
        players.set('atk', attacker);
        createPlayerBody(attacker, 0, 2, 0);
        attacker.body.position.set(0, 0.5, 5);
        attacker.body.velocity.set(0, 0, -50);
        // Throttle 1 to maintain speed (Arcade physics)

        const victim = {
            id: 'vic', type: 'driver', hp: 100, name: 'Victim', maskType: 'Classic',
            input: { steering: 0, throttle: 1, boost: false }
        };
        players.set('vic', victim);
        createPlayerBody(victim, 0, 2, 0);
        victim.body.position.set(0, 0.5, 0);
        victim.body.velocity.set(0, 0, -10);

        for (let i = 0; i < 60; i++) {
            gameLoop();
        }

        const victimDamage = 100 - victim.hp;
        const attackerDamage = 100 - attacker.hp;

        console.error(`Ramming - Victim DMG: ${victimDamage} (HP: ${victim.hp}), Atk DMG: ${attackerDamage} (HP: ${attacker.hp})`);

        expect(victim.hp).toBeLessThan(100);
        // Sometimes mechanics might reduce damage to 0 if speeds align perfectly or something?
        // But velocity diff 40 is high.

        // Ensure victim damage is notably higher (Ramming bonus)
        // If it equals, logic failed.
        if (victimDamage <= attackerDamage) {
            throw new Error(`Victim damage ${victimDamage} not greater than Attacker ${attackerDamage}`);
        }
    });
});
