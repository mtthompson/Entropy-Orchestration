const { getAllTracks } = require('../server/tracks');

// Configuration
const GRID_SIZE = 2; // Size of each grid cell in world units
const BOUNDS = { minX: -100, maxX: 100, minZ: -120, maxZ: 120 };

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


function validateTrack(track) {
    console.log(`\nValidating Track: ${track.name} (${track.id})`);

    // 1. Build Grid
    const width = Math.ceil((BOUNDS.maxX - BOUNDS.minX) / GRID_SIZE);
    const height = Math.ceil((BOUNDS.maxZ - BOUNDS.minZ) / GRID_SIZE);

    // grid[z][x] -> true if blocked
    const grid = Array(height).fill().map(() => Array(width).fill(false));

    // 2. Mark Walls
    let wallCount = 0;
    for (const wall of track.boundaries) {
        // Simple rasterization: check each cell against wall segment
        // Optimization: only check cells within wall bounding box
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

                // Add a small buffer to wall for player physics size
                if (lineIntersectsRect({ x: wall.x1, z: wall.z1 }, { x: wall.x2, z: wall.z2 }, cellRect)) {
                    grid[z][x] = true;
                    wallCount++;
                }
            }
        }
    }
    console.log(`Grid built: ${width}x${height}. Bounding Box cells marked.`);

    // 3. Find Start and Finish Grid Coords
    // Use center of start/finish lines
    const startX = (track.startLine.x1 + track.startLine.x2) / 2;
    const startZ = (track.startLine.z1 + track.startLine.z2) / 2;
    const finishX = (track.finishLine.x1 + track.finishLine.x2) / 2;
    const finishZ = (track.finishLine.z1 + track.finishLine.z2) / 2;

    const startGrid = {
        x: Math.floor((startX - BOUNDS.minX) / GRID_SIZE),
        z: Math.floor((startZ - BOUNDS.minZ) / GRID_SIZE)
    };
    const finishGrid = {
        x: Math.floor((finishX - BOUNDS.minX) / GRID_SIZE),
        z: Math.floor((finishZ - BOUNDS.minZ) / GRID_SIZE)
    };

    console.log(`Start: (${startX}, ${startZ}) -> Grid [${startGrid.x}, ${startGrid.z}]`);
    console.log(`Finish: (${finishX}, ${finishZ}) -> Grid [${finishGrid.x}, ${finishGrid.z}]`);

    // 4. Run Pathfinding
    const path = findPath(grid, startGrid, finishGrid, width, height);

    // 5. Visualize
    // Create detailed ASCII map
    const mapStr = [];
    const pathSet = new Set(path?.map(p => `${p.x},${p.z}`));

    // Subsample for console output if too large? No, let's print it, maybe simplified.
    // Let's simplified output: 1 char per grid cell

    // To avoid massive console spam, let's just print a smaller representation or only the relevant area?
    // Let's print the whole thing but compact.

    let output = '';
    for (let z = 0; z < height; z++) {
        let line = '';
        for (let x = 0; x < width; x++) {
            if (x === startGrid.x && z === startGrid.z) line += 'S';
            else if (x === finishGrid.x && z === finishGrid.z) line += 'F';
            else if (pathSet.has(`${x},${z}`)) line += '.';
            else if (grid[z][x]) line += '#';
            else line += ' ';

        }
        output += line + '\n';
    }

    // Save map to file for inspection
    const fs = require('fs');
    fs.writeFileSync('track_map.txt', output);
    console.log('Map saved to track_map.txt');

    if (path) {
        console.log(`✅ Track VALID. Path found (Length: ${path.length}).`);
        return true;
    } else {
        console.log(`❌ Track INVALID. No path found.`);
        return false;
    }
}

// Run
const tracks = getAllTracks();
tracks.forEach(validateTrack);
