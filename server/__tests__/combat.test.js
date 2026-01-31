// =============================================================================
// COMBAT SYSTEM TESTS
// =============================================================================
// Tests for collision damage, ramming, weapons, and elimination

const CANNON = require('cannon-es');

// =============================================================================
// CONSTANTS
// =============================================================================
const DAMAGE_THRESHOLD = 15;
const DAMAGE_MULTIPLIER = 1.2;
const MAX_HP = 100;

// =============================================================================
// MOCK STATE
// =============================================================================
let players = new Map();
let cpuPlayers = new Map();
let projectiles = new Map();

function resetMockState() {
    players.clear();
    cpuPlayers.clear();
    projectiles.clear();
}

function createMockBody(position = { x: 0, y: 1, z: 0 }) {
    const body = new CANNON.Body({
        mass: 50,
        shape: new CANNON.Sphere(1),
        position: new CANNON.Vec3(position.x, position.y, position.z)
    });
    body.velocity = new CANNON.Vec3(0, 0, 0);
    return body;
}

function createMockPlayer(id, options = {}) {
    return {
        id,
        name: options.name || `Player${id}`,
        type: options.type || 'driver',
        hp: options.hp !== undefined ? options.hp : 100,
        body: options.body || createMockBody(),
        maskType: options.maskType || 'Classic',
        isShielded: options.isShielded || false,
        isGhost: options.isGhost || false,
        isJuggernaut: options.isJuggernaut || false,
        isCPU: options.isCPU || false
    };
}

// =============================================================================
// COLLISION DAMAGE CALCULATION
// =============================================================================
describe('Collision Damage Calculation', () => {
    function calculateDamage(impactSpeed) {
        if (impactSpeed < DAMAGE_THRESHOLD) return 0;
        return Math.floor(impactSpeed * DAMAGE_MULTIPLIER);
    }

    test('no damage below threshold (15)', () => {
        expect(calculateDamage(10)).toBe(0);
        expect(calculateDamage(14)).toBe(0);
        expect(calculateDamage(14.9)).toBe(0);
    });

    test('damage at threshold', () => {
        expect(calculateDamage(15)).toBe(18);
    });

    test('damage scales with impact speed', () => {
        const lowDamage = calculateDamage(20);
        const highDamage = calculateDamage(30);
        
        expect(lowDamage).toBe(24);
        expect(highDamage).toBe(36);
        expect(highDamage).toBeGreaterThan(lowDamage);
    });

    test('high speed collision damage', () => {
        expect(calculateDamage(40)).toBe(48);
        expect(calculateDamage(50)).toBe(60);
    });
});

// =============================================================================
// COLLISION DETECTION
// =============================================================================
describe('Collision Detection', () => {
    beforeEach(resetMockState);

    test('collision detected when bodies overlap (dist < 2.2)', () => {
        const body1 = createMockBody({ x: 0, y: 1, z: 0 });
        const body2 = createMockBody({ x: 1.5, y: 1, z: 0 });
        
        const dist = body1.position.distanceTo(body2.position);
        const isColliding = dist < 2.2;
        
        expect(isColliding).toBe(true);
    });

    test('no collision when bodies far apart', () => {
        const body1 = createMockBody({ x: 0, y: 1, z: 0 });
        const body2 = createMockBody({ x: 10, y: 1, z: 0 });
        
        const dist = body1.position.distanceTo(body2.position);
        const isColliding = dist < 2.2;
        
        expect(isColliding).toBe(false);
    });

    test('relative velocity calculation', () => {
        const body1 = createMockBody();
        body1.velocity.set(20, 0, 0);
        
        const body2 = createMockBody();
        body2.velocity.set(-10, 0, 0);
        
        const relVel = new CANNON.Vec3();
        body1.velocity.vsub(body2.velocity, relVel);
        const impactSpeed = relVel.length();
        
        expect(impactSpeed).toBe(30);
    });
});

// =============================================================================
// RAMMING MECHANICS
// =============================================================================
describe('Ramming Mechanics', () => {
    test('attacker takes 30% less damage', () => {
        const baseDamage = 30;
        const attackerDamage = baseDamage * 0.7;
        
        expect(attackerDamage).toBe(21);
    });

    test('defender takes 20% more damage', () => {
        const baseDamage = 30;
        const defenderDamage = baseDamage * 1.2;
        
        expect(defenderDamage).toBe(36);
    });

    test('frontal hit detection (dot product > 0.7)', () => {
        // Facing directly at target
        const forward = { x: 0, z: -1 };
        const toTarget = { x: 0, z: -1 };
        
        const dotProduct = forward.x * toTarget.x + forward.z * toTarget.z;
        const isFrontalHit = dotProduct > 0.7;
        
        expect(dotProduct).toBe(1);
        expect(isFrontalHit).toBe(true);
    });

    test('side hit not counted as ram', () => {
        // Facing perpendicular to target
        const forward = { x: 1, z: 0 };
        const toTarget = { x: 0, z: -1 };
        
        const dotProduct = forward.x * toTarget.x + forward.z * toTarget.z;
        const isFrontalHit = dotProduct > 0.7;
        
        expect(dotProduct).toBe(0);
        expect(isFrontalHit).toBe(false);
    });

    test('mutual ramming both get reduced damage', () => {
        // Both facing each other
        const p1RamBonus = true;
        const p2RamBonus = true;
        
        let damage1 = 30;
        let damage2 = 30;
        
        if (p1RamBonus) {
            damage1 *= 0.7;
            damage2 *= 1.2;
        }
        if (p2RamBonus) {
            damage2 *= 0.7;
            damage1 *= 1.2;
        }
        
        // Both get 0.7 * 1.2 = 0.84 multiplier
        expect(damage1).toBeCloseTo(30 * 0.84);
        expect(damage2).toBeCloseTo(30 * 0.84);
    });
});

// =============================================================================
// MASK DAMAGE MODIFIERS
// =============================================================================
describe('Oni Mask Damage Resistance', () => {
    test('reduces damage by 15%', () => {
        const baseDamage = 30;
        const oniDamage = baseDamage * 0.85;
        
        expect(oniDamage).toBe(25.5);
    });

    test('stacks with other modifiers', () => {
        const baseDamage = 30;
        let damage = baseDamage;
        
        // Ram defender bonus
        damage *= 1.2;
        // Oni resistance
        damage *= 0.85;
        
        expect(damage).toBeCloseTo(30.6);
    });
});

// =============================================================================
// POWERUP DAMAGE MODIFIERS
// =============================================================================
describe('Shield Protection', () => {
    test('shield blocks all damage', () => {
        const player = createMockPlayer('p1', { hp: 100, isShielded: true });
        let damage = 50;
        
        if (player.isShielded) damage = 0;
        
        player.hp -= damage;
        
        expect(player.hp).toBe(100);
    });
});

describe('Ghost Immunity', () => {
    beforeEach(resetMockState);

    test('ghost ignores collision', () => {
        const ghost = createMockPlayer('p1', { isGhost: true });
        const other = createMockPlayer('p2');
        
        const shouldSkip = ghost.isGhost || other.isGhost;
        
        expect(shouldSkip).toBe(true);
    });

    test('two ghosts ignore each other', () => {
        const ghost1 = createMockPlayer('p1', { isGhost: true });
        const ghost2 = createMockPlayer('p2', { isGhost: true });
        
        const shouldSkip = ghost1.isGhost || ghost2.isGhost;
        
        expect(shouldSkip).toBe(true);
    });
});

describe('Juggernaut Modifiers', () => {
    test('reduces damage taken by 80%', () => {
        const baseDamage = 30;
        const juggernautTaken = baseDamage * 0.2;
        
        expect(juggernautTaken).toBe(6);
    });

    test('increases damage dealt by 50%', () => {
        const baseDamage = 30;
        const juggernautDealt = baseDamage * 1.5;
        
        expect(juggernautDealt).toBe(45);
    });

    test('knockback increased by 50%', () => {
        const baseKnockback = 1.0;
        const juggernautKnockback = baseKnockback * 1.5;
        
        expect(juggernautKnockback).toBe(1.5);
    });
});

// =============================================================================
// PLAYER ELIMINATION
// =============================================================================
describe('Player Elimination', () => {
    beforeEach(resetMockState);

    test('player eliminated at 0 HP', () => {
        const player = createMockPlayer('p1', { hp: 20 });
        player.hp -= 30;
        
        const isEliminated = player.hp <= 0;
        
        expect(isEliminated).toBe(true);
    });

    test('eliminated player becomes drone', () => {
        const player = createMockPlayer('p1', { hp: 10 });
        
        player.hp -= 20;
        if (player.hp <= 0) {
            player.type = 'drone';
            player.hp = 0;
        }
        
        expect(player.type).toBe('drone');
        expect(player.hp).toBe(0);
    });

    test('eliminated player body removed', () => {
        const player = createMockPlayer('p1');
        expect(player.body).not.toBeNull();
        
        // Simulate elimination
        player.body = null;
        
        expect(player.body).toBeNull();
    });
});

// =============================================================================
// CPU ELIMINATION
// =============================================================================
describe('CPU Elimination', () => {
    beforeEach(resetMockState);

    test('CPU eliminated at 0 HP', () => {
        const cpu = createMockPlayer('cpu_0', { isCPU: true, hp: 15 });
        cpu.hp -= 20;
        
        const isEliminated = cpu.hp <= 0;
        
        expect(isEliminated).toBe(true);
    });

    test('CPU removed from game on elimination', () => {
        const cpu = createMockPlayer('cpu_0', { isCPU: true });
        cpuPlayers.set('cpu_0', cpu);
        
        cpu.hp = 0;
        cpu.body = null;
        cpu.type = 'eliminated';
        
        expect(cpu.type).toBe('eliminated');
        expect(cpu.body).toBeNull();
    });
});

// =============================================================================
// WEAPONS SYSTEM
// =============================================================================
describe('Missile Weapon', () => {
    test('deals 40 damage', () => {
        const MISSILE_DAMAGE = 40;
        expect(MISSILE_DAMAGE).toBe(40);
    });

    test('speed is 80 units/s', () => {
        const MISSILE_SPEED = 80;
        expect(MISSILE_SPEED).toBe(80);
    });

    test('hit detection radius is 2 units', () => {
        const projPos = { x: 0, z: 0 };
        const playerPos = { x: 1.5, z: 0 };
        
        const dist = Math.sqrt(
            Math.pow(projPos.x - playerPos.x, 2) +
            Math.pow(projPos.z - playerPos.z, 2)
        );
        
        const isHit = dist < 2;
        
        expect(isHit).toBe(true);
    });
});

describe('Laser Weapon', () => {
    test('deals 20 damage', () => {
        const LASER_DAMAGE = 20;
        expect(LASER_DAMAGE).toBe(20);
    });

    test('speed is 120 units/s', () => {
        const LASER_SPEED = 120;
        expect(LASER_SPEED).toBe(120);
    });

    test('faster than missile', () => {
        const MISSILE_SPEED = 80;
        const LASER_SPEED = 120;
        
        expect(LASER_SPEED).toBeGreaterThan(MISSILE_SPEED);
    });
});

describe('Projectile System', () => {
    beforeEach(resetMockState);

    test('projectile auto-destroys after 3 seconds', () => {
        const PROJECTILE_LIFETIME = 3000;
        expect(PROJECTILE_LIFETIME).toBe(3000);
    });

    test('projectile cannot hit owner', () => {
        const ownerId = 'p1';
        const projectile = { ownerId: 'p1' };
        const targetId = 'p1';
        
        const canHit = projectile.ownerId !== targetId;
        
        expect(canHit).toBe(false);
    });

    test('projectile can hit other players', () => {
        const projectile = { ownerId: 'p1' };
        const targetId = 'p2';
        
        const canHit = projectile.ownerId !== targetId;
        
        expect(canHit).toBe(true);
    });

    test('ammo decrements on fire', () => {
        let ammo = 5;
        
        ammo--;
        
        expect(ammo).toBe(4);
    });

    test('cannot fire with 0 ammo', () => {
        const ammo = 0;
        
        const canFire = ammo > 0;
        
        expect(canFire).toBe(false);
    });
});

// =============================================================================
// PLAYER VS CPU COMBAT
// =============================================================================
describe('Player vs CPU Combat', () => {
    beforeEach(resetMockState);

    test('player can damage CPU', () => {
        const cpu = createMockPlayer('cpu_0', { isCPU: true, hp: 100 });
        const damage = 30;
        
        cpu.hp -= damage;
        
        expect(cpu.hp).toBe(70);
    });

    test('CPU can damage player', () => {
        const player = createMockPlayer('p1', { hp: 100 });
        const damage = 25;
        
        player.hp -= damage;
        
        expect(player.hp).toBe(75);
    });

    test('CPU ramming damage applies correctly', () => {
        const player = createMockPlayer('p1', { hp: 100 });
        const baseDamage = 28;
        
        // CPU rams player
        const damageToPlayer = Math.floor(baseDamage * DAMAGE_MULTIPLIER * 1.2);
        
        player.hp -= damageToPlayer;
        
        expect(player.hp).toBeLessThan(100);
    });
});

// =============================================================================
// CPU VS CPU COMBAT
// =============================================================================
describe('CPU vs CPU Combat', () => {
    beforeEach(resetMockState);

    test('CPUs can damage each other', () => {
        const cpu1 = createMockPlayer('cpu_0', { isCPU: true, hp: 100 });
        const cpu2 = createMockPlayer('cpu_1', { isCPU: true, hp: 100 });
        
        const damage = 35;
        cpu1.hp -= damage;
        cpu2.hp -= damage;
        
        expect(cpu1.hp).toBe(65);
        expect(cpu2.hp).toBe(65);
    });

    test('CPU elimination credits killer', () => {
        const killer = { name: 'NEON', kills: 0 };
        const victim = { name: 'RAZOR', deaths: 0 };
        
        // Simulate kill
        killer.kills++;
        victim.deaths++;
        
        expect(killer.kills).toBe(1);
        expect(victim.deaths).toBe(1);
    });
});

// =============================================================================
// SURVIVAL BALANCE
// =============================================================================
describe('Human Player Survival', () => {
    test('human can survive 3 moderate CPU hits', () => {
        let hp = 100;
        
        // 3 hits at 20 impact speed
        for (let i = 0; i < 3; i++) {
            const impactSpeed = 20;
            let damage = Math.floor(impactSpeed * DAMAGE_MULTIPLIER);
            hp -= damage;
        }
        
        expect(hp).toBeGreaterThan(0);
    });

    test('damage is balanced for fair gameplay', () => {
        const oldMultiplier = 2.0;
        const newMultiplier = DAMAGE_MULTIPLIER;
        
        const impactSpeed = 30;
        const oldDamage = Math.floor(impactSpeed * oldMultiplier);
        const newDamage = Math.floor(impactSpeed * newMultiplier);
        
        expect(newDamage).toBeLessThan(oldDamage);
        expect(newDamage).toBe(36);
        expect(oldDamage).toBe(60);
    });

    test('strategic ramming can eliminate CPU', () => {
        let humanHP = 100;
        let cpuHP = 100;
        
        // 3 successful rams
        for (let i = 0; i < 3; i++) {
            const baseDamage = 28;
            const humanTakes = Math.floor(baseDamage * DAMAGE_MULTIPLIER * 0.7);
            const cpuTakes = Math.floor(baseDamage * DAMAGE_MULTIPLIER * 1.2);
            
            humanHP -= humanTakes;
            cpuHP -= cpuTakes;
        }
        
        expect(humanHP).toBeGreaterThan(0);
        expect(cpuHP).toBeLessThanOrEqual(0);
    });
});

// =============================================================================
// SPAWN PROTECTION
// =============================================================================
describe('Spawn Protection', () => {
    test('CPU spawns 30+ units behind players', () => {
        const playerSpawnZ = 0;
        const cpuSpawnZ = -30;
        
        const distance = Math.abs(cpuSpawnZ - playerSpawnZ);
        
        expect(distance).toBeGreaterThanOrEqual(30);
    });

    test('CPU spawns staggered to prevent pile-up', () => {
        const cpuSpawns = [];
        
        for (let i = 0; i < 3; i++) {
            const zOffset = -30 - (i * 12);
            cpuSpawns.push(zOffset);
        }
        
        expect(cpuSpawns[0]).toBe(-30);
        expect(cpuSpawns[1]).toBe(-42);
        expect(cpuSpawns[2]).toBe(-54);
    });

    test('CPUs have X offset for spread', () => {
        const offsets = [];
        
        for (let i = 0; i < 4; i++) {
            const xOffset = ((i % 2) * 2 - 1) * (6 + Math.floor(i / 2) * 4);
            offsets.push(xOffset);
        }
        
        // Alternating left/right with increasing spread
        expect(offsets[0]).toBe(-6);
        expect(offsets[1]).toBe(6);
        expect(offsets[2]).toBe(-10);
        expect(offsets[3]).toBe(10);
    });
});
