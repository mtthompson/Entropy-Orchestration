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

// Helper: Calculate signed area of a polygon to determine winding
// In our coordinate system (X right, Z down), positive is CCW
function getPolygonSignedArea(points) {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        area += (p2.x - p1.x) * (p2.z + p1.z);
    }
    return area / 2.0;
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
 * Subdivide a path using Catmull-Rom splines for smooth curves
 * @param {Array} points - Input points
 * @param {number} segments - Number of segments per point
 * @param {boolean} loop - Whether to close the loop
 * @returns {Array} Smooth path
 */
function subdividePath(points, segments = 5, loop = true) {
    if (points.length < 3) return points;

    const smoothPoints = [];
    const count = points.length;

    for (let i = 0; i < count; i++) {
        // Control points
        // p0 is previous, p1 is current, p2 is next, p3 is next-next
        const p0 = points[(i - 1 + count) % count];
        const p1 = points[i];
        const p2 = points[(i + 1) % count];
        const p3 = points[(i + 2) % count];

        if (!loop && i === count - 1) {
            // Last point if not looping
            break;
        }

        // Generate segments
        for (let j = 0; j < segments; j++) {
            const t = j / segments;
            const t2 = t * t;
            const t3 = t2 * t;

            // Catmull-Rom logic
            const q0 = -t3 + 2.0 * t2 - t;
            const q1 = 3.0 * t3 - 5.0 * t2 + 2.0;
            const q2 = -3.0 * t3 + 4.0 * t2 + t;
            const q3 = t3 - t2;

            const x = 0.5 * (p0.x * q0 + p1.x * q1 + p2.x * q2 + p3.x * q3);
            const z = 0.5 * (p0.z * q0 + p1.z * q1 + p2.z * q2 + p3.z * q3);

            smoothPoints.push({ x, z });
        }
    }

    if (!loop) {
        smoothPoints.push(points[points.length - 1]);
    }

    return smoothPoints;
}

/**
 * Generates walls for a track based on a centerline path and width.
 * @param {Array} originalPoints - Array of {x, z} points defining the center path.
 * @param {number} width - Width of the track corridor.
 * @param {boolean} loop - Whether to close the loop (connect last to first).
 * @returns {object} { boundaries, outerPolygon, innerPolygon } 
 *                   boundaries: Array of wall objects {x1, z1, x2, z2, height}
 *                   outerPolygon: Array of {x, z} points for outer edge
 *                   innerPolygon: Array of {x, z} points for inner edge
 */
function createTrackFromPath(originalPoints, width, loop = true, smoothSegments = 6) {
    // Smooth the path for visuals and use the smoothed points for collision/boundary generation.
    // Using smoothed points reduces long segment offsets that can cross the centerline
    // on tight, switchback-style layouts.
    const smoothPoints = subdividePath(originalPoints, smoothSegments, loop);
    const points = smoothPoints.slice(); // centerline points used for boundary generation
    const boundaries = [];
    const halfWidth = width / 2;
    const height = 4;

    // 1. (No longer used) Normals per segment are computed implicitly below using the control points.

    // 2. Generate Offset Vertices by offsetting each segment, then intersect adjacent offsets to form joins.
    const leftVerts = [];
    const rightVerts = [];
    const scales = [];

    // Helper: intersect two infinite lines (p1->p2) and (p3->p4)
    function intersectLines(a1, a2, b1, b2) {
        const A1 = a2.z - a1.z;
        const B1 = a1.x - a2.x;
        const C1 = A1 * a1.x + B1 * a1.z;

        const A2 = b2.z - b1.z;
        const B2 = b1.x - b2.x;
        const C2 = A2 * b1.x + B2 * b1.z;

        const denom = A1 * B2 - A2 * B1;
        if (Math.abs(denom) < 1e-9) return null; // parallel

        const x = (B2 * C1 - B1 * C2) / denom;
        const z = (A1 * C2 - A2 * C1) / denom;
        return { x, z };
    }

    // Build offset lines for each segment using the (smoothed) centerline points
    const leftLines = [];
    const rightLines = [];
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1.0;
        const nx = -dz / len;
        const nz = dx / len;

        leftLines.push({ p1: { x: p1.x + nx * halfWidth, z: p1.z + nz * halfWidth }, p2: { x: p2.x + nx * halfWidth, z: p2.z + nz * halfWidth } });
        rightLines.push({ p1: { x: p1.x - nx * halfWidth, z: p1.z - nz * halfWidth }, p2: { x: p2.x - nx * halfWidth, z: p2.z - nz * halfWidth } });
    }

    // Strict miter intersection with conservative fallback to per-vertex bevel.
    // Use a tighter clamp to avoid long miters that cross the path.
    const maxMiterDistStrict = halfWidth * 2.0;
    for (let i = 0; i < points.length; i++) {
        const prev = (i - 1 + points.length) % points.length;
        const cur = i;

        let leftI = intersectLines(leftLines[prev].p1, leftLines[prev].p2, leftLines[cur].p1, leftLines[cur].p2);
        let rightI = intersectLines(rightLines[prev].p1, rightLines[prev].p2, rightLines[cur].p1, rightLines[cur].p2);

        // If intersection is invalid or too far, fallback to conservative per-vertex offset
        if (leftI) {
            const dx = leftI.x - points[i].x;
            const dz = leftI.z - points[i].z;
            if (Math.sqrt(dx * dx + dz * dz) > maxMiterDistStrict) leftI = null;
        }
        if (rightI) {
            const dx = rightI.x - points[i].x;
            const dz = rightI.z - points[i].z;
            if (Math.sqrt(dx * dx + dz * dz) > maxMiterDistStrict) rightI = null;
        }

        if (leftI) leftVerts.push(leftI);
        else {
            // Conservative per-vertex normal (average adjacent segment normals)
            const pPrev = points[prev];
            const pNext = points[(i + 1) % points.length];
            const v1 = { x: points[i].x - pPrev.x, z: points[i].z - pPrev.z };
            const v2 = { x: pNext.x - points[i].x, z: pNext.z - points[i].z };
            const l1 = Math.sqrt(v1.x * v1.x + v1.z * v1.z) || 1.0;
            const l2 = Math.sqrt(v2.x * v2.x + v2.z * v2.z) || 1.0;
            const n1 = { x: -v1.z / l1, z: v1.x / l1 };
            const n2 = { x: -v2.z / l2, z: v2.x / l2 };
            let ax = n1.x + n2.x, az = n1.z + n2.z;
            let alen = Math.sqrt(ax * ax + az * az) || 1.0;
            ax /= alen; az /= alen;
            leftVerts.push({ x: points[i].x + ax * halfWidth, z: points[i].z + az * halfWidth });
        }

        if (rightI) rightVerts.push(rightI);
        else {
            const pPrev = points[prev];
            const pNext = points[(i + 1) % points.length];
            const v1 = { x: points[i].x - pPrev.x, z: points[i].z - pPrev.z };
            const v2 = { x: pNext.x - points[i].x, z: pNext.z - points[i].z };
            const l1 = Math.sqrt(v1.x * v1.x + v1.z * v1.z) || 1.0;
            const l2 = Math.sqrt(v2.x * v2.x + v2.z * v2.z) || 1.0;
            const n1 = { x: -v1.z / l1, z: v1.x / l1 };
            const n2 = { x: -v2.z / l2, z: v2.x / l2 };
            let ax = n1.x + n2.x, az = n1.z + n2.z;
            let alen = Math.sqrt(ax * ax + az * az) || 1.0;
            ax /= alen; az /= alen;
            rightVerts.push({ x: points[i].x - ax * halfWidth, z: points[i].z - az * halfWidth });
        }
    }

    // Helper to build boundary list from current verts
    function buildBoundariesFromVerts(lt, rt) {
        const b = [];
        for (let i = 0; i < points.length; i++) {
            const next = (i + 1) % points.length;
            b.push({ x1: lt[i].x, z1: lt[i].z, x2: lt[next].x, z2: lt[next].z, height });
            b.push({ x1: rt[i].x, z1: rt[i].z, x2: rt[next].x, z2: rt[next].z, height });
        }
        return b;
    }

    // Detect segment intersection utility
    function segsIntersect(a, b, c, d) {
        const s1_x = b.x - a.x, s1_z = b.z - a.z;
        const s2_x = d.x - c.x, s2_z = d.z - c.z;
        const denom = (-s2_x * s1_z + s1_x * s2_z);
        if (Math.abs(denom) < 1e-10) return false;
        const s = (-s1_z * (a.x - c.x) + s1_x * (a.z - c.z)) / denom;
        const t = (s2_x * (a.z - c.z) - s2_z * (a.x - c.x)) / denom;
        return (s > 0 && s < 1 && t > 0 && t < 1);
    }

    // Iteratively repair any wall segments that intersect the centerline by switching
    // the involved vertices to a conservative bevel offset (and slightly widening)
    let boundariesTemp = buildBoundariesFromVerts(leftVerts, rightVerts);
    const repairIters = 3;
    for (let iter = 0; iter < repairIters; iter++) {
        let changed = false;
        for (let si = 0; si < points.length; si++) {
            const a = points[si];
            const bpt = points[(si + 1) % points.length];
            for (let wi = 0; wi < boundariesTemp.length; wi++) {
                const w = boundariesTemp[wi];
                if (segsIntersect(a, bpt, { x: w.x1, z: w.z1 }, { x: w.x2, z: w.z2 })) {
                    // The wall segment (w) intersects the waypoint segment (a->bpt).
                    // Find which vertex indices are associated with this wall (side index)
                    const sideIdx = Math.floor(wi / 2);
                    const vi0 = sideIdx;
                    const vi1 = (sideIdx + 1) % points.length;

                    // Apply conservative bevel offsets to vi0 and vi1, and slightly widen
                    [vi0, vi1].forEach(vi => {
                        const pPrev = points[(vi - 1 + points.length) % points.length];
                        const pNext = points[(vi + 1) % points.length];
                        const v1 = { x: points[vi].x - pPrev.x, z: points[vi].z - pPrev.z };
                        const v2 = { x: pNext.x - points[vi].x, z: pNext.z - points[vi].z };
                        const l1 = Math.sqrt(v1.x * v1.x + v1.z * v1.z) || 1.0;
                        const l2 = Math.sqrt(v2.x * v2.x + v2.z * v2.z) || 1.0;
                        const n1 = { x: -v1.z / l1, z: v1.x / l1 };
                        const n2 = { x: -v2.z / l2, z: v2.x / l2 };
                        let ax = n1.x + n2.x, az = n1.z + n2.z;
                        let alen = Math.sqrt(ax * ax + az * az) || 1.0;
                        ax /= alen; az /= alen;
                        // slight widen factor
                        const widen = 1.15;
                        leftVerts[vi] = { x: points[vi].x + ax * halfWidth * widen, z: points[vi].z + az * halfWidth * widen };
                        rightVerts[vi] = { x: points[vi].x - ax * halfWidth * widen, z: points[vi].z - az * halfWidth * widen };
                    });
                    changed = true;
                }
            }
        }
        if (!changed) break;
        boundariesTemp = buildBoundariesFromVerts(leftVerts, rightVerts);
    }

    // Additional targeted per-segment fix: if a waypoint segment still intersects any wall,
    // replace the verts at its endpoints with simple perpendicular offsets for that segment
    // (widened slightly). This gives a guaranteed unobstructed corridor for that segment.
    const perSegFixIters = 2;
    for (let iter = 0; iter < perSegFixIters; iter++) {
        let fixed = false;
        for (let si = 0; si < points.length; si++) {
            const a = points[si];
            const bpt = points[(si + 1) % points.length];
            // check if any wall intersects this centerline segment
            let intersects = false;
            for (const w of boundariesTemp) {
                if (segsIntersect(a, bpt, { x: w.x1, z: w.z1 }, { x: w.x2, z: w.z2 })) { intersects = true; break; }
            }
            if (!intersects) continue;

            // compute perpendicular to this segment
            const dx = bpt.x - a.x; const dz = bpt.z - a.z;
            const llen = Math.sqrt(dx * dx + dz * dz) || 1.0;
            const nx = -dz / llen; const nz = dx / llen;
            const widen = 1.25;
            const vi0 = si; const vi1 = (si + 1) % points.length;
            leftVerts[vi0] = { x: a.x + nx * halfWidth * widen, z: a.z + nz * halfWidth * widen };
            rightVerts[vi0] = { x: a.x - nx * halfWidth * widen, z: a.z - nz * halfWidth * widen };
            leftVerts[vi1] = { x: bpt.x + nx * halfWidth * widen, z: bpt.z + nz * halfWidth * widen };
            rightVerts[vi1] = { x: bpt.x - nx * halfWidth * widen, z: bpt.z - nz * halfWidth * widen };
            fixed = true;
        }
        if (!fixed) break;
        boundariesTemp = buildBoundariesFromVerts(leftVerts, rightVerts);
    }

    const finalBoundaries = boundariesTemp;

    // finalBoundaries was computed above by the strict-offset + repair pass

    // For visuals, compute smooth outer/inner polygons from smoothed points
    const smoothLeft = [];
    const smoothRight = [];
    for (let i = 0; i < smoothPoints.length; i++) {
        const p1 = smoothPoints[i];
        const p2 = smoothPoints[(i + 1) % smoothPoints.length];
        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1.0;
        const nx = -dz / len;
        const nz = dx / len;
        smoothLeft.push({ x: p1.x + nx * halfWidth, z: p1.z + nz * halfWidth });
        smoothRight.push({ x: p1.x - nx * halfWidth, z: p1.z - nz * halfWidth });
    }

    // 3. Use the post-processed boundaries
    // finalBoundaries was computed with optional local nudges to avoid waypoint intersections
    for (let i = 0; i < finalBoundaries.length; i++) boundaries.push(finalBoundaries[i]);

    // Determine which side is outer/inner based on path winding
    // In our coordinate system (Z+ is down), a CCW path has positive signed area.
    // For CCW, the "left" normal points OUTWARD.
    const area = getPolygonSignedArea(points);
    const isCCW = area > 0;

    // Return boundaries and floor polygons for rendering
    return {
        boundaries,
        outerPolygon: isCCW ? leftVerts : rightVerts,
        innerPolygon: isCCW ? rightVerts : leftVerts,
        path: smoothPoints // Expose smoothed path for CPU navigation
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
