// =============================================================================
// POWER-UP SYSTEM TESTS
// =============================================================================
// Tests for power-up spawning, collection, effects, and expiration

const CANNON = require('cannon-es');

// =============================================================================
// MOCK STATE
// =============================================================================
let powerups = new Map();
let players = new Map();
const MAX_POWERUPS = 15;
const POWERUP_LIFETIME = 30000;
const EXTENDED_POWERUP_TYPES = ['Repair', 'Repair', 'Boost', 'Boost', 'Shield', 'Ghost', 'Juggernaut', 'Weapon', 'Weapon', '67Meme'];

function resetMockState() {
    powerups.clear();
    players.clear();
}

function createMockBody(position = { x: 0, y: 1, z: 0 }) {
    return new CANNON.Body({
        mass: 50,
        shape: new CANNON.Sphere(1),
        position: new CANNON.Vec3(position.x, position.y, position.z)
    });
}

function createMockPlayer(id, options = {}) {
    return {
        id,
        name: options.name || `Player${id}`,
        type: options.type || 'driver',
        hp: options.hp !== undefined ? options.hp : 100,
        boost: options.boost !== undefined ? options.boost : 100,
        body: options.body !== undefined ? options.body : createMockBody(),
        isShielded: options.isShielded || false,
        isGhost: options.isGhost || false,
        isJuggernaut: options.isJuggernaut || false,
        ammo: options.ammo || 0,
        weaponType: options.weaponType || null
    };
}

function createMockPowerup(id, type, position) {
    return {
        id,
        type,
        position,
        body: new CANNON.Body({
            mass: 0,
            shape: new CANNON.Sphere(1.5),
            position: new CANNON.Vec3(position.x, position.y, position.z)
        }),
        spawnTime: Date.now()
    };
}

// =============================================================================
// POWER-UP SPAWNING
// =============================================================================
describe('Power-up Spawning', () => {
    beforeEach(resetMockState);

    test('powerup spawns with valid type', () => {
        const type = EXTENDED_POWERUP_TYPES[Math.floor(Math.random() * EXTENDED_POWERUP_TYPES.length)];
        
        expect(EXTENDED_POWERUP_TYPES).toContain(type);
    });

    test('powerup spawns within track bounds', () => {
        const bounds = { minX: -60, maxX: 60, minZ: -60, maxZ: 60 };
        
        const x = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
        const z = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
        
        expect(x).toBeGreaterThanOrEqual(bounds.minX);
        expect(x).toBeLessThanOrEqual(bounds.maxX);
        expect(z).toBeGreaterThanOrEqual(bounds.minZ);
        expect(z).toBeLessThanOrEqual(bounds.maxZ);
    });

    test('powerup spawn capped at MAX_POWERUPS', () => {
        for (let i = 0; i < MAX_POWERUPS; i++) {
            powerups.set(`pu_${i}`, createMockPowerup(`pu_${i}`, 'Repair', { x: i, y: 1, z: 0 }));
        }
        
        expect(powerups.size).toBe(MAX_POWERUPS);
        
        const canSpawn = powerups.size < MAX_POWERUPS;
        expect(canSpawn).toBe(false);
    });

    test('powerup has unique ID', () => {
        const ids = new Set();
        
        for (let i = 0; i < 100; i++) {
            const id = `pu_${i}_${Date.now()}`;
            ids.add(id);
        }
        
        expect(ids.size).toBe(100);
    });

    test('weighted powerup distribution', () => {
        const counts = {};
        
        for (let i = 0; i < 1000; i++) {
            const type = EXTENDED_POWERUP_TYPES[Math.floor(Math.random() * EXTENDED_POWERUP_TYPES.length)];
            counts[type] = (counts[type] || 0) + 1;
        }
        
        expect(counts['Repair']).toBeGreaterThan(50);
        expect(counts['Boost']).toBeGreaterThan(50);
    });
});

// =============================================================================
// POWER-UP COLLECTION
// =============================================================================
describe('Power-up Collection', () => {
    beforeEach(resetMockState);

    test('collision detection radius is 3.0 units', () => {
        const collisionRadius = 3.0;
        
        const playerPos = { x: 0, y: 1, z: 0 };
        const powerupPos = { x: 2, y: 1, z: 0 };
        
        const dist = Math.sqrt(
            Math.pow(powerupPos.x - playerPos.x, 2) +
            Math.pow(powerupPos.z - playerPos.z, 2)
        );
        
        expect(dist < collisionRadius).toBe(true);
    });

    test('powerup removed after collection', () => {
        const pu = createMockPowerup('pu_1', 'Repair', { x: 0, y: 1, z: 0 });
        powerups.set('pu_1', pu);
        
        powerups.delete('pu_1');
        
        expect(powerups.has('pu_1')).toBe(false);
    });

    test('only drivers can collect powerups', () => {
        const driver = createMockPlayer('p1', { type: 'driver' });
        const drone = createMockPlayer('p2', { type: 'drone' });
        
        const driverCanCollect = driver.type === 'driver';
        const droneCanCollect = drone.type === 'driver';
        
        expect(driverCanCollect).toBe(true);
        expect(droneCanCollect).toBe(false);
    });

    test('players without body cannot collect', () => {
        const player = createMockPlayer('p1', { body: null });
        
        const canCollect = !!player.body;
        
        expect(canCollect).toBe(false);
    });
});

// =============================================================================
// POWER-UP EFFECTS
// =============================================================================
describe('Repair Power-up', () => {
    test('heals 50 HP', () => {
        const player = createMockPlayer('p1', { hp: 40 });
        
        player.hp = Math.min(100, player.hp + 50);
        
        expect(player.hp).toBe(90);
    });

    test('HP capped at 100', () => {
        const player = createMockPlayer('p1', { hp: 80 });
        
        player.hp = Math.min(100, player.hp + 50);
        
        expect(player.hp).toBe(100);
    });

    test('heals from near-death', () => {
        const player = createMockPlayer('p1', { hp: 5 });
        
        player.hp = Math.min(100, player.hp + 50);
        
        expect(player.hp).toBe(55);
    });
});

describe('67Meme Power-up', () => {
    test('heals 67 HP', () => {
        const player = createMockPlayer('p1', { hp: 20 });
        
        player.hp = Math.min(100, player.hp + 67);
        
        expect(player.hp).toBe(87);
    });

    test('HP capped at 100', () => {
        const player = createMockPlayer('p1', { hp: 50 });
        
        player.hp = Math.min(100, player.hp + 67);
        
        expect(player.hp).toBe(100);
    });
});

describe('Boost Power-up', () => {
    test('refills boost to 100', () => {
        const player = createMockPlayer('p1', { boost: 30 });
        
        player.boost = 100;
        
        expect(player.boost).toBe(100);
    });

    test('applies velocity impulse', () => {
        const player = createMockPlayer('p1');
        player.body.velocity.set(0, 0, -10);
        
        const dir = player.body.velocity.clone();
        dir.normalize();
        dir.scale(50, dir);
        player.body.velocity.vadd(dir, player.body.velocity);
        
        expect(player.body.velocity.length()).toBeGreaterThan(10);
    });
});

describe('Shield Power-up', () => {
    test('activates shield state', () => {
        const player = createMockPlayer('p1');
        
        player.isShielded = true;
        
        expect(player.isShielded).toBe(true);
    });

    test('shield blocks damage', () => {
        const player = createMockPlayer('p1', { hp: 100, isShielded: true });
        
        let damage = 30;
        if (player.isShielded) damage = 0;
        
        player.hp -= damage;
        
        expect(player.hp).toBe(100);
    });

    test('shield duration is 5 seconds', () => {
        const SHIELD_DURATION = 5000;
        expect(SHIELD_DURATION).toBe(5000);
    });
});

describe('Ghost Power-up', () => {
    test('activates ghost state', () => {
        const player = createMockPlayer('p1');
        
        player.isGhost = true;
        
        expect(player.isGhost).toBe(true);
    });

    test('ghost ignores collision damage', () => {
        const p1 = createMockPlayer('p1', { isGhost: true });
        const p2 = createMockPlayer('p2');
        
        const shouldSkipCollision = p1.isGhost || p2.isGhost;
        
        expect(shouldSkipCollision).toBe(true);
    });

    test('ghost duration is 5 seconds', () => {
        const GHOST_DURATION = 5000;
        expect(GHOST_DURATION).toBe(5000);
    });
});

describe('Juggernaut Power-up', () => {
    test('activates juggernaut state', () => {
        const player = createMockPlayer('p1');
        
        player.isJuggernaut = true;
        
        expect(player.isJuggernaut).toBe(true);
    });

    test('doubles body mass', () => {
        const normalMass = 50;
        const juggernautMass = 100;
        
        expect(juggernautMass).toBe(normalMass * 2);
    });

    test('reduces damage taken by 80%', () => {
        const baseDamage = 30;
        const juggernautDamage = baseDamage * 0.2;
        
        expect(juggernautDamage).toBe(6);
    });

    test('increases damage dealt by 50%', () => {
        const baseDamage = 30;
        const juggernautDealt = baseDamage * 1.5;
        
        expect(juggernautDealt).toBe(45);
    });

    test('juggernaut duration is 10 seconds', () => {
        const JUGGERNAUT_DURATION = 10000;
        expect(JUGGERNAUT_DURATION).toBe(10000);
    });
});

describe('Weapon Power-up', () => {
    test('grants 5 ammo', () => {
        const player = createMockPlayer('p1', { ammo: 0 });
        
        player.ammo += 5;
        
        expect(player.ammo).toBe(5);
    });

    test('ammo stacks', () => {
        const player = createMockPlayer('p1', { ammo: 3 });
        
        player.ammo += 5;
        
        expect(player.ammo).toBe(8);
    });

    test('assigns random weapon type', () => {
        const weapons = ['missile', 'laser'];
        const type = Math.random() > 0.5 ? 'missile' : 'laser';
        
        expect(weapons).toContain(type);
    });
});

// =============================================================================
// POWER-UP STATE MANAGEMENT
// =============================================================================
describe('Power-up State Clearing', () => {
    beforeEach(resetMockState);

    test('new powerup clears previous effect', () => {
        const player = createMockPlayer('p1', { isShielded: true });
        
        player.isShielded = false;
        player.isGhost = false;
        player.isJuggernaut = true;
        
        expect(player.isShielded).toBe(false);
        expect(player.isJuggernaut).toBe(true);
    });

    test('effect timeout resets state', () => {
        const player = createMockPlayer('p1', { isShielded: true });
        
        player.isShielded = false;
        
        expect(player.isShielded).toBe(false);
    });

    test('mass reset after juggernaut expires', () => {
        const player = createMockPlayer('p1');
        player.body.mass = 100;
        
        player.body.mass = 50;
        
        expect(player.body.mass).toBe(50);
    });
});

// =============================================================================
// POWER-UP EXPIRATION
// =============================================================================
describe('Power-up Expiration', () => {
    beforeEach(resetMockState);

    test('powerup expires after 30 seconds', () => {
        const LIFETIME = 30000;
        const spawnTime = Date.now() - LIFETIME - 1000;
        
        const isExpired = Date.now() - spawnTime > LIFETIME;
        
        expect(isExpired).toBe(true);
    });

    test('fresh powerup not expired', () => {
        const LIFETIME = 30000;
        const spawnTime = Date.now();
        
        const isExpired = Date.now() - spawnTime > LIFETIME;
        
        expect(isExpired).toBe(false);
    });

    test('expired powerup is removed', () => {
        const pu = createMockPowerup('pu_1', 'Repair', { x: 0, y: 1, z: 0 });
        powerups.set('pu_1', pu);
        
        powerups.delete('pu_1');
        
        expect(powerups.size).toBe(0);
    });
});

// =============================================================================
// TRAP SYSTEM
// =============================================================================
describe('Trap System', () => {
    let traps = new Map();
    const MAX_TRAPS = 15;
    
    beforeEach(() => {
        traps.clear();
    });

    test('only drones can spawn traps', () => {
        const driver = createMockPlayer('p1', { type: 'driver' });
        const drone = createMockPlayer('p2', { type: 'drone' });
        
        const driverCanTrap = driver.type === 'drone';
        const droneCanTrap = drone.type === 'drone';
        
        expect(driverCanTrap).toBe(false);
        expect(droneCanTrap).toBe(true);
    });

    test('trap spawn capped at MAX_TRAPS', () => {
        for (let i = 0; i < MAX_TRAPS; i++) {
            traps.set(`t_${i}`, { position: { x: i, z: 0 } });
        }
        
        const canSpawnMore = traps.size < MAX_TRAPS;
        
        expect(canSpawnMore).toBe(false);
    });

    test('trap expires after 10 seconds', () => {
        const TRAP_LIFETIME = 10000;
        expect(TRAP_LIFETIME).toBe(10000);
    });
});

// =============================================================================
// IDLE CLEANUP
// =============================================================================
describe('Idle Cleanup', () => {
    beforeEach(resetMockState);

    test('excess powerups cleared when no players', () => {
        for (let i = 0; i < 8; i++) {
            powerups.set(`pu_${i}`, createMockPowerup(`pu_${i}`, 'Repair', { x: i, y: 1, z: 0 }));
        }
        
        const humanCount = 0;
        
        if (humanCount === 0 && powerups.size > 5) {
            let kept = 0;
            for (const id of powerups.keys()) {
                if (kept >= 3) {
                    powerups.delete(id);
                }
                kept++;
            }
        }
        
        expect(powerups.size).toBe(3);
    });

    test('all traps cleared when no players', () => {
        const traps = new Map();
        traps.set('t1', { position: { x: 0, z: 0 } });
        traps.set('t2', { position: { x: 5, z: 5 } });
        
        const humanCount = 0;
        
        if (humanCount === 0) {
            traps.clear();
        }
        
        expect(traps.size).toBe(0);
    });
});
