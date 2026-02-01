
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
function generateAudiencePositions(polygon, spacing = 60, offset = 15) {
    if (!polygon || polygon.length < 3) return [];

    const positions = [];

    for (let i = 0; i < polygon.length; i++) {
        const p1 = polygon[i];
        const p2 = polygon[(i + 1) % polygon.length];

        const segLen = distance(p1, p2);
        const segmentDir = normalize({ x: p2.x - p1.x, z: p2.z - p1.z });

        // Calculate normal (perpendicular)
        // Normal to (dx, dz) is (-dz, dx) or (dz, -dx)
        let normal = { x: -segmentDir.z, z: segmentDir.x };

        // Determine "outward" direction.
        // Test a point slightly shifted by normal. If it's INSIDE, then normal points IN, so we flip it.
        const midPoint = {
            x: (p1.x + p2.x) / 2,
            z: (p1.z + p2.z) / 2
        };

        const testPoint = {
            x: midPoint.x + normal.x * 0.1,
            z: midPoint.z + normal.z * 0.1
        };

        if (isPointInPolygon(testPoint, polygon)) {
            // Normal points inside, flip it
            normal = { x: -normal.x, z: -normal.z };
        }

        // Now normal points OUTSIDE

        // Place instances along the segment
        const numInstances = Math.max(1, Math.floor(segLen / spacing));
        const step = segLen / numInstances;

        for (let j = 0; j < numInstances; j++) {
            // T goes from 0 to 1 along segment? No, center them.
            // visual placement: start at half step to center them in their slot
            const distAlong = (j + 0.5) * step;

            const baseX = p1.x + segmentDir.x * distAlong;
            const baseZ = p1.z + segmentDir.z * distAlong;

            const posX = baseX + normal.x * offset;
            const posZ = baseZ + normal.z * offset;

            // Rotation: The grandstand should face the track.
            // If the user said they are facing AWAY, then my previous logic (atan2 + PI) was wrong for the model.
            // Let's try removing PI.
            const angle = Math.atan2(normal.x, normal.z);

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
