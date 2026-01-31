const { getAllTracks } = require('../server/tracks');

// Configuration
const GRID_SIZE = 4; // Size of each grid cell in world units (increased for larger tracks)
const MIN_CLEARANCE = 15; // Minimum distance spawn points should be from walls

// Helper: Check if line segment intersects box (grid cell)
// Simplified: Check if line intersects any of the 4 sides of the cell
function lineIntersectsRect(p1, p2, rect) {
    const minX = rect.x;
    const maxX = rect.x + rect.w;
    const minZ = rect.z;
    const maxZ = rect.z + rect.d;

    // Check if either point is inside (trivial case)
    if ((p1.x >= minX && p1.x <= maxX && p1.z >= minZ && p1.z <= maxZ) ||
        (p2.x >= minX && p2.x <= maxX && p2.z >= minZ && p2.z <= maxZ)) {
        return true;
    }

    // Check intersection with each of the 4 borders
    const borders = [
        [{ x: minX, z: minZ }, { x: maxX, z: minZ }], // Top
        [{ x: maxX, z: minZ }, { x: maxX, z: maxZ }], // Right
        [{ x: maxX, z: maxZ }, { x: minX, z: maxZ }], // Bottom
        [{ x: minX, z: maxZ }, { x: minX, z: minZ }]  // Left
    ];

    for (const border of borders) {
        if (getLineIntersection(p1, p2, border[0], border[1])) return true;
    }
    return false;
}

function getLineIntersection(p0, p1, p2, p3) {
    const s1_x = p1.x - p0.x;
    const s1_z = p1.z - p0.z;
    const s2_x = p3.x - p2.x;
    const s2_z = p3.z - p2.z;

    const s = (-s1_z * (p0.x - p2.x) + s1_x * (p0.z - p2.z)) / (-s2_x * s1_z + s1_x * s2_z);
    const t = (s2_x * (p0.z - p2.z) - s2_z * (p0.x - p2.x)) / (-s2_x * s1_z + s1_x * s2_z);

    return (s >= 0 && s <= 1 && t >= 0 && t <= 1);
}

// A* Pathfinding
function findPath(grid, start, end, width, height) {
    const startNode = { x: start.x, z: start.z, g: 0, h: 0, f: 0, parent: null };
    const endNode = { x: end.x, z: end.z };

    const openList = [startNode];
    const closedSet = new Set();
    const nodeMap = new Map(); // Keep track of nodes by "x,z" key

    nodeMap.set(`${start.x},${start.z}`, startNode);

    while (openList.length > 0) {
        // Sort by f score
        openList.sort((a, b) => a.f - b.f);
        const current = openList.shift();

        if (current.x === endNode.x && current.z === endNode.z) {
            // Path found
            const path = [];
            let curr = current;
            while (curr) {
                path.push({ x: curr.x, z: curr.z });
                curr = curr.parent;
            }
            return path.reverse();
        }

        closedSet.add(`${current.x},${current.z}`);

        // Neighbors (4-directional)
        const neighbors = [
            { x: current.x + 1, z: current.z },
            { x: current.x - 1, z: current.z },
            { x: current.x, z: current.z + 1 },
            { x: current.x, z: current.z - 1 }
        ];

        for (const neighbor of neighbors) {
            // Check bounds
            if (neighbor.x < 0 || neighbor.x >= width || neighbor.z < 0 || neighbor.z >= height) continue;

            // Check collision
            if (grid[neighbor.z][neighbor.x]) continue; // Blocked

            if (closedSet.has(`${neighbor.x},${neighbor.z}`)) continue;

            const gScore = current.g + 1;
            let neighborNode = nodeMap.get(`${neighbor.x},${neighbor.z}`);

            if (!neighborNode) {
                neighborNode = { x: neighbor.x, z: neighbor.z, g: Infinity, h: 0, f: Infinity, parent: null };
                nodeMap.set(`${neighbor.x},${neighbor.z}`, neighborNode);
            }

            if (gScore < neighborNode.g) {
                neighborNode.parent = current;
                neighborNode.g = gScore;
                neighborNode.h = Math.abs(neighborNode.x - endNode.x) + Math.abs(neighborNode.z - endNode.z);
                neighborNode.f = neighborNode.g + neighborNode.h;

                if (!openList.includes(neighborNode)) {
                    openList.push(neighborNode);
                }
            }
        }
    }
    return null; // No path found
}


// Calculate distance from point to line segment
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

function validateTrack(track) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Validating Track: ${track.name} (${track.id})`);
    console.log(`Type: ${track.type}`);
    
    let allValid = true;
    const issues = [];
    
    // 1. Validate spawn points are not inside walls
    console.log(`\n1. Checking spawn point placement...`);
    const spawnIssues = [];
    
    for (let i = 0; i < track.spawnPoints.length; i++) {
        const spawn = track.spawnPoints[i];
        let minDist = Infinity;
        
        // Check distance to all walls
        for (const wall of track.boundaries) {
            const dist = distanceToSegment(spawn.x, spawn.z, wall.x1, wall.z1, wall.x2, wall.z2);
            minDist = Math.min(minDist, dist);
        }
        
        if (minDist < MIN_CLEARANCE) {
            spawnIssues.push(`  Spawn ${i + 1} at (${spawn.x.toFixed(1)}, ${spawn.z.toFixed(1)}) is only ${minDist.toFixed(1)} units from wall (min: ${MIN_CLEARANCE})`);
        }
    }
    
    if (spawnIssues.length > 0) {
        console.log(`  ❌ ${spawnIssues.length} spawn point(s) too close to walls:`);
        spawnIssues.forEach(issue => console.log(issue));
        issues.push(...spawnIssues);
        allValid = false;
    } else {
        console.log(`  ✅ All ${track.spawnPoints.length} spawn points have adequate clearance`);
    }
    
    // 2. Check powerup bounds make sense
    console.log(`\n2. Checking powerup bounds...`);
    const bounds = track.powerupBounds;
    const boundsArea = (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ);
    console.log(`  Powerup area: ${(bounds.maxX - bounds.minX).toFixed(0)} x ${(bounds.maxZ - bounds.minZ).toFixed(0)} = ${boundsArea.toFixed(0)} sq units`);
    
    if (boundsArea < 10000) {
        console.log(`  ⚠️  Powerup area seems small (< 10,000 sq units)`);
        issues.push('Powerup area may be too small');
    } else {
        console.log(`  ✅ Powerup bounds adequate`);
    }
    
    // 3. For race tracks, validate path continuity
    if (track.type === 'race' && track.path) {
        console.log(`\n3. Validating race path (${track.path.length} waypoints)...`);
        
        // Check for extremely sharp turns (> 120 degrees)
        let sharpTurns = 0;
        for (let i = 0; i < track.path.length; i++) {
            const p0 = track.path[(i - 1 + track.path.length) % track.path.length];
            const p1 = track.path[i];
            const p2 = track.path[(i + 1) % track.path.length];
            
            const v1x = p1.x - p0.x, v1z = p1.z - p0.z;
            const v2x = p2.x - p1.x, v2z = p2.z - p1.z;
            
            const dot = v1x * v2x + v1z * v2z;
            const len1 = Math.sqrt(v1x * v1x + v1z * v1z);
            const len2 = Math.sqrt(v2x * v2x + v2z * v2z);
            
            if (len1 > 0 && len2 > 0) {
                const angle = Math.acos(Math.max(-1, Math.min(1, dot / (len1 * len2))));
                const angleDeg = angle * 180 / Math.PI;
                
                if (angleDeg > 120) {
                    sharpTurns++;
                }
            }
        }
        
        if (sharpTurns > 0) {
            console.log(`  ⚠️  ${sharpTurns} very sharp turn(s) detected (> 120°)`);
        } else {
            console.log(`  ✅ Path has smooth turns`);
        }
        
        // Build a simplified grid for pathfinding validation
        console.log(`\n4. Building collision grid for pathfinding test...`);
        
        // Use track's actual bounds
        const BOUNDS = {
            minX: bounds.minX - 50,
            maxX: bounds.maxX + 50,
            minZ: bounds.minZ - 50,
            maxZ: bounds.maxZ + 50
        };
        
        const width = Math.ceil((BOUNDS.maxX - BOUNDS.minX) / GRID_SIZE);
        const height = Math.ceil((BOUNDS.maxZ - BOUNDS.minZ) / GRID_SIZE);
        const grid = Array(height).fill().map(() => Array(width).fill(false));
        
        // Mark walls in grid
        for (const wall of track.boundaries) {
            const wMinX = Math.min(wall.x1, wall.x2);
            const wMaxX = Math.max(wall.x1, wall.x2);
            const wMinZ = Math.min(wall.z1, wall.z2);
            const wMaxZ = Math.max(wall.z1, wall.z2);
            
            const startCx = Math.floor((wMinX - BOUNDS.minX) / GRID_SIZE);
            const endCx = Math.floor((wMaxX - BOUNDS.minX) / GRID_SIZE);
            const startCz = Math.floor((wMinZ - BOUNDS.minZ) / GRID_SIZE);
            const endCz = Math.floor((wMaxZ - BOUNDS.minZ) / GRID_SIZE);
            
            for (let z = Math.max(0, startCz - 1); z <= Math.min(height - 1, endCz + 1); z++) {
                for (let x = Math.max(0, startCx - 1); x <= Math.min(width - 1, endCx + 1); x++) {
                    const cellRect = {
                        x: BOUNDS.minX + x * GRID_SIZE,
                        z: BOUNDS.minZ + z * GRID_SIZE,
                        w: GRID_SIZE,
                        d: GRID_SIZE
                    };
                    
                    if (lineIntersectsRect({ x: wall.x1, z: wall.z1 }, { x: wall.x2, z: wall.z2 }, cellRect)) {
                        grid[z][x] = true;
                    }
                }
            }
        }
        
        console.log(`  Grid: ${width}x${height} cells`);
        
        // Test pathfinding from first waypoint to midpoint
        const start = track.path[0];
        const end = track.path[Math.floor(track.path.length / 2)];
        
        const startGrid = {
            x: Math.floor((start.x - BOUNDS.minX) / GRID_SIZE),
            z: Math.floor((start.z - BOUNDS.minZ) / GRID_SIZE)
        };
        const endGrid = {
            x: Math.floor((end.x - BOUNDS.minX) / GRID_SIZE),
            z: Math.floor((end.z - BOUNDS.minZ) / GRID_SIZE)
        };
        
        const path = findPath(grid, startGrid, endGrid, width, height);
        
        if (path) {
            console.log(`  ✅ Path validated - track is navigable`);
        } else {
            console.log(`  ❌ No path found between waypoints - track may be blocked`);
            issues.push('Pathfinding test failed - track may have blocked sections');
            allValid = false;
        }
        
        // Save visualization
        const fs = require('fs');
        let output = `Track: ${track.name} (${track.id})\n`;
        output += `Bounds: X[${BOUNDS.minX}, ${BOUNDS.maxX}] Z[${BOUNDS.minZ}, ${BOUNDS.maxZ}]\n`;
        output += `Grid: ${width}x${height} @ ${GRID_SIZE} units/cell\n\n`;
        
        const pathSet = new Set(path?.map(p => `${p.x},${p.z}`));
        
        for (let z = 0; z < height; z++) {
            let line = '';
            for (let x = 0; x < width; x++) {
                if (x === startGrid.x && z === startGrid.z) line += 'S';
                else if (x === endGrid.x && z === endGrid.z) line += 'F';
                else if (pathSet.has(`${x},${z}`)) line += '.';
                else if (grid[z][x]) line += '#';
                else line += ' ';
            }
            output += line + '\n';
        }
        
        fs.writeFileSync(`track_map_${track.id}.txt`, output);
        console.log(`  Saved visualization to track_map_${track.id}.txt`);
        
    } else {
        console.log(`\n3. Arena track - no path validation needed`);
    }
    
    // Summary
    console.log(`\n${'='.repeat(70)}`);
    if (allValid && issues.length === 0) {
        console.log(`✅ ${track.name} - ALL CHECKS PASSED`);
    } else {
        console.log(`⚠️  ${track.name} - ${issues.length} issue(s) found`);
    }
    
    return allValid;
}

// Run
console.log('\n🏁 TRACK VALIDATION SUITE 🏁');
console.log('Testing all 12 tracks...\n');

const tracks = getAllTracks();
const results = tracks.map(track => ({
    id: track.id,
    name: track.name,
    valid: validateTrack(track)
}));

console.log('\n\n' + '='.repeat(70));
console.log('FINAL RESULTS');
console.log('='.repeat(70));

const passCount = results.filter(r => r.valid).length;
const failCount = results.length - passCount;

results.forEach(result => {
    const status = result.valid ? '✅' : '❌';
    console.log(`${status} ${result.name.padEnd(20)} (${result.id})`);
});

console.log('\n' + '='.repeat(70));
console.log(`Passed: ${passCount}/${results.length}`);
console.log(`Failed: ${failCount}/${results.length}`);
console.log('='.repeat(70) + '\n');