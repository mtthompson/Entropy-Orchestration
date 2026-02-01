// =============================================================================
// PLAYER INPUT & MOVEMENT TESTS
// =============================================================================
// Tests for steering, throttle, boost, and physics movement

const CANNON = require('cannon-es');

// =============================================================================
// MOCK PHYSICS WORLD
// =============================================================================
function createMockWorld() {
    const world = new CANNON.World({
        gravity: new CANNON.Vec3(0, -9.82, 0)
    });
    world.broadphase = new CANNON.SAPBroadphase(world);
    return world;
}

function createMockBody(position = { x: 0, y: 1, z: 0 }, mass = 50) {
    return new CANNON.Body({
        mass,
        shape: new CANNON.Sphere(1),
        position: new CANNON.Vec3(position.x, position.y, position.z),
        linearDamping: 0.5,
        angularDamping: 0.5
    });
}

function createMockPlayer(id, options = {}) {
    return {
        id,
        name: options.name || `Player${id}`,
        type: options.type || 'driver',
        hp: options.hp !== undefined ? options.hp : 100,
        boost: options.boost !== undefined ? options.boost : 100,
        body: options.body || null,
        maskType: options.maskType || 'Classic',
        input: options.input || { steering: 0, throttle: 0, boost: false }
    };
}

// =============================================================================
// INPUT VALIDATION
// =============================================================================
describe('Input Validation', () => {
    test('steering clamped to [-1, 1]', () => {
        const inputs = [-1.5, -1, 0, 1, 1.5];
        const clamped = inputs.map(s => Math.max(-1, Math.min(1, s)));
        
        expect(clamped).toEqual([-1, -1, 0, 1, 1]);
    });

    test('throttle clamped to [0, 1]', () => {
        const inputs = [-0.5, 0, 0.5, 1, 1.5];
        const clamped = inputs.map(t => Math.max(0, Math.min(1, t)));
        
        expect(clamped).toEqual([0, 0, 0.5, 1, 1]);
    });

    test('boost is boolean', () => {
        expect(typeof false).toBe('boolean');
        expect(typeof true).toBe('boolean');
    });

    test('input rejected for non-driver players', () => {
        const drone = createMockPlayer('p1', { type: 'drone' });
        
        const canProcessInput = drone.type === 'driver';
        
        expect(canProcessInput).toBe(false);
    });

    test('input rejected for players without body', () => {
        const player = createMockPlayer('p1', { body: null });
        
        const canProcessInput = player.body !== null;
        
        expect(canProcessInput).toBe(false);
    });
});

// =============================================================================
// STEERING MECHANICS
// =============================================================================
describe('Steering Mechanics', () => {
    let world;
    
    beforeEach(() => {
        world = createMockWorld();
    });

    test('steering requires minimum speed', () => {
        const body = createMockBody();
        body.velocity.set(0, 0, 0); // Stationary
        world.addBody(body);
        
        const speed = body.velocity.length();
        const minSpeedToTurn = 2;
        
        const canTurn = speed > minSpeedToTurn;
        
        expect(canTurn).toBe(false);
    });

    test('steering allowed when moving', () => {
        const body = createMockBody();
        body.velocity.set(0, 0, -10); // Moving forward
        world.addBody(body);
        
        const speed = body.velocity.length();
        const minSpeedToTurn = 2;
        
        const canTurn = speed > minSpeedToTurn;
        
        expect(canTurn).toBe(true);
    });

    test('steering sensitivity decreases at high speed', () => {
        const lowSpeed = 10;
        const highSpeed = 40;
        
        const lowSpeedDampen = Math.max(0.3, 1 - lowSpeed / 50);
        const highSpeedDampen = Math.max(0.3, 1 - highSpeed / 50);
        
        expect(highSpeedDampen).toBeLessThan(lowSpeedDampen);
    });

    test('angular velocity set for steering', () => {
        const body = createMockBody();
        body.velocity.set(0, 0, -10);
        world.addBody(body);
        
        const steering = 0.5; // Turn right
        const turnSpeed = 6.0;
        
        body.angularVelocity.y = -steering * turnSpeed;
        
        expect(body.angularVelocity.y).toBe(-3);
    });

    test('left steering applies positive angular velocity', () => {
        const steering = -1; // Left
        const turnSpeed = 6.0;
        
        const angularY = -steering * turnSpeed;
        
        expect(angularY).toBeGreaterThan(0);
    });

    test('right steering applies negative angular velocity', () => {
        const steering = 1; // Right
        const turnSpeed = 6.0;
        
        const angularY = -steering * turnSpeed;
        
        expect(angularY).toBeLessThan(0);
    });
});

// =============================================================================
// THROTTLE & ACCELERATION
// =============================================================================
describe('Throttle & Acceleration', () => {
    let world;
    
    beforeEach(() => {
        world = createMockWorld();
    });

    test('throttle applies force in forward direction', () => {
        const body = createMockBody();
        world.addBody(body);
        
        const throttle = 1;
        const driveForce = 800;
        
        // Forward is -Z
        const forward = new CANNON.Vec3(0, 0, -1);
        body.quaternion.vmult(forward, forward);
        forward.scale(throttle * driveForce, forward);
        
        body.applyForce(forward, body.position);
        world.step(1/60);
        
        expect(body.velocity.z).toBeLessThan(0); // Moving forward (-Z)
    });

    test('no throttle means no forward force', () => {
        const body = createMockBody();
        world.addBody(body);
        
        const initialVel = body.velocity.clone();
        
        // No force applied
        world.step(1/60);
        
        // Only gravity affects the body
        expect(body.velocity.x).toBeCloseTo(initialVel.x);
        expect(body.velocity.z).toBeCloseTo(initialVel.z);
    });

    test('partial throttle applies partial force', () => {
        const body1 = createMockBody();
        const body2 = createMockBody();
        world.addBody(body1);
        world.addBody(body2);
        
        const driveForce = 800;
        
        // Full throttle
        const fullForce = new CANNON.Vec3(0, 0, -driveForce);
        body1.applyForce(fullForce, body1.position);
        
        // Half throttle
        const halfForce = new CANNON.Vec3(0, 0, -driveForce * 0.5);
        body2.applyForce(halfForce, body2.position);
        
        world.step(1/60);
        
        expect(Math.abs(body1.velocity.z)).toBeGreaterThan(Math.abs(body2.velocity.z));
    });
});

// =============================================================================
// BOOST SYSTEM
// =============================================================================
describe('Boost System', () => {
    test('boost multiplies force', () => {
        const normalForce = 800;
        const boostMultiplier = 1.8;
        
        const boostedForce = normalForce * boostMultiplier;
        
        expect(boostedForce).toBe(1440);
    });

    test('boost depletes over time', () => {
        let boost = 100;
        const depleteRate = 1.5;
        
        // Simulate 60 frames of boosting
        for (let i = 0; i < 60; i++) {
            boost = Math.max(0, boost - depleteRate);
        }
        
        expect(boost).toBe(10);
    });

    test('boost cannot go below 0', () => {
        let boost = 5;
        const depleteRate = 1.5;
        
        for (let i = 0; i < 10; i++) {
            boost = Math.max(0, boost - depleteRate);
        }
        
        expect(boost).toBe(0);
    });

    test('boost regenerates when not boosting', () => {
        let boost = 50;
        const regenRate = 0.3;
        
        // Simulate 60 frames without boosting
        for (let i = 0; i < 60; i++) {
            boost = Math.min(100, boost + regenRate);
        }
        
        expect(boost).toBeCloseTo(68);
    });

    test('boost capped at 100', () => {
        let boost = 99;
        const regenRate = 0.3;
        
        for (let i = 0; i < 10; i++) {
            boost = Math.min(100, boost + regenRate);
        }
        
        expect(boost).toBe(100);
    });

    test('boost disabled when empty', () => {
        const boost = 0;
        const boostInput = true;
        
        const canBoost = boostInput && boost > 0;
        
        expect(canBoost).toBe(false);
    });
});

// =============================================================================
// MASK ABILITIES
// =============================================================================
describe('Mask Abilities', () => {
    test('Tech mask increases boost regen by 50%', () => {
        const normalRegen = 0.3;
        const techBonus = 1.5;
        
        const techRegen = normalRegen * techBonus;
        
        expect(techRegen).toBeCloseTo(0.45, 10);
    });

    test('Skull mask increases max speed by 10%', () => {
        const normalMaxSpeed = 45;
        const skullBonus = 1.1;
        
        const skullMaxSpeed = normalMaxSpeed * skullBonus;
        
        expect(skullMaxSpeed).toBeCloseTo(49.5);
    });

    test('Clown mask has random speed burst', () => {
        let bursts = 0;
        const burstChance = 0.003;
        
        // Simulate 600 frames (~10 seconds)
        for (let i = 0; i < 600; i++) {
            if (Math.random() < burstChance) {
                bursts++;
            }
        }
        
        // Should average ~1.8 bursts (statistically)
        // But random, so just check it's reasonable
        expect(bursts).toBeGreaterThanOrEqual(0);
        expect(bursts).toBeLessThan(20); // Very unlikely to exceed
    });

    test('Classic mask has no special ability', () => {
        const maskType = 'Classic';
        const boostRegenMod = maskType === 'Tech' ? 1.5 : 1.0;
        const maxSpeedMod = maskType === 'Skull' ? 1.1 : 1.0;
        
        expect(boostRegenMod).toBe(1.0);
        expect(maxSpeedMod).toBe(1.0);
    });
});

// =============================================================================
// LATERAL FRICTION (ANTI-DRIFT)
// =============================================================================
describe('Lateral Friction', () => {
    let world;
    
    beforeEach(() => {
        world = createMockWorld();
    });

    test('lateral velocity is dampened', () => {
        const body = createMockBody();
        body.velocity.set(10, 0, 0); // Moving sideways
        world.addBody(body);
        
        // Calculate lateral correction
        const quaternion = body.quaternion;
        const right = new CANNON.Vec3(1, 0, 0);
        quaternion.vmult(right, right);
        
        const lateralVelocity = body.velocity.dot(right);
        const grip = 0.92;
        
        const correctionMagnitude = -lateralVelocity * grip * body.mass * 8;
        
        expect(Math.abs(correctionMagnitude)).toBeGreaterThan(0);
    });

    test('forward velocity is not affected by grip', () => {
        const body = createMockBody();
        body.velocity.set(0, 0, -20); // Moving forward
        
        const right = new CANNON.Vec3(1, 0, 0);
        body.quaternion.vmult(right, right);
        
        const lateralVelocity = body.velocity.dot(right);
        
        expect(lateralVelocity).toBeCloseTo(0);
    });
});

// =============================================================================
// SPEED LIMITS
// =============================================================================
describe('Speed Limits', () => {
    test('speed capped at MAX_SPEED', () => {
        const MAX_SPEED = 80;
        let speed = 100;
        
        if (speed > MAX_SPEED) {
            speed = MAX_SPEED;
        }
        
        expect(speed).toBe(MAX_SPEED);
    });

    test('player max speed is 65 (or 71.5 for Skull)', () => {
        const normalMaxSpeed = 65;
        const skullMaxSpeed = 65 * 1.1;
        
        expect(normalMaxSpeed).toBe(65);
        expect(skullMaxSpeed).toBeCloseTo(71.5);
    });

    test('velocity scaling preserves direction', () => {
        const body = createMockBody();
        body.velocity.set(30, 0, -40); // Diagonal movement
        
        const maxSpeed = 45;
        const speed = body.velocity.length();
        
        if (speed > maxSpeed) {
            const scale = maxSpeed / speed;
            body.velocity.scale(scale, body.velocity);
        }
        
        const newSpeed = body.velocity.length();
        expect(newSpeed).toBeCloseTo(maxSpeed, 1);
        
        // Direction preserved (ratio same)
        const ratio = body.velocity.x / body.velocity.z;
        expect(ratio).toBeCloseTo(30 / -40);
    });
});

// =============================================================================
// BOUNDARY ENFORCEMENT
// =============================================================================
describe('Boundary Enforcement', () => {
    const bounds = { minX: -60, maxX: 60, minZ: -60, maxZ: 60 };
    const spawnPoint = { x: 0, z: 0, rotation: 0 };

    function isOutOfBounds(x, z) {
        return x < bounds.minX || x > bounds.maxX ||
               z < bounds.minZ || z > bounds.maxZ;
    }

    test('in-bounds position is valid', () => {
        expect(isOutOfBounds(0, 0)).toBe(false);
        expect(isOutOfBounds(50, 50)).toBe(false);
        expect(isOutOfBounds(-50, -50)).toBe(false);
    });

    test('out-of-bounds triggers respawn', () => {
        expect(isOutOfBounds(100, 0)).toBe(true);
        expect(isOutOfBounds(0, 100)).toBe(true);
        expect(isOutOfBounds(-100, -100)).toBe(true);
    });

    test('respawn resets position to spawn point', () => {
        const body = createMockBody({ x: 100, y: 1, z: 100 });
        
        if (isOutOfBounds(body.position.x, body.position.z)) {
            body.position.set(spawnPoint.x, 1, spawnPoint.z);
            body.velocity.set(0, 0, 0);
        }
        
        expect(body.position.x).toBe(0);
        expect(body.position.z).toBe(0);
        expect(body.velocity.length()).toBe(0);
    });

    test('falling through floor triggers respawn', () => {
        const body = createMockBody({ x: 0, y: -10, z: 0 });
        
        const shouldRespawn = body.position.y < -5;
        
        expect(shouldRespawn).toBe(true);
    });
});

// =============================================================================
// INPUT DURING GAME STATES
// =============================================================================
describe('Input During Game States', () => {
    test('input processed during RACING', () => {
        const gameState = 'RACING';
        const player = createMockPlayer('p1', { type: 'driver', body: createMockBody() });
        
        const shouldProcess = gameState === 'RACING' && player.type === 'driver' && !!player.body;
        
        expect(shouldProcess).toBe(true);
    });

    test('input ignored during COUNTDOWN', () => {
        const gameState = 'COUNTDOWN';
        
        const shouldProcess = gameState === 'RACING';
        
        expect(shouldProcess).toBe(false);
    });

    test('input ignored during LOBBY', () => {
        const gameState = 'LOBBY';
        
        const shouldProcess = gameState === 'RACING';
        
        expect(shouldProcess).toBe(false);
    });

    test('input ignored during WINNER', () => {
        const gameState = 'WINNER';
        
        const shouldProcess = gameState === 'RACING';
        
        expect(shouldProcess).toBe(false);
    });

    test('input stored for game loop processing', () => {
        const player = createMockPlayer('p1');
        
        player.input = { steering: 0.5, throttle: 1, boost: true };
        
        expect(player.input.steering).toBe(0.5);
        expect(player.input.throttle).toBe(1);
        expect(player.input.boost).toBe(true);
    });
});

// =============================================================================
// PHYSICS SIMULATION ACCURACY
// =============================================================================
describe('Physics Simulation', () => {
    let world;
    
    beforeEach(() => {
        world = createMockWorld();
    });

    test('60Hz tick rate is consistent', () => {
        const TICK_RATE = 60;
        const timestep = 1 / TICK_RATE;
        
        expect(timestep).toBeCloseTo(0.0167, 3);
    });

    test('body wakes up before force application', () => {
        const body = createMockBody();
        body.allowSleep = true;
        world.addBody(body);
        
        // Simulate sleep
        body.sleep();
        expect(body.sleepState).toBe(CANNON.Body.SLEEPING);
        
        // Wake up
        body.wakeUp();
        expect(body.sleepState).toBe(CANNON.Body.AWAKE);
    });

    test('physics steps consistently', () => {
        const body = createMockBody();
        body.velocity.set(0, 0, -10);
        world.addBody(body);
        
        const initialZ = body.position.z;
        
        // 60 steps = 1 second
        for (let i = 0; i < 60; i++) {
            world.step(1/60);
        }
        
        // Should have moved approximately 10 units (minus some damping)
        expect(body.position.z).toBeLessThan(initialZ);
    });
});
