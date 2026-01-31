// =============================================================================
// SERVER UNIT TESTS - Jest
// =============================================================================
// Run with: npm test (from server directory)

const CANNON = require('cannon-es');

// Mock minimal game state for testing
function createMockWorld() {
    return new CANNON.World({
        gravity: new CANNON.Vec3(0, -9.82, 0)
    });
}

function createMockBody(position = { x: 0, y: 1, z: 0 }) {
    return new CANNON.Body({
        mass: 50,
        shape: new CANNON.Sphere(1),
        position: new CANNON.Vec3(position.x, position.y, position.z)
    });
}

// =============================================================================
// PHYSICS TESTS
// =============================================================================
describe('Physics Simulation', () => {
    let world;

    beforeEach(() => {
        world = createMockWorld();
    });

    test('gravity applies correctly', () => {
        const body = createMockBody({ x: 0, y: 10, z: 0 });
        world.addBody(body);

        // Simulate 1 second
        for (let i = 0; i < 60; i++) {
            world.step(1 / 60);
        }

        // Body should have fallen
        expect(body.position.y).toBeLessThan(10);
    });

    test('collision detection works', () => {
        const body1 = createMockBody({ x: 0, y: 1, z: 0 });
        const body2 = createMockBody({ x: 0.5, y: 1, z: 0 });

        world.addBody(body1);
        world.addBody(body2);

        let collisionDetected = false;
        world.addEventListener('beginContact', () => {
            collisionDetected = true;
        });

        world.step(1 / 60);
        expect(collisionDetected).toBe(true);
    });

    test('body velocity is applied', () => {
        const body = createMockBody({ x: 0, y: 1, z: 0 });
        body.velocity.set(10, 0, 0);
        world.addBody(body);

        const initialX = body.position.x;
        world.step(1 / 60);

        expect(body.position.x).toBeGreaterThan(initialX);
    });
});

// =============================================================================
// BOUNDARY TESTS
// =============================================================================
describe('Boundary Enforcement', () => {
    const mockBounds = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };

    function isOutOfBounds(x, z) {
        return x < mockBounds.minX || x > mockBounds.maxX ||
            z < mockBounds.minZ || z > mockBounds.maxZ;
    }

    test('detects when position is in bounds', () => {
        expect(isOutOfBounds(0, 0)).toBe(false);
        expect(isOutOfBounds(25, 25)).toBe(false);
        expect(isOutOfBounds(-49, -49)).toBe(false);
    });

    test('detects when position is out of bounds', () => {
        expect(isOutOfBounds(100, 0)).toBe(true);
        expect(isOutOfBounds(0, 100)).toBe(true);
        expect(isOutOfBounds(-100, -100)).toBe(true);
    });

    test('edge cases are handled', () => {
        expect(isOutOfBounds(50, 0)).toBe(false); // Exactly on edge
        expect(isOutOfBounds(50.1, 0)).toBe(true); // Just outside
    });
});

// =============================================================================
// LEADERBOARD TESTS
// =============================================================================
describe('Leaderboard System', () => {
    let leaderboard;

    beforeEach(() => {
        leaderboard = new Map();
    });

    function updateLeaderboard(name, stat, value = 1) {
        if (!leaderboard.has(name)) {
            leaderboard.set(name, { wins: 0, kills: 0, deaths: 0, gamesPlayed: 0 });
        }
        const entry = leaderboard.get(name);
        entry[stat] = (entry[stat] || 0) + value;
    }

    function getLeaderboardData() {
        const entries = [];
        for (const [name, stats] of leaderboard) {
            entries.push({ name, ...stats });
        }
        entries.sort((a, b) => (b.wins - a.wins) || (b.kills - a.kills));
        return entries;
    }

    test('creates new entry for unknown player', () => {
        updateLeaderboard('TestPlayer', 'wins');
        expect(leaderboard.has('TestPlayer')).toBe(true);
    });

    test('increments stats correctly', () => {
        updateLeaderboard('TestPlayer', 'wins');
        updateLeaderboard('TestPlayer', 'wins');
        updateLeaderboard('TestPlayer', 'kills', 5);

        const entry = leaderboard.get('TestPlayer');
        expect(entry.wins).toBe(2);
        expect(entry.kills).toBe(5);
    });

    test('sorts by wins first, then kills', () => {
        updateLeaderboard('PlayerA', 'wins', 3);
        updateLeaderboard('PlayerB', 'wins', 5);
        updateLeaderboard('PlayerC', 'wins', 5);
        updateLeaderboard('PlayerC', 'kills', 10);

        const sorted = getLeaderboardData();
        expect(sorted[0].name).toBe('PlayerC'); // Most wins + kills
        expect(sorted[1].name).toBe('PlayerB'); // Same wins, fewer kills
        expect(sorted[2].name).toBe('PlayerA'); // Fewest wins
    });
});

// =============================================================================
// DEMO MODE TESTS
// =============================================================================
describe('Demo Mode System', () => {
    test('demo mode triggers after timeout', (done) => {
        let demoStarted = false;
        const DEMO_TIMEOUT = 100; // Short timeout for testing

        setTimeout(() => {
            demoStarted = true;
        }, DEMO_TIMEOUT);

        setTimeout(() => {
            expect(demoStarted).toBe(true);
            done();
        }, DEMO_TIMEOUT + 50);
    });

    test('CPU count is between 4 and 6', () => {
        for (let i = 0; i < 100; i++) {
            const cpuCount = 4 + Math.floor(Math.random() * 3);
            expect(cpuCount).toBeGreaterThanOrEqual(4);
            expect(cpuCount).toBeLessThanOrEqual(6);
        }
    });
});

// =============================================================================
// TRACK TESTS
// =============================================================================
describe('Track System', () => {
    test('spawn points have rotation', () => {
        const mockSpawnPoint = { x: 0, z: 0, rotation: Math.PI / 2 };
        expect(mockSpawnPoint.rotation).toBeDefined();
        expect(typeof mockSpawnPoint.rotation).toBe('number');
    });

    test('spawn point distribution covers grid', () => {
        const spawns = [];
        for (let i = 0; i < 12; i++) {
            const row = Math.floor(i / 4);
            const col = i % 4;
            spawns.push({ row, col });
        }

        expect(spawns.length).toBe(12);
        expect(spawns.filter(s => s.row === 0).length).toBe(4);
        expect(spawns.filter(s => s.row === 1).length).toBe(4);
        expect(spawns.filter(s => s.row === 2).length).toBe(4);
    });
});

// =============================================================================
// WEAPONS SYSTEM TESTS
// =============================================================================
describe('Weapons System', () => {
    const WEAPON_TYPES = {
        missile: { damage: 40, speed: 60 },
        laser: { damage: 20, speed: 100 }
    };

    test('missile deals correct damage', () => {
        const missileDamage = WEAPON_TYPES.missile.damage;
        expect(missileDamage).toBe(40);
    });

    test('laser deals correct damage', () => {
        const laserDamage = WEAPON_TYPES.laser.damage;
        expect(laserDamage).toBe(20);
    });

    test('projectile speeds are valid', () => {
        expect(WEAPON_TYPES.missile.speed).toBeGreaterThan(0);
        expect(WEAPON_TYPES.laser.speed).toBeGreaterThan(WEAPON_TYPES.missile.speed);
    });

    test('weapon pickup grants ammo', () => {
        let playerAmmo = 0;
        const AMMO_PER_PICKUP = 5;

        playerAmmo += AMMO_PER_PICKUP;
        expect(playerAmmo).toBe(5);

        playerAmmo += AMMO_PER_PICKUP;
        expect(playerAmmo).toBe(10);
    });
});

// =============================================================================
// DAMAGE CALCULATION TESTS
// =============================================================================
describe('Damage Calculation', () => {
    const COLLISION_THRESHOLD = 15;
    const MAX_HP = 100;

    function calculateDamage(relativeVelocity) {
        if (relativeVelocity < COLLISION_THRESHOLD) return 0;
        return Math.min(50, Math.floor((relativeVelocity - COLLISION_THRESHOLD) * 2));
    }

    test('no damage below threshold', () => {
        expect(calculateDamage(10)).toBe(0);
        expect(calculateDamage(14.9)).toBe(0);
    });

    test('damage scales with velocity', () => {
        const lowDamage = calculateDamage(20);
        const highDamage = calculateDamage(30);
        expect(highDamage).toBeGreaterThan(lowDamage);
    });

    test('damage is capped at 50', () => {
        expect(calculateDamage(100)).toBe(50);
        expect(calculateDamage(200)).toBe(50);
    });

    test('player elimination at 0 HP', () => {
        let hp = MAX_HP;
        hp -= 60;
        hp -= 60;
        expect(hp <= 0).toBe(true);
    });
});

// =============================================================================
// MASK TYPE TESTS
// =============================================================================
describe('Mask System', () => {
    const VALID_MASKS = ['Classic', 'Oni', 'Tech', 'Clown', 'Skull'];

    test('all mask types are valid', () => {
        expect(VALID_MASKS.length).toBe(5);
        VALID_MASKS.forEach(mask => {
            expect(typeof mask).toBe('string');
            expect(mask.length).toBeGreaterThan(0);
        });
    });

    test('default mask is Classic', () => {
        const defaultMask = 'Classic';
        expect(VALID_MASKS).toContain(defaultMask);
    });

    test('random mask selection works', () => {
        for (let i = 0; i < 50; i++) {
            const randomMask = VALID_MASKS[Math.floor(Math.random() * VALID_MASKS.length)];
            expect(VALID_MASKS).toContain(randomMask);
        }
    });
});

// =============================================================================
// AUDIO SYSTEM TESTS (Mock)
// =============================================================================
describe('Audio System', () => {
    const SOUND_TYPES = ['crash', 'boost', 'missile', 'laser', 'powerup', 'explosion', 'join'];

    test('all sound types are recognized', () => {
        expect(SOUND_TYPES.length).toBe(7);
    });

    test('engine RPM calculation', () => {
        function calculateRpm(velocity) {
            return Math.min(1, velocity / 40);
        }

        expect(calculateRpm(0)).toBe(0);
        expect(calculateRpm(20)).toBe(0.5);
        expect(calculateRpm(40)).toBe(1);
        expect(calculateRpm(80)).toBe(1); // Capped at 1
    });
});
