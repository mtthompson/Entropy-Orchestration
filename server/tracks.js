// =============================================================================
// TRACK DEFINITIONS
// =============================================================================
// Tracks define boundaries, spawn points, start/finish lines, and visual data.
// Linear tracks have left and right walls that form a racing corridor.
// Each wall segment: { x1, z1, x2, z2, height }

const TRACKS = [
    {
        id: 'test_track',
        name: 'Serpent Circuit',
        type: 'linear', // linear = racing corridor with turns

        // Track width: ~20 units between left and right walls
        // Track flows from +z (start) toward -z (finish) with turns
        boundaries: [
            // === STARTING STRAIGHT (z: 60 to 30) ===
            // Left wall
            { x1: -10, z1: 60, x2: -10, z2: 30, height: 4 },
            // Right wall  
            { x1: 10, z1: 60, x2: 10, z2: 30, height: 4 },

            // === FIRST TURN - RIGHT (connects to eastward section) ===
            // Outer wall (left becomes bottom of turn)
            { x1: -10, z1: 30, x2: 0, z2: 20, height: 4 },
            // Inner wall (right becomes top of turn)
            { x1: 10, z1: 30, x2: 20, z2: 20, height: 4 },

            // === EASTWARD STRAIGHT (x: 0 to 40, z: ~20) ===
            // Top wall
            { x1: 0, z1: 20, x2: 40, z2: 20, height: 4 },
            // Bottom wall
            { x1: 20, z1: 0, x2: 60, z2: 0, height: 4 },

            // === SECOND TURN - LEFT (connects to northward section) ===
            // Outer wall
            { x1: 40, z1: 20, x2: 50, z2: 10, height: 4 },
            { x1: 50, z1: 10, x2: 50, z2: -20, height: 4 },
            // Inner wall
            { x1: 60, z1: 0, x2: 70, z2: -10, height: 4 },
            { x1: 70, z1: -10, x2: 70, z2: -40, height: 4 },

            // === NORTHWARD STRAIGHT (z: -20 to -60) ===
            // Left wall
            { x1: 50, z1: -20, x2: 50, z2: -60, height: 4 },
            // Right wall
            { x1: 70, z1: -40, x2: 70, z2: -80, height: 4 },

            // === THIRD TURN - LEFT (connects to westward finish) ===
            // Outer walls
            { x1: 50, z1: -60, x2: 40, z2: -70, height: 4 },
            { x1: 40, z1: -70, x2: 0, z2: -70, height: 4 },
            // Inner walls
            { x1: 70, z1: -80, x2: 60, z2: -90, height: 4 },
            { x1: 60, z1: -90, x2: 0, z2: -90, height: 4 },

            // === FINISH STRAIGHT ===
            // End walls
            { x1: 0, z1: -70, x2: 0, z2: -90, height: 4 },
        ],

        // Start line at beginning of first straight
        startLine: { x1: -10, z1: 55, x2: 10, z2: 55 },

        // Finish line at end of track
        finishLine: { x1: 0, z1: -70, x2: 0, z2: -90 },

        // Spawn points behind start line (staggered grid)
        spawnPoints: [
            { x: -5, z: 58 },
            { x: 5, z: 58 },
            { x: -5, z: 62 },
            { x: 5, z: 62 },
            { x: 0, z: 65 },
            { x: -5, z: 68 },
            { x: 5, z: 68 },
            { x: 0, z: 71 },
        ],

        // Floor bounds (covers entire track area)
        floorSize: { width: 120, depth: 180 },
        floorOffset: { x: 30, z: -15 }, // Center the floor over the track

        // Powerup spawn areas (along the track corridor)
        powerupBounds: { minX: -5, maxX: 65, minZ: -85, maxZ: 55 },
    },
];

/**
 * Get a track by its ID
 * @param {string} id - Track ID
 * @returns {object|null} Track definition or null if not found
 */
function getTrackById(id) {
    return TRACKS.find(track => track.id === id) || null;
}

/**
 * Get all available tracks
 * @returns {Array} Array of track definitions
 */
function getAllTracks() {
    return TRACKS;
}

/**
 * Get default track
 * @returns {object} Default track definition
 */
function getDefaultTrack() {
    return TRACKS[0];
}

module.exports = {
    getTrackById,
    getAllTracks,
    getDefaultTrack,
};
