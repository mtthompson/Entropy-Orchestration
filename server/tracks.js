const { createTrackFromPath, createArena } = require('./GameTrackBuilder');

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

    const colSpacing = 4;
    const rowSpacing = 6;

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
    { x: -40, z: 60 }, { x: -45, z: 40 }, { x: -45, z: -40 }, { x: -40, z: -60 },
    { x: -20, z: -70 }, { x: 20, z: -70 }, { x: 40, z: -60 },
    { x: 45, z: -40 }, { x: 45, z: 40 }, { x: 40, z: 60 },
    { x: 20, z: 70 }, { x: -20, z: 70 }
];
TRACKS.push({
    id: 'track_01',
    name: 'Stadium Oval',
    type: 'race',
    path: OVAL_PATH,
    boundaries: createTrackFromPath(OVAL_PATH, 22, true),
    spawnPoints: generateAlignedSpawns(OVAL_PATH, 5, 12),
    powerupBounds: { minX: -55, maxX: 55, minZ: -80, maxZ: 80 },
    floorSize: { width: 160, depth: 200 }
});

// =============================================================================
// TRACK 2: Thunder Dome (Battle Arena)
// =============================================================================
TRACKS.push({
    id: 'track_02',
    name: 'Thunder Dome',
    type: 'arena',
    boundaries: createArena(65, 24),
    spawnPoints: generateCircleSpawns(50, 12),
    powerupBounds: { minX: -55, maxX: 55, minZ: -55, maxZ: 55 },
    floorSize: { width: 160, depth: 160 }
});

// =============================================================================
// TRACK 3: The Switchback
// =============================================================================
const SWITCHBACK_PATH = [
    { x: -60, z: 70 }, { x: -20, z: 70 }, { x: 20, z: 40 },
    { x: 60, z: 40 }, { x: 60, z: 0 },
    { x: 20, z: 0 }, { x: -20, z: -30 },
    { x: -60, z: -30 }, { x: -60, z: -70 },
    { x: -20, z: -70 }, { x: 20, z: -50 }, { x: 60, z: -70 },
    { x: 60, z: -90 }, { x: -60, z: -90 }
];
TRACKS.push({
    id: 'track_03',
    name: 'The Switchback',
    type: 'race',
    path: SWITCHBACK_PATH,
    boundaries: createTrackFromPath(SWITCHBACK_PATH, 18, true),
    spawnPoints: generateAlignedSpawns(SWITCHBACK_PATH, 5, 8),
    powerupBounds: { minX: -70, maxX: 70, minZ: -100, maxZ: 80 },
    floorSize: { width: 180, depth: 220 }
});

// =============================================================================
// TRACK 4: Cloverleaf
// =============================================================================
const CLOVER_PATH = [
    { x: 0, z: 80 }, { x: -40, z: 60 }, { x: -60, z: 20 },
    { x: -40, z: -20 }, { x: 0, z: -10 },
    { x: 40, z: -20 }, { x: 60, z: -60 },
    { x: 40, z: -80 }, { x: 0, z: -70 },
    { x: -40, z: -80 }, { x: -60, z: -60 },
    { x: -40, z: -30 }, { x: 0, z: -10 },
    { x: 40, z: 20 }, { x: 60, z: 60 }, { x: 40, z: 80 }
];
TRACKS.push({
    id: 'track_04',
    name: 'Cloverleaf',
    type: 'race',
    path: CLOVER_PATH,
    boundaries: createTrackFromPath(CLOVER_PATH, 20, true),
    spawnPoints: generateAlignedSpawns(CLOVER_PATH, 5, 8),
    powerupBounds: { minX: -70, maxX: 70, minZ: -90, maxZ: 90 },
    floorSize: { width: 180, depth: 220 }
});

// =============================================================================
// TRACK 5: Hexagon Heat
// =============================================================================
TRACKS.push({
    id: 'track_05',
    name: 'Hexagon Heat',
    type: 'arena',
    boundaries: createArena(55, 6),
    spawnPoints: generateCircleSpawns(40, 12),
    powerupBounds: { minX: -45, maxX: 45, minZ: -45, maxZ: 45 },
    floorSize: { width: 140, depth: 140 }
});

// =============================================================================
// TRACK 6: Dragon's Tail
// =============================================================================
const DRAGON_PATH = [
    { x: -50, z: 90 }, { x: -30, z: 70 }, { x: 10, z: 70 },
    { x: 30, z: 50 }, { x: 50, z: 30 }, { x: 30, z: 10 },
    { x: -10, z: 10 }, { x: -30, z: -10 }, { x: -50, z: -30 },
    { x: -30, z: -50 }, { x: 10, z: -50 }, { x: 30, z: -70 },
    { x: 50, z: -90 }, { x: 30, z: -100 }, { x: -50, z: -100 },
    { x: -70, z: -70 }, { x: -70, z: 70 }
];
TRACKS.push({
    id: 'track_06',
    name: "Dragon's Tail",
    type: 'race',
    path: DRAGON_PATH,
    boundaries: createTrackFromPath(DRAGON_PATH, 16, true),
    spawnPoints: generateAlignedSpawns(DRAGON_PATH, 5, 8),
    powerupBounds: { minX: -80, maxX: 60, minZ: -110, maxZ: 100 },
    floorSize: { width: 200, depth: 260 }
});

// =============================================================================
// TRACK 7: The Octagon
// =============================================================================
TRACKS.push({
    id: 'track_07',
    name: 'The Octagon',
    type: 'arena',
    boundaries: createArena(50, 8),
    spawnPoints: generateCircleSpawns(35, 10),
    powerupBounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 },
    floorSize: { width: 120, depth: 120 }
});

// =============================================================================
// TRACK 8: Grand Prix
// =============================================================================
const GP_PATH = [
    { x: -60, z: 80 }, { x: 0, z: 80 }, { x: 30, z: 70 },
    { x: 50, z: 50 }, { x: 60, z: 20 },
    { x: 50, z: 0 }, { x: 30, z: -10 },
    { x: 50, z: -30 }, { x: 60, z: -50 },
    { x: 50, z: -70 }, { x: 20, z: -80 },
    { x: -20, z: -80 }, { x: -50, z: -70 },
    { x: -60, z: -40 }, { x: -50, z: -10 },
    { x: -60, z: 20 }
];
TRACKS.push({
    id: 'track_08',
    name: 'Grand Prix',
    type: 'race',
    path: GP_PATH,
    boundaries: createTrackFromPath(GP_PATH, 18, true),
    spawnPoints: generateAlignedSpawns(GP_PATH, 5, 8),
    powerupBounds: { minX: -70, maxX: 70, minZ: -90, maxZ: 90 },
    floorSize: { width: 180, depth: 220 }
});

// =============================================================================
// TRACK 9: Triangle Terror
// =============================================================================
TRACKS.push({
    id: 'track_09',
    name: 'Triangle Terror',
    type: 'arena',
    boundaries: createArena(60, 3),
    spawnPoints: generateCircleSpawns(30, 8),
    powerupBounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 },
    floorSize: { width: 150, depth: 150 }
});

// =============================================================================
// TRACK 10: Velocity Strip
// =============================================================================
const STRIP_PATH = [
    { x: -25, z: 100 }, { x: 25, z: 100 },
    { x: 25, z: -80 }, { x: 40, z: -95 }, { x: 40, z: -110 },
    { x: -40, z: -110 }, { x: -40, z: -95 }, { x: -25, z: -80 }
];
TRACKS.push({
    id: 'track_10',
    name: 'Velocity Strip',
    type: 'race',
    path: STRIP_PATH,
    boundaries: createTrackFromPath(STRIP_PATH, 35, true),
    spawnPoints: generateAlignedSpawns(STRIP_PATH, 5, 8),
    powerupBounds: { minX: -50, maxX: 50, minZ: -120, maxZ: 110 },
    floorSize: { width: 120, depth: 280 }
});

// =============================================================================
// TRACK 11: The Coliseum
// =============================================================================
TRACKS.push({
    id: 'track_11',
    name: 'The Coliseum',
    type: 'arena',
    boundaries: createArena(75, 20),
    spawnPoints: generateCircleSpawns(55, 12),
    powerupBounds: { minX: -65, maxX: 65, minZ: -65, maxZ: 65 },
    floorSize: { width: 180, depth: 180 }
});

// =============================================================================
// TRACK 12: The Cage
// =============================================================================
TRACKS.push({
    id: 'track_12',
    name: 'The Cage',
    type: 'arena',
    boundaries: createArena(35, 12),
    spawnPoints: generateCircleSpawns(20, 12),
    powerupBounds: { minX: -28, maxX: 28, minZ: -28, maxZ: 28 },
    floorSize: { width: 90, depth: 90 }
});

// =============================================================================
// EXPORTS
// =============================================================================
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
