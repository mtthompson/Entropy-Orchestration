const { Server } = require('socket.io');
const { createServer } = require('http');
const CANNON = require('cannon-es');
const { v4: uuidv4 } = require('uuid');

// =============================================================================
// CONFIGURATION
// =============================================================================
const PORT = process.env.PORT || 3000;
const TICK_RATE = 60;
const DAMAGE_THRESHOLD = 15;
const POWERUP_SPAWN_INTERVAL = 7000; // 5-10s average
const POWERUP_TYPES = ['Repair', 'Boost'];

// =============================================================================
// SERVER SETUP
// =============================================================================
const httpServer = createServer();
const io = new Server(httpServer, {
    cors: { origin: '*' }
});

// =============================================================================
// PHYSICS WORLD
// =============================================================================
const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0)
});
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;

// Ground plane - prevents objects from falling through
const groundBody = new CANNON.Body({
    mass: 0, // Static body
    shape: new CANNON.Plane(),
    position: new CANNON.Vec3(0, 0, 0)
});
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Rotate to be horizontal
world.addBody(groundBody);

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
    const spawnX = (Math.random() - 0.5) * 20;
    const spawnZ = (Math.random() - 0.5) * 20;

    const body = new CANNON.Body({
        mass: 50,
        shape: new CANNON.Sphere(1),
        position: new CANNON.Vec3(spawnX, 1, spawnZ),
        linearDamping: 0.1,  // Reduced from 0.3 for less drag
        angularDamping: 0.3, // Reduced from 0.5 for snappier rotation
        allowSleep: false  // Keep player bodies always awake
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
    const x = (Math.random() - 0.5) * 40;
    const z = (Math.random() - 0.5) * 40;

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

            // Forward/backward - increased for snappier acceleration
            force.z = -throttle * 200;

            // Steering (rotate force direction)
            const angle = steering * 0.5;
            const rotatedX = force.x * Math.cos(angle) - force.z * Math.sin(angle);
            const rotatedZ = force.x * Math.sin(angle) + force.z * Math.cos(angle);
            force.x = rotatedX + steering * 100;
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
