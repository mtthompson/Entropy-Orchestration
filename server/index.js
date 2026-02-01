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
// Initialize workers on startup if running directly
if (require.main === module) {
    initializeWorkerPools();
}

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

const LAPS_TO_WIN = 3;

const EXTENDED_POWERUP_TYPES = ['Repair', 'Repair', 'Boost', 'Boost', 'Shield', 'Ghost', 'Juggernaut', 'Weapon', 'Weapon', '67Meme'];

const projectilePool = [];
const powerupPool = [];
const trapPool = [];
const MAX_POOL_SIZE = 20;
const MAX_PROJECTILE_POOL_SIZE = 50;

function initObjectPools() {
    console.log(`[POOL] Initializing object pools (Size: ${MAX_POOL_SIZE}, Projectiles: ${MAX_PROJECTILE_POOL_SIZE})`);
    for (let i = 0; i < MAX_POOL_SIZE; i++) {
        // Powerup pool
        const pBody = new CANNON.Body({
            mass: 0,
            shape: new CANNON.Sphere(1.5),
            isTrigger: true,
            position: new CANNON.Vec3(0, -500, 0), // Start in void
            collisionResponse: false
        });
        world.addBody(pBody); // Pre-add to world
        powerupPool.push(pBody);

        // Trap pool
        const tBody = new CANNON.Body({
            mass: 0,
            shape: new CANNON.Box(new CANNON.Vec3(1, 0.5, 1)),
            position: new CANNON.Vec3(0, -500, 0), // Start in void
            collisionResponse: false
        });
        world.addBody(tBody); // Pre-add to world
        trapPool.push(tBody);
    }

    // Projectile pool
    for (let i = 0; i < MAX_PROJECTILE_POOL_SIZE; i++) {
        const body = new CANNON.Body({
            mass: 1,
            shape: new CANNON.Sphere(0.3),
            linearDamping: 0,
            angularDamping: 0,
            position: new CANNON.Vec3(0, -500, 0),
            collisionResponse: false
        });
        world.addBody(body); // Pre-add to world
        projectilePool.push(body);
    }
}



// =============================================================================
// CONFIGURATION
// =============================================================================
const PORT = process.env.PORT || 3000;
const TICK_RATE = 60;
const DAMAGE_THRESHOLD = 20; // Increased from 15 to make it harder to kill
const MAX_SPEED = 250; // Increased from 210
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

initObjectPools();

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
        startLine: activeTrack.startLine, // Send start line to client
        // Floor polygons for rendering distinct track/arena surface
        floorPolygon: activeTrack.floorPolygon,
        outerPolygon: activeTrack.outerPolygon,
        innerPolygon: activeTrack.innerPolygon,
        radius: activeTrack.radius,
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
        // Pre-spawn some powerups for performance warm-up
        spawnInitialPowerups(8);
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
            isCPU: true, // Distinct from 'type' for some logic
            waypointIndex: 0, // Will be updated based on spawn position
            boost: 100,
            lapsCompleted: 0,
            lastWaypointIndex: 0,
            maskType: MASK_TYPES[Math.floor(Math.random() * MASK_TYPES.length)]
        };

        // LOCAL SPACE OFFSET CALCULATION
        // Determine offsets relative to the spawn direction (rotation)
        // Lateral offset: alternate left/right
        const lateralOffset = ((i % 2) * 2 - 1) * (4 + Math.floor(i / 2) * 3);
        // Backward offset: stagger them back so they don't spawn on top of each other
        // -5 units initial setback, then 8 units per pair
        const backwardOffset = 5 + (i * 8); // Positive means "back" if we subtract Forward

        // Calculate rotation components
        const yaw = spawn.rotation || 0;

        // Forward vector (approximate)
        // In this game's coord system: 0 rot usually means +Z or something.
        // Let's rely on standard trig: x=sin, z=cos for Forward vector if Y-rot is yaw.
        const forwardX = Math.sin(yaw);
        const forwardZ = Math.cos(yaw);

        // Right vector (90 deg clockwise)
        const rightX = Math.cos(yaw); // sin(yaw + PI/2)
        const rightZ = -Math.sin(yaw); // cos(yaw + PI/2)

        // Final World Position
        // Move laterally along Right vector
        // Move backward (negative Forward) along Forward vector
        // We subtract backwardOffset * Forward
        const finalX = spawn.x + (rightX * lateralOffset) - (forwardX * backwardOffset);
        const finalZ = spawn.z + (rightZ * lateralOffset) - (forwardZ * backwardOffset);

        const spawnY = getSpawnHeight(finalX, finalZ);

        const body = new CANNON.Body({
            mass: 50,
            shape: new CANNON.Sphere(1.5), // Increased from 1.0
            position: new CANNON.Vec3(finalX, spawnY, finalZ),
            linearDamping: 0.1, // Increased from 0.05 for better stability
            angularDamping: 0.5, // Increased from 0.0 for better stability
            allowSleep: false,
            material: carMaterial,
            ccdSpeedThreshold: 15, // Only use CCD at high speeds
            ccdIterations: 3
        });
        body.angularFactor.set(0, 1, 0); // Lock X/Z rotation (prevent rolling)
        body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw);

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
            waypointIndex: cpu.waypointIndex || 0,
            lapsCompleted: cpu.lapsCompleted || 0
        });
    }

    if (cpuList.length === 0) return;

    // Calculate Race Positions for Rubberbanding
    const raceStandings = [];
    if (activeTrack.type === 'race') {
        // Collect all racers
        for (const [id, player] of players) {
            if (player.type === 'driver' && player.hp > 0) {
                raceStandings.push({ id, laps: player.lapsCompleted || 0, wp: player.waypointIndex || 0 });
            }
        }
        for (const [id, cpu] of cpuPlayers) {
            if (cpu.body && cpu.hp > 0) {
                raceStandings.push({ id, laps: cpu.lapsCompleted || 0, wp: cpu.waypointIndex || 0 });
            }
        }
        // Sort: High laps first, then high waypoints
        raceStandings.sort((a, b) => {
            if (a.laps !== b.laps) return b.laps - a.laps;
            return b.wp - a.wp;
        });
    }

    // Attach rank to cpuList
    for (const cpu of cpuList) {
        const rankIdx = raceStandings.findIndex(r => r.id === cpu.id);
        cpu.rank = rankIdx !== -1 ? rankIdx + 1 : 1;
        cpu.totalRacers = raceStandings.length || 1;
    }

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
    // Add Powerups
    for (const [id, powerup] of powerups) {
        // Skip if body missing or in void (pooled)
        if (!powerup.body || powerup.body.position.y < -100) continue;
        allEntities.push({
            id,
            position: { x: powerup.body.position.x, z: powerup.body.position.z },
            isPowerup: true
        });
    }

    // Submit async calculation (result stored in pendingCpuResults)
    pendingCpuResults = cpuWorkerPool.submit('calculateCpuBatch', {
        cpuList,
        trackPath: activeTrack.path || null,
        trackType: activeTrack.type,
        trackBounds: activeTrack.powerupBounds || { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
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

        // Use standard physics update for CPUs
        updatePlayerPhysics(cpu, result.input);

        // Firing logic from worker
        if (result.fire && cpu.ammo > 0) {
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
            let CPU_MAX_SPEED = 230; // Increased from 110 (Player is 220)
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
// =============================================================================
// PROJECTILE SYSTEM
// =============================================================================
function createProjectile(ownerId, type, position, direction) {
    const projId = `proj_${projectileIdCounter++}`;

    const speed = type === 'missile' ? 80 : 120; // Missiles slower but stronger
    const damage = type === 'missile' ? 40 : 20;

    let body;
    let fromPool = false;

    if (projectilePool.length > 0) {
        body = projectilePool.pop();
        body.position.set(position.x, position.y, position.z);
        body.velocity.set(direction.x * speed, 0, direction.z * speed);
        body.angularVelocity.set(0, 0, 0);
        body.quaternion.set(0, 0, 0, 1);
        body.wakeUp();
        body.collisionResponse = true; // Enable collisions
        fromPool = true;
        // Already in world
    } else {
        body = new CANNON.Body({
            mass: 1,
            shape: new CANNON.Sphere(0.3),
            position: new CANNON.Vec3(position.x, position.y, position.z),
            linearDamping: 0,
            angularDamping: 0
        });
        body.velocity.set(direction.x * speed, 0, direction.z * speed);
        world.addBody(body); // Add new body to world
    }

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
            const proj = projectiles.get(projId);

            // "Remove" to void
            proj.body.position.set(0, -500, 0);
            proj.body.collisionResponse = false;

            projectiles.delete(projId);

            // Return to pool
            if (projectilePool.length < MAX_PROJECTILE_POOL_SIZE) {
                projectilePool.push(proj.body);
            } else {
                // If pool full (e.g. from fallback creation), actually remove it?
                // For now, just keep in void or remove if really overflow.
                // But passive pooling assumes fixed pool size usually.
                // If we created extra, we should probably remove them to avoid leak?
                // Let's stick to simple "push back" but maybe check if we want to grow pool?
                // If pool is full, it means we have plenty. If we created a new one, maybe we should delete it.
                // But mixing pooled and non-pooled is tricky.
                // Simplest: Just push it back. If pool grows beyond initial size, it's fine, it handles load.
                projectilePool.push(proj.body);
            }
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

                // Remove projectile ("to void")
                proj.body.position.set(0, -500, 0);
                proj.body.collisionResponse = false;

                projectiles.delete(projId);

                projectilePool.push(proj.body);

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

                // Remove projectile ("to void")
                proj.body.position.set(0, -500, 0);
                proj.body.collisionResponse = false;

                projectiles.delete(projId);

                projectilePool.push(proj.body);

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

    const timestep = 1 / TICK_RATE;
    if (Math.random() < 0.01) {
        console.log(`[PHYSICS_DEBUG] ID: ${player.id} Type: ${player.type} Pos: ${player.body.position.x.toFixed(2)},${player.body.position.z.toFixed(2)} Input: S=${input.steering.toFixed(2)} Th=${input.throttle.toFixed(2)} Timestep: ${timestep}`);
    }

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
    const baseMaxSpeed = 220 * maxSpeedMod; // Increased from 100
    let targetSpeed = throttle * baseMaxSpeed;

    let accelRate = 220; // Increased from 130
    let brakeRate = 250; // Increased from 160
    let coastRate = 100; // Increased from 70

    // Boost Logic - consume when input is true and boost > 0
    let isBoosting = false;

    if (boost && player.boost > 0) {
        isBoosting = true;
        const oldBoost = player.boost;
        player.boost = Math.max(0, player.boost - 1.0);
        // if (Math.random() < 0.05) console.log(`[DEBUG_PHYSICS] ${ player.name } Decreasing: ${ oldBoost.toFixed(1) } -> ${ player.boost.toFixed(1) } `);
    } else {
        // Debug why not boosting if input is true
        if (boost && player.boost >= 100) {
            // Suppress spam, but log once/sec or random
            if (Math.random() < 0.01) console.log(`[PHYSICS] Input = True but isBoosting = False.Boost = ${player.boost.toFixed(1)} `);
        }
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
    const blend = player.isCPU ? 0.08 : 0.1; // Slightly stiffer for CPUs
    player.body.velocity.x = player.body.velocity.x + (desiredVelX - player.body.velocity.x) * blend;
    player.body.velocity.z = player.body.velocity.z + (desiredVelZ - player.body.velocity.z) * blend;

    // =============================================
    // FINAL SAFETY: CLAMP SPEED AND BOUNDARIES
    // =============================================
    const currentSpeed = player.body.velocity.length();
    let maxSpeedValue = player.isCPU ? 230 : 220; // Standardize base speeds (CPU slightly faster)
    if (maskType === 'Skull') maxSpeedValue *= 1.1;

    if (currentSpeed > maxSpeedValue) {
        player.body.velocity.scale(maxSpeedValue / currentSpeed, player.body.velocity);
    }

    if (enforceBoundaries(player.body)) {
        player.speed = 0;
        if (player.isCPU) {
            player.waypointIndex = 0;
        }
        if (player.body && player.body.quaternion) {
            const fwd = new CANNON.Vec3(0, 0, -1);
            player.body.quaternion.vmult(fwd, fwd);
            player.yaw = Math.atan2(fwd.x, -fwd.z);
        } else {
            player.yaw = 0;
        }
        player.body.angularVelocity.set(0, 0, 0);
        if (!player.isCPU) {
            io.to(player.id).emit('respawned', { reason: 'out_of_bounds' });
        }
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
    player.activePowerup = { type, duration: durationMs, startTime: Date.now() };

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
    // Reusable temporary vectors to reduce GC
    const relVel = new CANNON.Vec3();
    const v1to2 = new CANNON.Vec3();
    const p1Forward = new CANNON.Vec3();
    const p2Forward = new CANNON.Vec3();
    const pForward = new CANNON.Vec3();
    const cForward = new CANNON.Vec3();
    const f1 = new CANNON.Vec3();
    const f2 = new CANNON.Vec3();
    const DAMAGE_COOLDOWN_MS = 500;

    // --- WALL COLLISION DETECTION ---
    for (const [id, player] of players) {
        if (!player.body || player.type !== 'driver') continue;

        // Check contacts with walls
        for (const contact of world.contacts) {
            const isPlayerBody = contact.bi === player.body || contact.bj === player.body;
            // Early continue if not involved
            if (!isPlayerBody) continue;

            const otherBody = contact.bi === player.body ? contact.bj : contact.bi;
            const isWall = trackWalls.includes(otherBody);

            if (isWall) {
                // Wall collision detected!
                const impactSpeed = player.body.velocity.length();
                if (impactSpeed > 5) {
                    io.to(id).emit('wallHit', { intensity: Math.min(1, impactSpeed / 20) });
                }
            }
        }
    }

    const now = Date.now();

    // Check collisions between players
    for (const [id1, p1] of players) {
        if (p1.type !== 'driver' || !p1.body) continue;

        for (const [id2, p2] of players) {
            if (id1 >= id2 || p2.type !== 'driver' || !p2.body) continue;

            // Ghost Logic: If either is Ghost, ignore collision
            if (p1.isGhost || p2.isGhost) continue;

            // Check if bodies are colliding
            const dist = p1.body.position.distanceTo(p2.body.position);
            if (dist < 3.2) { // Overlapping spheres

                // Damage Cooldown Check
                if (p1.lastDamageTime && now - p1.lastDamageTime < DAMAGE_COOLDOWN_MS) continue;
                if (p2.lastDamageTime && now - p2.lastDamageTime < DAMAGE_COOLDOWN_MS) continue;

                p1.body.velocity.vsub(p2.body.velocity, relVel);
                const impactSpeed = relVel.length();

                if (impactSpeed > DAMAGE_THRESHOLD) {
                    // Update Cooldowns
                    p1.lastDamageTime = now;
                    p2.lastDamageTime = now;

                    // Cap base damage
                    let damage1 = Math.min(40, Math.floor(impactSpeed * 1.0));
                    let damage2 = Math.min(40, Math.floor(impactSpeed * 1.0));
                    let knockback1 = 1.0;
                    let knockback2 = 1.0;

                    // ONI MASK: 15% damage resistance
                    if (p1.maskType === 'Oni') damage1 *= 0.85;
                    if (p2.maskType === 'Oni') damage2 *= 0.85;

                    // RAMMING LOGIC
                    p2.body.position.vsub(p1.body.position, v1to2);
                    v1to2.normalize();

                    // P1's forward vector
                    p1Forward.set(0, 0, -1);
                    p1.body.quaternion.vmult(p1Forward, p1Forward);

                    // P2's forward vector
                    p2Forward.set(0, 0, -1);
                    p2.body.quaternion.vmult(p2Forward, p2Forward);

                    // Dot products
                    const p1FacingP2 = p1Forward.dot(v1to2);
                    // Reuse v1to2 for negate but be careful, dot doesn't modify. 
                    // v1to2.negate() checks p2 to p1.
                    const p2FacingP1 = p2Forward.dot(v1to2.negate());
                    // Restore v1to2 just in case we need it? No, loop continues.

                    // Check P1 Ramming P2
                    if (p1FacingP2 > 0.7) {
                        damage2 *= 1.2;
                        damage1 *= 0.7;
                        knockback2 = 2.0;
                    }

                    // Check P2 Ramming P1
                    if (p2FacingP1 > 0.7) {
                        damage1 *= 1.2;
                        damage2 *= 0.7;
                        knockback1 = 2.0;
                    }

                    // Juggernaut Logic
                    if (p1.isJuggernaut) { damage1 *= 0.2; damage2 *= 1.5; knockback2 *= 1.5; }
                    if (p2.isJuggernaut) { damage2 *= 0.2; damage1 *= 1.5; knockback1 *= 1.5; }

                    // Shield Logic
                    if (p1.isShielded) damage1 = 0;
                    if (p2.isShielded) damage2 = 0;

                    p1.hp -= Math.floor(damage1);
                    p2.hp -= Math.floor(damage2);

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
            if (dist < 3.2) {
                // Damage Cooldown Check
                if (player.lastDamageTime && now - player.lastDamageTime < DAMAGE_COOLDOWN_MS) continue;
                if (cpu.lastDamageTime && now - cpu.lastDamageTime < DAMAGE_COOLDOWN_MS) continue;

                player.body.velocity.vsub(cpu.body.velocity, relVel);
                const impactSpeed = relVel.length();

                if (impactSpeed > DAMAGE_THRESHOLD) {
                    player.lastDamageTime = now;
                    cpu.lastDamageTime = now;

                    let damageToPlayer = Math.min(40, Math.floor(impactSpeed * 1.0));
                    let damageToCPU = Math.min(40, Math.floor(impactSpeed * 1.0));

                    // ONI MASK
                    if (player.maskType === 'Oni') damageToPlayer *= 0.85;
                    if (cpu.maskType === 'Oni') damageToCPU *= 0.85;

                    // RAMMING LOGIC
                    cpu.body.position.vsub(player.body.position, v1to2);
                    v1to2.normalize();

                    pForward.set(0, 0, -1);
                    player.body.quaternion.vmult(pForward, pForward);

                    cForward.set(0, 0, -1);
                    cpu.body.quaternion.vmult(cForward, cForward);

                    const playerRamming = pForward.dot(v1to2);
                    const cpuRamming = cForward.dot(v1to2.negate());

                    if (playerRamming > 0.7) {
                        damageToPlayer *= 0.7;
                        damageToCPU *= 1.2;
                    }

                    if (cpuRamming > 0.7) {
                        damageToCPU *= 0.7;
                        damageToPlayer *= 1.2;
                    }

                    // Juggernaut and Shield
                    if (player.isJuggernaut) { damageToPlayer *= 0.2; damageToCPU *= 1.5; }
                    if (player.isShielded) damageToPlayer = 0;

                    player.hp -= Math.floor(damageToPlayer);
                    cpu.hp -= Math.floor(damageToCPU);

                    io.to(playerId).emit('damage', { hp: player.hp, damage: damageToPlayer });

                    if (player.hp <= 0) {
                        switchToDrone(playerId);
                        updateLeaderboard(cpu.name, 'kills', 1, true);
                        checkWinCondition();
                    }
                    if (cpu.hp <= 0) {
                        world.removeBody(cpu.body);
                        cpu.body = null;
                        cpu.type = 'eliminated';
                        updateLeaderboard(player.name, 'kills', 1, false);
                        updateLeaderboard(cpu.name, 'deaths', 1, true);
                        checkWinCondition();

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

            if (cpu1.isGhost || cpu2.isGhost) continue;

            const dist = cpu1.body.position.distanceTo(cpu2.body.position);
            if (dist < 3.2) {
                if (cpu1.lastDamageTime && now - cpu1.lastDamageTime < DAMAGE_COOLDOWN_MS) continue;
                if (cpu2.lastDamageTime && now - cpu2.lastDamageTime < DAMAGE_COOLDOWN_MS) continue;

                cpu1.body.velocity.vsub(cpu2.body.velocity, relVel);
                const impactSpeed = relVel.length();

                if (impactSpeed > DAMAGE_THRESHOLD) {
                    cpu1.lastDamageTime = now;
                    cpu2.lastDamageTime = now;

                    let damage1 = Math.min(40, Math.floor(impactSpeed * 1.0));
                    let damage2 = Math.min(40, Math.floor(impactSpeed * 1.0));

                    // RAMMING
                    cpu2.body.position.vsub(cpu1.body.position, v1to2);
                    v1to2.normalize();

                    f1.set(0, 0, -1);
                    cpu1.body.quaternion.vmult(f1, f1);

                    f2.set(0, 0, -1);
                    cpu2.body.quaternion.vmult(f2, f2);

                    const cpu1Ramming = f1.dot(v1to2);
                    const cpu2Ramming = f2.dot(v1to2.negate());

                    if (cpu1Ramming > 0.7) {
                        damage1 *= 0.7;
                        damage2 *= 1.2;
                    }

                    if (cpu2Ramming > 0.7) {
                        damage2 *= 0.7;
                        damage1 *= 1.2;
                    }

                    // Mask Abilities
                    if (cpu1.maskType === 'Oni') damage1 *= 0.85;
                    if (cpu2.maskType === 'Oni') damage2 *= 0.85;

                    cpu1.hp -= Math.floor(damage1);
                    cpu2.hp -= Math.floor(damage2);

                    if (cpu1.hp <= 0) {
                        world.removeBody(cpu1.body);
                        cpu1.body = null;
                        cpu1.type = 'eliminated';
                        updateLeaderboard(cpu2.name, 'kills', 1, true);
                        updateLeaderboard(cpu1.name, 'deaths', 1, true);
                        checkWinCondition();

                        setTimeout(() => {
                            respawnCPU(id1);
                        }, RESPAWN_COOLDOWN);
                        break; // Stop checking collisions for this dead CPU
                    }
                    if (cpu2.hp <= 0) {
                        world.removeBody(cpu2.body);
                        cpu2.body = null;
                        cpu2.type = 'eliminated';
                        updateLeaderboard(cpu1.name, 'kills', 1, true);
                        updateLeaderboard(cpu2.name, 'deaths', 1, true);
                        checkWinCondition();

                        setTimeout(() => {
                            respawnCPU(id2);
                        }, RESPAWN_COOLDOWN);
                    }
                }
            }
        }
    }
});



function spawnPowerup() {
    // Prevent accumulation - cap at MAX_POWERUPS
    if (powerups.size >= MAX_POWERUPS) {
        console.log(`[POWERUP] Max powerups(${MAX_POWERUPS}) reached, skipping spawn`);
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
    body.collisionResponse = true; // Enable interactions
    // No need to addBody, it's already there

    powerups.set(id, { body, type, position: { x, y, z }, spawnTime: Date.now() });

    console.log(`[POWERUP] Spawned ${type} at(${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})[${powerups.size}/${MAX_POWERUPS}]`);

    // Auto-expire after POWERUP_LIFETIME with some jitter to stagger cleanup
    const jitter = (Math.random() - 0.5) * 20000; // +/- 10 seconds
    setTimeout(() => {
        if (powerups.has(id)) {
            const p = powerups.get(id);
            // "Remove" by moving to void
            p.body.position.set(0, -500, 0);
            p.body.collisionResponse = false;

            powerupPool.push(p.body); // Return to pool
            powerups.delete(id);
            console.log(`[POWERUP] Expired ${type} [${powerups.size} / ${MAX_POWERUPS}]`);
        }
    }, POWERUP_LIFETIME + jitter);
}

function spawnInitialPowerups(count = 5) {
    console.log(`[POWERUP] Spawning ${count} initial powerups to pre - warm client...`);
    for (let i = 0; i < count; i++) {
        spawnPowerup();
    }
}

function checkPowerupCollisions() {
    for (const [pId, powerup] of powerups) {
        // Collect all potential collectors (Players and CPUs)
        const candidates = [...players.entries(), ...cpuPlayers.entries()];

        for (const [id, entity] of candidates) {
            if (!entity.body || !powerup.body || entity.hp <= 0) continue;
            // Humans need 'driver' type, CPUs are always drivers
            if (!entity.isCPU && entity.type !== 'driver') continue;

            const dist = entity.body.position.distanceTo(powerup.body.position);
            if (dist < 2.5) {
                const isCPU = entity.isCPU;

                // Apply effect
                if (powerup.type === 'Repair') {
                    entity.hp = Math.min(100, entity.hp + 50);
                } else if (powerup.type === 'Boost') {
                    entity.boost = 100; // Refill boost
                    // Impulse
                    const dir = entity.body.velocity.clone();
                    dir.normalize();
                    dir.scale(50, dir);
                    entity.body.velocity.vadd(dir, entity.body.velocity);
                } else if (powerup.type === 'Shield') {
                    applyPowerupState(entity, 'Shield', 5000);
                } else if (powerup.type === 'Ghost') {
                    applyPowerupState(entity, 'Ghost', 5000);
                } else if (powerup.type === 'Juggernaut') {
                    applyPowerupState(entity, 'Juggernaut', 10000);
                } else if (powerup.type === 'Weapon') {
                    entity.ammo = (entity.ammo || 0) + 5;
                    entity.weaponType = Math.random() > 0.5 ? 'missile' : 'laser';
                    console.log(`[POWERUP] ${entity.name} picked up Weapon(${entity.weaponType}, ${entity.ammo} ammo)`);
                    if (!isCPU) io.to(id).emit('powerup', { type: 'Weapon', ammo: entity.ammo, weaponType: entity.weaponType });
                } else {
                    // All other powerups go to Held Item slot
                    entity.heldItem = powerup.type;
                    console.log(`[POWERUP] ${entity.name} picked up and HELD ${powerup.type} `);
                    if (!isCPU) io.to(id).emit('powerup', { type: powerup.type, isHeld: true });
                }

                // Remove powerup (return to void)
                powerup.body.position.set(0, -500, 0);
                powerup.body.collisionResponse = false;

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
if (require.main === module) {
    setInterval(spawnPowerup, POWERUP_SPAWN_INTERVAL);
}

// =============================================================================
// TRAPS (Drone ability)
// =============================================================================
function spawnTrap(x, z, ownerId) {
    // Prevent trap spam
    if (traps.size >= MAX_TRAPS) {
        console.log(`[TRAP] Max traps(${MAX_TRAPS}) reached, skipping spawn`);
        return;
    }

    if (trapPool.length === 0) {
        console.warn(`[TRAP] Pool exhausted, skipping spawn`);
        return;
    }

    const id = uuidv4();

    const body = trapPool.pop();
    body.position.set(x, 0.5, z);
    body.collisionResponse = true; // Enable collisions
    // world.addBody(body); // Already in world

    traps.set(id, { body, ownerId, position: { x, y: 0.5, z } });

    console.log(`[TRAP] Drone ${ownerId} placed trap at(${x.toFixed(1)}, ${z.toFixed(1)})[${traps.size}/${MAX_TRAPS}]`);

    // Remove trap after 10 seconds
    setTimeout(() => {
        if (traps.has(id)) {
            const t = traps.get(id);
            // "Remove" to void
            t.body.position.set(0, -500, 0);
            t.body.collisionResponse = false;

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
let playerQueue = []; // Queue for players waiting to join during winner screen
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
        console.log(`[DEMO] Cannot start demo - gameState is ${gameState} `);
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
    console.log(`[DEMO] Selected race track: ${activeTrack.name} `);

    // Update physics walls and broadcast to clients
    activateTrackWalls(activeTrack.id);
    createTerrainHeightfield();
    broadcastTrackData();

    // Spawn 4-6 CPU opponents
    const cpuCount = 4 + Math.floor(Math.random() * 3);
    spawnCPUOpponents(cpuCount);

    io.emit('demoMode', { active: true });
    broadcastGameState();

    console.log(`[DEMO] Spawned ${cpuCount} CPU opponents for demo on track: ${activeTrack.name} `);
}

function stopDemoMode() {
    if (!demoModeActive) return;

    console.log('[DEMO] Stopping demo mode - player joining');
    demoModeActive = false;
    gameState = 'LOBBY';

    removeCPUOpponents();
    processPlayerQueue();
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

function processPlayerQueue() {
    if (playerQueue.length === 0) return;

    console.log(`[QUEUE] Processing ${playerQueue.length} queued players...`);

    for (const queuedPlayer of playerQueue) {
        const { socketId, name, maskType } = queuedPlayer;
        
        // Check if socket still connected
        const socket = io.sockets.sockets.get(socketId);
        if (!socket) {
            console.log(`[QUEUE] Socket ${socketId} disconnected, skipping ${name}`);
            continue;
        }

        // Create player as driver
        const color = CAR_COLORS[players.size % CAR_COLORS.length];
        const newPlayer = {
            id: socketId,
            body: null,
            hp: 100,
            type: 'driver',
            maskType: maskType,
            color,
            name: name,
            boost: 100,
            isShielded: false,
            isGhost: false,
            isJuggernaut: false,
            lapsCompleted: 0,
            waypointIndex: 0,
            ammo: 0,
            weaponType: 'none',
            heldItem: null,
            activePowerup: null,
            input: { steering: 0, throttle: 0, boost: false }
        };
        players.set(socketId, newPlayer);

        // Spawn at spawn point
        if (!activeTrack.spawnPoints || activeTrack.spawnPoints.length === 0) {
            console.error('[ERROR] No spawn points available on track!');
            activeTrack.spawnPoints = [{ x: 0, z: 0, rotation: 0 }];
        }

        const spawnIndex = (players.size - 1) % activeTrack.spawnPoints.length;
        const spawnPoint = activeTrack.spawnPoints[spawnIndex];
        createPlayerBody(newPlayer,
            spawnPoint.x + (Math.random() - 0.5) * 2,
            spawnPoint.z + (Math.random() - 0.5) * 2,
            spawnPoint.rotation || 0
        );

        socket.emit('joined', {
            id: socketId,
            color: newPlayer.color,
            hp: newPlayer.hp,
            ammo: newPlayer.ammo,
            weaponType: newPlayer.weaponType
        });

        console.log(`[QUEUE] Added ${name} to race`);
    }

    playerQueue = []; // Clear queue
    broadcastGameState();

    // Check if we need to start countdown after adding queued players
    startLobbyCountdown();
}

function startLobbyCountdown() {
    if (gameState !== 'LOBBY' || gameTimer > 0) return;

    const humanCount = [...players.values()].filter(p => !p.isCPU && p.type === 'driver').length;
    if (humanCount === 0) return;

    console.log("[GAME] Starting lobby timer (30s)...");
    selectRandomTrack();
    gameTimer = 30; // 30 seconds to join
    broadcastGameState();

    // Start lobby countdown
    const lobbyInterval = setInterval(() => {
        // checks
        if (gameState !== 'LOBBY') {
            clearInterval(lobbyInterval);
            return;
        }

        const currentHumanCount = [...players.values()].filter(p => !p.isCPU && p.type === 'driver').length;
        if (currentHumanCount === 0) {
            console.log("[GAME] All players left lobby - canceling timer");
            gameTimer = 0;
            broadcastGameState();
            clearInterval(lobbyInterval);
            return;
        }

        gameTimer--;
        broadcastGameState();

        if (gameTimer <= 0) {
            clearInterval(lobbyInterval);
            startCountdown();
        }
    }, 1000);
}

function startCountdown() {

    console.log('[GAME] Starting countdown...');

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
        // "Remove" to void
        p.body.position.set(0, -500, 0);
        p.body.collisionResponse = false;
        powerupPool.push(p.body);
    }
    powerups.clear();
    for (const [id, t] of traps) {
        // "Remove" to void
        t.body.position.set(0, -500, 0);
        t.body.collisionResponse = false;
        trapPool.push(t.body);
    }
    traps.clear();

    // Clear projectiles
    for (const [id, proj] of projectiles) {
        proj.body.position.set(0, -500, 0);
        proj.body.collisionResponse = false;
        projectilePool.push(proj.body);
    }
    projectiles.clear();
}

function endRace(winner) {
    if (gameState !== 'RACING' && gameState !== 'DEMO') return;
    gameState = 'WINNER';
    winnerName = winner ? winner.name : 'Nobody';
    gameTimer = 10; // 10s until lobby
    console.log(`[GAME] Winner: ${winnerName} `);

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

                    // Select new random track for next demo
                    selectRandomTrack();

                    broadcastGameState();
                    // Start new demo after short delay
                    setTimeout(startDemoMode, 3000);
                    console.log('[DEMO] Demo race ended, restarting in 3 seconds...');
                } else {
                    // Human joined during demo, go to lobby
                    demoModeActive = false;
                    removeCPUOpponents();
                    gameState = 'LOBBY';

                    // Select new random track for lobby
                    selectRandomTrack();

                    processPlayerQueue();
                    broadcastGameState();
                    io.emit('demoMode', { active: false });
                }
            } else {
                gameState = 'LOBBY';

                // Select new random track for next round
                selectRandomTrack();

                processPlayerQueue();
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
    console.log(`[CONNECT] ${socket.id} as ${role} `);

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
                console.log(`[ADMIN] Added CPU - now ${cpuPlayers.size} `);
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
                console.log(`[ADMIN] Removed CPU - now ${cpuPlayers.size} `);
            }
        });

        socket.on('changeTrack', (trackId) => {
            const { getTrackById } = require('./tracks');
            const newTrack = getTrackById(trackId);
            if (newTrack) {
                console.log(`[ADMIN] Changing track to: ${newTrack.name} `);

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
            let queued = false;
            if (gameState === 'WINNER') {
                // Queue player for next race instead of joining as drone
                playerQueue.push({ socketId: socket.id, name: name || 'Player', maskType: maskType || 'Classic' });
                queued = true;
                console.log(`[QUEUE] ${name} queued for next race (currently ${playerQueue.length} in queue)`);
                socket.emit('queued', { position: playerQueue.length });
            } else if (gameState === 'RACING') {
                type = 'driver'; // Late joiners spawn as targets behind the pack
                lateJoiner = true;
            }

            // Create player object (only if not queued)
            if (!queued) {
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
                    ammo: 0,
                    weaponType: 'none',
                    heldItem: null,
                    activePowerup: null,
                    input: { steering: 0, throttle: 0, boost: false } // Initialize input for game loop
                };
                players.set(socket.id, newPlayer);

                // If Driver, spawn body
                if (type === 'driver') {
                    if (lateJoiner) {
                        // Late joiner: spawn behind the pack as a target
                        const rearPos = getPackRearPosition();
                        createPlayerBody(newPlayer, rearPos.x, rearPos.z, rearPos.rotation);
                        console.log(`[LATE JOIN] ${name} spawned behind pack at(${rearPos.x.toFixed(1)}, ${rearPos.z.toFixed(1)})`);

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
                    hp: newPlayer.hp,
                    ammo: newPlayer.ammo,
                    weaponType: newPlayer.weaponType
                });
            }

            // AUTO-START LOGIC
            // Start countdown if we have at least 1 player in LOBBY (Single Player allowed)
            if (gameState === 'LOBBY' && !queued) {
                startLobbyCountdown();
            }

            console.log(`[JOIN] ${name} as ${queued ? 'queued' : type} `);
            if (!queued) {
                broadcastGameState();
            }

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
            if (clampedBoost && !player.input?.boost) {
                console.log(`[INPUT] Boost START for ${player.name}(Boost: ${Math.floor(player.boost)})`);
            }
            player.input = { steering: clampedSteering, throttle: clampedThrottle, boost: clampedBoost };
        });

        socket.on('spawnTrap', ({ x, z }) => {
            const player = players.get(socket.id);
            if (player && player.type === 'drone') {
                spawnTrap(x, z, socket.id);
            }
        });

        // USE HELD ITEM
        socket.on('useItem', () => {
            const player = players.get(socket.id);
            if (!player || player.type !== 'driver' || !player.heldItem) return;

            const item = player.heldItem;
            player.heldItem = null;

            console.log(`[ITEM] ${player.name} used ${item} `);

            if (item === 'Repair') {
                player.hp = Math.min(100, player.hp + 50);
            } else if (item === '67Meme') {
                player.hp = Math.min(100, player.hp + 67);
            } else if (item === 'Boost') {
                player.boost = 100;
                // Refetch current velocity in case it changed since loop start
                const dir = player.body.velocity.clone();
                dir.normalize();
                if (dir.length() < 0.1) {
                    // If stationary, boost forward
                    const forward = new CANNON.Vec3(0, 0, -1);
                    player.body.quaternion.vmult(forward, forward);
                    forward.scale(50, dir);
                } else {
                    dir.scale(50, dir);
                }
                player.body.velocity.vadd(dir, player.body.velocity);
            } else if (item === 'Shield' || item === 'Ghost' || item === 'Juggernaut') {
                applyPowerupState(player, item, item === 'Juggernaut' ? 10000 : 5000);
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
        // Also remove from queue if present
        playerQueue = playerQueue.filter(p => p.socketId !== socket.id);
        console.log(`[DISCONNECT] ${socket.id} `);
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
            ammo: 0,
            weaponType: 'none',
            heldItem: null,
            activePowerup: null,
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
                    const input = player.input || { steering: 0, throttle: 0, boost: false };
                    updatePlayerPhysics(player, input);
                }
            }
        }

        // REDUNDANT CLAMPING/BOUNDARIES REMOVED - NOW HANDLED IN updatePlayerPhysics

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
            state.boost = Math.round(player.boost * 10) / 10; // 1 decimal place
            state.ammo = player.ammo || 0;
            state.weaponType = player.weaponType || 'none';
            state.heldItem = player.heldItem || null;

            if (player.activePowerup) {
                const elapsed = Date.now() - player.activePowerup.startTime;
                const remaining = Math.max(0, player.activePowerup.duration - elapsed);
                state.activePowerup = { type: player.activePowerup.type, r: Math.floor(remaining) };
            } else {
                state.activePowerup = null;
            }

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
            state.boost = Math.round((cpu.boost || 100) * 10) / 10;
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
                    ammo: state.ammo,
                    weaponType: state.weaponType,
                    heldItem: state.heldItem,
                    activePowerup: state.activePowerup,
                    isShielded: state.isShielded,
                    isGhost: state.isGhost,
                    isJuggernaut: state.isJuggernaut,
                    lapsCompleted: state.lapsCompleted,
                    waypointIndex: state.waypointIndex,
                    raceProgress: state.raceProgress,
                    isCPU: state.isCPU,
                    q: state.quaternion ? [state.quaternion.x, state.quaternion.y, state.quaternion.z, state.quaternion.w] : null
                };

                // Cache for delta comparison
                previousPlayerState.set(id, {
                    hp: state.hp,
                    boost: state.boost,
                    ammo: state.ammo,
                    weaponType: state.weaponType,
                    heldItem: state.heldItem,
                    activePowerup: state.activePowerup ? state.activePowerup.type : null,
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
                    q: state.quaternion ? [state.quaternion.x, state.quaternion.y, state.quaternion.z, state.quaternion.w] : null
                };

                // Only include properties that changed
                if (!prev || prev.hp !== state.hp) delta.hp = state.hp;
                if (!prev || prev.boost !== state.boost) {
                    delta.boost = state.boost;
                    // console.log(`[DEBUG_DELTA] Sending boost update for ${ id }: ${ prev?.boost } -> ${ state.boost } `);
                }
                if (!prev || prev.ammo !== state.ammo) delta.ammo = state.ammo;
                if (!prev || prev.weaponType !== state.weaponType) delta.weaponType = state.weaponType;
                if (!prev || prev.heldItem !== state.heldItem) delta.heldItem = state.heldItem;

                // For activePowerup, always send if it exists (for countdown sync) OR if it just ended
                if (state.activePowerup || (prev && prev.activePowerup)) {
                    delta.activePowerup = state.activePowerup;
                }

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
                    prev.ammo = state.ammo;
                    prev.weaponType = state.weaponType;
                    prev.heldItem = state.heldItem;
                    prev.activePowerup = state.activePowerup ? state.activePowerup.type : null;
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
                        ammo: state.ammo,
                        weaponType: state.weaponType,
                        heldItem: state.heldItem,
                        activePowerup: state.activePowerup ? state.activePowerup.type : null,
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

if (require.main === module) {
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
    ║     Tick Rate: ${TICK_RATE} Hz                                      ║
    ║     Physics: cannon - es                                    ║
    ║                                                           ║
    ║     Waiting for players...                                ║
    ╚═══════════════════════════════════════════════════════════╝
    `);
    });
}

module.exports = {
    world,
    players,
    cpuPlayers,
    createPlayerBody,
    updatePlayerPhysics,
    gameLoop,
    TICK_RATE,
    io,
    httpServer,
    spawnCPUOpponents,
    getActiveTrack: () => activeTrack, // Getter for test
    selectRandomTrack,
    setGameState: (state) => { gameState = state; }, // Helper for test
    powerups,
    projectiles,
    traps,
    createProjectile,
    spawnTrap,
    spawnPowerup,
    CANON: CANNON // Export CANNON if needed for tests
};
