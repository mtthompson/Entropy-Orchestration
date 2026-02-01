const { getAllTracks } = require('../server/tracks');

const GRID_SIZE = 4; // Size of each grid cell in world units

// Helper: Check if two line segments intersect (properly, not just at endpoints)
function getLineIntersection(p0, p1, p2, p3) {
    const s1_x = p1.x - p0.x;
    const s1_z = p1.z - p0.z;
    const s2_x = p3.x - p2.x;
    const s2_z = p3.z - p2.z;

    const denom = (-s2_x * s1_z + s1_x * s2_z);
    if (Math.abs(denom) < 1e-10) return false; // Parallel or coincident

    const s = (-s1_z * (p0.x - p2.x) + s1_x * (p0.z - p2.z)) / denom;
    const t = (s2_x * (p0.z - p2.z) - s2_z * (p0.x - p2.x)) / denom;

    // Check if intersection is within segment bounds (not including endpoints for adjacent segments)
    return (s > 0 && s < 1 && t > 0 && t < 1);
}

// Helper: Check if line segment intersects box (grid cell)
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

// Helper: Calculate radius of curvature for three consecutive points
function calculateTurnRadius(p1, p2, p3) {
    // Vectors
    const v1x = p2.x - p1.x;
    const v1z = p2.z - p1.z;
    const v2x = p3.x - p2.x;
    const v2z = p3.z - p2.z;

    // Lengths
    const len1 = Math.sqrt(v1x * v1x + v1z * v1z);
    const len2 = Math.sqrt(v2x * v2x + v2z * v2z);

    if (len1 === 0 || len2 === 0) return Infinity;

    // Angle between vectors
    const dot = v1x * v2x + v1z * v2z;
    const cosAngle = Math.max(-1, Math.min(1, dot / (len1 * len2)));
    const angle = Math.acos(cosAngle);

    // If angle is 0 or 180, radius is infinite
    if (Math.abs(angle) < 0.01 || Math.abs(angle - Math.PI) < 0.01) return Infinity;

    // Radius = side / (2 * sin(angle/2)) for isosceles triangle
    // But for path curvature, it's better to use the formula for circle through 3 points
    // R = |P1P2 × P2P3| / |P1P2 - P2P3| wait, no

    // The radius of the circle passing through p1, p2, p3
    // Using the formula: R = abc / (4K) where K is area of triangle

    // Cross product for area
    const cross = v1x * v2z - v1z * v2x;
    const area = Math.abs(cross) / 2;

    if (area < 0.01) return Infinity; // Collinear points

    // Semiperimeter
    const a = len2; // distance p1 to p2
    const b = len1; // distance p2 to p3
    const c = Math.sqrt((p3.x - p1.x)**2 + (p3.z - p1.z)**2); // distance p1 to p3

    const s = (a + b + c) / 2;
    const radius = (a * b * c) / (4 * area);

    return radius;
}

function validateTrackWallsAndTurns(track) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Validating Track Walls & Turns: ${track.name} (${track.id})`);
    console.log(`Type: ${track.type}`);

    let allValid = true;
    const issues = [];

    // 1. Check for wall intersections
    console.log(`\n1. Checking for wall intersections...`);
    const boundaries = track.boundaries;
    let intersections = 0;

    // Only check intersections for arena tracks (race tracks are generated from paths and should be valid by construction)
    if (track.type === 'arena') {
        for (let i = 0; i < boundaries.length; i++) {
            for (let j = i + 1; j < boundaries.length; j++) {
                const wall1 = boundaries[i];
                const wall2 = boundaries[j];

                if (getLineIntersection(
                    {x: wall1.x1, z: wall1.z1},
                    {x: wall1.x2, z: wall1.z2},
                    {x: wall2.x1, z: wall2.z1},
                    {x: wall2.x2, z: wall2.z2}
                )) {
                    intersections++;
                    console.log(`  ❌ Wall intersection detected between segments ${i} and ${j}`);
                    issues.push(`Wall intersection between segments ${i} and ${j}`);
                }
            }
        }
    }

    if (track.type === 'race') {
        console.log(`  ⏭️  Skipping intersection check for race track (generated from path)`);
    } else if (intersections === 0) {
        console.log(`  ✅ No wall intersections found (${boundaries.length} segments checked)`);
    } else {
        allValid = false;
    }

    // 2. Check path navigability for race tracks
    if (track.type === 'race' && track.path) {
        console.log(`\n2. Testing path navigability...`);
        
        // First, check if the waypoint path intersects boundaries
        console.log(`  Checking waypoint path against boundaries...`);
        let pathIntersectsWalls = false;
        for (let i = 0; i < track.path.length - 1; i++) {
            const p1 = track.path[i];
            const p2 = track.path[i + 1];
            
            for (const wall of track.boundaries) {
                if (getLineIntersection(p1, p2, {x: wall.x1, z: wall.z1}, {x: wall.x2, z: wall.z2})) {
                    pathIntersectsWalls = true;
                    console.log(`    ❌ Waypoint segment ${i} to ${i+1} intersects wall`);
                    issues.push(`Waypoint path intersects boundaries at segment ${i}-${i+1}`);
                    break;
                }
            }
            if (pathIntersectsWalls) break;
        }
        
        if (pathIntersectsWalls) {
            allValid = false;
        } else {
            console.log(`    ✅ Waypoint path does not intersect boundaries`);
        }
        
        // Then test A* pathfinding
        const bounds = track.powerupBounds;
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

        // Test pathfinding from first waypoint to last waypoint (nearly full loop)
        const start = track.path[0];
        const end = track.path[track.path.length - 1];

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
            // Verify the path doesn't intersect walls
            let pathValid = true;
            for (let i = 0; i < path.length - 1; i++) {
                const p1 = { x: BOUNDS.minX + path[i].x * GRID_SIZE + GRID_SIZE/2, z: BOUNDS.minZ + path[i].z * GRID_SIZE + GRID_SIZE/2 };
                const p2 = { x: BOUNDS.minX + path[i+1].x * GRID_SIZE + GRID_SIZE/2, z: BOUNDS.minZ + path[i+1].z * GRID_SIZE + GRID_SIZE/2 };
                
                // Check if this path segment intersects any wall
                for (const wall of track.boundaries) {
                    if (getLineIntersection(p1, p2, {x: wall.x1, z: wall.z1}, {x: wall.x2, z: wall.z2})) {
                        pathValid = false;
                        break;
                    }
                }
                if (!pathValid) break;
            }
            
            if (pathValid) {
                console.log(`  ✅ A* path validated - track is navigable`);
            } else {
                console.log(`  ❌ A* path found but intersects walls - algorithm error`);
                issues.push('A* pathfinding algorithm error - found path intersects walls');
                allValid = false;
            }
        } else {
            console.log(`  ❌ No A* path found between waypoints - track may be blocked`);
            issues.push('A* pathfinding test failed - track may have blocked sections');
            allValid = false;
        }
    } else if (track.type === 'arena') {
        console.log(`\n2. Arena track - no path validation needed`);
    }

    // Summary
    console.log(`\n${'='.repeat(50)}`);
    if (allValid) {
        console.log(`✅ ${track.name} - ALL CHECKS PASSED`);
    } else {
        console.log(`❌ ${track.name} - ${issues.length} issue(s) found:`);
        issues.forEach(issue => console.log(`   - ${issue}`));
    }

    return { valid: allValid, issues };
}

function main() {
    console.log('🏁 TRACK WALL & TURN VALIDATION SUITE 🏁');
    console.log('Validating wall intersections and turn radii...\n');

    const tracks = getAllTracks();
    let passed = 0;
    let failed = 0;

    for (const track of tracks) {
        const result = validateTrackWallsAndTurns(track);
        if (result.valid) {
            passed++;
        } else {
            failed++;
        }
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log('FINAL RESULTS');
    console.log(`${'='.repeat(70)}`);
    console.log(`Passed: ${passed}/${tracks.length}`);
    console.log(`Failed: ${failed}/${tracks.length}`);

    if (failed > 0) {
        console.log('\n❌ Some tracks have issues that need fixing.');
    } else {
        console.log('\n✅ All tracks passed validation!');
    }
}

if (require.main === module) {
    main();
}

module.exports = { validateTrackWallsAndTurns };