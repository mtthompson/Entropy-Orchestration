/**
 * CPU Pathfinding Worker Thread
 * Handles AI steering calculations off the main thread
 */
const { parentPort, workerData } = require('worker_threads');

const workerId = workerData?.workerId || 0;

// =============================================================================
// PATHFINDING FUNCTIONS (copied from cpuPathfinding.js for isolation)
// =============================================================================

function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
}

function distanceSquared(p1, p2) {
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    return dx * dx + dz * dz;
}

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
 * Calculate next waypoint for a CPU in race mode
 */
function getNextWaypoint(cpuPos, waypointIndex, path, lookahead = 8) { // Increased default lookahead for smooth path
    if (!path || path.length === 0) {
        return { x: 0, z: 0, waypointIndex: 0 };
    }

    const WAYPOINT_THRESHOLD = 10; // Reduced for more precise waypoint following
    let currentIndex = waypointIndex || 0;

    // Scan ahead to find the closest waypoint in the forward direction
    // This helps if we get slightly off track
    let bestIndex = currentIndex;
    let closestDistSq = Infinity;

    // check next 10 points to see if we're closer to one of them
    for (let i = 0; i < 10; i++) {
        const idx = (currentIndex + i) % path.length;
        const distSq = distanceSquared(cpuPos, path[idx]);
        if (distSq < closestDistSq) {
            closestDistSq = distSq;
            bestIndex = idx;
        }
    }

    // If we found a closer point ahead, advance to it
    if (bestIndex !== currentIndex) {
        currentIndex = bestIndex;
    }

    const currentWaypoint = path[currentIndex];
    const distToCurrentSq = distanceSquared(cpuPos, currentWaypoint);

    if (distToCurrentSq < WAYPOINT_THRESHOLD * WAYPOINT_THRESHOLD) {
        currentIndex = (currentIndex + 1) % path.length;
    }

    const targetIndex = (currentIndex + lookahead) % path.length;
    const target = path[targetIndex];

    return {
        x: target.x,
        z: target.z,
        waypointIndex: currentIndex
    };
}

// Simple pseudo-random generator for deterministic wobble based on ID + time
function getWobble(id, timeStr) {
    const seed = id.charCodeAt(0) + parseInt(timeStr.slice(-4));
    return Math.sin(seed * 0.1) * 0.15; // +/- 0.15 wobble
}

/**
 * Get target for CPU in arena mode (chase nearest enemy or patrol center)
 */
function getArenaTarget(position, cpuId, allEntities, trackBounds) {
    let nearestTarget = null;
    let nearestDistSq = Infinity;

    // Split entities into human, CPU, and powerups
    const humans = allEntities.filter(e => !e.isCPU && !e.isPowerup);
    const cpus = allEntities.filter(e => e.isCPU);
    const powerups = allEntities.filter(e => e.isPowerup);

    // Prioritize humans
    for (const entity of humans) {
        if (entity.id === cpuId || entity.hp <= 0) continue;
        const distSq = distanceSquared(position, entity.position);
        if (distSq < nearestDistSq) {
            nearestDistSq = distSq;
            nearestTarget = entity.position;
        }
    }

    // 2. Then CPUs
    if (!nearestTarget) {
        for (const entity of cpus) {
            if (entity.id === cpuId || entity.hp <= 0) continue;
            const distSq = distanceSquared(position, entity.position);
            if (distSq < nearestDistSq) {
                nearestDistSq = distSq;
                nearestTarget = entity.position;
            }
        }
    }

    // 3. Then Powerups
    // 3. Then Powerups
    if (!nearestTarget) {
        for (const entity of powerups) {
            const distSq = distanceSquared(position, entity.position);
            if (distSq < nearestDistSq) {
                nearestDistSq = distSq;
                nearestTarget = entity.position;
            }
        }
    }


    // 3. Fallback: Patrol center (0,0) if no valid targets
    if (!nearestTarget) {
        nearestTarget = { x: 0, z: 0 };
    }

    // 4. Safety Clamp: Ensure target is STRICTLY within playable bounds
    // Use trackBounds passed from server, or default to safe 50x50 box
    const minX = trackBounds ? trackBounds.minX + 5 : -50;
    const maxX = trackBounds ? trackBounds.maxX - 5 : 50;
    const minZ = trackBounds ? trackBounds.minZ + 5 : -50;
    const maxZ = trackBounds ? trackBounds.maxZ - 5 : 50;

    // Hard clamp to rectangular bounds
    const oldX = nearestTarget.x;
    const oldZ = nearestTarget.z;
    nearestTarget.x = Math.max(minX, Math.min(maxX, nearestTarget.x));
    nearestTarget.z = Math.max(minZ, Math.min(maxZ, nearestTarget.z));

    if (Math.random() < 0.01) {
        console.log(`[CPU_TARGET] ID: ${cpuId} Target: (${oldX.toFixed(1)}, ${oldZ.toFixed(1)}) -> Clamped: (${nearestTarget.x.toFixed(1)}, ${nearestTarget.z.toFixed(1)}) Bounds: [${minX}, ${maxX}, ${minZ}, ${maxZ}]`);
    }

    return nearestTarget;
}

/**
 * Calculate steering output for a CPU
 */
function calculateSteering(cpuData, target, isRacing) {
    const { position, quaternion, velocity, rank, totalRacers, id } = cpuData;

    const dx = target.x - position.x;
    const dz = target.z - position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Current heading from quaternion
    const q = quaternion;
    const currentAngle = Math.atan2(
        2 * (q.w * q.y + q.x * q.z),
        1 - 2 * (q.y * q.y + q.x * q.x)
    );

    if (dist < 0.1) {
        return {
            input: { steering: 0, throttle: 0, boost: false },
            angleDiff: 0,
            currentAngle
        };
    }

    // Target angle
    // Align with physics coordinates: North=0, West=+90, East=-90
    // atan2(-dx, -dz) creates this mapping
    const targetAngle = Math.atan2(-dx, -dz);

    // Angle difference
    let angleDiff = normalizeAngle(targetAngle - currentAngle);

    // Steering proportional to angle - NEGATIVE feedback to close the gap
    // Reduced sensitivity to prevent oscillation
    const steeringSens = isRacing ? 3.0 : 1.5;
    // Invert sign because Positive Steering -> Turns Right (Decreases Yaw in physics)
    // Wait, Physics: +Steer -> -Yaw (Left?).
    // R (-90). Current (-90). Diff 0.
    // L (+90). Current (+90). Diff 0.
    // L (+90). Current (0). Diff +90.
    // Steer = -90. Neg Steer -> +Yaw (Right?).
    // If L is +90, I want to turn Left (+Yaw).
    // So Steer should be NEGATIVE?
    // Let's stick with steering = -angleDiff which worked for initial alignment.
    let steering = -angleDiff * steeringSens;

    // Add imperfection/wobble
    if (isRacing) {
        const wobble = getWobble(id, Date.now().toString());
        steering += wobble;
    }

    // Throttle: reduce when turning sharply
    const turnFactor = 1 - Math.abs(angleDiff) / Math.PI;
    let throttle = 0.4 + 0.6 * turnFactor; // 0.4 to 1.0 based on turn sharpness

    // Reverse Logic: REMOVED for now as it causes stalling without reverse physics
    // Just allow the turnFactor to slow it down (arc turn)
    /*
    const isReversing = Math.abs(angleDiff) > (Math.PI * 0.8);
    if (isReversing) {
        throttle = -1.0; 
    }
    */

    if (Math.random() < 0.05) {
        // console.log(`[CPU_STEER] ID: ${id} Diff: ${angleDiff.toFixed(2)} Steer: ${steering.toFixed(2)} Thr: ${throttle.toFixed(2)} Rev: ${isReversing}`);
    }

    return {
        input: {
            steering: Math.max(-1, Math.min(1, steering)),
            throttle: Math.max(0, Math.min(1, throttle)), // Normalize for unified physics (0 to 1)
            boost: false // Set by combat logic
        },
        angleDiff,
        currentAngle
    };
}

/**
 * Check for combat opportunities (ramming)
 */
function checkCombatTargets(cpuData, allEntities, currentAngle, isRacing) {
    const combatRange = 25;
    const combatChance = isRacing ? 0.3 : 0.6;

    if (Math.random() > combatChance) {
        return 1.0;
    }

    const cpuPos = cpuData.position;

    for (const entity of allEntities) {
        if (entity.id === cpuData.id || entity.hp <= 0) continue;

        const dx = entity.position.x - cpuPos.x;
        const dz = entity.position.z - cpuPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < combatRange) {
            const toAngle = Math.atan2(dx, -dz);
            const aimDiff = Math.abs(normalizeAngle(toAngle - currentAngle));

            // Within 30 degrees - boost!
            if (aimDiff < Math.PI / 6) {
                return 1.15;
            }
        }
    }

    return 1.0;
}

// =============================================================================
// MESSAGE HANDLER
// =============================================================================

parentPort.on('message', (message) => {
    const { taskId, type, payload } = message;

    try {
        let result;

        switch (type) {
            case 'calculateCpuBatch': {
                // Process batch of CPU calculations
                const { cpuList, trackPath, trackType, allEntities, trackBounds } = payload;
                const isRacing = trackType === 'race' && trackPath;

                result = cpuList.map(cpu => {
                    let target;
                    let newWaypointIndex = cpu.waypointIndex;


                    if (isRacing) {
                        const waypoint = getNextWaypoint(
                            cpu.position,
                            cpu.waypointIndex,
                            trackPath,
                            3
                        );
                        target = { x: waypoint.x, z: waypoint.z };
                        newWaypointIndex = waypoint.waypointIndex;
                    } else {
                        target = getArenaTarget(cpu.position, cpu.id, allEntities, trackBounds);
                    }

                    const steerResult = calculateSteering(cpu, target, isRacing);
                    const combatBoost = checkCombatTargets(
                        cpu,
                        allEntities,
                        steerResult.currentAngle,
                        isRacing
                    );

                    const input = steerResult.input;
                    input.boost = combatBoost > 1.0;

                    // Standardize fire logic: 5% chance if enemy in range/angle
                    let shouldFire = false;
                    if (cpu.ammo > 0 && Math.random() < 0.05) {
                        for (const entity of allEntities) {
                            if (entity.id === cpu.id || entity.hp <= 0) continue;
                            const dx = entity.position.x - cpu.position.x;
                            const dz = entity.position.z - cpu.position.z;
                            const distSq = dx * dx + dz * dz;
                            if (distSq < 1600) { // 40 range
                                const toAngle = Math.atan2(dx, -dz);
                                const aimDiff = Math.abs(normalizeAngle(toAngle - steerResult.currentAngle));
                                if (aimDiff < Math.PI / 8) {
                                    shouldFire = true;
                                    break;
                                }
                            }
                        }
                    }

                    return {
                        id: cpu.id,
                        input: input,
                        fire: shouldFire,
                        waypointIndex: newWaypointIndex,
                        target
                    };
                });
                break;
            }

            case 'calculateSingleCpu': {
                // Single CPU calculation
                const { cpu, trackPath, trackType, allEntities, trackBounds } = payload;
                const isRacing = trackType === 'race' && trackPath;

                let target;
                let newWaypointIndex = cpu.waypointIndex;

                if (isRacing) {
                    const waypoint = getNextWaypoint(
                        cpu.position,
                        cpu.waypointIndex,
                        trackPath,
                        3
                    );
                    target = { x: waypoint.x, z: waypoint.z };
                    newWaypointIndex = waypoint.waypointIndex;
                } else {
                    target = getArenaTarget(cpu.position, cpu.id, allEntities, trackBounds);
                }

                const steerResult = calculateSteering(cpu, target, isRacing);
                const combatBoost = checkCombatTargets(
                    cpu,
                    allEntities,
                    steerResult.currentAngle,
                    isRacing
                );

                const input = steerResult.input;
                input.boost = combatBoost > 1.0;

                // Standardize fire logic: 5% chance if enemy in range/angle
                let shouldFire = false;
                if (cpu.ammo > 0 && Math.random() < 0.05) {
                    for (const entity of allEntities) {
                        if (entity.id === cpu.id || entity.hp <= 0) continue;
                        const dx = entity.position.x - cpu.position.x;
                        const dz = entity.position.z - cpu.position.z;
                        const distSq = dx * dx + dz * dz;
                        if (distSq < 1600) { // 40 range
                            const toAngle = Math.atan2(dx, -dz);
                            const aimDiff = Math.abs(normalizeAngle(toAngle - steerResult.currentAngle));
                            if (aimDiff < Math.PI / 8) {
                                shouldFire = true;
                                break;
                            }
                        }
                    }
                }

                result = {
                    id: cpu.id,
                    input: input,
                    fire: shouldFire,
                    waypointIndex: newWaypointIndex,
                    target
                };
                break;
            }

            default:
                throw new Error(`Unknown task type: ${type}`);
        }

        parentPort.postMessage({ taskId, data: result });

    } catch (error) {
        parentPort.postMessage({ taskId, error: error.message });
    }
});

console.log(`[CPUWorker ${workerId}] Ready`);
