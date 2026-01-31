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

module.exports = { getTrackById, getAllTracks, getDefaultTrack, getRandomTrack };
