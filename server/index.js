const { Server } = require('socket.io');
const { createServer } = require('http');
const CANNON = require('cannon-es');
const { v4: uuidv4 } = require('uuid');
const { getDefaultTrack } = require('./tracks');

// =============================================================================
// CONFIGURATION
// =============================================================================
const PORT = process.env.PORT || 3000;
const TICK_RATE = 60;
const DAMAGE_THRESHOLD = 15;
const MAX_SPEED = 80; // Hard cap on velocity to prevent physics explosions
const POWERUP_SPAWN_INTERVAL = 7000; // 5-10s average
const POWERUP_TYPES = ['Repair', 'Boost'];

// =============================================================================
// SERVER SETUP
// =============================================================================
const httpServer = createServer();
const io = new Server(httpServer, {
    cors: { origin: '*' }
    // Default path is /socket.io - tailscale strips /api prefix when routing to backend
});

// =============================================================================
// PHYSICS WORLD
// =============================================================================
const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0)
});
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
world.solver.iterations = 20; // Increase solver iterations for stability (default is 10)

// Ground plane - prevents objects from falling through
// Ground plane - prevents objects from falling through
const groundMaterial = new CANNON.Material('ground');
const wallMaterial = new CANNON.Material('wall');
const carMaterial = new CANNON.Material('car');

// Define interactions
const carGroundContact = new CANNON.ContactMaterial(carMaterial, groundMaterial, {
    friction: 0.7,
    restitution: 0.1, // Little bounce on ground
    contactEquationStiffness: 1e8,
    contactEquationRelaxation: 3
});

const carWallContact = new CANNON.ContactMaterial(carMaterial, wallMaterial, {
    friction: 0.0,      // Teflon walls - slide along them
    restitution: 0.0,   // Absolutely NO bounce
    contactEquationStiffness: 1e9, // Very Rigid (prevents spring effect)
    contactEquationRelaxation: 3   // Standard stability
});

const carCarContact = new CANNON.ContactMaterial(carMaterial, carMaterial, {
    friction: 0.5,
    restitution: 0.4, // Some bounce between cars
    contactEquationStiffness: 1e8,
    contactEquationRelaxation: 3
});

world.addContactMaterial(carGroundContact);
world.addContactMaterial(carWallContact);
world.addContactMaterial(carCarContact);

const groundBody = new CANNON.Body({
    mass: 0, // Static body
    shape: new CANNON.Plane(),
    position: new CANNON.Vec3(0, 0, 0),
    material: groundMaterial
});
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Rotate to be horizontal
world.addBody(groundBody);

// =============================================================================
// TRACK SYSTEM
// =============================================================================
const activeTrack = getDefaultTrack();
const trackWalls = [];

// Create wall physics bodies from track boundaries
function createTrackWalls() {
    for (const wall of activeTrack.boundaries) {
        // Calculate wall dimensions and position
        const length = Math.sqrt(
            Math.pow(wall.x2 - wall.x1, 2) + Math.pow(wall.z2 - wall.z1, 2)
        );
        const centerX = (wall.x1 + wall.x2) / 2;
        const centerZ = (wall.z1 + wall.z2) / 2;
        const angle = Math.atan2(wall.z2 - wall.z1, wall.x2 - wall.x1);

        // Wall thickness of 2 units
        // Wall thickness increased to prevents tunneling
        const wallBody = new CANNON.Body({
            mass: 0, // Static
            shape: new CANNON.Box(new CANNON.Vec3(length / 2, wall.height / 2, 2.5)), // 5 units thick (2.5 half-extents)
            position: new CANNON.Vec3(centerX, wall.height / 2, centerZ),
            material: wallMaterial
        });
        wallBody.quaternion.setFromEuler(0, -angle, 0);

        world.addBody(wallBody);
        trackWalls.push(wallBody);
    }

    console.log(`[TRACK] Created ${trackWalls.length} walls for "${activeTrack.name}"`);
}

createTrackWalls();


// =============================================================================
// GAME STATE
// =============================================================================
const players = new Map();       // id -> { body, hp, type, color, name }
const powerups = new Map();      // id -> { body, type }
const traps = new Map();         // id -> { body }

const CAR_COLORS = [
    '#FF00FF', '#00FFFF', '#FF6B00', '#00FF00',
    '#FF0066', '#6600FF', '#FFFF00', '#00FF99'
];

// =============================================================================
// PLAYER MANAGEMENT
// =============================================================================
function spawnPlayer(id, name = 'Player') {
    // Use track spawn points
    const spawnIndex = players.size % activeTrack.spawnPoints.length;
    const spawnPoint = activeTrack.spawnPoints[spawnIndex];
    const spawnX = spawnPoint.x + (Math.random() - 0.5) * 2; // Slight randomization
    const spawnZ = spawnPoint.z + (Math.random() - 0.5) * 2;

    const body = new CANNON.Body({
        mass: 50,
        shape: new CANNON.Sphere(1),
        position: new CANNON.Vec3(spawnX, 1, spawnZ),
        linearDamping: 0.5,  // Increased drag for better control (was 0.1)
        angularDamping: 0.5, // Reduced spin (was 0.3)
        allowSleep: false,  // Keep player bodies always awake
        material: carMaterial,
        // Continuous Collision Detection settings
        ccdSpeedThreshold: 1, // Enable CCD if moving faster than 1 unit/tick
        ccdIterations: 5      // Check 5 times between steps
    });

    world.addBody(body);

    const color = CAR_COLORS[players.size % CAR_COLORS.length];

    players.set(id, {
        body,
        hp: 100,
        type: 'driver',
        color,
        name,
        boost: 100
    });

    console.log(`[SPAWN] Player ${name} (${id}) spawned at (${spawnX.toFixed(1)}, ${spawnZ.toFixed(1)})`);
    return players.get(id);
}

function removePlayer(id) {
    const player = players.get(id);
    if (player && player.body) {
        world.removeBody(player.body);
    }
    players.delete(id);
    console.log(`[REMOVE] Player ${id} removed`);
}

function switchToDrone(id) {
    const player = players.get(id);
    if (!player) return;

    // Remove physics body
    if (player.body) {
        world.removeBody(player.body);
        player.body = null;
    }

    player.type = 'drone';
    player.hp = 0;

    console.log(`[DRONE] Player ${id} is now a drone`);
    io.to(id).emit('becameDrone');
}

function updatePlayerPhysics(player, input) {
    if (!player.body) return;

    const { steering, throttle, boost } = input;

    // Wake up body
    player.body.wakeUp();

    // 1. Update Heading (Steering)
    // Instead of applying torque, we rotate the car's intended direction
    // Retrieve current heading from quaternion (approximate)
    // actually, let's just use angular velocity to turn the car
    // Apply torque for rotation
    const turnSpeed = 8.0; // How fast it turns
    player.body.angularVelocity.y = -steering * turnSpeed;

    // 2. Calculate Forward Direction based on current rotation
    const quaternion = player.body.quaternion;
    const forward = new CANNON.Vec3(0, 0, 1);
    quaternion.vmult(forward, forward); // Rotate forward vector by body rotation

    // 3. Apply Throttle Force (Aligned with heading)
    const driveForce = 600;
    const force = forward.clone();
    force.scale(-throttle * driveForce, force); // -z is forward in our local space usually

    // Boost
    if (boost && player.boost > 0) {
        force.scale(2, force);
        player.boost = Math.max(0, player.boost - 1);
    } else {
        player.boost = Math.min(100, player.boost + 0.2);
    }

    player.body.applyForce(force, player.body.position);

    // 4. Lateral Friction (Grip)
    // Get velocity relative to car
    // We want to kill sideways velocity
    const velocity = player.body.velocity;
    const right = new CANNON.Vec3(1, 0, 0);
    quaternion.vmult(right, right);

    const lateralVelocity = velocity.dot(right);

    // Apply opposing impulse to cancel lateral slide
    // Grip factor: 0.0 = ice, 1.0 = tracks
    const grip = 0.85;
    const correctionForce = right.clone();
    correctionForce.scale(-lateralVelocity * grip * player.body.mass * 5, correctionForce); // *5 to make it stiff

    player.body.applyForce(correctionForce, player.body.position);
}

// =============================================================================
// COLLISION HANDLING
// =============================================================================
world.addEventListener('postStep', () => {
    // Check collisions between players
    for (const [id1, p1] of players) {
        if (p1.type !== 'driver' || !p1.body) continue;

        for (const [id2, p2] of players) {
            if (id1 >= id2 || p2.type !== 'driver' || !p2.body) continue;

            // Check if bodies are colliding
            const dist = p1.body.position.distanceTo(p2.body.position);
            if (dist < 2.2) { // Overlapping spheres
                const relVel = new CANNON.Vec3();
                p1.body.velocity.vsub(p2.body.velocity, relVel);
                const impactSpeed = relVel.length();

                if (impactSpeed > DAMAGE_THRESHOLD) {
                    const damage = Math.floor(impactSpeed * 2);

                    p1.hp -= damage;
                    p2.hp -= damage;

                    console.log(`[COLLISION] ${id1} <-> ${id2} | Impact: ${impactSpeed.toFixed(1)} | Damage: ${damage}`);

                    // Emit damage events
                    io.to(id1).emit('damage', { hp: p1.hp, damage });
                    io.to(id2).emit('damage', { hp: p2.hp, damage });

                    // Check for deaths
                    if (p1.hp <= 0) switchToDrone(id1);
                    if (p2.hp <= 0) switchToDrone(id2);
                }
            }
        }
    }
});

// =============================================================================
// POWER-UPS
// =============================================================================
function spawnPowerup() {
    const id = uuidv4();
    const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    // Use track bounds for powerup spawning
    const bounds = activeTrack.powerupBounds;
    const x = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
    const z = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);

    const body = new CANNON.Body({
        mass: 0, // Static
        shape: new CANNON.Sphere(1.5),
        position: new CANNON.Vec3(x, 1, z),
        isTrigger: true
    });

    world.addBody(body);
    powerups.set(id, { body, type, position: { x, y: 1, z } });

    console.log(`[POWERUP] Spawned ${type} at (${x.toFixed(1)}, ${z.toFixed(1)})`);
}

function checkPowerupCollisions() {
    for (const [pId, powerup] of powerups) {
        for (const [playerId, player] of players) {
            if (player.type !== 'driver' || !player.body) continue;

            const dist = player.body.position.distanceTo(powerup.body.position);
            if (dist < 2.5) {
                // Apply effect
                if (powerup.type === 'Repair') {
                    player.hp = Math.min(100, player.hp + 50);
                    console.log(`[POWERUP] ${playerId} picked up Repair -> HP: ${player.hp}`);
                } else if (powerup.type === 'Boost') {
                    const dir = player.body.velocity.clone();
                    dir.normalize();
                    dir.scale(30, dir);
                    player.body.velocity.vadd(dir, player.body.velocity);
                    console.log(`[POWERUP] ${playerId} picked up Boost`);
                }

                io.to(playerId).emit('powerup', { type: powerup.type });

                // Remove powerup
                world.removeBody(powerup.body);
                powerups.delete(pId);
                break;
            }
        }
    }
}

// Spawn powerups periodically
setInterval(spawnPowerup, POWERUP_SPAWN_INTERVAL);

// =============================================================================
// TRAPS (Drone ability)
// =============================================================================
function spawnTrap(x, z, ownerId) {
    const id = uuidv4();

    const body = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(1, 0.5, 1)),
        position: new CANNON.Vec3(x, 0.5, z)
    });

    world.addBody(body);
    traps.set(id, { body, ownerId, position: { x, y: 0.5, z } });

    console.log(`[TRAP] Drone ${ownerId} placed trap at (${x.toFixed(1)}, ${z.toFixed(1)})`);

    // Remove trap after 10 seconds
    setTimeout(() => {
        if (traps.has(id)) {
            world.removeBody(traps.get(id).body);
            traps.delete(id);
        }
    }, 10000);
}

// =============================================================================
// NETWORK HANDLING
// =============================================================================
io.on('connection', (socket) => {
    const role = socket.handshake.query.role || 'controller';
    console.log(`[CONNECT] ${socket.id} as ${role}`);

    // Send track data to all clients on connection
    socket.emit('trackData', {
        id: activeTrack.id,
        name: activeTrack.name,
        boundaries: activeTrack.boundaries,
        floorSize: activeTrack.floorSize
    });

    if (role === 'admin') {
        // Renderer connection - just receives state
        socket.join('renderers');
    } else {
        // Controller connection
        socket.on('join', ({ name }) => {
            const player = spawnPlayer(socket.id, name);
            socket.emit('joined', {
                id: socket.id,
                color: player.color,
                hp: player.hp
            });
        });

        socket.on('input', ({ steering, throttle, boost }) => {
            const player = players.get(socket.id);
            if (!player || player.type !== 'driver' || !player.body) {
                console.log(`[INPUT] Rejected - player: ${!!player}, type: ${player?.type}, body: ${!!player?.body}`);
                return;
            }

            // Wake up the body in case it's sleeping
            player.body.wakeUp();

            // Apply forces based on input
            const force = new CANNON.Vec3();

            // Forward/backward - increased for punchy acceleration
            force.z = -throttle * 600; // Was 200

            // Steering (rotate force direction) - sharper response
            const angle = steering * 0.8;
            const rotatedX = force.x * Math.cos(angle) - force.z * Math.sin(angle);
            const rotatedZ = force.x * Math.sin(angle) + force.z * Math.cos(angle);

            // Lateral force helper - helps turn the car by pushing it sideways
            force.x = rotatedX + steering * 400; // Was 150
            force.z = rotatedZ;

            // Boost
            if (boost && player.boost > 0) {
                force.scale(2, force);
                player.boost = Math.max(0, player.boost - 1);
            } else {
                player.boost = Math.min(100, player.boost + 0.2);
            }

            // Log first few inputs for debugging
            if (throttle > 0 || steering !== 0) {
                console.log(`[INPUT] ${socket.id.slice(0, 6)} - throttle: ${throttle}, steering: ${steering.toFixed(2)}, force: (${force.x.toFixed(1)}, ${force.z.toFixed(1)})`);
            }

            player.body.applyForce(force, player.body.position);
        });

        socket.on('spawnTrap', ({ x, z }) => {
            const player = players.get(socket.id);
            if (player && player.type === 'drone') {
                spawnTrap(x, z, socket.id);
            }
        });
    }

    socket.on('disconnect', () => {
        removePlayer(socket.id);
        console.log(`[DISCONNECT] ${socket.id}`);
    });
});

// =============================================================================
// GAME LOOP
// =============================================================================
const timestep = 1 / TICK_RATE;

function gameLoop() {
    // Step physics
    world.step(timestep);

    // Safety: Clamp velocities to prevent physics explosions
    for (const [id, player] of players) {
        if (player.type === 'driver' && player.body) {
            const vel = player.body.velocity;
            const speed = vel.length();
            if (speed > MAX_SPEED) {
                vel.scale(MAX_SPEED / speed, vel);
                // console.log(`[PHYSICS] Clamped speed for ${id} (was ${speed.toFixed(1)})`);
            }

            // Safety: Reset position if fallen off map (glitch prevention)
            if (player.body.position.y < -10) {
                player.body.position.set(0, 5, 0);
                player.body.velocity.set(0, 0, 0);
                console.log(`[PHYSICS] Reset ${id} from void`);
            }
        }
    }

    // Check powerup collisions
    checkPowerupCollisions();

    // Build world state
    const worldState = {
        players: {},
        powerups: {},
        traps: {}
    };

    for (const [id, player] of players) {
        worldState.players[id] = {
            position: player.body ? {
                x: player.body.position.x,
                y: player.body.position.y,
                z: player.body.position.z
            } : null,
            velocity: player.body ? {
                x: player.body.velocity.x,
                y: player.body.velocity.y,
                z: player.body.velocity.z
            } : null,
            hp: player.hp,
            type: player.type,
            color: player.color,
            name: player.name,
            boost: player.boost
        };
    }

    for (const [id, powerup] of powerups) {
        worldState.powerups[id] = {
            position: powerup.position,
            type: powerup.type
        };
    }

    for (const [id, trap] of traps) {
        worldState.traps[id] = {
            position: trap.position
        };
    }

    // Broadcast to all clients
    io.emit('worldState', worldState);
}

setInterval(gameLoop, 1000 / TICK_RATE);

// =============================================================================
// START SERVER
// =============================================================================
httpServer.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║     🏎️  ENTROPY ORCHESTRATION SERVER v1.0  🏎️             ║
║                                                           ║
║     Port: ${PORT}                                           ║
║     Tick Rate: ${TICK_RATE}Hz                                      ║
║     Physics: cannon-es                                    ║
║                                                           ║
║     Waiting for players...                                ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
