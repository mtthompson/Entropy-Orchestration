const { createTrackFromPath, createArena, validateSpawnPoints } = require('./GameTrackBuilder');

// =============================================================================
// TRACK DEFINITIONS - All 12 Tracks with Proper Aligned Spawns
// =============================================================================

// Generate spawns along a path segment (usually first straight of the track)
function generateAlignedSpawns(pathPoints, offset, count) {
    const spawns = [];
    const p1 = pathPoints[0];
    const p2 = pathPoints[1];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    const nx = dx / len;
    const nz = dz / len;
    const px = -nz;
    const pz = nx;
    const rotation = Math.atan2(dx, dz);

    const colSpacing = 10;
    const rowSpacing = 15;

    for (let i = 0; i < count; i++) {
        const row = Math.floor(i / 4);
        const col = i % 4;
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
TRACKS.push({
    id: 'track_01',
    name: 'Stadium Oval',
    type: 'race',
    path: OVAL_PATH,
    boundaries: createTrackFromPath(OVAL_PATH, 55, true),
    spawnPoints: generateAlignedSpawns(OVAL_PATH, 10, 12),
    powerupBounds: { minX: -140, maxX: 140, minZ: -200, maxZ: 200 },
    floorSize: { width: 350, depth: 450 }
});

// =============================================================================
// TRACK 2: Thunder Dome (Battle Arena)
// =============================================================================
TRACKS.push({
    id: 'track_02',
    name: 'Thunder Dome',
    type: 'arena',
    boundaries: createArena(160, 24),
    spawnPoints: generateCircleSpawns(120, 12),
    powerupBounds: { minX: -140, maxX: 140, minZ: -140, maxZ: 140 },
    floorSize: { width: 380, depth: 380 }
});

// =============================================================================
// TRACK 3: The Switchback
// =============================================================================
const SWITCHBACK_PATH = [
    { x: -150, z: 175 }, { x: -50, z: 175 }, { x: 50, z: 100 },
    { x: 150, z: 100 }, { x: 150, z: 0 },
    { x: 50, z: 0 }, { x: -50, z: -75 },
    { x: -150, z: -75 }, { x: -150, z: -175 },
    { x: -50, z: -175 }, { x: 50, z: -125 }, { x: 150, z: -175 },
    { x: 150, z: -225 }, { x: -150, z: -225 }
];
TRACKS.push({
    id: 'track_03',
    name: 'The Switchback',
    type: 'race',
    path: SWITCHBACK_PATH,
    boundaries: createTrackFromPath(SWITCHBACK_PATH, 45, true),
    spawnPoints: generateAlignedSpawns(SWITCHBACK_PATH, 10, 8),
    powerupBounds: { minX: -175, maxX: 175, minZ: -250, maxZ: 200 },
    floorSize: { width: 420, depth: 520 }
});

// =============================================================================
// TRACK 4: Cloverleaf
// =============================================================================
const CLOVER_PATH = [
    { x: 0, z: 200 }, { x: -100, z: 150 }, { x: -150, z: 50 },
    { x: -100, z: -50 }, { x: 0, z: -25 },
    { x: 100, z: -50 }, { x: 150, z: -150 },
    { x: 100, z: -200 }, { x: 0, z: -175 },
    { x: -100, z: -200 }, { x: -150, z: -150 },
    { x: -100, z: -75 }, { x: 0, z: -25 },
    { x: 100, z: 50 }, { x: 150, z: 150 }, { x: 100, z: 200 }
];
TRACKS.push({
    id: 'track_04',
    name: 'Cloverleaf',
    type: 'race',
    path: CLOVER_PATH,
    boundaries: createTrackFromPath(CLOVER_PATH, 50, true),
    spawnPoints: generateAlignedSpawns(CLOVER_PATH, 10, 8),
    powerupBounds: { minX: -175, maxX: 175, minZ: -225, maxZ: 225 },
    floorSize: { width: 420, depth: 520 }
});

// =============================================================================
// TRACK 5: Hexagon Heat
// =============================================================================
TRACKS.push({
    id: 'track_05',
    name: 'Hexagon Heat',
    type: 'arena',
    boundaries: createArena(135, 6),
    spawnPoints: generateCircleSpawns(100, 12),
    powerupBounds: { minX: -115, maxX: 115, minZ: -115, maxZ: 115 },
    floorSize: { width: 330, depth: 330 }
});

// =============================================================================
// TRACK 6: Dragon's Tail
// =============================================================================
const DRAGON_PATH = [
    { x: -125, z: 225 }, { x: -75, z: 175 }, { x: 25, z: 175 },
    { x: 75, z: 125 }, { x: 125, z: 75 }, { x: 75, z: 25 },
    { x: -25, z: 25 }, { x: -75, z: -25 }, { x: -125, z: -75 },
    { x: -75, z: -125 }, { x: 25, z: -125 }, { x: 75, z: -175 },
    { x: 125, z: -225 }, { x: 75, z: -250 }, { x: -125, z: -250 },
    { x: -175, z: -175 }, { x: -175, z: 175 }
];
TRACKS.push({
    id: 'track_06',
    name: "Dragon's Tail",
    type: 'race',
    path: DRAGON_PATH,
    boundaries: createTrackFromPath(DRAGON_PATH, 40, true),
    spawnPoints: generateAlignedSpawns(DRAGON_PATH, 10, 8),
    powerupBounds: { minX: -200, maxX: 150, minZ: -275, maxZ: 250 },
    floorSize: { width: 480, depth: 600 }
});

// =============================================================================
// TRACK 7: The Octagon
// =============================================================================
TRACKS.push({
    id: 'track_07',
    name: 'The Octagon',
    type: 'arena',
    boundaries: createArena(125, 8),
    spawnPoints: generateCircleSpawns(90, 10),
    powerupBounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    floorSize: { width: 280, depth: 280 }
});

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
TRACKS.push({
    id: 'track_08',
    name: 'Grand Prix',
    type: 'race',
    path: GP_PATH,
    boundaries: createTrackFromPath(GP_PATH, 45, true),
    spawnPoints: generateAlignedSpawns(GP_PATH, 10, 8),
    powerupBounds: { minX: -175, maxX: 175, minZ: -225, maxZ: 225 },
    floorSize: { width: 420, depth: 520 }
});

// =============================================================================
// TRACK 9: Triangle Terror
// =============================================================================
TRACKS.push({
    id: 'track_09',
    name: 'Triangle Terror',
    type: 'arena',
    boundaries: createArena(150, 3),
    spawnPoints: generateCircleSpawns(75, 8),
    powerupBounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    floorSize: { width: 350, depth: 350 }
});

// =============================================================================
// TRACK 10: Velocity Strip
// =============================================================================
const STRIP_PATH = [
    { x: -62, z: 250 }, { x: 62, z: 250 },
    { x: 62, z: -200 }, { x: 100, z: -237 }, { x: 100, z: -275 },
    { x: -100, z: -275 }, { x: -100, z: -237 }, { x: -62, z: -200 }
];
TRACKS.push({
    id: 'track_10',
    name: 'Velocity Strip',
    type: 'race',
    path: STRIP_PATH,
    boundaries: createTrackFromPath(STRIP_PATH, 85, true),
    spawnPoints: generateAlignedSpawns(STRIP_PATH, 10, 8),
    powerupBounds: { minX: -125, maxX: 125, minZ: -300, maxZ: 275 },
    floorSize: { width: 300, depth: 650 }
});

// =============================================================================
// TRACK 11: The Coliseum
// =============================================================================
TRACKS.push({
    id: 'track_11',
    name: 'The Coliseum',
    type: 'arena',
    boundaries: createArena(185, 20),
    spawnPoints: generateCircleSpawns(135, 12),
    powerupBounds: { minX: -160, maxX: 160, minZ: -160, maxZ: 160 },
    floorSize: { width: 420, depth: 420 }
});

// =============================================================================
// TRACK 12: The Cage
// =============================================================================
TRACKS.push({
    id: 'track_12',
    name: 'The Cage',
    type: 'arena',
    boundaries: createArena(105, 12),
    spawnPoints: generateCircleSpawns(60, 12),
    powerupBounds: { minX: -85, maxX: 85, minZ: -85, maxZ: 85 },
    floorSize: { width: 250, depth: 250 }
});

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
    TRACK_THEMES
};
