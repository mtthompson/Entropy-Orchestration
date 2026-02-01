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
const DAMAGE_THRESHOLD = 20; // Increased from 15 to make it harder to kill
const MAX_SPEED = 210; // Slightly increased
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
const WALL_THICKNESS = 0.8; // Thin walls (match renderer visuals)

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
            const wallHeight = wall.height ?? 5;

            const wallBody = new CANNON.Body({
                mass: 0,
                shape: new CANNON.Box(new CANNON.Vec3(length / 2, wallHeight / 2, WALL_THICKNESS / 2)),
                position: new CANNON.Vec3(centerX, wallHeight / 2, centerZ),
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

// Helper to broadcast track data to all clients (or a specific socket)
function broadcastTrackData(target = io) {
    if (!activeTrack) return;

    target.emit('trackData', {
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

    target.emit('trackStyle', {
        trackId: activeTrack.id,
        trackName: activeTrack.name,
        theme: getThemeByTrackId(activeTrack.id)
    });
}

// Select random track - now just swaps pre-built walls instead of creating new ones
function selectRandomTrack() {
    activeTrack = getRandomTrack();
    console.log(`[TRACK] Selected: ${activeTrack.name}`);
    activateTrackWalls(activeTrack.id);
    createTerrainHeightfield(); // Update terrain for new track

    // Broadcast to all clients so visuals match physics
    broadcastTrackData();
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

    // Skip heightfield creation - using flat ground plane only
    console.log('[TERRAIN] Using flat ground plane (no heightfield)');

    // Update wall positions to match terrain height
    updateWallPositions();
}

// Update wall positions to flat ground level
function updateWallPositions() {
    // Place all walls at fixed height - no terrain matching
    for (const wall of trackWalls) {
        let wallHeight = 5;
        // Keep rotation flat - only Y axis rotation for direction
        const wallData = activeTrack.boundaries.find(w =>
            Math.abs((w.x1 + w.x2) / 2 - wall.position.x) < 0.5 &&
            Math.abs((w.z1 + w.z2) / 2 - wall.position.z) < 0.5
        );
        if (wallData) {
            wallHeight = wallData.height ?? 5;
            const angle = Math.atan2(wallData.z2 - wallData.z1, wallData.x2 - wallData.x1);
            wall.quaternion.setFromEuler(0, -angle, 0); // No slope
        }
        wall.position.y = wallHeight / 2; // Fixed height at wallHeight / 2
    }
    console.log(`[WALLS] Set ${trackWalls.length} walls to flat ground level (Y=height/2)`);
}

// Get spawn height at position (flat ground)
function getSpawnHeight(x, z) {
    return 1.2; // Fixed height above flat ground
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
    const margin = 10;

    // Start with floorSize if available (preferred visual ground bounds)
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;

    if (activeTrack?.floorSize) {
        const halfW = activeTrack.floorSize.width / 2;
        const halfD = activeTrack.floorSize.depth / 2;
        minX = Math.min(minX, -halfW);
        maxX = Math.max(maxX, halfW);
        minZ = Math.min(minZ, -halfD);
        maxZ = Math.max(maxZ, halfD);
    }

    // Expand to include walls (their endpoints) and account for wall thickness
    if (activeTrack?.boundaries?.length) {
        for (const wall of activeTrack.boundaries) {
            minX = Math.min(minX, wall.x1, wall.x2 - 0);
            maxX = Math.max(maxX, wall.x1, wall.x2 + 0);
            minZ = Math.min(minZ, wall.z1, wall.z2 - 0);
            maxZ = Math.max(maxZ, wall.z1, wall.z2 + 0);
        }
    }

    // Fallback to powerupBounds if nothing else
    if (!isFinite(minX) || !isFinite(minZ)) {
        const bounds = activeTrack.powerupBounds || { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };
        minX = bounds.minX;
        maxX = bounds.maxX;
        minZ = bounds.minZ;
        maxZ = bounds.maxZ;
    }

    return {
        minX: minX - margin - WALL_THICKNESS,
        maxX: maxX + margin + WALL_THICKNESS,
        minZ: minZ - margin - WALL_THICKNESS,
        maxZ: maxZ + margin + WALL_THICKNESS
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
        body.angularVelocity.set(0, 0, 0);
        const respawnYaw = spawn.rotation || 0;
        body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), respawnYaw);
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

        // Spawn CPUs slightly behind players to prevent instant collision
        const xOffset = ((i % 2) * 2 - 1) * (4 + Math.floor(i / 2) * 3); // Spaced out laterally
        const zOffset = -5 - (i * 8); // Start 5 units back, 8 apart (prevents starting behind finish line)
        const spawnY = getSpawnHeight(spawn.x + xOffset, spawn.z + zOffset);

        const body = new CANNON.Body({
            mass: 50,
            shape: new CANNON.Sphere(1.5), // Increased from 1.0
            position: new CANNON.Vec3(spawn.x + xOffset, spawnY, spawn.z + zOffset),
            linearDamping: 0.1, // Increased from 0.05 for better stability
            angularDamping: 0.5, // Increased from 0.0 for better stability
            allowSleep: false,
            material: carMaterial,
            ccdSpeedThreshold: 15, // Only use CCD at high speeds
            ccdIterations: 3
        });
        body.angularFactor.set(0, 1, 0); // Lock X/Z rotation (prevent rolling)
        body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), spawn.rotation || 0);

        world.addBody(body);
        cpu.body = body;

        // Initialize waypointIndex to 0 for all CPUs at start
        cpu.waypointIndex = 0;

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
        let CPU_MAX_SPEED = 85; // Faster than player (70) but not insane
        if (cpu.maskType === 'Skull') CPU_MAX_SPEED *= 1.1; // Skull mask bonus

        if (cpuSpeed > CPU_MAX_SPEED) {
            cpu.body.velocity.scale(CPU_MAX_SPEED / cpuSpeed, cpu.body.velocity);
        }

        // Enforce boundaries - reset waypoints if teleported
        if (enforceBoundaries(cpu.body)) {
            cpu.waypointIndex = 0;
            cpu.speed = 0;
        }
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

                // Arcade steering logic for CPU
                const steerStrength = 1.5;
                let desiredSteer = angleDiff * steerStrength;

                // Combat AI: detect nearby targets for ramming
                let combatBoost = 1.0;
                const combatRange = 25;
                const combatChance = isRacing ? 0.3 : 0.6;

                if (Math.random() < combatChance) {
                    for (const [pId, player] of players) {
                        if (player.type !== 'driver' || !player.body) continue;
                        const pDist = cpu.body.position.distanceTo(player.body.position);
                        if (pDist < combatRange) {
                            const toDx = player.body.position.x - pos.x;
                            const toDz = player.body.position.z - pos.z;
                            const toAngle = Math.atan2(toDx, -toDz);
                            const aimDiff = Math.abs(normalizeAngle(toAngle - currentAngle));
                            if (aimDiff < Math.PI / 6) {
                                combatBoost = 1.3;
                                break;
                            }
                        }
                    }
                }

                // Set input for unified physics
                cpu.input = {
                    steering: Math.max(-1, Math.min(1, desiredSteer)),
                    throttle: 1.0,
                    boost: combatBoost > 1.0
                };

                // Combat AI: fire at targets
                if (cpu.ammo > 0 && Math.random() < 0.02) {
                    for (const [pId, player] of players) {
                        if (player.type !== 'driver' || !player.body) continue;
                        const pDist = cpu.body.position.distanceTo(player.body.position);
                        if (pDist < 40) {
                            const toDx = player.body.position.x - pos.x;
                            const toDz = player.body.position.z - pos.z;
                            const toAngle = Math.atan2(toDx, -toDz);
                            const aimDiff = Math.abs(normalizeAngle(toAngle - currentAngle));
                            if (aimDiff < Math.PI / 8) {
                                // FIRE!
                                cpu.ammo--;
                                const forward = new CANNON.Vec3(0, 0, -1);
                                cpu.body.quaternion.vmult(forward, forward);
                                const projPos = {
                                    x: cpu.body.position.x + forward.x * 2.5,
                                    y: cpu.body.position.y,
                                    z: cpu.body.position.z + forward.z * 2.5
                                };
                                const projType = cpu.weaponType || 'laser';
                                createProjectile(cpu.id, projType, projPos, { x: forward.x, z: forward.z });
                                io.emit('projectileFired', {
                                    ownerId: cpu.id,
                                    position: projPos,
                                    direction: { x: forward.x, z: forward.z },
                                    type: projType
                                });
                            }
                        }
                    }
                }

                updatePlayerPhysics(cpu, cpu.input);
            } else {
                // If stopped/stuck, just idle
                cpu.input = { steering: 0, throttle: 0, boost: false };
                updatePlayerPhysics(cpu, cpu.input);
            }

            // CRITICAL: Clamp CPU velocity to prevent passing through walls
            const cpuSpeed = cpu.body.velocity.length();
            let CPU_MAX_SPEED = 85; // Faster than player (70) but not insane
            if (cpu.maskType === 'Skull') CPU_MAX_SPEED *= 1.1; // Skull mask bonus

            if (cpuSpeed > CPU_MAX_SPEED) {
                cpu.body.velocity.scale(CPU_MAX_SPEED / cpuSpeed, cpu.body.velocity);
            }

            // Enforce boundaries for CPU too - reset waypoints if teleported
            if (enforceBoundaries(cpu.body)) {
                cpu.waypointIndex = 0;
                cpu.speed = 0;
            }
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
        angularDamping: 0.6, // Reduced for more responsive turning
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

    // Get current speed (cache per player for stable arcade control)
    const bodySpeed = player.body.velocity.length();
    if (typeof player.speed !== 'number') {
        player.speed = bodySpeed;
    }
    const speed = player.speed;

    // 1. ARCADE STEERING - cached yaw for stable, strong turning
    const baseTurnRate = 10.0; // radians per second (half strength)
    const speedDampen = 1 / (1 + speed * 0.004); // minimal damping at speed
    const lowSpeedBoost = Math.min(1, speed / 3); // reduce steering when nearly stopped
    const steerRate = baseTurnRate * speedDampen * (0.35 + 0.65 * lowSpeedBoost);

    if (typeof player.yaw !== 'number') {
        const initialForward = new CANNON.Vec3(0, 0, -1);
        player.body.quaternion.vmult(initialForward, initialForward);
        player.yaw = Math.atan2(initialForward.x, -initialForward.z);
    }

    const maxYawStep = 0.3; // radians per tick (half step)
    let yawDelta = -steering * steerRate * timestep;
    if (yawDelta > maxYawStep) yawDelta = maxYawStep;
    if (yawDelta < -maxYawStep) yawDelta = -maxYawStep;
    player.yaw += yawDelta;
    player.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), player.yaw);
    player.body.angularVelocity.y = 0;

    // 2. Calculate Forward Direction based on updated rotation
    const forward = new CANNON.Vec3(0, 0, -1);
    player.body.quaternion.vmult(forward, forward);
    forward.normalize();

    // 3. Arcade Drive: target-speed approach and direct velocity alignment
    const baseMaxSpeed = 70 * maxSpeedMod;
    let targetSpeed = throttle * baseMaxSpeed;

    let accelRate = 95;
    let brakeRate = 140;
    let coastRate = 60;

    if (boost && player.boost > 0) {
        targetSpeed *= 1.35;
        accelRate *= 1.25;
        player.boost = Math.max(0, player.boost - 1.0); // Increased consumption (was 0.8)
    } else {
        player.boost = Math.min(100, player.boost + 0.4 * boostRegenMod); // Increased regen (was 0.3)
    }

    if (throttle > 0.01) {
        if (player.speed < targetSpeed) {
            player.speed = Math.min(targetSpeed, player.speed + accelRate * timestep);
        } else {
            player.speed = Math.max(targetSpeed, player.speed - brakeRate * timestep);
        }
    } else {
        player.speed = Math.max(0, player.speed - coastRate * timestep);
    }

    const desiredVelX = forward.x * player.speed;
    const desiredVelZ = forward.z * player.speed;
    player.body.velocity.x = player.body.velocity.x + (desiredVelX - player.body.velocity.x) * blend;
    player.body.velocity.z = player.body.velocity.z + (desiredVelZ - player.body.velocity.z) * blend;

    // Boundary enforcement - reset waypoints if teleported
    if (enforceBoundaries(player.body)) {
        player.waypointIndex = 0;
        player.speed = 0;
    }

    // 5. Speed cap to prevent runaway (modified by mask/boost)
    const maxSpeed = Math.max(baseMaxSpeed, targetSpeed);
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
            if (dist < 3.2) { // Overlapping spheres (Increased from 2.2 for 1.5x scale)
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

            // Ghost Logic
            if (player.isGhost || cpu.isGhost) continue;

            const dist = player.body.position.distanceTo(cpu.body.position);
            if (dist < 3.2) { // Overlapping spheres (Increased from 2.2 for 1.5x scale)
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

            // Ghost Logic
            if (cpu1.isGhost || cpu2.isGhost) continue;

            const dist = cpu1.body.position.distanceTo(cpu2.body.position);
            if (dist < 3.2) { // Overlapping spheres (Increased from 2.2 for 1.5x scale)
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

// =============================================================================
// OBJECT POOLING
// =============================================================================
const powerupPool = [];
const trapPool = [];
const MAX_POOL_SIZE = 20;

function initObjectPools() {
    console.log(`[POOL] Initializing object pools (Size: ${MAX_POOL_SIZE})`);
    for (let i = 0; i < MAX_POOL_SIZE; i++) {
        // Powerup pool
        const pBody = new CANNON.Body({
            mass: 0,
            shape: new CANNON.Sphere(1.5),
            isTrigger: true
        });
        powerupPool.push(pBody);

        // Trap pool
        const tBody = new CANNON.Body({
            mass: 0,
            shape: new CANNON.Box(new CANNON.Vec3(1, 0.5, 1))
        });
        trapPool.push(tBody);
    }
}

initObjectPools();

function spawnPowerup() {
    // Prevent accumulation - cap at MAX_POWERUPS
    if (powerups.size >= MAX_POWERUPS) {
        console.log(`[POWERUP] Max powerups (${MAX_POWERUPS}) reached, skipping spawn`);
        return;
    }

    if (powerupPool.length === 0) {
        console.warn(`[POWERUP] Pool exhausted, skipping spawn`);
        return;
    }

    const id = uuidv4();
    const type = EXTENDED_POWERUP_TYPES[Math.floor(Math.random() * EXTENDED_POWERUP_TYPES.length)];

    // Get random position on track
    if (!activeTrack) return;
    const pos = getRandomPointOnTrack(activeTrack);
    const x = pos.x;
    const z = pos.z;
    const y = getSpawnHeight(x, z) + 0.5; // Slightly above ground

    // Get body from pool
    const body = powerupPool.pop();
    body.position.set(x, y, z);
    world.addBody(body);

    powerups.set(id, { body, type, position: { x, y, z }, spawnTime: Date.now() });

    console.log(`[POWERUP] Spawned ${type} at (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}) [${powerups.size}/${MAX_POWERUPS}]`);

    // Auto-expire after POWERUP_LIFETIME
    setTimeout(() => {
        if (powerups.has(id)) {
            const p = powerups.get(id);
            world.removeBody(p.body);
            powerupPool.push(p.body); // Return to pool
            powerups.delete(id);
            console.log(`[POWERUP] Expired ${type} [${powerups.size}/${MAX_POWERUPS}]`);
        }
    }, POWERUP_LIFETIME);
}

function checkPowerupCollisions() {
    for (const [pId, powerup] of powerups) {
        for (const [playerId, player] of players) {
            if (player.type !== 'driver' || !player.body || !powerup.body) continue;

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
                if (powerupPool.length < MAX_POOL_SIZE) {
                    powerupPool.push(powerup.body); // Return to pool
                }
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

    if (trapPool.length === 0) {
        console.warn(`[TRAP] Pool exhausted, skipping spawn`);
        return;
    }

    const id = uuidv4();

    const body = trapPool.pop();
    body.position.set(x, 0.5, z);
    world.addBody(body);
    traps.set(id, { body, ownerId, position: { x, y: 0.5, z } });

    console.log(`[TRAP] Drone ${ownerId} placed trap at (${x.toFixed(1)}, ${z.toFixed(1)}) [${traps.size}/${MAX_TRAPS}]`);

    // Remove trap after 10 seconds
    setTimeout(() => {
        if (traps.has(id)) {
            const t = traps.get(id);
            world.removeBody(t.body);
            trapPool.push(t.body); // Return to pool
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

    // Update physics walls and broadcast to clients
    activateTrackWalls(activeTrack.id);
    createTerrainHeightfield();
    broadcastTrackData();

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
        activateTrackWalls(activeTrack.id);
    }

    // Reset game BEFORE countdown starts so players are moved to spawn points immediately
    // Fixes the "teleporting at start" issue
    resetGame();

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

    // resetGame() removed from here - now called in startCountdown()

    // Emit track music style
    if (activeTrack) {
        io.emit('trackStyle', {
            trackId: activeTrack.id,
            trackName: activeTrack.name,
            theme: getThemeByTrackId(activeTrack.id)
        });
    }

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
        player.speed = 0;

        // Create new body
        const spawnIndex = spawnCounter % activeTrack.spawnPoints.length;
        const spawnPoint = activeTrack.spawnPoints[spawnIndex];
        const spawnX = spawnPoint.x + (Math.random() - 0.5) * 5;
        const spawnZ = spawnPoint.z + (Math.random() - 0.5) * 5;
        player.yaw = spawnPoint.rotation || 0;

        createPlayerBody(player, spawnX, spawnZ, spawnPoint.rotation || 0);
        spawnCounter++;

        io.to(id).emit('joined', {
            id: id,
            color: player.color, // Keep color
            hp: 100
        });
    }

    // Clear powerups and traps
    for (const [id, p] of powerups) {
        world.removeBody(p.body);
        powerupPool.push(p.body);
    }
    powerups.clear();
    for (const [id, t] of traps) {
        world.removeBody(t.body);
        trapPool.push(t.body);
    }
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
        shape: new CANNON.Sphere(1.5), // Increased from 1.0 for better visibility/presence
        position: new CANNON.Vec3(x, spawnY, z),
        linearDamping: 0.1, // Added damping to reduce judder
        angularDamping: 0.5, // Added damping to reduce erratic spinning
        allowSleep: false,
        material: carMaterial,
        ccdSpeedThreshold: 15, // Only use CCD at high speeds for performance
        ccdIterations: 3
    });
    body.angularFactor.set(0, 1, 0); // Lock X/Z rotation (prevent rolling)

    // Apply spawn rotation
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotation);
    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);

    world.addBody(body);
    player.body = body;
    player.speed = 0;
    player.yaw = rotation;
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

    // Send track data to all clients on connection (visuals, physics orientation, terrain)
    broadcastTrackData(socket);

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
                broadcastTrackData();
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

            // Only process input during RACING or COUNTDOWN states
            if (gameState !== 'RACING' && gameState !== 'COUNTDOWN') {
                return;
            }

            // Clamp inputs to valid ranges
            const clampedSteering = Math.max(-1, Math.min(1, steering || 0));
            const clampedThrottle = Math.max(0, Math.min(1, throttle || 0));
            const clampedBoost = !!boost;

            // Store input for game loop processing (no duplicate force application)
            player.input = { steering: clampedSteering, throttle: clampedThrottle, boost: clampedBoost };
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
const FULL_STATE_INTERVAL = 120; // Send full state every 120 ticks (2 seconds)
const previousPlayerState = new Map(); // Track previous values for delta detection

// Pre-allocated world state object to avoid GC pressure
const worldStatePool = {
    players: {},
    powerups: {},
    traps: {},
    projectiles: {}
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
        if (gameState === 'RACING' || gameState === 'DEMO' || gameState === 'COUNTDOWN') {
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
                if (player.type === 'driver' && player.body) {
                    // Use neutral input if no input yet or in countdown (if we want to prevent early start)
                    // But typically we want physics to run even if idle.
                    const input = player.input || { steering: 0, throttle: 0, boost: false };
                    updatePlayerPhysics(player, input);
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
                    player.speed = 0;
                    if (player.body && player.body.quaternion) {
                        const fwd = new CANNON.Vec3(0, 0, -1);
                        player.body.quaternion.vmult(fwd, fwd);
                        player.yaw = Math.atan2(fwd.x, -fwd.z);
                    } else {
                        player.yaw = 0;
                    }
                    player.body.angularVelocity.set(0, 0, 0);
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
                if (!state.position) state.position = { x: 0, y: 0, z: 0 };
                if (!state.velocity) state.velocity = { x: 0, y: 0, z: 0 };
                if (!state.quaternion) state.quaternion = { x: 0, y: 0, z: 0, w: 1 };

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
                state.quaternion = null;
            }

            state.hp = Math.floor(player.hp);
            state.type = player.type;
            state.maskType = player.maskType;
            state.color = player.color;
            state.name = player.name;
            state.boost = Math.floor(player.boost);
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
                if (!state.position) state.position = { x: 0, y: 0, z: 0 };
                if (!state.velocity) state.velocity = { x: 0, y: 0, z: 0 };
                if (!state.quaternion) state.quaternion = { x: 0, y: 0, z: 0, w: 1 };

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
                state.quaternion = null;
            }

            state.hp = Math.floor(cpu.hp);
            state.type = cpu.type;
            state.maskType = cpu.maskType || 'Classic';
            state.color = cpu.color;
            state.name = cpu.name;
            state.boost = Math.floor(cpu.boost || 100);
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

        // Clear and rebuild projectiles
        worldStatePool.projectiles = {};
        for (const [id, proj] of projectiles) {
            worldStatePool.projectiles[id] = {
                position: { x: proj.body.position.x, y: proj.body.position.y, z: proj.body.position.z },
                velocity: { x: proj.body.velocity.x, y: proj.body.velocity.y, z: proj.body.velocity.z },
                type: proj.type,
                ownerId: proj.ownerId
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
                traps: worldStatePool.traps,
                projectiles: worldStatePool.projectiles
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
                traps: worldStatePool.traps,
                projectiles: worldStatePool.projectiles
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

                // Only include race progress if it changed significantly (every waypoint or lap)
                if (!prev || prev.raceProgress !== state.raceProgress) {
                    delta.lapsCompleted = state.lapsCompleted;
                    delta.waypointIndex = state.waypointIndex;
                    delta.raceProgress = state.raceProgress;
                }

                // New player? Include all static data
                if (!prev) {
                    delta.maskType = state.maskType;
                    delta.color = state.color;
                    delta.name = state.name;
                    delta.isCPU = state.isCPU;
                }

                deltaState.players[id] = delta;

                // Update cache
                if (prev) {
                    prev.hp = state.hp;
                    prev.boost = state.boost;
                    prev.type = state.type;
                    prev.isShielded = state.isShielded;
                    prev.isGhost = state.isGhost;
                    prev.isJuggernaut = state.isJuggernaut;
                    prev.raceProgress = state.raceProgress;
                } else {
                    // New player: Add to cache so we can do deltas next tick
                    previousPlayerState.set(id, {
                        hp: Math.floor(state.hp),
                        boost: Math.floor(state.boost),
                        type: state.type,
                        isShielded: state.isShielded,
                        isGhost: state.isGhost,
                        isJuggernaut: state.isJuggernaut,
                        raceProgress: state.raceProgress
                    });
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

        // DEBUG: Emit actual physics wall positions occasionally (e.g., every 60 ticks = 1s)
        if (tickCounter % 60 === 0) {
            const debugWalls = trackWalls.map(w => ({
                position: { x: w.position.x, y: w.position.y, z: w.position.z },
                quaternion: { x: w.quaternion.x, y: w.quaternion.y, z: w.quaternion.z, w: w.quaternion.w },
                halfExtents: { x: w.shapes[0].halfExtents.x, y: w.shapes[0].halfExtents.y, z: w.shapes[0].halfExtents.z }
            }));
            io.emit('debugWallPositions', debugWalls);
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
