const { createTrackFromPath, createArena, validateSpawnPoints } = require('./GameTrackBuilder');

// Helper to build track with floor polygons from createTrackFromPath result
function buildRaceTrack(path, width, trackDef) {
    // Allow per-track control over smoothing to avoid over-smoothing tight corners
    const smoothSegments = trackDef.smoothSegments || 6;
    const result = createTrackFromPath(path, width, true, smoothSegments);

    // Validate spawn points against the generated (smoothed) boundaries
    const safeSpawns = trackDef.spawnPoints
        ? validateSpawnPoints(trackDef.spawnPoints, result.boundaries, width * 0.2)
        : [];

    return {
        ...trackDef,
        path: result.path || path, // Use smoothed path if available
        width, // Store width for physics/terrain generation
        boundaries: result.boundaries,
        outerPolygon: result.outerPolygon,
        innerPolygon: result.innerPolygon,
        spawnPoints: safeSpawns
    };
}

// Helper to build arena with floor polygon from createArena result
function buildArena(radius, segments, trackDef) {
    const result = createArena(radius, segments);

    // Validate spawn points against arena boundaries
    const safeSpawns = trackDef.spawnPoints
        ? validateSpawnPoints(trackDef.spawnPoints, result.boundaries, 10)
        : [];

    return {
        ...trackDef,
        radius, // Store radius for powerup spawning
        // Arenas don't have a single "width", but treating radius as comparable for some logic?
        // Actually heightMap logic uses trackWidth for PATHS.
        // Arenas usually use flat presets.
        boundaries: result.boundaries,
        floorPolygon: result.floorPolygon,
        spawnPoints: safeSpawns
    };
}

// =============================================================================
// TRACK DEFINITIONS - All 12 Tracks with Proper Aligned Spawns
// =============================================================================

// Generate spawns along a path segment (usually first straight of the track)
function generateAlignedSpawns(pathPoints, offset, count) {
    const spawns = [];
    const p1 = pathPoints[0];

    // For alignment, use the direction FROM the first point TO the second point
    // This ensures players face the direction they're going to drive
    const pNext = pathPoints[1];
    const dx = pNext.x - p1.x;
    const dz = pNext.z - p1.z;
    const len = Math.sqrt(dx * dx + dz * dz);

    // Forward direction (unit vector)
    const nx = dx / len;
    const nz = dz / len;

    // Perpendicular direction (for side-by-side rows)
    const px = -nz;
    const pz = nx;

    const rotation = Math.atan2(dx, dz);

    const colSpacing = 10;
    const rowSpacing = 15;

    for (let i = 0; i < count; i++) {
        const row = Math.floor(i / 4);
        const col = i % 4;
        // Push BACK from p1 along the incoming direction
        const baseX = p1.x - nx * (offset + row * rowSpacing);
        const baseZ = p1.z - nz * (offset + row * rowSpacing);
        spawns.push({
            x: baseX + px * (col - 1.5) * colSpacing,
            z: baseZ + pz * (col - 1.5) * colSpacing,
            rotation: rotation
        });
    }
    return spawns;
}

// Generate arena spawns in a circle
function generateCircleSpawns(radius, count) {
    const spawns = [];
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        spawns.push({
            x: Math.cos(angle) * radius * 0.5,
            z: Math.sin(angle) * radius * 0.5,
            rotation: angle + Math.PI // Face center
        });
    }
    return spawns;
}

// Generate start line perpendicular to track at first path point
function generateStartLine(pathPoints, trackWidth = 55) {
    const p1 = pathPoints[0];
    const pPrev = pathPoints[pathPoints.length - 1]; // Use incoming segment
    const dx = p1.x - pPrev.x;
    const dz = p1.z - pPrev.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    // Perpendicular direction (normal to track direction)
    const px = -dz / len;
    const pz = dx / len;
    // Half width of the start line
    const halfWidth = trackWidth / 2;
    return {
        x1: p1.x - px * halfWidth,
        z1: p1.z - pz * halfWidth,
        x2: p1.x + px * halfWidth,
        z2: p1.z + pz * halfWidth
    };
}

/**
 * Returns a random point guaranteed to be on the track or arena surface.
 */
function getRandomPointOnTrack(track) {
    if (!track) return { x: 0, z: 0 };

    if (track.type === 'arena') {
        // Uniform distribution in circle
        const angle = Math.random() * Math.PI * 2;
        const r = (track.radius || 100) * Math.sqrt(Math.random()) * 0.85; // 85% of radius to stay away from walls
        return {
            x: Math.cos(angle) * r,
            z: Math.sin(angle) * r
        };
    } else if (track.path && track.path.length > 1) {
        // Pick a random segment
        const idx = Math.floor(Math.random() * track.path.length);
        const p1 = track.path[idx];
        const p2 = track.path[(idx + 1) % track.path.length];

        // Linear interpolation between p1 and p2
        const t = Math.random();
        const segX = p1.x + t * (p2.x - p1.x);
        const segZ = p1.z + t * (p2.z - p1.z);

        // Calculate segment normal
        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        const nx = -dz / len;
        const nz = dx / len;

        // Offset laterally (within track width)
        const trackWidth = track.width || 50;
        const lateralOffset = (Math.random() - 0.5) * trackWidth * 0.7; // 70% of width for safety

        return {
            x: segX + nx * lateralOffset,
            z: segZ + nz * lateralOffset
        };
    }

    return { x: 0, z: 0 };
}

// =============================================================================
// TRACK THEMES - Unique colors, scenery, and visual style for each track
// =============================================================================
const TRACK_THEMES = {
    'track_01': {
        name: 'Stadium Oval',
        primaryColor: '#ff00ff',      // Magenta
        secondaryColor: '#00ffff',    // Cyan
        floorColor: '#0a051a',
        gridColor: '#ff00ff',
        wallColor: '#ff00ff',
        skyColor: '#0a0020',
        sceneryType: 'stadium',       // Grandstands, spotlights
        particleType: 'confetti',
        ambientIntensity: 0.4
    },
    'track_02': {
        name: 'Thunder Dome',
        primaryColor: '#ff6600',      // Orange
        secondaryColor: '#ffff00',    // Yellow
        floorColor: '#1a0500',
        gridColor: '#ff3300',
        wallColor: '#ff6600',
        skyColor: '#200800',
        sceneryType: 'industrial',    // Metal beams, sparks
        particleType: 'sparks',
        ambientIntensity: 0.3
    },
    'track_03': {
        name: 'The Switchback',
        primaryColor: '#00ff88',      // Mint
        secondaryColor: '#00ffff',    // Cyan
        floorColor: '#001a0a',
        gridColor: '#00ff88',
        wallColor: '#00ff88',
        skyColor: '#002010',
        sceneryType: 'neon_forest',   // Glowing trees
        particleType: 'fireflies',
        ambientIntensity: 0.5
    },
    'track_04': {
        name: 'Cloverleaf',
        primaryColor: '#88ff00',      // Lime
        secondaryColor: '#ffffff',    // White
        floorColor: '#0a1a00',
        gridColor: '#66ff00',
        wallColor: '#88ff00',
        skyColor: '#102000',
        sceneryType: 'nature',        // Stylized plants
        particleType: 'leaves',
        ambientIntensity: 0.6
    },
    'track_05': {
        name: 'Hexagon Heat',
        primaryColor: '#ff0066',      // Hot pink
        secondaryColor: '#ff6600',    // Orange
        floorColor: '#1a0010',
        gridColor: '#ff0066',
        wallColor: '#ff0066',
        skyColor: '#200010',
        sceneryType: 'volcanic',      // Lava, smoke
        particleType: 'embers',
        ambientIntensity: 0.3
    },
    'track_06': {
        name: "Dragon's Tail",
        primaryColor: '#ff0000',      // Red
        secondaryColor: '#ff8800',    // Gold
        floorColor: '#1a0000',
        gridColor: '#ff0000',
        wallColor: '#ff0000',
        skyColor: '#200000',
        sceneryType: 'dragon',        // Oriental lanterns, fire
        particleType: 'flames',
        ambientIntensity: 0.35
    },
    'track_07': {
        name: 'The Octagon',
        primaryColor: '#6600ff',      // Purple
        secondaryColor: '#ff00ff',    // Magenta
        floorColor: '#0a0020',
        gridColor: '#6600ff',
        wallColor: '#6600ff',
        skyColor: '#100030',
        sceneryType: 'mystic',        // Floating crystals
        particleType: 'magic',
        ambientIntensity: 0.5
    },
    'track_08': {
        name: 'Grand Prix',
        primaryColor: '#ffffff',      // White
        secondaryColor: '#ff0000',    // Red
        floorColor: '#0a0a0a',
        gridColor: '#ffffff',
        wallColor: '#ffffff',
        skyColor: '#101010',
        sceneryType: 'classic',       // Checkered flags, banners
        particleType: 'confetti',
        ambientIntensity: 0.7
    },
    'track_09': {
        name: 'Triangle Terror',
        primaryColor: '#ffff00',      // Yellow
        secondaryColor: '#ff0000',    // Red
        floorColor: '#1a1a00',
        gridColor: '#ffff00',
        wallColor: '#ffff00',
        skyColor: '#202000',
        sceneryType: 'warning',       // Hazard signs, stripes
        particleType: 'electricity',
        ambientIntensity: 0.4
    },
    'track_10': {
        name: 'Velocity Strip',
        primaryColor: '#00aaff',      // Electric blue
        secondaryColor: '#00ffff',    // Cyan
        floorColor: '#00050a',
        gridColor: '#00aaff',
        wallColor: '#00aaff',
        skyColor: '#001020',
        sceneryType: 'speed',         // Motion blur panels
        particleType: 'speedlines',
        ambientIntensity: 0.5
    },
    'track_11': {
        name: 'The Coliseum',
        primaryColor: '#ffd700',      // Gold
        secondaryColor: '#ff6600',    // Bronze
        floorColor: '#1a1000',
        gridColor: '#ffd700',
        wallColor: '#ffd700',
        skyColor: '#201800',
        sceneryType: 'roman',         // Pillars, torches
        particleType: 'flames',
        ambientIntensity: 0.45
    },
    'track_12': {
        name: 'The Cage',
        primaryColor: '#888888',      // Gray
        secondaryColor: '#ff0000',    // Blood red
        floorColor: '#0a0a0a',
        gridColor: '#444444',
        wallColor: '#666666',
        skyColor: '#080808',
        sceneryType: 'prison',        // Chain link, rust
        particleType: 'dust',
        ambientIntensity: 0.2
    }
};

const TRACKS = [];

// =============================================================================
// TRACK 1: Stadium Oval
// =============================================================================
const OVAL_PATH = [
    { x: -100, z: 150 }, { x: -112, z: 100 }, { x: -112, z: -100 }, { x: -100, z: -150 },
    { x: -50, z: -175 }, { x: 50, z: -175 }, { x: 100, z: -150 },
    { x: 112, z: -100 }, { x: 112, z: 100 }, { x: 100, z: 150 },
    { x: 50, z: 175 }, { x: -50, z: 175 }
];
TRACKS.push(buildRaceTrack(OVAL_PATH, 55, {
    id: 'track_01',
    name: 'Stadium Oval',
    type: 'race',
    spawnPoints: generateAlignedSpawns(OVAL_PATH, 10, 12),
    startLine: generateStartLine(OVAL_PATH, 55),
    powerupBounds: { minX: -140, maxX: 140, minZ: -200, maxZ: 200 },
    floorSize: { width: 350, depth: 450 },
    sceneryType: 'stadium'
}));

// =============================================================================
// TRACK 2: Thunder Dome (Battle Arena)
// =============================================================================
TRACKS.push(buildArena(160, 24, {
    id: 'track_02',
    name: 'Thunder Dome',
    type: 'arena',
    spawnPoints: generateCircleSpawns(120, 12),
    powerupBounds: { minX: -140, maxX: 140, minZ: -140, maxZ: 140 },
    floorSize: { width: 380, depth: 380 },
    sceneryType: 'industrial'
}));

// =============================================================================
// TRACK 3: The Switchback
// =============================================================================
const SWITCHBACK_PATH = [
    { x: -150, z: 165 }, { x: -50, z: 165 }, { x: 50, z: 100 },
    { x: 150, z: 100 }, { x: 150, z: 0 },
    { x: 50, z: 0 }, { x: -70, z: -85 },
    { x: -105, z: -180 }, { x: -80, z: -175 },
    { x: -50, z: -175 }, { x: 50, z: -125 }, { x: 150, z: -175 },
    { x: 150, z: -225 }, { x: -150, z: -225 }
];
TRACKS.push(buildRaceTrack(SWITCHBACK_PATH, 90, {
    id: 'track_03',
    name: 'The Switchback',
    type: 'race',
    smoothSegments: 1,
    spawnPoints: generateAlignedSpawns(SWITCHBACK_PATH, 10, 8),
    startLine: generateStartLine(SWITCHBACK_PATH, 70),
    powerupBounds: { minX: -175, maxX: 175, minZ: -250, maxZ: 200 },
    floorSize: { width: 420, depth: 520 },
    sceneryType: 'neon_forest'
}));

// =============================================================================
// TRACK 4: Cloverleaf
// =============================================================================
const CLOVER_PATH = [
    { x: 60, z: 150 }, { x: 120, z: 120 }, { x: 150, z: 60 }, { x: 120, z: 0 }, { x: 60, z: -30 },
    { x: 120, z: -60 }, { x: 150, z: -120 }, { x: 120, z: -180 }, { x: 60, z: -210 }, { x: 0, z: -180 }, { x: -60, z: -210 },
    { x: -120, z: -180 }, { x: -150, z: -120 }, { x: -120, z: -60 }, { x: -60, z: -30 }, { x: -120, z: 0 }, { x: -150, z: 60 },
    { x: -120, z: 120 }, { x: -60, z: 150 }, { x: 0, z: 180 }
];
TRACKS.push(buildRaceTrack(CLOVER_PATH, 95, {
    id: 'track_04',
    name: 'Cloverleaf',
    type: 'race',
    smoothSegments: 6,
    spawnPoints: generateAlignedSpawns(CLOVER_PATH, 10, 8),
    startLine: generateStartLine(CLOVER_PATH, 95),
    powerupBounds: { minX: -175, maxX: 175, minZ: -225, maxZ: 225 },
    floorSize: { width: 420, depth: 520 },
    sceneryType: 'nature'
}));

// =============================================================================
// TRACK 5: Hexagon Heat
// =============================================================================
TRACKS.push(buildArena(135, 6, {
    id: 'track_05',
    name: 'Hexagon Heat',
    type: 'arena',
    spawnPoints: generateCircleSpawns(100, 12),
    powerupBounds: { minX: -115, maxX: 115, minZ: -115, maxZ: 115 },
    floorSize: { width: 330, depth: 330 },
    sceneryType: 'volcanic'
}));

// =============================================================================
// TRACK 6: Dragon's Tail
// =============================================================================
const DRAGON_PATH = [
    { x: -125, z: 225 },
    { x: -100, z: 200 }, // Midpoint
    { x: -75, z: 175 },
    { x: -25, z: 175 }, // Midpoint
    { x: 25, z: 175 },
    { x: 50, z: 150 }, // Midpoint
    { x: 75, z: 125 },
    { x: 100, z: 100 }, // Midpoint
    { x: 125, z: 75 },
    { x: 100, z: 50 }, // Midpoint
    { x: 75, z: 25 },
    { x: 25, z: 25 }, // Midpoint
    { x: -25, z: 25 },
    { x: -50, z: 0 }, // Midpoint
    { x: -75, z: -25 },
    { x: -100, z: -50 }, // Midpoint
    { x: -125, z: -75 },
    { x: -100, z: -100 }, // Midpoint
    { x: -75, z: -125 },
    { x: -25, z: -125 }, // Midpoint
    { x: 25, z: -125 },
    { x: 50, z: -150 }, // Midpoint
    { x: 75, z: -175 },
    { x: 100, z: -200 }, // Midpoint
    { x: 125, z: -225 },
    { x: 100, z: -237.5 }, // Midpoint
    { x: 75, z: -250 },
    { x: 25, z: -250 }, // Quarter point
    { x: -25, z: -250 }, // Midpoint
    { x: -75, z: -250 }, // Quarter point
    { x: -125, z: -250 },
    { x: -150, z: -212.5 }, // Midpoint
    { x: -175, z: -175 },
    { x: -175, z: -87.5 }, // Quarter point
    { x: -175, z: 0 }, // Midpoint
    { x: -175, z: 87.5 }, // Quarter point
    { x: -175, z: 175 },
    { x: -150, z: 200 } // Midpoint (closing loop)
];
TRACKS.push(buildRaceTrack(DRAGON_PATH, 40, {
    id: 'track_06',
    name: "Dragon's Tail",
    type: 'race',
    smoothSegments: 1,
    spawnPoints: generateAlignedSpawns(DRAGON_PATH, 0, 8),
    startLine: generateStartLine(DRAGON_PATH, 40),
    powerupBounds: { minX: -200, maxX: 150, minZ: -275, maxZ: 250 },
    floorSize: { width: 480, depth: 600 },
    sceneryType: 'dragon'
}));

// =============================================================================
// TRACK 7: The Octagon
// =============================================================================
TRACKS.push(buildArena(125, 8, {
    id: 'track_07',
    name: 'The Octagon',
    type: 'arena',
    spawnPoints: generateCircleSpawns(90, 10),
    powerupBounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    floorSize: { width: 310, depth: 310 },
    sceneryType: 'mystic'
}));

// =============================================================================
// TRACK 8: Grand Prix
// =============================================================================
const GP_PATH = [
    { x: -150, z: 200 }, { x: 0, z: 200 }, { x: 75, z: 175 },
    { x: 125, z: 125 }, { x: 150, z: 50 },
    { x: 125, z: 0 }, { x: 75, z: -25 },
    { x: 125, z: -75 }, { x: 150, z: -125 },
    { x: 125, z: -175 }, { x: 50, z: -200 },
    { x: -50, z: -200 }, { x: -125, z: -175 },
    { x: -150, z: -100 }, { x: -125, z: -25 },
    { x: -150, z: 50 }
];
TRACKS.push(buildRaceTrack(GP_PATH, 45, {
    id: 'track_08',
    name: 'Grand Prix',
    type: 'race',
    spawnPoints: generateAlignedSpawns(GP_PATH, 0, 8),
    startLine: generateStartLine(GP_PATH, 45),
    powerupBounds: { minX: -175, maxX: 175, minZ: -225, maxZ: 225 },
    floorSize: { width: 420, depth: 520 },
    sceneryType: 'classic'
}));

// =============================================================================
// TRACK 9: Triangle Terror
// =============================================================================
TRACKS.push(buildArena(150, 3, {
    id: 'track_09',
    name: 'Triangle Terror',
    type: 'arena',
    spawnPoints: generateCircleSpawns(75, 8),
    powerupBounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    floorSize: { width: 350, depth: 350 },
    sceneryType: 'warning'
}));

// =============================================================================
// TRACK 10: Velocity Strip
// =============================================================================
const STRIP_PATH = [
    { x: -62, z: 250 }, { x: 62, z: 250 },
    { x: 62, z: -200 }, { x: 100, z: -237 }, { x: 100, z: -275 },
    { x: -100, z: -275 }, { x: -100, z: -237 }, { x: -62, z: -200 }
];
TRACKS.push(buildRaceTrack(STRIP_PATH, 85, {
    id: 'track_10',
    name: 'Velocity Strip',
    type: 'race',
    smoothSegments: 1,
    spawnPoints: generateAlignedSpawns(STRIP_PATH, 10, 8),
    startLine: generateStartLine(STRIP_PATH, 85),
    powerupBounds: { minX: -125, maxX: 125, minZ: -300, maxZ: 275 },
    floorSize: { width: 300, depth: 650 },
    sceneryType: 'speed'
}));

// =============================================================================
// TRACK 11: The Coliseum
// =============================================================================
TRACKS.push(buildArena(185, 20, {
    id: 'track_11',
    name: 'The Coliseum',
    type: 'arena',
    spawnPoints: generateCircleSpawns(135, 12),
    powerupBounds: { minX: -160, maxX: 160, minZ: -160, maxZ: 160 },
    floorSize: { width: 420, depth: 420 },
    sceneryType: 'roman'
}));

// =============================================================================
// TRACK 12: The Cage
// =============================================================================
TRACKS.push(buildArena(105, 12, {
    id: 'track_12',
    name: 'The Cage',
    type: 'arena',
    spawnPoints: generateCircleSpawns(60, 12),
    powerupBounds: { minX: -85, maxX: 85, minZ: -85, maxZ: 85 },
    floorSize: { width: 250, depth: 250 },
    sceneryType: 'prison'
}));

// =============================================================================
// EXPORTS
// =============================================================================

// Validate and adjust all spawn points on module load
TRACKS.forEach(track => {
    track.spawnPoints = validateSpawnPoints(track.spawnPoints, track.boundaries, 15);
});

function getTrackById(id) {
    return TRACKS.find(track => track.id === id) || TRACKS[0];
}

function getAllTracks() {
    return TRACKS;
}

function getDefaultTrack() {
    return TRACKS[0];
}

function getRandomTrack() {
    return TRACKS[Math.floor(Math.random() * TRACKS.length)];
}

function getRandomRaceTrack() {
    const raceTracks = TRACKS.filter(t => t.type === 'race' && t.path);
    return raceTracks[Math.floor(Math.random() * raceTracks.length)] || TRACKS[0];
}

function getThemeByTrackId(trackId) {
    return TRACK_THEMES[trackId] || TRACK_THEMES['track_01'];
}

function getTrackPath(trackId) {
    const track = getTrackById(trackId);
    return track ? track.path || null : null;
}

function getAllThemes() {
    return TRACK_THEMES;
}

module.exports = {
    getTrackById,
    getAllTracks,
    getDefaultTrack,
    getRandomTrack,
    getRandomRaceTrack,
    getThemeByTrackId,
    getTrackPath,
    getAllThemes,
    getRandomPointOnTrack,
    TRACK_THEMES
};
