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
function getNextWaypoint(cpuPos, waypointIndex, path, lookahead = 3) {
    if (!path || path.length === 0) {
        return { x: 0, z: 0, waypointIndex: 0 };
    }

    const WAYPOINT_THRESHOLD = 10;
    let currentIndex = waypointIndex || 0;
    
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

/**
 * Find nearest enemy target for arena mode
 */
function getArenaTarget(cpuPos, cpuId, allEntities) {
    let nearestTarget = null;
    let nearestDistSq = Infinity;

    for (const entity of allEntities) {
        if (entity.id === cpuId || entity.hp <= 0) continue;
        
        const distSq = distanceSquared(cpuPos, entity.position);
        
        // Prioritize human players
        if (!entity.isCPU && distSq < nearestDistSq) {
            nearestDistSq = distSq;
            nearestTarget = entity.position;
        } else if (entity.isCPU && !nearestTarget && distSq < nearestDistSq) {
            nearestDistSq = distSq;
            nearestTarget = entity.position;
        }
    }

    // Default to center patrol
    if (!nearestTarget) {
        const offset = (cpuId.charCodeAt(4) || 0) % 20 - 10;
        nearestTarget = { x: offset, z: offset };
    }

    return nearestTarget;
}

/**
 * Calculate steering output for a CPU
 */
function calculateSteering(cpuData, target, isRacing) {
    const { position, quaternion, velocity } = cpuData;
    
    const dx = target.x - position.x;
    const dz = target.z - position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.1) {
        return { steering: 0, throttle: 0, combatBoost: 1.0 };
    }

    // Target angle
    const targetAngle = Math.atan2(dx, -dz);

    // Current heading from quaternion
    const q = quaternion;
    const currentAngle = Math.atan2(
        2 * (q.w * q.y + q.x * q.z), 
        1 - 2 * (q.y * q.y + q.x * q.x)
    );

    // Angle difference
    let angleDiff = normalizeAngle(targetAngle - currentAngle);

    // Steering proportional to angle
    const steering = angleDiff * 3.0;

    // Throttle reduces with sharp turns
    const turnFactor = 1 - Math.abs(angleDiff) / Math.PI;
    const baseThrottle = isRacing ? 350 : 280;
    const throttle = baseThrottle + baseThrottle * turnFactor;

    return {
        steering,
        throttle,
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
                const { cpuList, trackPath, trackType, allEntities } = payload;
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
                        target = getArenaTarget(cpu.position, cpu.id, allEntities);
                    }
                    
                    const steering = calculateSteering(cpu, target, isRacing);
                    const combatBoost = checkCombatTargets(
                        cpu, 
                        allEntities, 
                        steering.currentAngle, 
                        isRacing
                    );
                    
                    return {
                        id: cpu.id,
                        steering: steering.steering,
                        throttle: steering.throttle * combatBoost,
                        waypointIndex: newWaypointIndex,
                        target
                    };
                });
                break;
            }
            
            case 'calculateSingleCpu': {
                // Single CPU calculation
                const { cpu, trackPath, trackType, allEntities } = payload;
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
                    target = getArenaTarget(cpu.position, cpu.id, allEntities);
                }
                
                const steering = calculateSteering(cpu, target, isRacing);
                const combatBoost = checkCombatTargets(
                    cpu, 
                    allEntities, 
                    steering.currentAngle, 
                    isRacing
                );
                
                result = {
                    id: cpu.id,
                    steering: steering.steering,
                    throttle: steering.throttle * combatBoost,
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
