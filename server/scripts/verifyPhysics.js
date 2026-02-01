const CANNON = require('cannon-es');
const { getAllTracks } = require('../tracks');
const { generateHeightMap, getTerrainHeight, getTerrainPreset } = require('../terrain');

// Configuration
const SIMULATION_TICKS = 120; // 2 seconds at 60fps
const TICK_RATE = 1 / 60;
const FALL_THRESHOLD = -5; // If y < -5, it fell through (matches server logic)

function createPhysicsWorld() {
    const world = new CANNON.World({
        gravity: new CANNON.Vec3(0, -15, 0)
    });
    world.broadphase = new CANNON.SAPBroadphase(world);
    // world.solver.iterations = 20; // Match server
    return world;
}

function verifyTrackPhysics(track) {
    console.log(`\nSimulating Track: ${track.name} (${track.id})`);

    // 1. Setup World & Materials
    const world = createPhysicsWorld();
    const groundMaterial = new CANNON.Material('ground');
    const carMaterial = new CANNON.Material('car');
    const wallMaterial = new CANNON.Material('wall');

    const carGroundContact = new CANNON.ContactMaterial(carMaterial, groundMaterial, {
        friction: 0.6, restitution: 0.1
    });
    world.addContactMaterial(carGroundContact);

    // 2. Add Terrain
    const preset = getTerrainPreset(track.id, track.type);
    const floorSize = track.floorSize || { width: 300, depth: 300 };
    // Use the dynamic width fix we added
    const heightMap = generateHeightMap(
        floorSize.width * 1.2,
        floorSize.depth * 1.2,
        preset.resolution,
        {
            hillScale: preset.hillScale,
            hillFrequency: preset.hillFrequency,
            trackPath: track.path,
            trackWidth: track.width || 55,
            spawnPoints: track.spawnPoints
        }
    );

    const heightfieldShape = new CANNON.Heightfield(heightMap.matrix, {
        elementSize: heightMap.elementSize
    });
    const terrainBody = new CANNON.Body({ mass: 0, material: groundMaterial });
    terrainBody.addShape(heightfieldShape, new CANNON.Vec3(-heightMap.width / 2, -heightMap.depth / 2, 0));
    terrainBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(terrainBody);

    // 3. Spawn Test Cars (Spheres)
    const cars = [];
    track.spawnPoints.forEach((spawn, i) => {
        // Match server: spawn height = terrain + 10
        // Note: index.js adds +10. tracks.js just has x/z.
        const spawnY = getTerrainHeight(heightMap, spawn.x, spawn.z) + 10;

        const shape = new CANNON.Sphere(1); // Radius 1
        const body = new CANNON.Body({
            mass: 50,
            shape: shape,
            position: new CANNON.Vec3(spawn.x, spawnY, spawn.z),
            material: carMaterial
        });
        world.addBody(body);
        cars.push({ id: i, body, initialPos: { x: spawn.x, y: spawnY, z: spawn.z } });
    });

    // 4. Run Simulation
    let failures = 0;

    for (let tick = 0; tick < SIMULATION_TICKS; tick++) {
        world.step(TICK_RATE);

        // Check for failures each tick
        cars.forEach(car => {
            if (car.failed) return; // Already failed

            const pos = car.body.position;

            // Check for fall-through
            if (pos.y < FALL_THRESHOLD) {
                console.error(`  [FAIL] Spawn ${car.id} fell through world! (y=${pos.y.toFixed(2)} at tick ${tick})`);
                console.error(`         Spawn: ${car.initialPos.x}, ${car.initialPos.y}, ${car.initialPos.z}`);
                car.failed = true;
                failures++;
            }

            // Check for exploded physics (NaN or Infinity)
            if (isNaN(pos.x) || isNaN(pos.y) || isNaN(pos.z) || !isFinite(pos.x)) {
                console.error(`  [FAIL] Spawn ${car.id} physics exploded! (NaN/Inf)`);
                car.failed = true;
                failures++;
            }
        });
    }

    // End of simulation status
    cars.forEach(car => {
        if (!car.failed) {
            // Check final resting position
            const landHeight = getTerrainHeight(heightMap, car.body.position.x, car.body.position.z);
            // Must be ON ground (approx radius 1 above terrain)
            // If it's embedded deep inside, that's bad too.
            const distFromGround = car.body.position.y - landHeight;

            if (distFromGround < 0.5) {
                console.warn(`  [WARN] Spawn ${car.id} landed too low/embedded? (Height above terrain: ${distFromGround.toFixed(2)})`);
                // Not a hard failure unless it falls through, but worth noting.
            } else if (distFromGround > 2.0) {
                // Still floating?
                // console.log(`  [INFO] Spawn ${car.id} floating? (Height: ${distFromGround.toFixed(2)})`);
            }
        }
    });

    if (failures === 0) {
        console.log(`  [PASS] All ${cars.length} cars survived 2s simulation.`);
        return true;
    } else {
        return false;
    }
}

function run() {
    const tracks = getAllTracks();
    let totalFailures = 0;

    tracks.forEach(track => {
        if (!verifyTrackPhysics(track)) {
            totalFailures++;
        }
    });

    if (totalFailures > 0) {
        console.error(`\nPhysics Verification Failed: ${totalFailures} tracks have unstable spawns.`);
        process.exit(1);
    } else {
        console.log('\nPhysics Verification Passed: No fall-throughs detected.');
        process.exit(0);
    }
}

run();
