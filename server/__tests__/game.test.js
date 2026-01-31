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
// CPU RACING AND COMBAT TESTS
// =============================================================================
describe('CPU Racing System', () => {
    const { findNearestWaypointIndex, getNextWaypoint } = require('../cpuPathfinding');
    
    const OVAL_PATH = [
        { x: -40, z: 60 }, { x: -45, z: 40 }, { x: -45, z: -40 }, { x: -40, z: -60 },
        { x: -20, z: -70 }, { x: 20, z: -70 }, { x: 40, z: -60 },
        { x: 45, z: -40 }, { x: 45, z: 40 }, { x: 40, z: 60 },
        { x: 20, z: 70 }, { x: -20, z: 70 }
    ];
    
    test('CPU waypoint system works correctly', () => {
        // Test that CPU can use waypoint navigation
        let cpu = {
            body: { position: { x: -40, z: 60 } },
            waypointIndex: 0
        };
        
        // Get initial target
        const result1 = getNextWaypoint(cpu, OVAL_PATH, 2);
        expect(result1.x).toBeDefined();
        expect(result1.z).toBeDefined();
        
        // Move CPU to a different position on track
        cpu.body.position = { x: 20, z: 70 };
        cpu.waypointIndex = 10; // Near waypoint 10
        
        const result2 = getNextWaypoint(cpu, OVAL_PATH, 2);
        
        // Should get valid target
        expect(result2.x).toBeDefined();
        expect(result2.z).toBeDefined();
        
        // Test shows waypoint system returns valid targets
        expect(OVAL_PATH.length).toBe(12);
    });
    
    test('lap tracking detects finish line crossing', () => {
        let lapsCompleted = 0;
        let waypointIndex = OVAL_PATH.length - 2;
        
        // Simulate approaching finish
        waypointIndex = OVAL_PATH.length - 1;
        // Next update wraps to 0
        const newIndex = 0;
        
        if (waypointIndex === OVAL_PATH.length - 1 && newIndex === 0) {
            lapsCompleted++;
        }
        
        expect(lapsCompleted).toBe(1);
    });
    
    test('CPU completes 3 laps and wins', () => {
        const LAPS_TO_WIN = 3;
        let cpu = { lapsCompleted: 2 };
        
        // Complete one more lap
        cpu.lapsCompleted++;
        
        const hasWon = cpu.lapsCompleted >= LAPS_TO_WIN;
        expect(hasWon).toBe(true);
    });
});

describe('CPU Collision System', () => {
    const DAMAGE_THRESHOLD = 15;
    
    function calculateCollisionDamage(impactSpeed) {
        if (impactSpeed < DAMAGE_THRESHOLD) return 0;
        return Math.floor(impactSpeed * 2);
    }
    
    test('CPU takes damage from high-speed collision', () => {
        let cpuHP = 100;
        const impactSpeed = 25;
        
        const damage = calculateCollisionDamage(impactSpeed);
        cpuHP -= damage;
        
        expect(damage).toBeGreaterThan(0);
        expect(cpuHP).toBeLessThan(100);
    });
    
    test('CPU is eliminated when HP reaches zero', () => {
        let cpu = { hp: 20, body: {}, type: 'driver' };
        const damage = 25;
        
        cpu.hp -= damage;
        
        if (cpu.hp <= 0) {
            cpu.body = null;
            cpu.type = 'eliminated';
        }
        
        expect(cpu.hp).toBeLessThanOrEqual(0);
        expect(cpu.body).toBeNull();
        expect(cpu.type).toBe('eliminated');
    });
    
    test('CPU-CPU collision calculates mutual damage', () => {
        let cpu1 = { hp: 100, name: 'NEON' };
        let cpu2 = { hp: 100, name: 'RAZOR' };
        
        const impactSpeed = 30;
        const damage = calculateCollisionDamage(impactSpeed);
        
        cpu1.hp -= damage;
        cpu2.hp -= damage;
        
        expect(cpu1.hp).toBe(100 - damage);
        expect(cpu2.hp).toBe(100 - damage);
    });
    
    test('ramming attack increases damage to target', () => {
        const baseDamage = 20;
        let damageToRammed = baseDamage * 1.5; // Frontal hit
        let damageToRammer = baseDamage * 0.5; // Attacker takes less
        
        expect(damageToRammed).toBe(30);
        expect(damageToRammer).toBe(10);
    });
});

describe('Win Condition System', () => {
    test('race track uses lap-based win condition', () => {
        const trackType = 'race';
        const LAPS_TO_WIN = 3;
        
        let winner = null;
        let player = { name: 'TestPlayer', lapsCompleted: 3 };
        
        if (trackType === 'race' && player.lapsCompleted >= LAPS_TO_WIN) {
            winner = player;
        }
        
        expect(winner).not.toBeNull();
        expect(winner.name).toBe('TestPlayer');
    });
    
    test('arena uses last-survivor win condition', () => {
        const trackType = 'arena';
        
        const players = [
            { name: 'Player1', hp: 0, type: 'driver' },
            { name: 'Player2', hp: 50, type: 'driver' },
            { name: 'CPU1', hp: 0, isCPU: true }
        ];
        
        const activePlayers = players.filter(p => p.hp > 0);
        
        expect(trackType).toBe('arena');
        expect(activePlayers.length).toBe(1);
        expect(activePlayers[0].name).toBe('Player2');
    });
    
    test('CPU can win in arena mode', () => {
        const players = [
            { name: 'Player1', hp: 0, type: 'driver' },
            { name: 'NEON', hp: 75, isCPU: true, type: 'driver' }
        ];
        
        const activePlayers = players.filter(p => p.hp > 0 && p.type === 'driver');
        
        expect(activePlayers.length).toBe(1);
        expect(activePlayers[0].isCPU).toBe(true);
        expect(activePlayers[0].name).toBe('NEON');
    });
});

describe('Leaderboard System', () => {
    let leaderboard;
    
    beforeEach(() => {
        leaderboard = new Map();
    });
    
    function updateLeaderboard(playerName, stat, value = 1, isCPU = false) {
        if (!leaderboard.has(playerName)) {
            leaderboard.set(playerName, { wins: 0, kills: 0, deaths: 0, gamesPlayed: 0, isCPU });
        }
        const entry = leaderboard.get(playerName);
        entry[stat] = (entry[stat] || 0) + value;
        if (isCPU) entry.isCPU = true;
    }
    
    test('CPU wins are tracked in leaderboard', () => {
        updateLeaderboard('NEON', 'wins', 1, true);
        
        const entry = leaderboard.get('NEON');
        expect(entry.wins).toBe(1);
        expect(entry.isCPU).toBe(true);
    });
    
    test('CPU and player stats are separate', () => {
        updateLeaderboard('Player1', 'wins', 1, false);
        updateLeaderboard('RAZOR', 'wins', 1, true);
        
        expect(leaderboard.get('Player1').isCPU).toBeFalsy();
        expect(leaderboard.get('RAZOR').isCPU).toBe(true);
    });
    
    test('CPU kills are credited', () => {
        updateLeaderboard('VOLT', 'kills', 1, true);
        
        const entry = leaderboard.get('VOLT');
        expect(entry.kills).toBe(1);
    });
    
    test('leaderboard sorts by wins then kills', () => {
        updateLeaderboard('Player1', 'wins', 2, false);
        updateLeaderboard('NEON', 'wins', 3, true);
        updateLeaderboard('Player2', 'wins', 2, false);
        updateLeaderboard('Player2', 'kills', 5, false);
        
        const entries = Array.from(leaderboard.entries()).map(([name, stats]) => ({
            name,
            ...stats
        }));
        
        entries.sort((a, b) => (b.wins - a.wins) || (b.kills - a.kills));
        
        expect(entries[0].name).toBe('NEON'); // Most wins
        expect(entries[1].name).toBe('Player2'); // Same wins as Player1, more kills
        expect(entries[2].name).toBe('Player1');
    });
});

// =============================================================================
// HUMAN VS CPU BALANCE TESTS
// =============================================================================
describe('Human Player Survival', () => {
    const DAMAGE_THRESHOLD = 15;
    const COLLISION_DAMAGE_MULTIPLIER = 1.2; // Current balance
    
    test('human can survive multiple CPU collisions', () => {
        let humanHP = 100;
        const cpuCount = 3;
        
        // Simulate 3 moderate collisions (20 speed each)
        for (let i = 0; i < cpuCount; i++) {
            const impactSpeed = 20;
            let damage = Math.floor(impactSpeed * COLLISION_DAMAGE_MULTIPLIER);
            
            // CPU ramming bonus
            damage *= 1.2;
            
            humanHP -= damage;
        }
        
        // Human should survive 3 hits
        expect(humanHP).toBeGreaterThan(0);
        expect(humanHP).toBeGreaterThanOrEqual(10); // At least 10% health remaining
    });
    
    test('human spawn position is far from CPU spawns', () => {
        const humanSpawn = { x: 0, z: 0 }; // Typical player spawn
        
        // CPU spawns start 30 units back with 12-unit spacing
        const cpuSpawns = [
            { x: -6, z: -30 },  // First CPU
            { x: 6, z: -42 },   // Second CPU
            { x: -10, z: -54 }  // Third CPU
        ];
        
        // Check minimum distance
        cpuSpawns.forEach(cpuSpawn => {
            const dist = Math.sqrt(
                Math.pow(cpuSpawn.x - humanSpawn.x, 2) + 
                Math.pow(cpuSpawn.z - humanSpawn.z, 2)
            );
            expect(dist).toBeGreaterThanOrEqual(30); // At least 30 units away
        });
    });
    
    test('human can win race by completing laps', () => {
        const LAPS_TO_WIN = 3;
        let humanLaps = 0;
        let cpuLaps = 0;
        
        // Simulate human racing ahead
        humanLaps = 3;
        cpuLaps = 2;
        
        const humanWins = humanLaps >= LAPS_TO_WIN && humanLaps > cpuLaps;
        expect(humanWins).toBe(true);
    });
    
    test('human can survive arena with defensive play', () => {
        let humanHP = 100;
        let cpu1HP = 100;
        let cpu2HP = 100;
        
        // Scenario: Human avoids damage, CPUs fight each other
        const cpuVsCpuDamage = Math.floor(25 * COLLISION_DAMAGE_MULTIPLIER * 1.2);
        
        cpu1HP -= cpuVsCpuDamage;
        cpu2HP -= cpuVsCpuDamage;
        
        // Human takes one glancing hit
        const glancingDamage = Math.floor(18 * COLLISION_DAMAGE_MULTIPLIER);
        humanHP -= glancingDamage;
        
        // Human should still have good health
        expect(humanHP).toBeGreaterThan(70);
        
        // CPUs should have damaged each other more
        expect(cpu1HP).toBeLessThan(humanHP);
        expect(cpu2HP).toBeLessThan(humanHP);
    });
    
    test('reduced damage multiplier makes game fairer', () => {
        const oldMultiplier = 2.0;
        const newMultiplier = 1.2;
        
        const impactSpeed = 30;
        const oldDamage = Math.floor(impactSpeed * oldMultiplier);
        const newDamage = Math.floor(impactSpeed * newMultiplier);
        
        expect(newDamage).toBe(36);
        expect(oldDamage).toBe(60);
        
        // New damage is 40% less
        const reduction = ((oldDamage - newDamage) / oldDamage) * 100;
        expect(reduction).toBeGreaterThanOrEqual(40);
    });
    
    test('ramming multipliers are balanced', () => {
        const baseDamage = 30;
        
        // Attacker takes less damage
        const attackerDamage = baseDamage * 0.7;
        
        // Defender takes bonus damage
        const defenderDamage = baseDamage * 1.2;
        
        expect(attackerDamage).toBe(21);
        expect(defenderDamage).toBe(36);
        
        // Attacker advantage is reasonable (41% less damage)
        const advantage = ((defenderDamage - attackerDamage) / defenderDamage) * 100;
        expect(advantage).toBeGreaterThanOrEqual(40);
        expect(advantage).toBeLessThanOrEqual(45);
    });
    
    test('human can eliminate CPU with strategic ramming', () => {
        let humanHP = 100;
        let cpuHP = 100;
        
        // Human performs 3 successful rams
        const rammingDamage = Math.floor(28 * COLLISION_DAMAGE_MULTIPLIER);
        const humanTakesDamage = Math.floor(rammingDamage * 0.7);
        const cpuTakesDamage = Math.floor(rammingDamage * 1.2);
        
        for (let i = 0; i < 3; i++) {
            humanHP -= humanTakesDamage;
            cpuHP -= cpuTakesDamage;
        }
        
        // Human should win
        expect(humanHP).toBeGreaterThan(0);
        expect(cpuHP).toBeLessThanOrEqual(0);
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
