// =============================================================================
// TRACK DEFINITIONS
// =============================================================================
// Tracks define boundaries, spawn points, and visual data for race arenas.
// Each wall is defined as a segment: { x1, z1, x2, z2, height }
// New tracks can be added to the TRACKS array.

const TRACKS = [
    {
        id: 'test_track',
        name: 'Test Arena',
        // Rectangular arena: 80 units wide (x), 100 units long (z)
        // Centered at origin
        boundaries: [
            // North wall (far side, -z)
            { x1: -40, z1: -50, x2: 40, z2: -50, height: 4 },
            // South wall (near side, +z)
            { x1: -40, z1: 50, x2: 40, z2: 50, height: 4 },
            // East wall (+x)
            { x1: 40, z1: -50, x2: 40, z2: 50, height: 4 },
            // West wall (-x)
            { x1: -40, z1: -50, x2: -40, z2: 50, height: 4 },
        ],
        spawnPoints: [
            { x: -15, z: 30 },
            { x: -5, z: 30 },
            { x: 5, z: 30 },
            { x: 15, z: 30 },
            { x: -15, z: 40 },
            { x: -5, z: 40 },
            { x: 5, z: 40 },
            { x: 15, z: 40 },
        ],
        // Floor size for renderer
        floorSize: { width: 80, depth: 100 },
        // Powerup spawn bounds
        powerupBounds: { minX: -35, maxX: 35, minZ: -45, maxZ: 45 },
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
