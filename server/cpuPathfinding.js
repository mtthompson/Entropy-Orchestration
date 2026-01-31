/**
 * CPU Pathfinding Module
 * Provides waypoint-following logic for CPU racers
 */

/**
 * Normalize angle to [-π, π] range
 * @param {number} angle - Angle in radians
 * @returns {number} Normalized angle
 */
function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
}

/**
 * Calculate squared distance between two points (faster than sqrt)
 * @param {Object} p1 - Point with x, z properties
 * @param {Object} p2 - Point with x, z properties
 * @returns {number} Squared distance
 */
function distanceSquared(p1, p2) {
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    return dx * dx + dz * dz;
}

/**
 * Find the index of the nearest waypoint to a position
 * @param {{x: number, z: number}} position - Current position
 * @param {Array<{x: number, z: number}>} path - Array of waypoints
 * @returns {number} Index of nearest waypoint
 */
function findNearestWaypointIndex(position, path) {
    if (!path || path.length === 0) return 0;

    let nearestIndex = 0;
    let nearestDistSq = Infinity;

    for (let i = 0; i < path.length; i++) {
        const distSq = distanceSquared(position, path[i]);
        if (distSq < nearestDistSq) {
            nearestDistSq = distSq;
            nearestIndex = i;
        }
    }

    return nearestIndex;
}

/**
 * Get the next waypoint target for a CPU racer on a race track
 * @param {Object} cpu - CPU player object with position and waypointIndex
 * @param {Array<{x: number, z: number}>} path - Track waypoints
 * @param {number} lookahead - How many waypoints ahead to look (default 2)
 * @returns {{x: number, z: number, waypointIndex: number}} Target position and updated waypoint index
 */
function getNextWaypoint(cpu, path, lookahead = 2) {
    if (!path || path.length === 0) {
        return { x: 0, z: 0, waypointIndex: 0 };
    }

    const pos = { x: cpu.body.position.x, z: cpu.body.position.z };
    let currentIndex = cpu.waypointIndex || 0;

    // Check if we've reached the current waypoint (within threshold)
    const WAYPOINT_THRESHOLD = 15; // Distance to consider waypoint "reached"
    const currentWaypoint = path[currentIndex];
    const distToCurrentSq = distanceSquared(pos, currentWaypoint);

    if (distToCurrentSq < WAYPOINT_THRESHOLD * WAYPOINT_THRESHOLD) {
        // Advance to next waypoint
        currentIndex = (currentIndex + 1) % path.length;
    }

    // Target a waypoint ahead for smoother cornering
    const targetIndex = (currentIndex + lookahead) % path.length;
    const target = path[targetIndex];

    return {
        x: target.x,
        z: target.z,
        waypointIndex: currentIndex
    };
}

/**
 * Get target for CPU in arena mode (chase nearest enemy or patrol center)
 * @param {Object} cpu - CPU player object
 * @param {Map} players - Human players map
 * @param {Map} cpuPlayers - CPU players map
 * @returns {{x: number, z: number}} Target position
 */
function getArenaTarget(cpu, players, cpuPlayers) {
    const pos = cpu.body.position;
    let nearestTarget = null;
    let nearestDistSq = Infinity;

    // Find nearest human player (prioritize)
    for (const [id, player] of players) {
        if (!player.body || player.type !== 'driver' || player.hp <= 0) continue;

        const distSq = distanceSquared(
            { x: pos.x, z: pos.z },
            { x: player.body.position.x, z: player.body.position.z }
        );

        if (distSq < nearestDistSq) {
            nearestDistSq = distSq;
            nearestTarget = { x: player.body.position.x, z: player.body.position.z };
        }
    }

    // If no human, find nearest other CPU
    if (!nearestTarget) {
        for (const [id, otherCpu] of cpuPlayers) {
            if (id === cpu.id || !otherCpu.body || otherCpu.hp <= 0) continue;

            const distSq = distanceSquared(
                { x: pos.x, z: pos.z },
                { x: otherCpu.body.position.x, z: otherCpu.body.position.z }
            );

            if (distSq < nearestDistSq) {
                nearestDistSq = distSq;
                nearestTarget = { x: otherCpu.body.position.x, z: otherCpu.body.position.z };
            }
        }
    }

    // If still no target, patrol toward center with some randomness
    if (!nearestTarget) {
        // Add slight offset to prevent all CPUs converging on exact center
        const offset = (cpu.id.charCodeAt(4) || 0) % 20 - 10;
        nearestTarget = { x: offset, z: offset };
    }

    return nearestTarget;
}

/**
 * Calculate steering and throttle for CPU to reach target
 * @param {Object} cpu - CPU player with body
 * @param {{x: number, z: number}} target - Target position
 * @returns {{steering: number, throttle: number}} Control values
 */
function calculateCPUControls(cpu, target) {
    const pos = cpu.body.position;
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.1) {
        return { steering: 0, throttle: 0 };
    }

    // Calculate target angle (direction to target)
    const targetAngle = Math.atan2(dx, -dz);

    // Get current heading from quaternion
    const euler = { x: 0, y: 0, z: 0 };
    const q = cpu.body.quaternion;
    // Simplified euler extraction for Y rotation
    const sinY = 2 * (q.w * q.y - q.z * q.x);
    euler.y = Math.abs(sinY) >= 1 ? Math.sign(sinY) * Math.PI / 2 : Math.asin(sinY);
    // More accurate for our use case:
    euler.y = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));

    const currentAngle = euler.y;

    // Calculate angle difference
    let angleDiff = normalizeAngle(targetAngle - currentAngle);

    // Steering: proportional to angle difference, clamped
    const steering = Math.max(-1, Math.min(1, angleDiff / (Math.PI / 4)));

    // Throttle: reduce when turning sharply
    const turnFactor = 1 - Math.abs(angleDiff) / Math.PI;
    const throttle = 0.5 + 0.5 * turnFactor; // 0.5 to 1.0 based on turn sharpness

    return { steering, throttle };
}

module.exports = {
    normalizeAngle,
    distanceSquared,
    findNearestWaypointIndex,
    getNextWaypoint,
    getArenaTarget,
    calculateCPUControls
};
