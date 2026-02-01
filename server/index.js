const { Server } = require('socket.io');
const { createServer } = require('http');
const CANNON = require('cannon-es');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { getDefaultTrack, getThemeByTrackId, getRandomTrack, getRandomRaceTrack, getAllTracks, getAllThemes, getRandomPointOnTrack } = require('./tracks');
const { getNextWaypoint, getArenaTarget, normalizeAngle, findNearestWaypointIndex } = require('./cpuPathfinding');
const { generateHeightMap, getTerrainHeight, getTerrainPreset } = require('./terrain');
const { WorkerPool } = require('./workers/workerPool');

// =============================================================================
// WORKER THREAD POOLS (Multi-threading for CPU pathfinding & terrain generation)
// =============================================================================
let cpuWorkerPool = null;
let terrainWorkerPool = null;
let pendingCpuResults = null; // Stores async CPU calculations between ticks

function initializeWorkerPools() {
    try {
        cpuWorkerPool = new WorkerPool(
            path.join(__dirname, 'workers', 'cpuWorker.js'),
            2 // 2 workers for CPU pathfinding
        );
        terrainWorkerPool = new WorkerPool(
            path.join(__dirname, 'workers', 'terrainWorker.js'),
            1 // 1 worker for terrain (infrequent operation)
        );
        console.log('[WORKERS] Multi-threaded worker pools initialized');
    } catch (err) {
        console.error('[WORKERS] Failed to initialize worker pools, falling back to single-threaded:', err.message);
        cpuWorkerPool = null;
        terrainWorkerPool = null;
    }
}

// Initialize workers on startup
initializeWorkerPools();

// =============================================================================
// CONFIGURATION
// =============================================================================
const PORT = process.env.PORT || 3000;
const TICK_RATE = 60;
const DAMAGE_THRESHOLD = 15;
const MAX_SPEED = 200; // Hard cap on velocity to prevent physics explosions
const POWERUP_SPAWN_INTERVAL = 7000; // 5-10s average
const POWERUP_TYPES = ['Repair', 'Boost'];
const MAX_POWERUPS = 10; // Prevent accumulation during idle
const MAX_TRAPS = 15; // Prevent trap spam
const POWERUP_LIFETIME = 30000; // Powerups expire after 30 seconds
const RESPAWN_COOLDOWN = 5000; // 5 seconds to respawn

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
// TRACK SYSTEM - Pre-built walls for all tracks at startup
// =============================================================================
let activeTrack = getRandomRaceTrack();
const trackWalls = []; // Currently active walls in physics world
const prebuiltTrackWalls = new Map(); // trackId -> array of CANNON.Body (inactive until needed)
let activeHeightMap = null; // Current terrain height data
let terrainBody = null; // Heightfield physics body

// Pre-build all track walls at startup for instant track switching
function preloadAllTrackWalls() {
    console.log('[TRACK] Pre-building physics walls for all tracks...');
    const allTracks = getAllTracks();

    for (const track of allTracks) {
        const walls = [];
        for (const wall of track.boundaries) {
            const length = Math.sqrt(
                Math.pow(wall.x2 - wall.x1, 2) + Math.pow(wall.z2 - wall.z1, 2)
            );
            const centerX = (wall.x1 + wall.x2) / 2;
            const centerZ = (wall.z1 + wall.z2) / 2;
            const angle = Math.atan2(wall.z2 - wall.z1, wall.x2 - wall.x1);

            const wallBody = new CANNON.Body({
                mass: 0,
                shape: new CANNON.Box(new CANNON.Vec3(length / 2, wall.height / 2, 2.5)),
                position: new CANNON.Vec3(centerX, wall.height / 2, centerZ),
                material: wallMaterial,
                collisionResponse: false // Disabled until track is active
            });
            wallBody.quaternion.setFromEuler(0, -angle, 0);
            walls.push(wallBody);
        }
        prebuiltTrackWalls.set(track.id, walls);
        console.log(`[TRACK] Pre-built ${walls.length} walls for "${track.name}"`);
    }
    console.log(`[TRACK] Finished pre-building walls for ${allTracks.length} tracks`);
}

// Select random track - now just swaps pre-built walls instead of creating new ones
function selectRandomTrack() {
    activeTrack = getRandomTrack();
    console.log(`[TRACK] Selected: ${activeTrack.name}`);
    activateTrackWalls(activeTrack.id);
    createTerrainHeightfield(); // Update terrain for new track
}

// Activate pre-built walls for a specific track
function activateTrackWalls(trackId) {
    // Disable current walls
    for (const wall of trackWalls) {
        wall.collisionResponse = false;
        world.removeBody(wall);
    }
    trackWalls.length = 0;

    // Activate new track's walls
    const newWalls = prebuiltTrackWalls.get(trackId);
    if (newWalls) {
        for (const wall of newWalls) {
            wall.collisionResponse = true;
            world.addBody(wall);
            trackWalls.push(wall);
        }
        console.log(`[TRACK] Activated ${trackWalls.length} pre-built walls for track ${trackId}`);
    } else {
        console.error(`[TRACK] No pre-built walls found for track ${trackId}`);
    }
}

// Legacy function for compatibility - now uses pre-built walls
function createTrackWalls() {
    activateTrackWalls(activeTrack.id);
}

// Pre-build all walls on startup
preloadAllTrackWalls();

// Activate default track walls
activateTrackWalls(activeTrack.id);

// =============================================================================
// TERRAIN HEIGHTFIELD SYSTEM
// =============================================================================

// Create terrain heightfield from track data
function createTerrainHeightfield() {
    // Remove old terrain body if exists
    if (terrainBody) {
        world.removeBody(terrainBody);
        terrainBody = null;
    }

    const floorSize = activeTrack.floorSize || { width: 300, depth: 300 };
    const preset = getTerrainPreset(activeTrack.id, activeTrack.type);

    // Generate height map with slightly larger area than floor
    const terrainWidth = floorSize.width * 1.2;
    const terrainDepth = floorSize.depth * 1.2;

    activeHeightMap = generateHeightMap(
        terrainWidth,
        terrainDepth,
        preset.resolution,
        {
            hillScale: preset.hillScale,
            hillFrequency: preset.hillFrequency,
            hillFrequency: preset.hillFrequency,
            trackPath: activeTrack.path,
            trackWidth: activeTrack.width || 55, // Use actual track width
            spawnPoints: activeTrack.spawnPoints // Flatten terrain at spawns
        }
    );

    // Create Cannon.js Heightfield
    const heightfieldShape = new CANNON.Heightfield(activeHeightMap.matrix, {
        elementSize: activeHeightMap.elementSize
    });

    terrainBody = new CANNON.Body({
        mass: 0, // Static
        material: groundMaterial
    });

    // Position heightfield - cannon-es heightfield origin is at corner
    // Need to offset so center of heightfield is at world origin
    const offsetX = -activeHeightMap.width / 2;
    const offsetZ = -activeHeightMap.depth / 2;

    // Heightfield is added in XY plane, rotated to XZ
    terrainBody.addShape(heightfieldShape, new CANNON.Vec3(offsetX, offsetZ, 0));
    terrainBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);

    world.addBody(terrainBody);
    console.log(`[TERRAIN] Created heightfield ${activeHeightMap.gridWidth}x${activeHeightMap.gridDepth}, scale=${preset.hillScale}`);
}

// Get spawn height at position (for placing cars on terrain)
function getSpawnHeight(x, z) {
    if (!activeHeightMap) return 4; // Default safe height
    // Reduced from +10 to +1.2 to spawn cars on the ground
    return getTerrainHeight(activeHeightMap, x, z) + 1.2;
}

// Initialize terrain for default track
createTerrainHeightfield();


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

const MASK_TYPES = ['Classic', 'Oni', 'Tech', 'Clown', 'Skull'];
const CPU_NAMES = ['NEON', 'RAZOR', 'VOLT', 'BLAZE', 'CYBER', 'TURBO'];
let cpuIdCounter = 0;
let projectileIdCounter = 0;

// Lap tracking constants
const LAPS_TO_WIN = 3;

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
        body.position.set(spawn.x, getSpawnHeight(spawn.x, spawn.z), spawn.z);
        body.velocity.set(0, 0, 0);
        body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), spawn.rotation || 0);
        teleported = true;
        console.log(`[BOUNDS] Body exceeded horizontal bounds (${body.position.x.toFixed(1)}, ${body.position.z.toFixed(1)}). Resetting.`);
    }

    // Also prevent falling through floor
    // Relaxed from -5 to -20 to prevent accidental resets on steep hills or during spawn drop
    if (body.position.y < -100) {
        const spawn = activeTrack.spawnPoints[0];
        body.position.set(spawn.x, 2, spawn.z);
        body.velocity.set(0, 0, 0);
        teleported = true;
        console.log(`[BOUNDS] Body fell through world (y=${body.position.y.toFixed(1)}). Resetting.`);
    }

    return teleported;
}

// =============================================================================
// CPU OPPONENT SYSTEM
// =============================================================================
function spawnCPUOpponents(count) {
    for (let i = 0; i < count; i++) {
        const cpuId = `cpu_${cpuIdCounter++}`;
        // Use different spawn points for each CPU to spread them out
        const spawnIndex = i % activeTrack.spawnPoints.length;
        const spawn = activeTrack.spawnPoints[spawnIndex];

        const cpu = {
            id: cpuId,
            name: CPU_NAMES[i % CPU_NAMES.length],
            color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
            hp: 100,
            type: 'driver',
            isCPU: true,
            waypointIndex: 0, // Will be updated based on spawn position
            boost: 100,
            lapsCompleted: 0,
            lastWaypointIndex: 0,
            maskType: MASK_TYPES[Math.floor(Math.random() * MASK_TYPES.length)]
        };

        // Spawn CPUs far behind players to prevent instant collision
        const xOffset = ((i % 2) * 2 - 1) * (6 + Math.floor(i / 2) * 4); // -6, +6, -10, +10, etc
        const zOffset = -30 - (i * 12); // Start 30 units back, then 12 units apart
        const spawnY = getSpawnHeight(spawn.x + xOffset, spawn.z + zOffset);

        const body = new CANNON.Body({
            mass: 50,
            shape: new CANNON.Sphere(1),
            position: new CANNON.Vec3(spawn.x + xOffset, spawnY, spawn.z + zOffset),
            linearDamping: 0.1, // Increased from 0.05 for better stability
            angularDamping: 0.6, // Slightly increased from 0.5
            allowSleep: false,
            material: carMaterial
        });
        body.angularFactor.set(0, 1, 0); // Lock X/Z rotation (prevent rolling)
        body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), spawn.rotation || 0);

        world.addBody(body);
        cpu.body = body;

        // Initialize waypointIndex based on spawn position for race tracks
        if (activeTrack.path) {
            cpu.waypointIndex = findNearestWaypointIndex(
                { x: spawn.x + xOffset, z: spawn.z + zOffset },
                activeTrack.path
            );
        }
        cpuPlayers.set(cpuId, cpu);
    }
    // Notify clients of new CPUs
    for (const [id, cpu] of cpuPlayers) {
        io.emit('joined', {
            id: cpu.id,
            name: cpu.name,
            color: cpu.color,
            hp: cpu.hp,
            isCPU: true,
            maskType: cpu.maskType
        });
    }
    console.log(`[CPU] Spawned ${count} CPU opponents`);
}

// Submit CPU calculations to worker pool (async, results applied next tick)
function submitCpuCalculationsAsync() {
    if (!cpuWorkerPool || cpuPlayers.size === 0) return;

    // Build serializable data for workers
    const cpuList = [];
    for (const [id, cpu] of cpuPlayers) {
        if (!cpu.body || cpu.hp <= 0) continue;
        cpuList.push({
            id,
            position: { x: cpu.body.position.x, y: cpu.body.position.y, z: cpu.body.position.z },
            quaternion: { w: cpu.body.quaternion.w, x: cpu.body.quaternion.x, y: cpu.body.quaternion.y, z: cpu.body.quaternion.z },
            velocity: { x: cpu.body.velocity.x, y: cpu.body.velocity.y, z: cpu.body.velocity.z },
            waypointIndex: cpu.waypointIndex || 0
        });
    }

    if (cpuList.length === 0) return;

    // Build entity list for arena targeting
    const allEntities = [];
    for (const [id, player] of players) {
        if (player.type !== 'driver' || !player.body || player.hp <= 0) continue;
        allEntities.push({
            id,
            position: { x: player.body.position.x, z: player.body.position.z },
            hp: player.hp,
            isCPU: false
        });
    }
    for (const [id, cpu] of cpuPlayers) {
        if (!cpu.body || cpu.hp <= 0) continue;
        allEntities.push({
            id,
            position: { x: cpu.body.position.x, z: cpu.body.position.z },
            hp: cpu.hp,
            isCPU: true
        });
    }

    // Submit async calculation (result stored in pendingCpuResults)
    pendingCpuResults = cpuWorkerPool.submit('calculateCpuBatch', {
        cpuList,
        trackPath: activeTrack.path || null,
        trackType: activeTrack.type,
        allEntities
    });
}

// Apply worker results to CPU physics bodies
function applyCpuWorkerResults(results) {
    if (!results || !Array.isArray(results)) return;

    for (const result of results) {
        const cpu = cpuPlayers.get(result.id);
        if (!cpu || !cpu.body || cpu.hp <= 0) continue;

        // Wake up body
        cpu.body.wakeUp();

        // Lap tracking for race mode
        const isRacing = activeTrack.type === 'race' && activeTrack.path;
        if (isRacing && cpu.waypointIndex !== result.waypointIndex) {
            if (result.waypointIndex === 0 && cpu.waypointIndex === activeTrack.path.length - 1) {
                cpu.lapsCompleted++;
                console.log(`[LAP] ${cpu.name} completed lap ${cpu.lapsCompleted}`);
                if (cpu.lapsCompleted >= LAPS_TO_WIN) {
                    endRace(cpu);
                    return;
                }
            }
            cpu.waypointIndex = result.waypointIndex;
        }

        // Apply steering with smoothing
        const steerSmoothing = 0.8;
        cpu.body.angularVelocity.y = (cpu.body.angularVelocity.y * steerSmoothing) + (result.steering * (1 - steerSmoothing));

        // Apply Clown Mask random burst
        if (cpu.maskType === 'Clown' && Math.random() < 0.003) {
            const burst = new CANNON.Vec3(0, 0, -1);
            cpu.body.quaternion.vmult(burst, burst);
            burst.scale(450, burst);
            cpu.body.applyImpulse(burst, cpu.body.position);
            console.log(`[CLOWN] ${cpu.name} got a random burst!`);
        }

        // Apply throttle force
        const forward = new CANNON.Vec3(0, 0, -1);
        cpu.body.quaternion.vmult(forward, forward);
        forward.scale(result.throttle, forward);
        cpu.body.applyForce(forward, cpu.body.position);

        // CRITICAL: Clamp CPU velocity to prevent passing through walls
        const cpuSpeed = cpu.body.velocity.length();
        let CPU_MAX_SPEED = 140; // Increased from 90
        if (cpu.maskType === 'Skull') CPU_MAX_SPEED *= 1.1; // Skull mask bonus

        if (cpuSpeed > CPU_MAX_SPEED) {
            cpu.body.velocity.scale(CPU_MAX_SPEED / cpuSpeed, cpu.body.velocity);
        }

        // Enforce boundaries
        enforceBoundaries(cpu.body);
    }
}

// Fallback single-threaded CPU physics (used when workers unavailable)
function updateCPUPhysicsFallback() {
    try {
        for (const [id, cpu] of cpuPlayers) {
            if (!cpu.body || cpu.hp <= 0) continue;

            // Wake up the body to ensure physics applies
            cpu.body.wakeUp();

            const pos = cpu.body.position;
            let target;
            let isRacing = false;

            // Different behavior for race tracks vs arenas
            if (activeTrack.type === 'race' && activeTrack.path) {
                // Race track: Follow waypoints
                const WAYPOINT_THRESHOLD = 10; // Reduced from 15 for tighter racing
                const result = getNextWaypoint(cpu, activeTrack.path, 6); // Increased lookahead
                target = { x: result.x, z: result.z };

                // Lap tracking: detect finish line crossing
                if (cpu.waypointIndex !== result.waypointIndex) {
                    // Waypoint advanced
                    if (result.waypointIndex === 0 && cpu.waypointIndex === activeTrack.path.length - 1) {
                        // Wrapped from last to first = lap completed
                        cpu.lapsCompleted++;
                        console.log(`[LAP] ${cpu.name} completed lap ${cpu.lapsCompleted}`);

                        // Check for race completion
                        if (cpu.lapsCompleted >= LAPS_TO_WIN) {
                            endRace(cpu);
                            return;
                        }
                    }
                    cpu.waypointIndex = result.waypointIndex;
                }

                isRacing = true;
            } else {
                // Arena: Chase enemies or patrol center
                target = getArenaTarget(cpu, players, cpuPlayers);
            }

            const dx = target.x - pos.x;
            const dz = target.z - pos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist > 0.1) {
                // Calculate target angle (direction to target)
                const targetAngle = Math.atan2(dx, -dz);

                // Get current heading from quaternion
                const q = cpu.body.quaternion;
                const currentAngle = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));

                // Calculate angle difference
                let angleDiff = normalizeAngle(targetAngle - currentAngle);

                // Apply steering proportional to angle difference
                const steerStrength = 3.0;
                let desiredSteer = angleDiff * steerStrength;

                // Low-pass filter for smoothing (prevents jitter)
                const smoothing = 0.8; // 80% old value, 20% new
                cpu.body.angularVelocity.y = (cpu.body.angularVelocity.y * smoothing) + (desiredSteer * (1 - smoothing));

                // Apply throttle (reduce when turning sharply) - increased base values
                const turnFactor = 1 - Math.abs(angleDiff) / Math.PI;
                // Don't slow down as much on turns to correct "slow driving"
                let baseThrottle = isRacing ? 2000 : 1500; // significantly increased from 1200/800
                const throttleStrength = baseThrottle + (baseThrottle * 0.8 * turnFactor);

                // Combat AI: detect nearby targets for ramming (less aggressive)
                let combatBoost = 1.0;
                const combatRange = 25; // Reduced from 30

                // Check for nearby players to ram (less aggressive in race mode)
                const combatChance = isRacing ? 0.3 : 0.6; // 30% aggressive in races, 60% in arenas

                if (Math.random() < combatChance) {
                    for (const [pId, player] of players) {
                        if (player.type !== 'driver' || !player.body) continue;
                        const pDist = cpu.body.position.distanceTo(player.body.position);
                        if (pDist < combatRange) {
                            const toDx = player.body.position.x - pos.x;
                            const toDz = player.body.position.z - pos.z;
                            const toAngle = Math.atan2(toDx, -toDz);
                            const aimDiff = Math.abs(normalizeAngle(toAngle - currentAngle));

                            // If aligned with target (within 30 degrees), small boost
                            if (aimDiff < Math.PI / 6) {
                                combatBoost = 1.15; // Reduced from 1.5
                                break;
                            }
                        }
                    }
                }

                // Check for nearby CPUs to ram (in all modes, not just arena)
                if (Math.random() < combatChance) {
                    for (const [cId, otherCpu] of cpuPlayers) {
                        if (cId === id || !otherCpu.body || otherCpu.hp <= 0) continue;
                        const cDist = cpu.body.position.distanceTo(otherCpu.body.position);
                        if (cDist < combatRange) {
                            const toDx = otherCpu.body.position.x - pos.x;
                            const toDz = otherCpu.body.position.z - pos.z;
                            const toAngle = Math.atan2(toDx, -toDz);
                            const aimDiff = Math.abs(normalizeAngle(toAngle - currentAngle));

                            if (aimDiff < Math.PI / 6) {
                                combatBoost = 1.15; // Reduced from 1.5
                                break;
                            }
                        }
                    }
                }

                // Calculate forward direction from quaternion using correct method
                const forward = new CANNON.Vec3(0, 0, -1); // Negative Z is forward
                cpu.body.quaternion.vmult(forward, forward);
                forward.scale(throttleStrength * combatBoost, forward); // Apply combat boost

                // Apply Clown Mask random burst
                if (cpu.maskType === 'Clown' && Math.random() < 0.003) {
                    const burst = new CANNON.Vec3(0, 0, -1);
                    cpu.body.quaternion.vmult(burst, burst);
                    burst.scale(450, burst);
                    cpu.body.applyImpulse(burst, cpu.body.position);
                }

                cpu.body.applyForce(forward, cpu.body.position);
            }

            // CRITICAL: Clamp CPU velocity to prevent passing through walls
            const cpuSpeed = cpu.body.velocity.length();
            let CPU_MAX_SPEED = 140; // Increased from 90
            if (cpu.maskType === 'Skull') CPU_MAX_SPEED *= 1.1; // Skull mask bonus

            if (cpuSpeed > CPU_MAX_SPEED) {
                cpu.body.velocity.scale(CPU_MAX_SPEED / cpuSpeed, cpu.body.velocity);
            }

            // Enforce boundaries for CPU too
            enforceBoundaries(cpu.body);
        }
    } catch (error) {
        console.error('[CPU] Error in CPU physics:', error.message);
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
                    switchToDrone(playerId);
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

    // Reset demo timer if no human players remain
    resetDemoTimer();
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

    console.log(`[DRONE] Player ${id} is now a drone. Respawning in ${RESPAWN_COOLDOWN / 1000}s`);
    io.to(id).emit('becameDrone', { respawnIn: RESPAWN_COOLDOWN });

    // Start respawn timer
    setTimeout(() => {
        respawnPlayer(id);
    }, RESPAWN_COOLDOWN);
}

function respawnPlayer(id) {
    const player = players.get(id);
    if (!player) return; // Player might have disconnected

    console.log(`[RESPAWN] Respawning player ${id}`);

    // Reset stats
    player.hp = 100;
    player.type = 'driver';
    player.boost = 100;
    player.isShielded = false;
    player.isGhost = false;
    player.isJuggernaut = false;
    player.ammo = 0;
    player.weaponType = null;
    player.input = { steering: 0, throttle: 0, boost: false };

    // Find spawn position at the back of the pack
    const spawn = getPackRearPosition();
    createPlayerBody(player, spawn.x, spawn.z, spawn.rotation || 0);

    // Notify client
    io.to(id).emit('respawned', {
        id: id,
        hp: 100,
        type: 'driver'
    });

    // Notify all clients that player joined back as driver
    io.emit('joined', {
        id: id,
        name: player.name,
        color: player.color,
        hp: 100,
        isCPU: false,
        maskType: player.maskType
    });
}

function respawnCPU(id) {
    const cpu = cpuPlayers.get(id);
    if (!cpu) return;

    console.log(`[RESPAWN] Respawning CPU ${id}`);

    // Reset stats
    cpu.hp = 100;
    cpu.type = 'driver';
    cpu.boost = 100;
    cpu.lapsCompleted = 0; // Or keep them? Usually demolition games reset but race games don't.
    // In this game, laps are important for race mode, but if you die maybe you lose progress?
    // Let's keep it simple and just revive.

    // Find spawn position at the back of the pack
    const spawn = getPackRearPosition();

    // Create new body
    const body = new CANNON.Body({
        mass: 50,
        shape: new CANNON.Sphere(1),
        position: new CANNON.Vec3(spawn.x, getSpawnHeight(spawn.x, spawn.z), spawn.z),
        linearDamping: 0.1,
        angularDamping: 0.6,
        allowSleep: false,
        material: carMaterial
    });
    body.angularFactor.set(0, 1, 0);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), spawn.rotation || 0);

    world.addBody(body);
    cpu.body = body;

    // Update waypoint to nearest
    if (activeTrack.path) {
        cpu.waypointIndex = findNearestWaypointIndex(
            { x: spawn.x, z: spawn.z },
            activeTrack.path
        );
    }

    // Notify clients
    io.emit('joined', {
        id: cpu.id,
        name: cpu.name,
        color: cpu.color,
        hp: cpu.hp,
        isCPU: true,
        maskType: cpu.maskType
    });
}

function updatePlayerPhysics(player, input) {
    if (!player.body) return;

    // Lap tracking for race tracks
    if (activeTrack.type === 'race' && activeTrack.path && gameState === 'RACING') {
        const pos = { x: player.body.position.x, z: player.body.position.z };
        const currentWaypointIndex = findNearestWaypointIndex(pos, activeTrack.path);

        // Check for lap completion (wrapping from last to first waypoint)
        if (player.waypointIndex === activeTrack.path.length - 1 && currentWaypointIndex === 0) {
            player.lapsCompleted++;
            console.log(`[LAP] ${player.name} completed lap ${player.lapsCompleted}`);
            io.to(player.id).emit('lapCompleted', { lap: player.lapsCompleted, totalLaps: LAPS_TO_WIN });

            // Check for race win
            if (player.lapsCompleted >= LAPS_TO_WIN) {
                endRace(player);
                return;
            }
        }

        player.waypointIndex = currentWaypointIndex;
    }

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
            burst.scale(450, burst); // Increased burst power
            player.body.applyImpulse(burst, player.body.position);
        }
    }

    // Wake up body
    player.body.wakeUp();

    // Get current speed
    const speed = player.body.velocity.length();

    // 1. STEERING - Responsive arcade-style turning
    // Quick turn response at all speeds, slightly reduced at very high speed
    const minSpeedToTurn = 1.0; // Lower threshold
    const baseTurnSpeed = 3.8; // Reduced from 5.5 for more controlled steering
    const speedFactor = Math.min(1, speed / 10); // Full turn responsiveness at speed 10+
    const highSpeedDampen = Math.max(0.5, 1 - speed / 100); // Gentler reduction at high speed

    let desiredSteer = 0;
    if (speed > minSpeedToTurn) {
        desiredSteer = -steering * baseTurnSpeed * speedFactor * highSpeedDampen;
    } else {
        // Allow some turning even when nearly stopped (helps with maneuvering)
        desiredSteer = -steering * baseTurnSpeed * 0.4;
    }

    // Apply low-pass filter (smoothing) to prevent instant 180s and rapid spinning
    // This is the key fix for the "spinning in circles" issue
    const steerSmoothing = 0.85; // 85% old value, 15% new
    player.body.angularVelocity.y = (player.body.angularVelocity.y * steerSmoothing) + (desiredSteer * (1 - steerSmoothing));

    // 2. Calculate Forward Direction based on current rotation
    const quaternion = player.body.quaternion;
    const forward = new CANNON.Vec3(0, 0, -1); // NEGATIVE Z is forward
    quaternion.vmult(forward, forward);

    // 3. Apply Throttle Force (Significantly increased for faster acceleration)
    const driveForce = 3500; // Increased from 2000 - much punchier acceleration
    const force = forward.clone();
    force.scale(throttle * driveForce, force);

    // Boost multiplier - more impactful
    if (boost && player.boost > 0) {
        force.scale(2.2, force); // Increased from 1.8 - boost feels powerful
        player.boost = Math.max(0, player.boost - 1.2); // Slightly longer boost duration
    } else {
        player.boost = Math.min(100, player.boost + 0.4 * boostRegenMod); // Faster regen
    }

    player.body.applyForce(force, player.body.position);

    // 4. Lateral Friction (Balanced drift/grip)
    const velocity = player.body.velocity;
    
    // Calculate right vector properly: cross product of forward and up
    // Reuse the forward vector already calculated above
    const up = new CANNON.Vec3(0, 1, 0);
    const right = new CANNON.Vec3();
    forward.cross(up, right);  // right = forward × up
    right.normalize();

    const lateralVelocity = velocity.dot(right);

    // Dynamic grip: more grip at low speed, allows controlled drift at high speed
    const speedRatio = Math.min(speed / 50, 1);
    const grip = 0.95 - speedRatio * 0.15; // 0.95 at low speed, 0.80 at high speed
    const correctionForce = right.clone();
    correctionForce.scale(-lateralVelocity * grip * player.body.mass * 10, correctionForce);

    player.body.applyForce(correctionForce, player.body.position);

    // 5. Speed cap increased for faster gameplay (modified by mask)
    const maxSpeed = 150 * maxSpeedMod; // Increased from 95
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
                    // Cap base damage to prevent instant kills (max 40 base damage per hit)
                    let damage1 = Math.min(40, Math.floor(impactSpeed * 1.0));
                    let damage2 = Math.min(40, Math.floor(impactSpeed * 1.0));
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

                    // P1's forward vector (negative Z is forward)
                    const p1Forward = new CANNON.Vec3(0, 0, -1);
                    p1.body.quaternion.vmult(p1Forward, p1Forward);

                    // P2's forward vector (negative Z is forward)
                    const p2Forward = new CANNON.Vec3(0, 0, -1);
                    p2.body.quaternion.vmult(p2Forward, p2Forward);

                    // Dot products (> 0.7 is roughly < 45 degrees)
                    const p1FacingP2 = p1Forward.dot(v1to2);
                    const p2FacingP1 = p2Forward.dot(v1to2.negate()); // v2to1 is needed? v1to2.negate() is v2to1

                    // Check P1 Ramming P2
                    if (p1FacingP2 > 0.7) {
                        // P1 is hitting P2 frontally
                        damage2 *= 1.2; // Further reduced
                        damage1 *= 0.7; // Less reduction for attacker
                        knockback2 = 2.0; // P2 gets punted
                        console.log(`[COMBAT] ${p1.name} RAMMED ${p2.name}!`);
                    }

                    // Check P2 Ramming P1
                    if (p2FacingP1 > 0.7) {
                        // P2 is hitting P1 frontally
                        damage1 *= 1.2; // Further reduced
                        damage2 *= 0.7; // Less reduction for attacker
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

    // Check collisions between players and CPUs
    for (const [playerId, player] of players) {
        if (player.type !== 'driver' || !player.body) continue;

        for (const [cpuId, cpu] of cpuPlayers) {
            if (!cpu.body || cpu.hp <= 0) continue;

            const dist = player.body.position.distanceTo(cpu.body.position);
            if (dist < 2.2) {
                const relVel = new CANNON.Vec3();
                player.body.velocity.vsub(cpu.body.velocity, relVel);
                const impactSpeed = relVel.length();

                if (impactSpeed > DAMAGE_THRESHOLD) {
                    // Cap base damage to prevent instant kills (max 40 base damage per hit)
                    let damageToPlayer = Math.min(40, Math.floor(impactSpeed * 1.0));
                    let damageToCPU = Math.min(40, Math.floor(impactSpeed * 1.0));

                    // ONI MASK: 15% damage resistance
                    if (player.maskType === 'Oni') damageToPlayer *= 0.85;
                    if (cpu.maskType === 'Oni') damageToCPU *= 0.85;

                    // RAMMING LOGIC
                    const v1to2 = new CANNON.Vec3();
                    cpu.body.position.vsub(player.body.position, v1to2);
                    v1to2.normalize();

                    // Player heading - use correct quaternion rotation
                    const pForward = new CANNON.Vec3(0, 0, -1);
                    player.body.quaternion.vmult(pForward, pForward);

                    // CPU heading - use correct quaternion rotation
                    const cForward = new CANNON.Vec3(0, 0, -1);
                    cpu.body.quaternion.vmult(cForward, cForward);

                    const playerRamming = pForward.dot(v1to2);
                    const cpuRamming = cForward.dot(v1to2.negate());

                    if (playerRamming > 0.7) {
                        damageToPlayer *= 0.7; // Less reduction for attacker
                        damageToCPU *= 1.2; // Further reduced
                        console.log(`[COMBAT] ${player.name} RAMMED ${cpu.name}!`);
                    }

                    if (cpuRamming > 0.7) {
                        damageToCPU *= 0.7; // Less reduction for attacker
                        damageToPlayer *= 1.2; // Further reduced to help humans
                        console.log(`[COMBAT] ${cpu.name} RAMMED ${player.name}!`);
                    }

                    // Juggernaut and Shield Logic
                    if (player.isJuggernaut) { damageToPlayer *= 0.2; damageToCPU *= 1.5; }
                    if (player.isShielded) damageToPlayer = 0;

                    player.hp -= Math.floor(damageToPlayer);
                    cpu.hp -= Math.floor(damageToCPU);

                    console.log(`[COLLISION] ${player.name} (-${damageToPlayer}) <-> ${cpu.name} (-${damageToCPU}) | Speed: ${impactSpeed.toFixed(1)}`);

                    io.to(playerId).emit('damage', { hp: player.hp, damage: damageToPlayer });

                    if (player.hp <= 0) {
                        switchToDrone(playerId);
                        updateLeaderboard(cpu.name, 'kills', 1, true); // CPU gets kill credit
                        checkWinCondition();
                    }
                    if (cpu.hp <= 0) {
                        console.log(`[CPU] ${cpu.name} eliminated by ${player.name}. Respawning in ${RESPAWN_COOLDOWN / 1000}s`);
                        world.removeBody(cpu.body);
                        cpu.body = null;
                        cpu.type = 'eliminated';
                        updateLeaderboard(player.name, 'kills', 1, false);
                        updateLeaderboard(cpu.name, 'deaths', 1, true);
                        checkWinCondition();

                        // Start respawn timer
                        setTimeout(() => {
                            respawnCPU(cpuId);
                        }, RESPAWN_COOLDOWN);
                    }
                }
            }
        }
    }

    // Check collisions between CPUs
    const cpuArray = Array.from(cpuPlayers.entries());
    for (let i = 0; i < cpuArray.length; i++) {
        const [id1, cpu1] = cpuArray[i];
        if (!cpu1.body || cpu1.hp <= 0) continue;

        for (let j = i + 1; j < cpuArray.length; j++) {
            const [id2, cpu2] = cpuArray[j];
            if (!cpu2.body || cpu2.hp <= 0) continue;

            const dist = cpu1.body.position.distanceTo(cpu2.body.position);
            if (dist < 2.2) {
                const relVel = new CANNON.Vec3();
                cpu1.body.velocity.vsub(cpu2.body.velocity, relVel);
                const impactSpeed = relVel.length();

                if (impactSpeed > DAMAGE_THRESHOLD) {
                    // Cap base damage to prevent instant kills (max 40 base damage per hit)
                    let damage1 = Math.min(40, Math.floor(impactSpeed * 1.0));
                    let damage2 = Math.min(40, Math.floor(impactSpeed * 1.0));

                    // RAMMING LOGIC
                    const v1to2 = new CANNON.Vec3();
                    cpu2.body.position.vsub(cpu1.body.position, v1to2);
                    v1to2.normalize();

                    // CPU1 heading - use correct quaternion rotation
                    const f1 = new CANNON.Vec3(0, 0, -1);
                    cpu1.body.quaternion.vmult(f1, f1);

                    // CPU2 heading - use correct quaternion rotation
                    const f2 = new CANNON.Vec3(0, 0, -1);
                    cpu2.body.quaternion.vmult(f2, f2);

                    const cpu1Ramming = f1.dot(v1to2);
                    const cpu2Ramming = f2.dot(v1to2.negate());

                    if (cpu1Ramming > 0.7) {
                        damage1 *= 0.7; // Less reduction for attacker
                        damage2 *= 1.2; // Further reduced
                        console.log(`[COMBAT] ${cpu1.name} RAMMED ${cpu2.name}!`);
                    }

                    if (cpu2Ramming > 0.7) {
                        damage2 *= 0.7; // Less reduction for attacker
                        damage1 *= 1.2; // Further reduced
                        console.log(`[COMBAT] ${cpu2.name} RAMMED ${cpu1.name}!`);
                    }

                    // Mask Abilities
                    if (cpu1.maskType === 'Oni') damage1 *= 0.85;
                    if (cpu2.maskType === 'Oni') damage2 *= 0.85;

                    cpu1.hp -= Math.floor(damage1);
                    cpu2.hp -= Math.floor(damage2);

                    console.log(`[COLLISION] ${cpu1.name} (-${damage1}) <-> ${cpu2.name} (-${damage2}) | Speed: ${impactSpeed.toFixed(1)}`);

                    if (cpu1.hp <= 0) {
                        console.log(`[CPU] ${cpu1.name} eliminated by ${cpu2.name}. Respawning in ${RESPAWN_COOLDOWN / 1000}s`);
                        world.removeBody(cpu1.body);
                        cpu1.body = null;
                        cpu1.type = 'eliminated';
                        updateLeaderboard(cpu2.name, 'kills', 1, true);
                        updateLeaderboard(cpu1.name, 'deaths', 1, true);
                        checkWinCondition();

                        // Start respawn timer
                        setTimeout(() => {
                            respawnCPU(id1);
                        }, RESPAWN_COOLDOWN);
                    }
                    if (cpu2.hp <= 0) {
                        console.log(`[CPU] ${cpu2.name} eliminated by ${cpu1.name}. Respawning in ${RESPAWN_COOLDOWN / 1000}s`);
                        world.removeBody(cpu2.body);
                        cpu2.body = null;
                        cpu2.type = 'eliminated';
                        updateLeaderboard(cpu1.name, 'kills', 1, true);
                        updateLeaderboard(cpu2.name, 'deaths', 1, true);
                        checkWinCondition();

                        // Start respawn timer
                        setTimeout(() => {
                            respawnCPU(id2);
                        }, RESPAWN_COOLDOWN);
                    }
                }
            }
        }
    }
});

// =============================================================================
// POWER-UPS
// =============================================================================
const EXTENDED_POWERUP_TYPES = ['Repair', 'Repair', 'Boost', 'Boost', 'Shield', 'Ghost', 'Juggernaut', 'Weapon', 'Weapon', '67Meme']; // Weighted

function spawnPowerup() {
    // Prevent accumulation - cap at MAX_POWERUPS
    if (powerups.size >= MAX_POWERUPS) {
        console.log(`[POWERUP] Max powerups (${MAX_POWERUPS}) reached, skipping spawn`);
        return;
    }

    const id = uuidv4();
    const type = EXTENDED_POWERUP_TYPES[Math.floor(Math.random() * EXTENDED_POWERUP_TYPES.length)];

    // Get random position on track
    const pos = getRandomPointOnTrack(activeTrack);
    const x = pos.x;
    const z = pos.z;
    const y = getSpawnHeight(x, z) + 0.5; // Slightly above ground

    const body = new CANNON.Body({
        mass: 0, // Static
        shape: new CANNON.Sphere(1.5),
        position: new CANNON.Vec3(x, y, z),
        isTrigger: true
    });

    world.addBody(body);
    powerups.set(id, { body, type, position: { x, y, z }, spawnTime: Date.now() });

    console.log(`[POWERUP] Spawned ${type} at (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}) [${powerups.size}/${MAX_POWERUPS}]`);

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
                } else if (powerup.type === 'Weapon') {
                    player.ammo = (player.ammo || 0) + 5;
                    player.weaponType = Math.random() > 0.5 ? 'missile' : 'laser';
                    console.log(`[POWERUP] ${player.name} picked up Weapon (${player.weaponType}, ${player.ammo} ammo)`);
                    io.to(playerId).emit('powerup', { type: 'Weapon', ammo: player.ammo, weaponType: player.weaponType });
                } else if (powerup.type === '67Meme') {
                    player.hp = Math.min(100, player.hp + 67);
                    console.log(`[POWERUP] ${player.name} picked up 67Meme - 6 7`);
                    io.to(playerId).emit('powerup', { type: '67Meme' });
                } else {
                    console.log(`[POWERUP] ${player.name} picked up ${powerup.type}`);
                    io.to(playerId).emit('powerup', { type: powerup.type });
                }

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
const leaderboard = new Map(); // name -> { wins, kills, deaths, gamesPlayed, isCPU }

function updateLeaderboard(playerName, stat, value = 1, isCPU = false) {
    if (!leaderboard.has(playerName)) {
        leaderboard.set(playerName, { wins: 0, kills: 0, deaths: 0, gamesPlayed: 0, isCPU });
    }
    const entry = leaderboard.get(playerName);
    entry[stat] = (entry[stat] || 0) + value;
    // Ensure isCPU flag is set
    if (isCPU) entry.isCPU = true;
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
    // Prevent starting if already active or in middle of a game
    if (demoModeActive) {
        console.log('[DEMO] Demo already active, skipping');
        return;
    }
    if (gameState === 'RACING' || gameState === 'COUNTDOWN' || gameState === 'WINNER') {
        console.log(`[DEMO] Cannot start demo - gameState is ${gameState}`);
        return;
    }

    // Check for human players one more time
    const humanCount = [...players.values()].filter(p => !p.isCPU).length;
    if (humanCount > 0) {
        console.log('[DEMO] Human players present, canceling demo start');
        return;
    }

    console.log('[DEMO] Starting demo mode - CPU battle!');
    demoModeActive = true;
    gameState = 'DEMO';

    // Select random RACE track (with path for CPU pathfinding)
    const { getRandomRaceTrack } = require('./tracks');
    activeTrack = getRandomRaceTrack();
    console.log(`[DEMO] Selected race track: ${activeTrack.name}`);

    // Clear existing walls and create new ones for the selected track
    for (const wall of trackWalls) {
        world.removeBody(wall);
    }
    trackWalls.length = 0;
    createTrackWalls();
    createTerrainHeightfield(); // Generate terrain for demo track

    // Broadcast track data so renderer displays correct track and music plays
    io.emit('trackData', {
        ...activeTrack,
        heightMap: activeHeightMap ? {
            width: activeHeightMap.width,
            depth: activeHeightMap.depth,
            gridWidth: activeHeightMap.gridWidth,
            gridDepth: activeHeightMap.gridDepth,
            elementSize: activeHeightMap.elementSize,
            matrix: activeHeightMap.matrix,
            hillScale: activeHeightMap.hillScale
        } : null
    });
    io.emit('trackStyle', {
        trackId: activeTrack.id,
        trackName: activeTrack.name,
        theme: getThemeByTrackId(activeTrack.id)
    });

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
    demoModeTimer = null;

    // Only set timer if no human players and not already in demo/racing
    const humanCount = [...players.values()].filter(p => !p.isCPU).length;
    if (humanCount === 0 && !demoModeActive && gameState !== 'RACING' && gameState !== 'COUNTDOWN') {
        demoModeTimer = setTimeout(startDemoMode, DEMO_TIMEOUT);
        console.log(`[DEMO] Demo timer set - starting in ${DEMO_TIMEOUT / 1000}s if no one joins`);
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

    console.log('[GAME] Starting countdown...');

    // Select random track for this round
    selectRandomTrack();

    // Validate track was loaded
    if (!activeTrack || !activeTrack.spawnPoints || activeTrack.spawnPoints.length === 0) {
        console.error('[ERROR] Track not properly initialized, resetting to default');
        activeTrack = getDefaultTrack();
        createTrackWalls();
    }

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
    console.log('[GAME] Starting race!');
    gameState = 'RACING';
    gameTimer = 0;

    // Remove any existing CPU
    removeCPUOpponents();

    // Validate track before starting
    if (!activeTrack || !activeTrack.spawnPoints || activeTrack.spawnPoints.length === 0) {
        console.error('[ERROR] Cannot start race - invalid track configuration');
        gameState = 'LOBBY';
        broadcastGameState();
        return;
    }

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
    io.emit('trackStyle', {
        trackId: activeTrack.id,
        trackName: activeTrack.name,
        theme: getThemeByTrackId(activeTrack.id)
    });

    broadcastGameState();
    console.log('[GAME] Race Started!');
}

function resetGame() {
    // Respawn all players
    let spawnCounter = 0;
    for (const [id, player] of players) {
        removePlayerBody(player); // Helper to clear old body

        // Reset stats
        player.hp = 100;
        player.type = 'driver';
        player.boost = 100;
        player.isShielded = false;
        player.isGhost = false;
        player.isJuggernaut = false;
        player.ammo = 0;
        player.weaponType = null;
        player.lapsCompleted = 0;
        player.waypointIndex = 0;
        player.input = { steering: 0, throttle: 0, boost: false };

        // Create new body
        const spawnIndex = spawnCounter % activeTrack.spawnPoints.length;
        const spawnPoint = activeTrack.spawnPoints[spawnIndex];
        const spawnX = spawnPoint.x + (Math.random() - 0.5) * 5;
        const spawnZ = spawnPoint.z + (Math.random() - 0.5) * 5;

        createPlayerBody(player, spawnX, spawnZ, spawnPoint.rotation || 0);
        spawnCounter++;

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
    if (gameState !== 'RACING' && gameState !== 'DEMO') return;
    gameState = 'WINNER';
    winnerName = winner ? winner.name : 'Nobody';
    gameTimer = 10; // 10s until lobby
    console.log(`[GAME] Winner: ${winnerName}`);

    // Update leaderboard for winner
    if (winner) {
        updateLeaderboard(winner.name, 'wins', 1, winner.isCPU || false);
        updateLeaderboard(winner.name, 'gamesPlayed', 1, winner.isCPU || false);
    }

    // Update gamesPlayed for all other participants
    for (const [id, player] of players) {
        if (!winner || player.name !== winner.name) {
            updateLeaderboard(player.name, 'gamesPlayed', 1, false);
        }
    }
    for (const [id, cpu] of cpuPlayers) {
        if (!winner || cpu.name !== winner.name) {
            updateLeaderboard(cpu.name, 'gamesPlayed', 1, true);
        }
    }

    broadcastLeaderboard();
    broadcastGameState();

    // Capture if this was a demo mode race
    const wasDemoMode = demoModeActive;

    const interval = setInterval(() => {
        gameTimer--;
        broadcastGameState();
        if (gameTimer <= 0) {
            clearInterval(interval);
            winnerName = null;

            // If this was demo mode, restart demo automatically (loop demo battles)
            if (wasDemoMode) {
                const humanCount = [...players.values()].filter(p => !p.isCPU).length;
                if (humanCount === 0) {
                    // Reset for new demo race
                    demoModeActive = false; // Reset flag so startDemoMode works
                    removeCPUOpponents();
                    gameState = 'LOBBY';
                    broadcastGameState();
                    // Start new demo after short delay
                    setTimeout(startDemoMode, 3000);
                    console.log('[DEMO] Demo race ended, restarting in 3 seconds...');
                } else {
                    // Human joined during demo, go to lobby
                    demoModeActive = false;
                    removeCPUOpponents();
                    gameState = 'LOBBY';
                    broadcastGameState();
                    io.emit('demoMode', { active: false });
                }
            } else {
                gameState = 'LOBBY';
                broadcastGameState();
            }
        }
    }, 1000);
}

function checkWinCondition() {
    if (gameState !== 'RACING' && gameState !== 'DEMO') return;

    // For race tracks: lap completion is handled in updateCPUPhysics and updatePlayerPhysics
    // Only check elimination-based win condition for arenas or if everyone is eliminated

    if (activeTrack.type === 'arena') {
        // Arena mode: Last survivor wins
        let activeDrivers = [];

        // Count human players
        for (const [id, p] of players) {
            if (p.type === 'driver' && p.hp > 0) activeDrivers.push(p);
        }

        // Count CPU players
        for (const [id, cpu] of cpuPlayers) {
            if (cpu.hp > 0 && cpu.body) activeDrivers.push(cpu);
        }

        // Last survivor wins
        if (activeDrivers.length === 1) {
            endRace(activeDrivers[0]);
        }
        // Everyone died
        else if (activeDrivers.length === 0) {
            endRace(null);
        }
    } else if (activeTrack.type === 'race') {
        // Race mode: Check if everyone is eliminated (no lap winner yet)
        let activeDrivers = [];

        for (const [id, p] of players) {
            if (p.type === 'driver' && p.hp > 0) activeDrivers.push(p);
        }

        for (const [id, cpu] of cpuPlayers) {
            if (cpu.hp > 0 && cpu.body) activeDrivers.push(cpu);
        }

        // If everyone is eliminated before finishing, end race
        if (activeDrivers.length === 0) {
            endRace(null);
        }
    }
}

// Helper to find spawn position behind the pack for late joiners
function getPackRearPosition() {
    const drivers = [...players.values()].filter(p => p.type === 'driver' && p.body);
    const cpuDrivers = [...cpuPlayers.values()].filter(c => c.body && c.hp > 0);
    const allDrivers = [...drivers, ...cpuDrivers];

    if (allDrivers.length === 0) {
        // No active drivers, use first spawn point
        const spawn = activeTrack.spawnPoints?.[0] || { x: 0, z: 0, rotation: 0 };
        return { x: spawn.x, z: spawn.z, rotation: spawn.rotation || 0 };
    }

    // Find the rearmost driver (highest Z value since -Z is forward)
    let rearmost = allDrivers[0];
    for (const driver of allDrivers) {
        if (driver.body.position.z > rearmost.body.position.z) {
            rearmost = driver;
        }
    }

    // Spawn 10 units behind the rearmost player with random X offset
    const xOffset = (Math.random() - 0.5) * 4; // ±2 units
    return {
        x: rearmost.body.position.x + xOffset,
        z: rearmost.body.position.z + 10, // Behind (higher Z)
        rotation: 0 // Facing forward (-Z direction)
    };
}

// Helper to separate body creation logic
function createPlayerBody(player, x, z, rotation = 0) {
    const spawnY = getSpawnHeight(x, z); // Account for terrain height
    const body = new CANNON.Body({
        mass: 50,
        shape: new CANNON.Sphere(1),
        position: new CANNON.Vec3(x, spawnY, z),
        linearDamping: 0.1, // Increased from 0.05 for better stability
        angularDamping: 0.6, // Slightly increased from 0.5
        allowSleep: false,
        material: carMaterial,
        ccdSpeedThreshold: 1,
        ccdIterations: 5
    });
    body.angularFactor.set(0, 1, 0); // Lock X/Z rotation (prevent rolling)

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
        floorSize: activeTrack.floorSize,
        path: activeTrack.path,
        type: activeTrack.type,
        // Floor polygons for rendering distinct track/arena surface
        floorPolygon: activeTrack.floorPolygon,
        outerPolygon: activeTrack.outerPolygon,
        innerPolygon: activeTrack.innerPolygon,
        heightMap: activeHeightMap ? {
            width: activeHeightMap.width,
            depth: activeHeightMap.depth,
            gridWidth: activeHeightMap.gridWidth,
            gridDepth: activeHeightMap.gridDepth,
            elementSize: activeHeightMap.elementSize,
            matrix: activeHeightMap.matrix,
            hillScale: activeHeightMap.hillScale
        } : null
    });

    // Send initial game state
    socket.emit('gameState', { state: gameState, timer: gameTimer, winner: winnerName, isDemo: demoModeActive });

    // Send demo mode state
    socket.emit('demoMode', { active: demoModeActive });

    if (role === 'admin') {
        // Renderer connection - receives state + can send admin commands
        socket.join('renderers');

        // Send ALL track data for preloading (eliminates lag on track change)
        const allTracks = getAllTracks();
        const allThemes = getAllThemes();
        socket.emit('allTracks', allTracks.map(t => ({
            id: t.id,
            name: t.name,
            type: t.type,
            boundaries: t.boundaries,
            floorSize: t.floorSize,
            theme: allThemes[t.id] || allThemes['track_01']
        })));

        // Send track list and CPU count on connect
        socket.emit('trackList', allTracks.map(t => {
            const theme = allThemes[t.id] || allThemes['track_01'];
            return {
                id: t.id,
                name: t.name,
                type: t.type,
                primaryColor: theme.primaryColor,
                secondaryColor: theme.secondaryColor
            };
        }));
        socket.emit('cpuCount', cpuPlayers.size);

        // Admin commands
        socket.on('startGame', () => {
            console.log("[ADMIN] Requested start");
            if (gameState === 'LOBBY') startCountdown();
        });

        socket.on('addCPU', () => {
            if (cpuPlayers.size < 10) {
                spawnCPUOpponents(1);
                io.to('renderers').emit('cpuCount', cpuPlayers.size);
                console.log(`[ADMIN] Added CPU - now ${cpuPlayers.size}`);
            }
        });

        socket.on('removeCPU', () => {
            if (cpuPlayers.size > 0) {
                // Remove the first CPU
                const [firstId] = cpuPlayers.keys();
                const cpu = cpuPlayers.get(firstId);
                if (cpu.body) world.removeBody(cpu.body);
                cpuPlayers.delete(firstId);
                io.to('renderers').emit('cpuCount', cpuPlayers.size);
                console.log(`[ADMIN] Removed CPU - now ${cpuPlayers.size}`);
            }
        });

        socket.on('changeTrack', (trackId) => {
            const { getTrackById } = require('./tracks');
            const newTrack = getTrackById(trackId);
            if (newTrack) {
                console.log(`[ADMIN] Changing track to: ${newTrack.name}`);

                // Remove all CPUs
                removeCPUOpponents();

                // Set new track and activate pre-built walls
                activeTrack = newTrack;
                activateTrackWalls(activeTrack.id);
                createTerrainHeightfield(); // Generate terrain for new track

                // Broadcast new track data
                io.emit('trackData', {
                    id: activeTrack.id,
                    name: activeTrack.name,
                    boundaries: activeTrack.boundaries,
                    floorSize: activeTrack.floorSize,
                    path: activeTrack.path,
                    type: activeTrack.type,
                    // Floor polygons for rendering
                    floorPolygon: activeTrack.floorPolygon,
                    outerPolygon: activeTrack.outerPolygon,
                    innerPolygon: activeTrack.innerPolygon,
                    heightMap: activeHeightMap ? {
                        width: activeHeightMap.width,
                        depth: activeHeightMap.depth,
                        gridWidth: activeHeightMap.gridWidth,
                        gridDepth: activeHeightMap.gridDepth,
                        elementSize: activeHeightMap.elementSize,
                        matrix: activeHeightMap.matrix,
                        hillScale: activeHeightMap.hillScale
                    } : null
                });
                io.emit('trackStyle', {
                    trackId: activeTrack.id,
                    trackName: activeTrack.name,
                    theme: getThemeByTrackId(activeTrack.id)
                });
                io.to('renderers').emit('cpuCount', cpuPlayers.size);

                // Reset game state
                if (demoModeActive) {
                    spawnCPUOpponents(4);
                    io.to('renderers').emit('cpuCount', cpuPlayers.size);
                }
            }
        });

        socket.on('restartGame', () => {
            console.log("[ADMIN] Restarting game");

            // Stop demo mode if active
            if (demoModeActive) {
                demoModeActive = false;
                io.emit('demoMode', { active: false });
            }

            // Remove all CPUs
            removeCPUOpponents();

            // Reset all players
            for (const [id, player] of players) {
                removePlayerBody(player);
            }
            players.clear();

            // Clear powerups and traps
            for (const [id, p] of powerups) {
                world.removeBody(p.body);
            }
            powerups.clear();

            for (const [id, t] of traps) {
                world.removeBody(t.body);
            }
            traps.clear();

            // Reset game state
            gameState = 'LOBBY';
            gameTimer = 0;
            winnerName = null;

            broadcastGameState();
            io.to('renderers').emit('cpuCount', 0);

            // Restart demo timer
            resetDemoTimer();

            console.log("[ADMIN] Game reset to LOBBY");
        });

    } else {
        // Controller connection
        socket.on('join', ({ name, maskType }) => {
            // Exit demo mode if active when a real player joins
            if (demoModeActive) {
                stopDemoMode();
            }

            // Reset demo timer (prevents demo from starting while player is present)
            resetDemoTimer();

            // Determine spawn type - late joiners spawn as drivers behind the pack
            let type = 'driver';
            let lateJoiner = false;
            if (gameState === 'WINNER') {
                type = 'drone'; // Can't join during winner screen
            } else if (gameState === 'RACING') {
                type = 'driver'; // Late joiners spawn as targets behind the pack
                lateJoiner = true;
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
                isJuggernaut: false,
                lapsCompleted: 0,
                waypointIndex: 0,
                input: { steering: 0, throttle: 0, boost: false } // Initialize input for game loop
            };
            players.set(socket.id, newPlayer);
            // ...

            // If Driver, spawn body
            if (type === 'driver') {
                if (lateJoiner) {
                    // Late joiner: spawn behind the pack as a target
                    const rearPos = getPackRearPosition();
                    createPlayerBody(newPlayer, rearPos.x, rearPos.z, rearPos.rotation);
                    console.log(`[LATE JOIN] ${name} spawned behind pack at (${rearPos.x.toFixed(1)}, ${rearPos.z.toFixed(1)})`);

                    // Announce fresh meat to other players
                    io.emit('lateJoiner', { name: name || 'Player' });
                } else {
                    // Normal join: use spawn points
                    if (!activeTrack.spawnPoints || activeTrack.spawnPoints.length === 0) {
                        console.error('[ERROR] No spawn points available on track!');
                        activeTrack.spawnPoints = [{ x: 0, z: 0, rotation: 0 }]; // Fallback
                    }

                    const spawnIndex = (players.size - 1) % activeTrack.spawnPoints.length;
                    const spawnPoint = activeTrack.spawnPoints[spawnIndex];
                    createPlayerBody(newPlayer,
                        spawnPoint.x + (Math.random() - 0.5) * 2,
                        spawnPoint.z + (Math.random() - 0.5) * 2,
                        spawnPoint.rotation || 0
                    );
                }
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
                return;
            }

            // Only process input during RACING state
            if (gameState !== 'RACING') {
                return;
            }

            // Store input for game loop processing (no duplicate force application)
            player.input = { steering, throttle, boost };
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

        // LOCATE MY CAR - broadcast to renderer
        socket.on('locateMe', () => {
            const player = players.get(socket.id);
            if (!player || player.type !== 'driver') return;

            io.emit('playerLocating', { id: socket.id });
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
// GAME LOOP - Optimized with delta compression
// =============================================================================
const timestep = 1 / TICK_RATE;

// Delta compression state
let tickCounter = 0;
const FULL_STATE_INTERVAL = 60; // Send full state every 60 ticks (1 second)
const previousPlayerState = new Map(); // Track previous values for delta detection

// Pre-allocated world state object to avoid GC pressure
const worldStatePool = {
    players: {},
    powerups: {},
    traps: {}
};

// Pre-allocated position/velocity objects per player
const playerStatePool = new Map();

function getOrCreatePlayerState(id) {
    if (!playerStatePool.has(id)) {
        playerStatePool.set(id, {
            position: { x: 0, y: 0, z: 0 },
            velocity: { x: 0, y: 0, z: 0 },
            hp: 100,
            type: 'driver',
            maskType: 'Classic',
            color: '#ffffff',
            name: '',
            boost: 100,
            isShielded: false,
            isGhost: false,
            isJuggernaut: false,
            lapsCompleted: 0,
            waypointIndex: 0,
            raceProgress: 0,
            isCPU: false,
            quaternion: { x: 0, y: 0, z: 0, w: 1 }
        });
    }
    return playerStatePool.get(id);
}

function gameLoop() {
    try {
        // Apply pending CPU worker results from previous tick (if available)
        if (pendingCpuResults) {
            pendingCpuResults
                .then(results => applyCpuWorkerResults(results))
                .catch(err => console.error('[WORKERS] CPU result error:', err.message));
            pendingCpuResults = null;
        }

        // Step physics
        world.step(timestep);

        // Update CPU opponents (in both RACING and DEMO modes)
        if (gameState === 'RACING' || gameState === 'DEMO') {
            // Use worker pool if available, otherwise fallback to single-threaded
            if (cpuWorkerPool && cpuPlayers.size > 0) {
                // Submit async calculation for NEXT tick
                submitCpuCalculationsAsync();
            } else {
                // Fallback: synchronous single-threaded
                updateCPUPhysicsFallback();
            }
            updateProjectiles();

            // Update human player physics using stored input
            for (const [id, player] of players) {
                if (player.type === 'driver' && player.body && player.input) {
                    updatePlayerPhysics(player, player.input);
                }
            }
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

        // Build world state using pooled objects (reduces GC)
        // Clear old player references
        for (const key of Object.keys(worldStatePool.players)) {
            if (!players.has(key) && !cpuPlayers.has(key)) {
                delete worldStatePool.players[key];
                playerStatePool.delete(key);
            }
        }

        // Update player states in-place
        for (const [id, player] of players) {
            const state = getOrCreatePlayerState(id);

            if (player.body) {
                state.position.x = player.body.position.x;
                state.position.y = player.body.position.y;
                state.position.z = player.body.position.z;
                state.velocity.x = player.body.velocity.x;
                state.velocity.y = player.body.velocity.y;
                state.velocity.z = player.body.velocity.z;
                state.quaternion.x = player.body.quaternion.x;
                state.quaternion.y = player.body.quaternion.y;
                state.quaternion.z = player.body.quaternion.z;
                state.quaternion.w = player.body.quaternion.w;
            } else {
                state.position = null;
                state.velocity = null;
            }

            state.hp = player.hp;
            state.type = player.type;
            state.maskType = player.maskType;
            state.color = player.color;
            state.name = player.name;
            state.boost = player.boost;
            state.isShielded = player.isShielded || false;
            state.isGhost = player.isGhost || false;
            state.isJuggernaut = player.isJuggernaut || false;
            state.lapsCompleted = player.lapsCompleted || 0;
            state.waypointIndex = player.waypointIndex || 0;
            state.raceProgress = (player.lapsCompleted || 0) * (activeTrack?.path?.length || 1) + (player.waypointIndex || 0);
            state.isCPU = false;

            worldStatePool.players[id] = state;
        }

        // Include CPU players in world state using pooled objects
        for (const [id, cpu] of cpuPlayers) {
            const state = getOrCreatePlayerState(id);

            if (cpu.body) {
                state.position.x = cpu.body.position.x;
                state.position.y = cpu.body.position.y;
                state.position.z = cpu.body.position.z;
                state.velocity.x = cpu.body.velocity.x;
                state.velocity.y = cpu.body.velocity.y;
                state.velocity.z = cpu.body.velocity.z;
                state.quaternion.x = cpu.body.quaternion.x;
                state.quaternion.y = cpu.body.quaternion.y;
                state.quaternion.z = cpu.body.quaternion.z;
                state.quaternion.w = cpu.body.quaternion.w;
            } else {
                state.position = null;
                state.velocity = null;
            }

            state.hp = cpu.hp;
            state.type = cpu.type;
            state.maskType = cpu.maskType || 'Classic';
            state.color = cpu.color;
            state.name = cpu.name;
            state.boost = cpu.boost || 100;
            state.isCPU = true;
            state.isShielded = false;
            state.isGhost = false;
            state.isJuggernaut = false;
            state.lapsCompleted = cpu.lapsCompleted || 0;
            state.waypointIndex = cpu.waypointIndex || 0;
            state.raceProgress = (cpu.lapsCompleted || 0) * (activeTrack?.path?.length || 1) + (cpu.waypointIndex || 0);

            worldStatePool.players[id] = state;
        }

        // Clear and rebuild powerups (small objects, less critical)
        worldStatePool.powerups = {};
        for (const [id, powerup] of powerups) {
            worldStatePool.powerups[id] = {
                position: powerup.position,
                type: powerup.type
            };
        }

        // Clear and rebuild traps
        worldStatePool.traps = {};
        for (const [id, trap] of traps) {
            worldStatePool.traps[id] = {
                position: trap.position
            };
        }

        // Delta compression: send full state every FULL_STATE_INTERVAL ticks
        tickCounter++;
        const sendFullState = tickCounter >= FULL_STATE_INTERVAL;
        if (sendFullState) tickCounter = 0;

        if (sendFullState) {
            // Full state - includes everything, mark with isFull flag
            const fullState = {
                isFull: true,
                players: {},
                powerups: worldStatePool.powerups,
                traps: worldStatePool.traps
            };

            // Build full player state and cache for delta comparison
            for (const [id, state] of Object.entries(worldStatePool.players)) {
                fullState.players[id] = {
                    p: state.position ? [state.position.x, state.position.y, state.position.z] : null,
                    v: state.velocity ? [state.velocity.x, state.velocity.y, state.velocity.z] : null,
                    hp: state.hp,
                    type: state.type,
                    maskType: state.maskType,
                    color: state.color,
                    name: state.name,
                    boost: state.boost,
                    isShielded: state.isShielded,
                    isGhost: state.isGhost,
                    isJuggernaut: state.isJuggernaut,
                    lapsCompleted: state.lapsCompleted,
                    waypointIndex: state.waypointIndex,
                    raceProgress: state.raceProgress,
                    isCPU: state.isCPU,
                    q: [state.quaternion.x, state.quaternion.y, state.quaternion.z, state.quaternion.w]
                };

                // Cache for delta comparison
                previousPlayerState.set(id, {
                    hp: state.hp,
                    boost: state.boost,
                    type: state.type,
                    isShielded: state.isShielded,
                    isGhost: state.isGhost,
                    isJuggernaut: state.isJuggernaut
                });
            }

            io.emit('worldState', fullState);
        } else {
            // Delta state - only position/velocity arrays + changed properties
            const deltaState = {
                isFull: false,
                players: {},
                powerups: worldStatePool.powerups,
                traps: worldStatePool.traps
            };

            for (const [id, state] of Object.entries(worldStatePool.players)) {
                const prev = previousPlayerState.get(id);
                const delta = {
                    p: state.position ? [state.position.x, state.position.y, state.position.z] : null,
                    v: state.velocity ? [state.velocity.x, state.velocity.y, state.velocity.z] : null,
                    q: [state.quaternion.x, state.quaternion.y, state.quaternion.z, state.quaternion.w]
                };

                // Only include properties that changed
                if (!prev || prev.hp !== state.hp) delta.hp = state.hp;
                if (!prev || prev.boost !== state.boost) delta.boost = state.boost;
                if (!prev || prev.type !== state.type) delta.type = state.type;
                if (!prev || prev.isShielded !== state.isShielded) delta.isShielded = state.isShielded;
                if (!prev || prev.isGhost !== state.isGhost) delta.isGhost = state.isGhost;
                if (!prev || prev.isJuggernaut !== state.isJuggernaut) delta.isJuggernaut = state.isJuggernaut;

                // New player? Include all static data
                if (!prev) {
                    delta.maskType = state.maskType;
                    delta.color = state.color;
                    delta.name = state.name;
                    delta.isCPU = state.isCPU;
                }

                // Always include race progress for race position calculations
                delta.lapsCompleted = state.lapsCompleted;
                delta.waypointIndex = state.waypointIndex;
                delta.raceProgress = state.raceProgress;

                deltaState.players[id] = delta;

                // Update cache
                if (prev) {
                    prev.hp = state.hp;
                    prev.boost = state.boost;
                    prev.type = state.type;
                    prev.isShielded = state.isShielded;
                    prev.isGhost = state.isGhost;
                    prev.isJuggernaut = state.isJuggernaut;
                }
            }

            io.emit('worldState', deltaState);
        }

        // Clean up stale entries from previous state cache
        for (const id of previousPlayerState.keys()) {
            if (!worldStatePool.players[id]) {
                previousPlayerState.delete(id);
            }
        }
    } catch (error) {
        console.error('[GAMELOOP] Error in game loop:', error.message);
        console.error(error.stack);
    }
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
