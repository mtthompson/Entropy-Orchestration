
// Helper to calculate distance between two points
function distance(p1, p2) {
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    return Math.sqrt(dx * dx + dz * dz);
}

// Helper to normalize a vector
function normalize(v) {
    const len = Math.sqrt(v.x * v.x + v.z * v.z);
    if (len === 0) return { x: 0, z: 0 };
    return { x: v.x / len, z: v.z / len };
}

// Ray casting algorithm to determine if a point is inside a polygon
function isPointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].z;
        const xj = polygon[j].x, yj = polygon[j].z;

        const intersect = ((yi > point.z) !== (yj > point.z))
            && (point.x < (xj - xi) * (point.z - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Generates audience positions along the exterior of the track.
 * @param {Array<{x: number, z: number}>} polygon - The generated floor/outer polygon of the track.
 * @param {number} spacing - Distance between grandstands.
 * @param {number} offset - Distance from the wall to place the grandstand center.
 * @returns {Array<{position: [x,y,z], rotation: [x,y,z]}>}
 */
function generateAudiencePositions(polygon, spacing = 20, offset = 15) {
    if (!polygon || polygon.length < 3) return [];

    const positions = [];

    for (let i = 0; i < polygon.length; i++) {
        const p1 = polygon[i];
        const p2 = polygon[(i + 1) % polygon.length];

        const segLen = distance(p1, p2);
        const segmentDir = normalize({ x: p2.x - p1.x, z: p2.z - p1.z });

        // Calculate normal (perpendicular)
        // Normal to (dx, dz) is (-dz, dx) or (dz, -dx)
        // We want the one pointing OUT of the polygon (assuming CCW winding)
        // But polygon winding might vary. Robust way:
        // Pick a point slightly "left" of the segment. If inside, "left" is IN, so we want "right".

        let normal = { x: -segmentDir.z, z: segmentDir.x }; // "Left" relative to segment

        const midPoint = {
            x: (p1.x + p2.x) / 2,
            z: (p1.z + p2.z) / 2
        };

        // Use a larger epsilon to avoid edge case precision issues on vertices
        const testDist = 5.0;
        const testPoint = {
            x: midPoint.x + normal.x * testDist,
            z: midPoint.z + normal.z * testDist
        };

        if (isPointInPolygon(testPoint, polygon)) {
            // Normal points inside, flip it to point outside
            normal = { x: -normal.x, z: -normal.z };
        }

        // Now normal points OUTSIDE

        // Place instances along the segment
        const numInstances = Math.max(1, Math.floor(segLen / spacing));
        const step = segLen / numInstances;

        for (let j = 0; j < numInstances; j++) {
            // visual placement: start at half step to center them in their slot
            const distAlong = (j + 0.5) * step;

            const baseX = p1.x + segmentDir.x * distAlong;
            const baseZ = p1.z + segmentDir.z * distAlong;

            const posX = baseX + normal.x * offset;
            const posZ = baseZ + normal.z * offset;

            // Final sanity check: Is this placement point actually outside?
            // In tight concave corners, "offsetting outwards" from two adjacent segments
            // might still result in crossing back over another part of the track.
            // We check if the PLACEMENT point is inside. If so, skip it (it's clipping).
            if (isPointInPolygon({ x: posX, z: posZ }, polygon)) {
                continue;
            }

            // Rotation: The grandstand should face the track.
            // normal points AWAY from track. We want to face TOWARDS track.
            // angle of normal + PI
            const angle = Math.atan2(normal.x, normal.z) + Math.PI;

            positions.push({
                position: [posX, 0, posZ],
                rotation: [0, angle, 0],
                // Metadata for variation
                rows: 3 + Math.floor(Math.random() * 2),
                seats: 8 + Math.floor(Math.random() * 5)
            });
        }
    }

    return positions;
}

// module.exports = { generateAudiencePositions };
export { generateAudiencePositions };
