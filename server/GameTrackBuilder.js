/**
 * TrackBuilder - Generates wall segments from a path of points.
 */

// Helper: Calculate distance from point to line segment
function distanceToSegment(px, pz, x1, z1, x2, z2) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const lenSq = dx * dx + dz * dz;
    
    if (lenSq === 0) return Math.sqrt((px - x1) * (px - x1) + (pz - z1) * (pz - z1));
    
    let t = ((px - x1) * dx + (pz - z1) * dz) / lenSq;
    t = Math.max(0, Math.min(1, t));
    
    const closestX = x1 + t * dx;
    const closestZ = z1 + t * dz;
    
    return Math.sqrt((px - closestX) * (px - closestX) + (pz - closestZ) * (pz - closestZ));
}

// Helper: Validate and adjust spawn points to ensure minimum clearance from walls
function validateSpawnPoints(spawnPoints, boundaries, minClearance = 15) {
    const adjustedSpawns = [];
    let adjustmentCount = 0;
    
    for (const spawn of spawnPoints) {
        let currentSpawn = { ...spawn };
        let iterations = 0;
        const maxIterations = 5; // Try up to 5 times to find a safe position
        
        while (iterations < maxIterations) {
            let minDist = Infinity;
            let nearestWallPoint = null;
            
            // Find nearest wall and closest point on that wall
            for (const wall of boundaries) {
                const dist = distanceToSegment(currentSpawn.x, currentSpawn.z, wall.x1, wall.z1, wall.x2, wall.z2);
                if (dist < minDist) {
                    minDist = dist;
                    
                    // Calculate closest point on wall
                    const dx = wall.x2 - wall.x1;
                    const dz = wall.z2 - wall.z1;
                    const lenSq = dx * dx + dz * dz;
                    let t = ((currentSpawn.x - wall.x1) * dx + (currentSpawn.z - wall.z1) * dz) / lenSq;
                    t = Math.max(0, Math.min(1, t));
                    nearestWallPoint = {
                        x: wall.x1 + t * dx,
                        z: wall.z1 + t * dz
                    };
                }
            }
            
            if (minDist >= minClearance) {
                // Safe position found
                break;
            }
            
            if (nearestWallPoint) {
                // Calculate direction from wall to spawn
                const dx = currentSpawn.x - nearestWallPoint.x;
                const dz = currentSpawn.z - nearestWallPoint.z;
                const len = Math.sqrt(dx * dx + dz * dz);
                
                if (len > 0.001) {
                    // Move spawn away from wall along this direction
                    const pushDistance = minClearance - minDist + 3;
                    const dirX = dx / len;
                    const dirZ = dz / len;
                    
                    currentSpawn.x += dirX * pushDistance;
                    currentSpawn.z += dirZ * pushDistance;
                    adjustmentCount++;
                } else {
                    // Spawn is exactly on wall, push in arbitrary direction
                    currentSpawn.x += minClearance;
                }
            }
            
            iterations++;
        }
        
        adjustedSpawns.push({
            x: currentSpawn.x,
            z: currentSpawn.z,
            rotation: spawn.rotation
        });
    }
    
    if (adjustmentCount > 0) {
        console.log(`  [GameTrackBuilder] Made ${adjustmentCount} spawn adjustment(s) to maintain clearance`);
    }
    
    return adjustedSpawns;
}

/**
 * Generates walls for a track based on a centerline path and width.
 * @param {Array} points - Array of {x, z} points defining the center path.
 * @param {number} width - Width of the track corridor.
 * @param {boolean} loop - Whether to close the loop (connect last to first).
 * @returns {object} { boundaries, outerPolygon, innerPolygon } 
 *                   boundaries: Array of wall objects {x1, z1, x2, z2, height}
 *                   outerPolygon: Array of {x, z} points for outer edge
 *                   innerPolygon: Array of {x, z} points for inner edge
 */
function createTrackFromPath(points, width, loop = true) {
    const boundaries = [];
    const halfWidth = width / 2;
    const height = 4;

    // 1. Calculate Normals for each segment
    const segmentNormals = [];
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];

        if (!loop && i === points.length - 1) {
            segmentNormals.push({ x: 0, z: 0 }); // Placeholder
            break;
        }

        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        segmentNormals.push({ x: -dz / len, z: dx / len });
    }

    // 2. Generate Offset Vertices at each Point (Vertex Normals)
    const leftVerts = [];
    const rightVerts = [];

    const count = loop ? points.length : points.length;
    // If not looping, we handle start/end differently, but simpler to just assumes loops for tracks.
    // The user claimed "completely invalid", so gaps are likely the issue.

    for (let i = 0; i < points.length; i++) {
        const p = points[i];

        // Previous segment index
        const prevIdx = (i - 1 + points.length) % points.length;
        const currIdx = i;

        // If open track start/end, handle edge case (not implemented for simplicity, assume loops)

        // Average the normals of the two connecting segments
        const n1 = segmentNormals[prevIdx];
        const n2 = segmentNormals[currIdx]; // This segment starting at i

        if (!loop && (i === 0 || i === points.length - 1)) {
            // Simple cap for ends
            // ...
            // Let's stick to the current logic but connect the dots better.
        }

        // Miter Normal
        let mx = n1.x + n2.x;
        let mz = n1.z + n2.z;
        const mLen = Math.sqrt(mx * mx + mz * mz);
        
        // Properly scale miter to maintain constant track width
        // miterScale = 1 / cos(θ/2), where mLen = 2*cos(θ/2)
        const miterScale = (mLen > 0.001) ? (2.0 / mLen) : 1.0;
        mx = (mx / mLen) * miterScale;
        mz = (mz / mLen) * miterScale;

        leftVerts.push({ x: p.x + mx * halfWidth, z: p.z + mz * halfWidth });
        rightVerts.push({ x: p.x - mx * halfWidth, z: p.z - mz * halfWidth });
    }

    // 3. Connect Vertices with Walls
    for (let i = 0; i < points.length; i++) {
        if (!loop && i === points.length - 1) break;
        const next = (i + 1) % points.length;

        boundaries.push({
            x1: leftVerts[i].x, z1: leftVerts[i].z,
            x2: leftVerts[next].x, z2: leftVerts[next].z,
            height
        });

        boundaries.push({
            x1: rightVerts[i].x, z1: rightVerts[i].z,
            x2: rightVerts[next].x, z2: rightVerts[next].z,
            height
        });
    }

    // Return boundaries and floor polygons for rendering
    return {
        boundaries,
        outerPolygon: leftVerts,
        innerPolygon: rightVerts
    };
}

/**
 * Creates a circular arena
 * @param {number} radius 
 * @param {number} segments 
 * @returns {object} { boundaries, floorPolygon }
 */
function createArena(radius, segments = 32) {
    const points = [];
    for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        points.push({
            x: Math.cos(angle) * radius,
            z: Math.sin(angle) * radius
        });
    }
    // Arena is just one big loop of walls? No, it needs to be an enclosed area.
    // createTrackFromPath makes a "corridor".
    // For an Arena, we just want the OUTER boundary.

    const boundaries = [];
    for (let i = 0; i < segments; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % segments];
        boundaries.push({
            x1: p1.x, z1: p1.z,
            x2: p2.x, z2: p2.z,
            height: 4
        });
    }
    
    // Return boundaries and the floor polygon (same as boundary points for arena)
    return {
        boundaries,
        floorPolygon: points
    };
}

module.exports = { createTrackFromPath, createArena, validateSpawnPoints };
