// =============================================================================
// CPU WALL COLLISION TESTS - Jest
// =============================================================================
// Run with: npm test (from server directory)
// 
// These tests verify that CPU opponents cannot pass through walls.

const CANNON = require('cannon-es');

// =============================================================================
// TEST HELPERS
// =============================================================================

function createTestWorld() {
    const world = new CANNON.World({
        gravity: new CANNON.Vec3(0, -15, 0)
    });
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.solver.iterations = 20;
    return world;
}

function createWallMaterial() {
    return new CANNON.Material('wall');
}

function createCarMaterial() {
    return new CANNON.Material('car');
}

function createWall(world, material, x1, z1, x2, z2, height = 5) {
    const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(z2 - z1, 2));
    const centerX = (x1 + x2) / 2;
    const centerZ = (z1 + z2) / 2;
    const angle = Math.atan2(z2 - z1, x2 - x1);

    const wallBody = new CANNON.Body({
        mass: 0, // Static
        shape: new CANNON.Box(new CANNON.Vec3(length / 2, height / 2, 2.5)),
        position: new CANNON.Vec3(centerX, height / 2, centerZ),
        material
    });
    wallBody.quaternion.setFromEuler(0, -angle, 0);
    world.addBody(wallBody);
    return wallBody;
}

function createCPUBody(world, material, x, z) {
    const body = new CANNON.Body({
        mass: 50,
        shape: new CANNON.Sphere(1),
        position: new CANNON.Vec3(x, 1, z),
        linearDamping: 0.3,
        angularDamping: 0.3,
        allowSleep: false,
        material
    });
    world.addBody(body);
    return body;
}

function createGroundPlane(world, material) {
    const groundBody = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Plane(),
        position: new CANNON.Vec3(0, 0, 0),
        material
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(groundBody);
    return groundBody;
}

// =============================================================================
// CPU WALL COLLISION TESTS
// =============================================================================
describe('CPU Wall Collision', () => {
    let world;
    let wallMaterial;
    let carMaterial;

    beforeEach(() => {
        world = createTestWorld();
        wallMaterial = createWallMaterial();
        carMaterial = createCarMaterial();

        // Setup car-wall contact material (same as server)
        const carWallContact = new CANNON.ContactMaterial(carMaterial, wallMaterial, {
            friction: 0.0,
            restitution: 0.0,
            contactEquationStiffness: 1e9,
            contactEquationRelaxation: 3
        });
        world.addContactMaterial(carWallContact);

        // Add ground
        const groundMaterial = new CANNON.Material('ground');
        createGroundPlane(world, groundMaterial);
    });

    test('CPU body stops when colliding with wall head-on', () => {
        // Create a wall at x=10
        createWall(world, wallMaterial, 10, -20, 10, 20);

        // Create CPU at x=0, moving towards wall
        const cpuBody = createCPUBody(world, carMaterial, 0, 0);
        cpuBody.velocity.set(30, 0, 0); // High velocity towards wall

        // Simulate physics for 1 second
        for (let i = 0; i < 60; i++) {
            world.step(1 / 60);
        }

        // CPU should NOT have passed through the wall (x should be less than wall position minus radius)
        expect(cpuBody.position.x).toBeLessThan(10);
    });

    test('CPU body cannot pass through wall even with extreme velocity', () => {
        // Create a wall at x=10
        createWall(world, wallMaterial, 10, -20, 10, 20);

        // Create CPU at x=5, very close to wall with extreme velocity
        const cpuBody = createCPUBody(world, carMaterial, 5, 0);
        cpuBody.velocity.set(100, 0, 0); // Extreme velocity

        // Simulate physics
        for (let i = 0; i < 60; i++) {
            world.step(1 / 60);
        }

        // CPU should still not pass through (allowing some penetration tolerance)
        expect(cpuBody.position.x).toBeLessThan(12); // Wall at 10 + some tolerance
    });

    test('CPU body cannot pass through wall when force is applied', () => {
        // Create a wall at x=20
        createWall(world, wallMaterial, 20, -20, 20, 20);

        // Create CPU at origin
        const cpuBody = createCPUBody(world, carMaterial, 0, 0);

        // Simulate physics with continuous force application (like CPU AI does)
        for (let i = 0; i < 120; i++) {
            // Apply force towards wall (same direction as wall)
            const force = new CANNON.Vec3(500, 0, 0);
            cpuBody.applyForce(force, cpuBody.position);
            world.step(1 / 60);
        }

        // CPU should NOT have passed through the wall
        expect(cpuBody.position.x).toBeLessThan(20);
    });

    test('CPU body respects diagonal wall', () => {
        // Create diagonal wall from (10, -10) to (20, 10)
        createWall(world, wallMaterial, 10, -10, 20, 10);

        // Create CPU moving diagonally towards wall
        const cpuBody = createCPUBody(world, carMaterial, 0, 0);
        cpuBody.velocity.set(20, 0, 0);

        // Simulate
        for (let i = 0; i < 60; i++) {
            world.step(1 / 60);
        }

        // CPU should be blocked by the diagonal wall
        // Check that the CPU is on the near side of the wall's center
        const wallCenterX = 15;
        expect(cpuBody.position.x).toBeLessThan(wallCenterX + 5); // Some tolerance for diagonal
    });

    test('CPU body slides along wall instead of passing through', () => {
        // Create wall along X axis at z=10
        createWall(world, wallMaterial, -20, 10, 20, 10);

        // Create CPU moving at an angle towards wall
        const cpuBody = createCPUBody(world, carMaterial, 0, 0);
        cpuBody.velocity.set(10, 0, 20); // Moving forward and towards wall

        const initialX = cpuBody.position.x;

        // Simulate
        for (let i = 0; i < 60; i++) {
            world.step(1 / 60);
        }

        // CPU should have slid along the wall (moved in X direction)
        // but not passed through (z should be less than wall)
        expect(cpuBody.position.z).toBeLessThan(10);
        // X should have changed as the CPU slides along the wall
        expect(Math.abs(cpuBody.position.x - initialX)).toBeGreaterThan(0);
    });

    test('Multiple CPUs cannot push each other through walls', () => {
        // Create wall at x=20
        createWall(world, wallMaterial, 20, -20, 20, 20);

        // Create two CPUs, one behind the other
        const cpu1 = createCPUBody(world, carMaterial, 0, 0);
        const cpu2 = createCPUBody(world, carMaterial, -5, 0);

        // Both moving towards wall
        cpu1.velocity.set(30, 0, 0);
        cpu2.velocity.set(40, 0, 0); // Faster, will push cpu1

        // Simulate
        for (let i = 0; i < 120; i++) {
            world.step(1 / 60);
        }

        // Neither should pass through
        expect(cpu1.position.x).toBeLessThan(20);
        expect(cpu2.position.x).toBeLessThan(20);
    });
});

// =============================================================================
// CPU BOUNDARY ENFORCEMENT TESTS
// =============================================================================
describe('CPU Boundary Enforcement', () => {
    test('CPU is respawned when out of bounds', () => {
        const mockBounds = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
        const mockSpawnPoint = { x: 0, z: 0, rotation: 0 };

        function enforceBoundaries(body) {
            let teleported = false;
            if (body.position.x < mockBounds.minX || body.position.x > mockBounds.maxX ||
                body.position.z < mockBounds.minZ || body.position.z > mockBounds.maxZ) {
                body.position.set(mockSpawnPoint.x, 1, mockSpawnPoint.z);
                body.velocity.set(0, 0, 0);
                teleported = true;
            }
            return teleported;
        }

        const world = createTestWorld();
        const carMaterial = createCarMaterial();
        const cpuBody = createCPUBody(world, carMaterial, 100, 0); // Out of bounds

        const wasRespawned = enforceBoundaries(cpuBody);
        expect(wasRespawned).toBe(true);
        expect(cpuBody.position.x).toBe(mockSpawnPoint.x);
        expect(cpuBody.position.z).toBe(mockSpawnPoint.z);
    });

    test('CPU within bounds is not respawned', () => {
        const mockBounds = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };

        function isOutOfBounds(x, z) {
            return x < mockBounds.minX || x > mockBounds.maxX ||
                z < mockBounds.minZ || z > mockBounds.maxZ;
        }

        expect(isOutOfBounds(0, 0)).toBe(false);
        expect(isOutOfBounds(25, 25)).toBe(false);
        expect(isOutOfBounds(-49, 49)).toBe(false);
    });
});

// =============================================================================
// CPU VELOCITY CLAMPING TESTS
// =============================================================================
describe('CPU Velocity Clamping', () => {
    test('CPU velocity is clamped to max speed', () => {
        const MAX_SPEED = 80;

        function clampVelocity(body) {
            const speed = body.velocity.length();
            if (speed > MAX_SPEED) {
                body.velocity.scale(MAX_SPEED / speed, body.velocity);
            }
        }

        const world = createTestWorld();
        const carMaterial = createCarMaterial();
        const cpuBody = createCPUBody(world, carMaterial, 0, 0);
        cpuBody.velocity.set(100, 0, 100); // Speed > 80

        clampVelocity(cpuBody);

        const newSpeed = cpuBody.velocity.length();
        expect(newSpeed).toBeLessThanOrEqual(MAX_SPEED + 0.001); // Allow floating point tolerance
    });

    test('Velocity direction is preserved when clamping', () => {
        const MAX_SPEED = 80;

        function clampVelocity(body) {
            const speed = body.velocity.length();
            if (speed > MAX_SPEED) {
                body.velocity.scale(MAX_SPEED / speed, body.velocity);
            }
        }

        const world = createTestWorld();
        const carMaterial = createCarMaterial();
        const cpuBody = createCPUBody(world, carMaterial, 0, 0);
        cpuBody.velocity.set(100, 0, 0);

        const originalDirection = new CANNON.Vec3();
        cpuBody.velocity.normalize(originalDirection);

        clampVelocity(cpuBody);

        const newDirection = new CANNON.Vec3();
        cpuBody.velocity.normalize(newDirection);

        // Direction should be preserved
        expect(newDirection.x).toBeCloseTo(originalDirection.x);
        expect(newDirection.y).toBeCloseTo(originalDirection.y);
        expect(newDirection.z).toBeCloseTo(originalDirection.z);
    });
});
