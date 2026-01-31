/**
 * Particle System Web Worker
 * Offloads particle position calculations from the main rendering thread
 * 
 * Handles:
 * - Explosion burst particle updates
 * - Trail particle calculations
 * - Ambient particle systems
 */

// =============================================================================
// PARTICLE PHYSICS CALCULATIONS
// =============================================================================

/**
 * Update explosion particles
 * @param {Float32Array} positions - Particle positions (x,y,z triplets)
 * @param {Array} velocities - Velocity vectors
 * @param {Array} lifetimes - Remaining lifetime per particle
 * @param {number} delta - Time delta in seconds
 * @param {object} config - Configuration (gravity, drag, etc.)
 * @returns {object} Updated state
 */
function updateExplosionParticles(positions, velocities, lifetimes, delta, config) {
    const { gravity = 40, drag = 0.98 } = config;
    const count = lifetimes.length;
    let activeCount = 0;
    
    for (let i = 0; i < count; i++) {
        if (lifetimes[i] <= 0) continue;
        
        lifetimes[i] -= delta;
        activeCount++;
        
        const idx = i * 3;
        const v = velocities[i];
        
        // Apply physics
        v.y -= gravity * delta;
        v.x *= drag;
        v.z *= drag;
        
        // Update position
        positions[idx] += v.x * delta;
        positions[idx + 1] += v.y * delta;
        positions[idx + 2] += v.z * delta;
    }
    
    return { positions, velocities, lifetimes, activeCount };
}

/**
 * Update smoke/trail particles
 * @param {Float32Array} positions
 * @param {Array} velocities
 * @param {Array} lifetimes
 * @param {number} delta
 * @param {object} config
 * @param {Array} spawnPoint - Where to spawn new particles [x, y, z]
 * @param {boolean} active - Whether to spawn new particles
 * @returns {object} Updated state
 */
function updateSmokeParticles(positions, velocities, lifetimes, delta, config, spawnPoint, active) {
    const { 
        gravity = -3, // Smoke rises
        spread = 1.5,
        initialVelocityY = 2,
        lifetime = 0.4,
        intensity = 1
    } = config;
    
    const count = lifetimes.length;
    
    for (let i = 0; i < count; i++) {
        lifetimes[i] -= delta;
        
        // Respawn dead particles if active
        if (lifetimes[i] <= 0 && active) {
            const idx = i * 3;
            positions[idx] = spawnPoint[0] + (Math.random() - 0.5) * spread;
            positions[idx + 1] = spawnPoint[1] + 0.2;
            positions[idx + 2] = spawnPoint[2] + (Math.random() - 0.5) * spread;
            
            velocities[i] = {
                x: (Math.random() - 0.5) * 2 * intensity,
                y: Math.random() * initialVelocityY + 1,
                z: (Math.random() - 0.5) * 2 * intensity
            };
            lifetimes[i] = Math.random() * lifetime + 0.2;
        } else if (lifetimes[i] > 0) {
            // Update existing particle
            const idx = i * 3;
            const v = velocities[i];
            
            positions[idx] += v.x * delta;
            positions[idx + 1] += v.y * delta;
            positions[idx + 2] += v.z * delta;
            
            v.y -= gravity * delta;
        }
    }
    
    return { positions, velocities, lifetimes };
}

/**
 * Update ambient floating particles
 * @param {Float32Array} positions
 * @param {Array} phases - Animation phase per particle
 * @param {number} time - Total elapsed time
 * @param {object} config
 * @param {Array} bounds - [minX, maxX, minY, maxY, minZ, maxZ]
 * @returns {object} Updated state
 */
function updateAmbientParticles(positions, phases, time, config, bounds) {
    const {
        floatSpeed = 0.5,
        floatAmplitude = 2,
        driftSpeed = 0.1
    } = config;
    
    const count = phases.length;
    const [minX, maxX, minY, maxY, minZ, maxZ] = bounds;
    
    for (let i = 0; i < count; i++) {
        const idx = i * 3;
        const phase = phases[i];
        
        // Floating motion
        positions[idx + 1] += Math.sin(time * floatSpeed + phase) * floatAmplitude * 0.01;
        
        // Gentle drift
        positions[idx] += Math.sin(time * driftSpeed + phase * 2) * 0.01;
        positions[idx + 2] += Math.cos(time * driftSpeed + phase * 3) * 0.01;
        
        // Wrap around bounds
        if (positions[idx] < minX) positions[idx] = maxX;
        if (positions[idx] > maxX) positions[idx] = minX;
        if (positions[idx + 1] < minY) positions[idx + 1] = maxY;
        if (positions[idx + 1] > maxY) positions[idx + 1] = minY;
        if (positions[idx + 2] < minZ) positions[idx + 2] = maxZ;
        if (positions[idx + 2] > maxZ) positions[idx + 2] = minZ;
    }
    
    return { positions, phases };
}

/**
 * Initialize explosion particles at a position
 * @param {number} count - Number of particles
 * @param {Array} origin - [x, y, z] explosion center
 * @param {object} config
 * @returns {object} Initial state
 */
function initExplosion(count, origin, config) {
    const { speed = 20, spread = 1, lifetime = 0.4 } = config;
    
    const positions = new Float32Array(count * 3);
    const velocities = [];
    const lifetimes = [];
    
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const elevation = Math.random() * Math.PI * 0.5;
        const vel = Math.random() * speed + speed * 0.5;
        
        positions[i * 3] = origin[0];
        positions[i * 3 + 1] = origin[1];
        positions[i * 3 + 2] = origin[2];
        
        velocities.push({
            x: Math.cos(angle) * Math.cos(elevation) * vel * spread,
            y: Math.sin(elevation) * vel + 5,
            z: Math.sin(angle) * Math.cos(elevation) * vel * spread
        });
        
        lifetimes.push(Math.random() * lifetime + lifetime * 0.5);
    }
    
    return { positions, velocities, lifetimes };
}

// =============================================================================
// MESSAGE HANDLER
// =============================================================================

self.onmessage = function(e) {
    const { taskId, type, payload } = e.data;
    
    try {
        let result;
        
        switch (type) {
            case 'updateExplosion': {
                const { positions, velocities, lifetimes, delta, config } = payload;
                result = updateExplosionParticles(
                    new Float32Array(positions),
                    velocities,
                    lifetimes,
                    delta,
                    config || {}
                );
                // Transfer the positions buffer back
                result.positions = Array.from(result.positions);
                break;
            }
            
            case 'updateSmoke': {
                const { positions, velocities, lifetimes, delta, config, spawnPoint, active } = payload;
                result = updateSmokeParticles(
                    new Float32Array(positions),
                    velocities,
                    lifetimes,
                    delta,
                    config || {},
                    spawnPoint,
                    active
                );
                result.positions = Array.from(result.positions);
                break;
            }
            
            case 'updateAmbient': {
                const { positions, phases, time, config, bounds } = payload;
                result = updateAmbientParticles(
                    new Float32Array(positions),
                    phases,
                    time,
                    config || {},
                    bounds
                );
                result.positions = Array.from(result.positions);
                break;
            }
            
            case 'initExplosion': {
                const { count, origin, config } = payload;
                result = initExplosion(count, origin, config || {});
                result.positions = Array.from(result.positions);
                break;
            }
            
            case 'batchUpdate': {
                // Update multiple particle systems in one call
                const { systems } = payload;
                result = systems.map(sys => {
                    switch (sys.type) {
                        case 'explosion':
                            return {
                                id: sys.id,
                                ...updateExplosionParticles(
                                    new Float32Array(sys.positions),
                                    sys.velocities,
                                    sys.lifetimes,
                                    sys.delta,
                                    sys.config || {}
                                )
                            };
                        case 'smoke':
                            return {
                                id: sys.id,
                                ...updateSmokeParticles(
                                    new Float32Array(sys.positions),
                                    sys.velocities,
                                    sys.lifetimes,
                                    sys.delta,
                                    sys.config || {},
                                    sys.spawnPoint,
                                    sys.active
                                )
                            };
                        default:
                            return { id: sys.id, error: 'Unknown system type' };
                    }
                });
                // Convert all Float32Arrays to regular arrays for transfer
                result.forEach(r => {
                    if (r.positions instanceof Float32Array) {
                        r.positions = Array.from(r.positions);
                    }
                });
                break;
            }
            
            default:
                throw new Error(`Unknown task type: ${type}`);
        }
        
        self.postMessage({ taskId, data: result });
        
    } catch (error) {
        self.postMessage({ taskId, error: error.message });
    }
};

console.log('[ParticleWorker] Ready');
