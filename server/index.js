const { Server } = require('socket.io');
const { createServer } = require('http');
const CANNON = require('cannon-es');
const { v4: uuidv4 } = require('uuid');
const { getDefaultTrack, getThemeByTrackId, getRandomTrack } = require('./tracks');

// =============================================================================
// CONFIGURATION
// =============================================================================
const PORT = process.env.PORT || 3000;
const TICK_RATE = 60;
const DAMAGE_THRESHOLD = 15;
const MAX_SPEED = 80; // Hard cap on velocity to prevent physics explosions
const POWERUP_SPAWN_INTERVAL = 7000; // 5-10s average
const POWERUP_TYPES = ['Repair', 'Boost'];
const MAX_POWERUPS = 10; // Prevent accumulation during idle
const MAX_TRAPS = 15; // Prevent trap spam
const POWERUP_LIFETIME = 30000; // Powerups expire after 30 seconds

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
let activeTrack = getDefaultTrack();
const trackWalls = [];

// Select random track
function selectRandomTrack() {
    const { getRandomTrack } = require('./tracks');
    activeTrack = getRandomTrack();
    console.log(`[TRACK] Selected: ${activeTrack.name}`);

    // Clear existing walls
    for (const wall of trackWalls) {
        world.removeBody(wall);
    }
    trackWalls.length = 0;

    // Create new walls
    createTrackWalls();
}

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
const cpuPlayers = new Map();    // id -> { body, waypointIndex, ... }
const projectiles = new Map();   // id -> { body, ownerId, type, damage }
const powerups = new Map();      // id -> { body, type }
const traps = new Map();         // id -> { body }

const CAR_COLORS = [
    '#FF00FF', '#00FFFF', '#FF6B00', '#00FF00',
    '#FF0066', '#6600FF', '#FFFF00', '#00FF99'
];

const CPU_NAMES = ['NEON', 'RAZOR', 'VOLT', 'BLAZE', 'CYBER', 'TURBO'];
let cpuIdCounter = 0;
let projectileIdCounter = 0;

// =============================================================================
// BOUNDARY ENFORCEMENT
// =============================================================================
function getTrackBounds() {
    const bounds = activeTrack.powerupBounds;
    return {
        minX: bounds.minX - 10,
        maxX: bounds.maxX + 10,
        minZ: bounds.minZ - 10,
        maxZ: bounds.maxZ + 10
    };
}

function enforceBoundaries(body) {
    const bounds = getTrackBounds();
    let teleported = false;

    if (body.position.x < bounds.minX || body.position.x > bounds.maxX ||
        body.position.z < bounds.minZ || body.position.z > bounds.maxZ) {
        // Find closest spawn point
        const spawn = activeTrack.spawnPoints[0];
        body.position.set(spawn.x, 1, spawn.z);
        body.velocity.set(0, 0, 0);
        body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), spawn.rotation || 0);
        teleported = true;
    }

    // Also prevent falling through floor
    if (body.position.y < -5) {
        const spawn = activeTrack.spawnPoints[0];
        body.position.set(spawn.x, 1, spawn.z);
        body.velocity.set(0, 0, 0);
        teleported = true;
    }

    return teleported;
}

// =============================================================================
// CPU OPPONENT SYSTEM
// =============================================================================
function spawnCPUOpponents(count) {
    for (let i = 0; i < count; i++) {
        const cpuId = `cpu_${cpuIdCounter++}`;
        const spawnIndex = i % activeTrack.spawnPoints.length;
        const spawn = activeTrack.spawnPoints[spawnIndex];

        const cpu = {
            id: cpuId,
            name: CPU_NAMES[i % CPU_NAMES.length],
            color: CAR_COLORS[(i + 3) % CAR_COLORS.length],
            hp: 100,
            type: 'driver',
            isCPU: true,
            waypointIndex: 0,
            boost: 100
        };

        const body = new CANNON.Body({
            mass: 50,
            shape: new CANNON.Sphere(1),
            position: new CANNON.Vec3(spawn.x + (i * 3), 1, spawn.z),
            linearDamping: 0.5,
            angularDamping: 0.5,
            allowSleep: false,
            material: carMaterial
        });
        body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), spawn.rotation || 0);

        world.addBody(body);
        cpu.body = body;
        cpuPlayers.set(cpuId, cpu);
    }
    console.log(`[CPU] Spawned ${count} CPU opponents`);
}

function updateCPUPhysics() {
    const trackPath = activeTrack.boundaries;

    for (const [id, cpu] of cpuPlayers) {
        if (!cpu.body || cpu.hp <= 0) continue;

        // Simple waypoint following AI
        const pos = cpu.body.position;

        // Get a target point ahead on the track (simplified - just drive toward center)
        const targetX = 0;
        const targetZ = pos.z - 20; // Always try to go forward (negative Z)

        const dx = targetX - pos.x;
        const dz = targetZ - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 0.1) {
            // Calculate steering
            const targetAngle = Math.atan2(dx, -dz);
            const euler = new CANNON.Vec3();
            cpu.body.quaternion.toEuler(euler);
            const currentAngle = euler.y;

            let angleDiff = targetAngle - currentAngle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            // Apply steering
            cpu.body.angularVelocity.y = angleDiff * 3;

            // Apply throttle
            const forward = new CANNON.Vec3(0, 0, -1);
            cpu.body.quaternion.vmult(forward, forward);
            const force = forward.clone();
            force.scale(500, force); // Slightly slower than players
            cpu.body.applyForce(force, cpu.body.position);
        }

        // Enforce boundaries for CPU too
        enforceBoundaries(cpu.body);
    }
}

function removeCPUOpponents() {
    for (const [id, cpu] of cpuPlayers) {
        if (cpu.body) world.removeBody(cpu.body);
    }
    cpuPlayers.clear();
}

// =============================================================================
// PROJECTILE SYSTEM
// =============================================================================
function createProjectile(ownerId, type, position, direction) {
    const projId = `proj_${projectileIdCounter++}`;

    const speed = type === 'missile' ? 80 : 120; // Missiles slower but stronger
    const damage = type === 'missile' ? 40 : 20;

    const body = new CANNON.Body({
        mass: 1,
        shape: new CANNON.Sphere(0.3),
        position: new CANNON.Vec3(position.x, position.y, position.z),
        linearDamping: 0,
        angularDamping: 0
    });

    body.velocity.set(direction.x * speed, 0, direction.z * speed);
    world.addBody(body);

    const projectile = {
        id: projId,
        body,
        ownerId,
        type,
        damage,
        createdAt: Date.now()
    };

    projectiles.set(projId, projectile);

    // Auto-destroy after 3 seconds
    setTimeout(() => {
        if (projectiles.has(projId)) {
            world.removeBody(projectiles.get(projId).body);
            projectiles.delete(projId);
        }
    }, 3000);

    return projId;
}

function updateProjectiles() {
    const now = Date.now();

    for (const [projId, proj] of projectiles) {
        // Check collision with players
        for (const [playerId, player] of players) {
            if (playerId === proj.ownerId) continue; // Can't hit yourself
            if (!player.body || player.type !== 'driver') continue;

            const dist = proj.body.position.distanceTo(player.body.position);
            if (dist < 2) {
                // Hit!
                player.hp -= proj.damage;
                io.to(playerId).emit('damage', { amount: proj.damage, source: 'projectile' });

                // Remove projectile
                world.removeBody(proj.body);
                projectiles.delete(projId);

                // Check if player died
                if (player.hp <= 0) {
                    handlePlayerDeath(playerId);
                }
                break;
            }
        }

        // Check collision with CPU
        for (const [cpuId, cpu] of cpuPlayers) {
            if (!cpu.body) continue;

            const dist = proj.body.position.distanceTo(cpu.body.position);
            if (dist < 2) {
                cpu.hp -= proj.damage;
                world.removeBody(proj.body);
                projectiles.delete(projId);

                if (cpu.hp <= 0) {
                    world.removeBody(cpu.body);
                    cpuPlayers.delete(cpuId);
                }
                break;
            }
        }
    }
}

// =============================================================================
// PLAYER MANAGEMENT
// =============================================================================
// spawnPlayer removed - logic handled in socket connection

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

    // ==============================================
    // MASK ABILITIES - Each mask grants slight bonus
    // ==============================================
    // Classic: Balanced (no special bonus)
    // Oni: +15% damage resistance (handled in collision)
    // Tech: +50% boost regeneration
    // Clown: Random speed bursts
    // Skull: +10% max speed
    const maskType = player.maskType || 'Classic';
    let boostRegenMod = 1.0;
    let maxSpeedMod = 1.0;

    if (maskType === 'Tech') {
        boostRegenMod = 1.5; // Faster boost regen
    } else if (maskType === 'Skull') {
        maxSpeedMod = 1.1; // 10% faster
    } else if (maskType === 'Clown') {
        // Random speed burst every ~5 seconds
        if (Math.random() < 0.003) { // ~18% chance per second at 60fps
            const burst = new CANNON.Vec3(0, 0, -1);
            player.body.quaternion.vmult(burst, burst);
            burst.scale(300, burst);
            player.body.applyImpulse(burst, player.body.position);
        }
    }

    // Wake up body
    player.body.wakeUp();

    // Get current speed
    const speed = player.body.velocity.length();

    // 1. STEERING - Only allow turning when moving
    // Steering sensitivity decreases at high speed (prevents spinouts)
    const minSpeedToTurn = 2;
    const turnSpeed = 6.0;
    const speedFactor = Math.min(1, speed / 15); // Full turn at speed 15+
    const highSpeedDampen = Math.max(0.3, 1 - speed / 50); // Reduce turn at very high speed

    if (speed > minSpeedToTurn) {
        player.body.angularVelocity.y = -steering * turnSpeed * speedFactor * highSpeedDampen;
    } else {
        player.body.angularVelocity.y *= 0.9; // Dampen rotation when stationary
    }

    // 2. Calculate Forward Direction based on current rotation
    const quaternion = player.body.quaternion;
    const forward = new CANNON.Vec3(0, 0, -1); // NEGATIVE Z is forward
    quaternion.vmult(forward, forward);

    // 3. Apply Throttle Force (Aligned with heading)
    const driveForce = 800;
    const force = forward.clone();
    force.scale(throttle * driveForce, force);

    // Boost multiplier
    if (boost && player.boost > 0) {
        force.scale(1.8, force);
        player.boost = Math.max(0, player.boost - 1.5);
    } else {
        player.boost = Math.min(100, player.boost + 0.3 * boostRegenMod);
    }

    player.body.applyForce(force, player.body.position);

    // 4. Lateral Friction (Anti-drift grip)
    const velocity = player.body.velocity;
    const right = new CANNON.Vec3(1, 0, 0);
    quaternion.vmult(right, right);

    const lateralVelocity = velocity.dot(right);

    // Apply STRONG opposing force to cancel sideways slide
    // Higher grip = more like a car, lower = more like ice
    const grip = 0.92; // Increased grip
    const correctionForce = right.clone();
    correctionForce.scale(-lateralVelocity * grip * player.body.mass * 8, correctionForce);

    player.body.applyForce(correctionForce, player.body.position);

    // 5. Speed cap to prevent runaway (modified by mask)
    const maxSpeed = 45 * maxSpeedMod;
    if (speed > maxSpeed) {
        player.body.velocity.scale(maxSpeed / speed, player.body.velocity);
    }
}

// =============================================================================
// PLAYER STATE HELPERS
// =============================================================================
function applyPowerupState(player, type, durationMs) {
    if (!player) return;

    // Clear existing timeouts if overwriting
    if (player.powerupTimeout) clearTimeout(player.powerupTimeout);

    // Reset stats to default before applying new one
    if (player.body) {
        player.body.mass = 50;
        player.body.collisionFilterGroup = 1;
        player.body.collisionFilterMask = 1; // Collide with everything
        player.body.updateMassProperties();
    }
    player.isShielded = false;
    player.isGhost = false;
    player.isJuggernaut = false;

    // Apply new state
    if (type === 'Shield') {
        player.isShielded = true;
    } else if (type === 'Ghost') {
        player.isGhost = true;
        if (player.body) {
            // Filter Group 2: Ghosts. Mask 2: Only walls/ground (not 1: Players).
            // Actually, we'll just handle logic in collision loop to skip damage
            // But true pass-through requires collision filters.
            // Let's rely on the manual overlap check in postStep for now to disable damage/bounce.
        }
    } else if (type === 'Juggernaut') {
        player.isJuggernaut = true;
        if (player.body) {
            player.body.mass = 100; // Double mass
            player.body.updateMassProperties();
        }
    }

    // Set expiration
    player.powerupTimeout = setTimeout(() => {
        if (player.body) {
            player.body.mass = 50;
        }
        player.isShielded = false;
        player.isGhost = false;
        player.isJuggernaut = false;
        io.to(player.id).emit('powerupEnd');
        console.log(`[POWERUP] ${player.name} effect expired`);
    }, durationMs);
}

// =============================================================================
// COLLISION HANDLING
// =============================================================================
world.addEventListener('postStep', () => {
    // --- WALL COLLISION DETECTION ---
    for (const [id, player] of players) {
        if (!player.body || player.type !== 'driver') continue;

        // Check contacts with walls
        for (const contact of world.contacts) {
            const isPlayerBody = contact.bi === player.body || contact.bj === player.body;
            const otherBody = contact.bi === player.body ? contact.bj : contact.bi;
            const isWall = trackWalls.includes(otherBody);

            if (isPlayerBody && isWall) {
                // Wall collision detected!
                const impactSpeed = player.body.velocity.length();
                if (impactSpeed > 5) {
                    io.to(id).emit('wallHit', { intensity: Math.min(1, impactSpeed / 20) });
                }
            }
        }
    }

    // Check collisions between players
    for (const [id1, p1] of players) {
        if (p1.type !== 'driver' || !p1.body) continue;

        for (const [id2, p2] of players) {
            if (id1 >= id2 || p2.type !== 'driver' || !p2.body) continue;

            // Ghost Logic: If either is Ghost, ignore collision
            if (p1.isGhost || p2.isGhost) continue;

            // Check if bodies are colliding
            const dist = p1.body.position.distanceTo(p2.body.position);
            if (dist < 2.2) { // Overlapping spheres
                const relVel = new CANNON.Vec3();
                p1.body.velocity.vsub(p2.body.velocity, relVel);
                const impactSpeed = relVel.length();

                if (impactSpeed > DAMAGE_THRESHOLD) {
                    let damage1 = Math.floor(impactSpeed * 2); // Damage TO p1
                    let damage2 = Math.floor(impactSpeed * 2); // Damage TO p2
                    let knockback1 = 1.0;
                    let knockback2 = 1.0;

                    // ONI MASK: 15% damage resistance
                    if (p1.maskType === 'Oni') damage1 *= 0.85;
                    if (p2.maskType === 'Oni') damage2 *= 0.85;

                    // RAMMING LOGIC
                    // Calculate attack angles
                    // Vector from 1 to 2
                    const v1to2 = new CANNON.Vec3();
                    p2.body.position.vsub(p1.body.position, v1to2);
                    v1to2.normalize();

                    // P1's forward vector
                    const p1Forward = new CANNON.Vec3(0, 0, 1);
                    p1.body.quaternion.vmult(p1Forward, p1Forward);

                    // P2's forward vector
                    const p2Forward = new CANNON.Vec3(0, 0, 1);
                    p2.body.quaternion.vmult(p2Forward, p2Forward);

                    // Dot products (> 0.7 is roughly < 45 degrees)
                    const p1FacingP2 = p1Forward.dot(v1to2);
                    const p2FacingP1 = p2Forward.dot(v1to2.negate()); // v2to1 is needed? v1to2.negate() is v2to1

                    // Check P1 Ramming P2
                    if (p1FacingP2 > 0.7) {
                        // P1 is hitting P2 frontally
                        damage2 *= 1.5; // P2 takes more
                        damage1 *= 0.5; // P1 takes less
                        knockback2 = 2.0; // P2 gets punted
                        console.log(`[COMBAT] ${p1.name} RAMMED ${p2.name}!`);
                    }

                    // Check P2 Ramming P1
                    if (p2FacingP1 > 0.7) {
                        // P2 is hitting P1 frontally
                        damage1 *= 1.5;
                        damage2 *= 0.5;
                        knockback1 = 2.0;
                        console.log(`[COMBAT] ${p2.name} RAMMED ${p1.name}!`);
                    }

                    // Juggernaut Logic
                    if (p1.isJuggernaut) { damage1 *= 0.2; damage2 *= 1.5; knockback2 *= 1.5; }
                    if (p2.isJuggernaut) { damage2 *= 0.2; damage1 *= 1.5; knockback1 *= 1.5; }

                    // Shield Logic
                    if (p1.isShielded) damage1 = 0;
                    if (p2.isShielded) damage2 = 0;

                    // Apply Knockback Impulse
                    // ... (Simplistic impulse already handled by physics engine restitution, 
                    // but we can add extra "Juice" here if needed. 
                    // For now, reliance on physics + mass diffs (Juggernaut) is safer).

                    p1.hp -= Math.floor(damage1);
                    p2.hp -= Math.floor(damage2);

                    console.log(`[COLLISION] ${p1.name} (-${damage1}) <-> ${p2.name} (-${damage2}) | Speed: ${impactSpeed.toFixed(1)}`);

                    // Emit damage events
                    io.to(id1).emit('damage', { hp: p1.hp, damage: damage1 });
                    io.to(id2).emit('damage', { hp: p2.hp, damage: damage2 });

                    // Check for deaths
                    if (p1.hp <= 0) {
                        switchToDrone(id1);
                        checkWinCondition();
                    }
                    if (p2.hp <= 0) {
                        switchToDrone(id2);
                        checkWinCondition();
                    }
                }
            }
        }
    }
});

// =============================================================================
// POWER-UPS
// =============================================================================
const EXTENDED_POWERUP_TYPES = ['Repair', 'Repair', 'Boost', 'Boost', 'Shield', 'Ghost', 'Juggernaut', 'Weapon', 'Weapon']; // Weighted

function spawnPowerup() {
    // Prevent accumulation - cap at MAX_POWERUPS
    if (powerups.size >= MAX_POWERUPS) {
        console.log(`[POWERUP] Max powerups (${MAX_POWERUPS}) reached, skipping spawn`);
        return;
    }

    const id = uuidv4();
    const type = EXTENDED_POWERUP_TYPES[Math.floor(Math.random() * EXTENDED_POWERUP_TYPES.length)];
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
    powerups.set(id, { body, type, position: { x, y: 1, z }, spawnTime: Date.now() });

    console.log(`[POWERUP] Spawned ${type} at (${x.toFixed(1)}, ${z.toFixed(1)}) [${powerups.size}/${MAX_POWERUPS}]`);

    // Auto-expire after POWERUP_LIFETIME
    setTimeout(() => {
        if (powerups.has(id)) {
            world.removeBody(powerups.get(id).body);
            powerups.delete(id);
            console.log(`[POWERUP] Expired ${type} [${powerups.size}/${MAX_POWERUPS}]`);
        }
    }, POWERUP_LIFETIME);
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
                } else if (powerup.type === 'Boost') {
                    player.boost = 100; // Refill boost
                    // Impulse
                    const dir = player.body.velocity.clone();
                    dir.normalize();
                    dir.scale(50, dir);
                    player.body.velocity.vadd(dir, player.body.velocity);
                } else if (powerup.type === 'Shield') {
                    applyPowerupState(player, 'Shield', 5000);
                } else if (powerup.type === 'Ghost') {
                    applyPowerupState(player, 'Ghost', 5000);
                } else if (powerup.type === 'Juggernaut') {
                    applyPowerupState(player, 'Juggernaut', 10000);
                }

                console.log(`[POWERUP] ${player.name} picked up ${powerup.type}`);
                io.to(playerId).emit('powerup', { type: powerup.type });

                // Remove powerup
                world.removeBody(powerup.body);
                powerups.delete(pId);
                break;
            } else if (pup.type === 'Weapon') {
                player.ammo = (player.ammo || 0) + 5;
                player.weaponType = Math.random() > 0.5 ? 'missile' : 'laser';
                io.to(playerId).emit('powerup', { type: 'Weapon', ammo: player.ammo, weaponType: player.weaponType });
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
    // Prevent trap spam
    if (traps.size >= MAX_TRAPS) {
        console.log(`[TRAP] Max traps (${MAX_TRAPS}) reached, skipping spawn`);
        return;
    }

    const id = uuidv4();

    const body = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(1, 0.5, 1)),
        position: new CANNON.Vec3(x, 0.5, z)
    });

    world.addBody(body);
    traps.set(id, { body, ownerId, position: { x, y: 0.5, z } });

    console.log(`[TRAP] Drone ${ownerId} placed trap at (${x.toFixed(1)}, ${z.toFixed(1)}) [${traps.size}/${MAX_TRAPS}]`);

    // Remove trap after 10 seconds
    setTimeout(() => {
        if (traps.has(id)) {
            world.removeBody(traps.get(id).body);
            traps.delete(id);
        }
    }, 10000);
}

// =============================================================================
// IDLE CLEANUP - Prevents accumulation during extended idle periods
// =============================================================================
function idleCleanup() {
    const humanCount = [...players.values()].filter(p => !p.isCPU).length;
    const now = Date.now();

    // If no human players, be more aggressive with cleanup
    if (humanCount === 0) {
        // Clear all powerups if too many
        if (powerups.size > 5) {
            console.log(`[CLEANUP] No players - clearing ${powerups.size - 3} excess powerups`);
            let count = 0;
            for (const [id, powerup] of powerups) {
                if (count >= 3) { // Keep only 3
                    world.removeBody(powerup.body);
                    powerups.delete(id);
                }
                count++;
            }
        }

        // Clear all traps
        if (traps.size > 0) {
            console.log(`[CLEANUP] No players - clearing ${traps.size} traps`);
            for (const [id, trap] of traps) {
                world.removeBody(trap.body);
                traps.delete(id);
            }
        }

        // Clear stale projectiles (shouldn't accumulate, but safety)
        for (const [id, proj] of projectiles) {
            world.removeBody(proj.body);
            projectiles.delete(id);
        }
    }
}

// Run idle cleanup every 30 seconds
setInterval(idleCleanup, 30000);

// =============================================================================
// GAME LOOP MANAGER
// =============================================================================
let gameState = 'LOBBY'; // LOBBY, COUNTDOWN, RACING, WINNER, DEMO
let gameTimer = 0;
let winnerName = null;
let demoModeActive = false;
let demoModeTimer = null;
const DEMO_TIMEOUT = 60000; // 60 seconds of no players triggers demo

// =============================================================================
// LEADERBOARD SYSTEM
// =============================================================================
const leaderboard = new Map(); // name -> { wins, kills, deaths, gamesPlayed }

function updateLeaderboard(playerName, stat, value = 1) {
    if (!leaderboard.has(playerName)) {
        leaderboard.set(playerName, { wins: 0, kills: 0, deaths: 0, gamesPlayed: 0 });
    }
    const entry = leaderboard.get(playerName);
    entry[stat] = (entry[stat] || 0) + value;
}

function getLeaderboardData() {
    const entries = [];
    for (const [name, stats] of leaderboard) {
        entries.push({ name, ...stats });
    }
    // Sort by wins, then kills
    entries.sort((a, b) => (b.wins - a.wins) || (b.kills - a.kills));
    return entries.slice(0, 10); // Top 10
}

function broadcastLeaderboard() {
    io.emit('leaderboard', getLeaderboardData());
}

// =============================================================================
// DEMO MODE SYSTEM
// =============================================================================
function startDemoMode() {
    if (demoModeActive || gameState === 'RACING') return;

    console.log('[DEMO] Starting demo mode - CPU battle!');
    demoModeActive = true;
    gameState = 'DEMO';

    // Select random track
    selectRandomTrack();

    // Broadcast track data so renderer displays correct track and music plays
    io.emit('trackData', activeTrack);
    io.emit('trackStyle', { trackId: activeTrack.id, trackName: activeTrack.name });

    // Spawn 4-6 CPU opponents
    const cpuCount = 4 + Math.floor(Math.random() * 3);
    spawnCPUOpponents(cpuCount);

    io.emit('demoMode', { active: true });
    broadcastGameState();

    console.log(`[DEMO] Spawned ${cpuCount} CPU opponents for demo on track: ${activeTrack.name}`);
}

function stopDemoMode() {
    if (!demoModeActive) return;

    console.log('[DEMO] Stopping demo mode - player joining');
    demoModeActive = false;
    gameState = 'LOBBY';

    removeCPUOpponents();
    io.emit('demoMode', { active: false });
    broadcastGameState();
}

function resetDemoTimer() {
    if (demoModeTimer) clearTimeout(demoModeTimer);

    // Only set timer if no human players
    const humanCount = [...players.values()].filter(p => !p.isCPU).length;
    if (humanCount === 0 && !demoModeActive) {
        demoModeTimer = setTimeout(startDemoMode, DEMO_TIMEOUT);
        console.log('[DEMO] Demo timer set - starting in 60s if no one joins');
    }
}

// Start demo timer on server start
resetDemoTimer();

function broadcastGameState() {
    io.emit('gameState', {
        state: gameState,
        timer: gameTimer,
        winner: winnerName,
        isDemo: demoModeActive
    });
}

function startCountdown() {
    if (gameState !== 'LOBBY') return;

    // Select random track for this round
    selectRandomTrack();

    gameState = 'COUNTDOWN';
    gameTimer = 3;
    broadcastGameState();

    const interval = setInterval(() => {
        gameTimer--;
        broadcastGameState();
        if (gameTimer <= 0) {
            clearInterval(interval);
            startRace();
        }
    }, 1000);
}

function startRace() {
    gameState = 'RACING';
    gameTimer = 0;

    // Remove any existing CPU
    removeCPUOpponents();

    // Count human drivers
    let humanDrivers = 0;
    for (const [id, player] of players) {
        if (player.type === 'driver' && !player.isCPU) humanDrivers++;
    }

    // Spawn CPU opponents if less than 3 human players
    if (humanDrivers < 3) {
        const cpuCount = Math.max(1, 3 - humanDrivers);
        spawnCPUOpponents(cpuCount);
    }

    // Reset all players to driver
    resetGame();

    // Emit track music style
    io.emit('trackStyle', { trackId: activeTrack.id, trackName: activeTrack.name });

    broadcastGameState();
    console.log('[GAME] Race Started!');
}

function resetGame() {
    // Respawn all players
    for (const [id, player] of players) {
        removePlayerBody(player); // Helper to clear old body

        // Reset stats
        player.hp = 100;
        player.type = 'driver';
        player.boost = 100;
        player.isShielded = false;
        player.isGhost = false;
        player.isJuggernaut = false;

        // Create new body
        // Use logic from spawnPlayer but force creation
        const spawnIndex = players.size % activeTrack.spawnPoints.length;
        const spawnPoint = activeTrack.spawnPoints[spawnIndex];
        const spawnX = spawnPoint.x + (Math.random() - 0.5) * 5;
        const spawnZ = spawnPoint.z + (Math.random() - 0.5) * 5;

        createPlayerBody(player, spawnX, spawnZ, spawnPoint.rotation || 0);

        io.to(id).emit('joined', {
            id: id,
            color: player.color, // Keep color
            hp: 100
        });
    }

    // Clear powerups and traps
    for (const [id, p] of powerups) world.removeBody(p.body);
    powerups.clear();
    for (const [id, t] of traps) world.removeBody(t.body);
    traps.clear();
}

function endRace(winner) {
    if (gameState !== 'RACING') return;
    gameState = 'WINNER';
    winnerName = winner ? winner.name : 'Nobody';
    gameTimer = 10; // 10s until lobby
    console.log(`[GAME] Winner: ${winnerName}`);
    broadcastGameState();

    const interval = setInterval(() => {
        gameTimer--;
        broadcastGameState();
        if (gameTimer <= 0) {
            clearInterval(interval);
            gameState = 'LOBBY';
            winnerName = null;
            broadcastGameState();
        }
    }, 1000);
}

function checkWinCondition() {
    if (gameState !== 'RACING') return;

    // Count active drivers
    let activeDrivers = [];
    for (const [id, p] of players) {
        if (p.type === 'driver' && p.hp > 0) activeDrivers.push(p);
    }

    // PvP Win Condition: Last man standing (only if we have multiple players)
    if (players.size > 1 && activeDrivers.length === 1) {
        endRace(activeDrivers[0]);
    }
    // Single Player / Everyone Died Condition
    else if (activeDrivers.length === 0) {
        endRace(null); // Game Over
    }
}

// Helper to separate body creation logic
function createPlayerBody(player, x, z, rotation = 0) {
    const body = new CANNON.Body({
        mass: 50,
        shape: new CANNON.Sphere(1),
        position: new CANNON.Vec3(x, 1, z),
        linearDamping: 0.5,
        angularDamping: 0.5,
        allowSleep: false,
        material: carMaterial,
        ccdSpeedThreshold: 1,
        ccdIterations: 5
    });

    // Apply spawn rotation
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotation);

    world.addBody(body);
    player.body = body;
}

function removePlayerBody(player) {
    if (player.body) {
        world.removeBody(player.body);
        player.body = null;
    }
}

// ... INSIDE JOIN LOGIC ...
// If RACING, spawn as DRONE immediately


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

    // Send initial game state
    socket.emit('gameState', { state: gameState, timer: gameTimer, winner: winnerName });

    if (role === 'admin') {
        // Renderer connection - just receives state
        socket.join('renderers');

        // Admin commands
        socket.on('startGame', () => {
            console.log("Admin requested start");
            if (gameState === 'LOBBY') startCountdown();
        });

    } else {
        // Controller connection
        socket.on('join', ({ name, maskType }) => {
            // Determine spawn type
            let type = 'driver';
            if (gameState === 'RACING' || gameState === 'WINNER') {
                type = 'drone';
            }

            // Create player object
            const color = CAR_COLORS[players.size % CAR_COLORS.length];
            const newPlayer = {
                id: socket.id,
                body: null,
                hp: type === 'drone' ? 0 : 100,
                type: type,
                maskType: maskType || 'Classic',
                color,
                name: name || 'Player',
                boost: 100,
                isShielded: false,
                isGhost: false,
                isJuggernaut: false
            };
            players.set(socket.id, newPlayer);
            // ...

            // If Driver, spawn body
            if (type === 'driver') {
                const spawnIndex = players.size % activeTrack.spawnPoints.length;
                const spawnPoint = activeTrack.spawnPoints[spawnIndex];
                createPlayerBody(newPlayer,
                    spawnPoint.x + (Math.random() - 0.5) * 2,
                    spawnPoint.z + (Math.random() - 0.5) * 2,
                    spawnPoint.rotation || 0
                );
            }

            socket.emit('joined', {
                id: socket.id,
                color: newPlayer.color,
                hp: newPlayer.hp
            });

            // AUTO-START LOGIC
            // Start countdown if we have at least 1 player in LOBBY (Single Player allowed)
            if (gameState === 'LOBBY' && players.size >= 1) {
                // If not already counting down, start it
                if (gameTimer === 0) {
                    console.log("[GAME] Auto-start sequence initiated...");
                    // Start countdown after a brief delay to let them see the "Waiting" for a split second?
                    // Or immediate? Immediate is fine.
                    startCountdown();
                }
            }

            console.log(`[JOIN] ${name} as ${type}`);
            broadcastGameState();

            // Auto-start if 2 players in lobby and not started? 
            // Better to wait for Admin/Renderer start, or auto-start logic
            if (gameState === 'LOBBY' && players.size >= 2) {
                // Optional: Auto start countdown?
                // Let's stick to manual start or renderer button for now, 
                // OR auto-start after 30s?
            }
        });

        socket.on('input', ({ steering, throttle, boost }) => {
            const player = players.get(socket.id);
            if (!player || player.type !== 'driver' || !player.body) {
                // ... (Keep existing rejection logic) ...
                return;
            }

            // Wake up the body in case it's sleeping
            player.body.wakeUp();

            // Apply forces based on input
            const force = new CANNON.Vec3();

            // Forward/backward - increased for punchy acceleration
            force.z = -throttle * 600;

            // Steering (rotate force direction) - sharper response
            const angle = steering * 0.8;
            const rotatedX = force.x * Math.cos(angle) - force.z * Math.sin(angle);
            const rotatedZ = force.x * Math.sin(angle) + force.z * Math.cos(angle);

            // Lateral force helper - helps turn the car by pushing it sideways
            force.x = rotatedX + steering * 400;
            force.z = rotatedZ;

            // Boost
            if (boost && player.boost > 0) {
                force.scale(2, force);
                player.boost = Math.max(0, player.boost - 1);
            } else {
                player.boost = Math.min(100, player.boost + 0.2);
            }

            player.body.applyForce(force, player.body.position);
        });

        socket.on('spawnTrap', ({ x, z }) => {
            const player = players.get(socket.id);
            if (player && player.type === 'drone') {
                spawnTrap(x, z, socket.id);
            }
        });

        // FIRE WEAPON
        socket.on('fire', () => {
            const player = players.get(socket.id);
            if (!player || player.type !== 'driver' || !player.body) return;
            if (!player.ammo || player.ammo <= 0) return;

            player.ammo--;

            // Get forward direction
            const forward = new CANNON.Vec3(0, 0, -1);
            player.body.quaternion.vmult(forward, forward);

            const projPos = {
                x: player.body.position.x + forward.x * 2,
                y: player.body.position.y,
                z: player.body.position.z + forward.z * 2
            };

            const projType = player.weaponType || 'laser';
            createProjectile(socket.id, projType, projPos, { x: forward.x, z: forward.z });

            io.emit('projectileFired', {
                ownerId: socket.id,
                position: projPos,
                direction: { x: forward.x, z: forward.z },
                type: projType
            });
        });
    }

    socket.on('disconnect', () => {
        removePlayer(socket.id);
        console.log(`[DISCONNECT] ${socket.id}`);
        checkWinCondition(); // Check if this caused a win
        broadcastGameState();
    });
});

// ... Keep GameLoop ...

// =============================================================================
// GAME LOOP
// =============================================================================
const timestep = 1 / TICK_RATE;

function gameLoop() {
    // Step physics
    world.step(timestep);

    // Update CPU opponents (in both RACING and DEMO modes)
    if (gameState === 'RACING' || gameState === 'DEMO') {
        updateCPUPhysics();
        updateProjectiles();
    }

    // Safety: Clamp velocities and enforce boundaries
    for (const [id, player] of players) {
        if (player.type === 'driver' && player.body) {
            const vel = player.body.velocity;
            const speed = vel.length();
            if (speed > MAX_SPEED) {
                vel.scale(MAX_SPEED / speed, vel);
            }

            // Enforce track boundaries
            if (enforceBoundaries(player.body)) {
                io.to(id).emit('respawned', { reason: 'out_of_bounds' });
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
            maskType: player.maskType,
            color: player.color,
            name: player.name,
            boost: player.boost,
            isShielded: player.isShielded || false,
            isGhost: player.isGhost || false,
            isJuggernaut: player.isJuggernaut || false
        };
    }

    // Include CPU players in world state (for demo mode camera to follow)
    for (const [id, cpu] of cpuPlayers) {
        worldState.players[id] = {
            position: cpu.body ? {
                x: cpu.body.position.x,
                y: cpu.body.position.y,
                z: cpu.body.position.z
            } : null,
            velocity: cpu.body ? {
                x: cpu.body.velocity.x,
                y: cpu.body.velocity.y,
                z: cpu.body.velocity.z
            } : null,
            hp: cpu.hp,
            type: cpu.type,
            maskType: 'Classic', // CPUs use classic mask
            color: cpu.color,
            name: cpu.name,
            boost: cpu.boost || 100,
            isCPU: true,
            isShielded: false,
            isGhost: false,
            isJuggernaut: false
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
