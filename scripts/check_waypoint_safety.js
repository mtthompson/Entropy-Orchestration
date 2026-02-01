const { getAllTracks } = require('../server/tracks');

// Configuration
const LOOKAHEAD = 2; // CPU lookahead
const CAR_RADIUS = 2; // Approximate buffer for car size

// Helper: Check if line segment intersects box (grid cell) or other segment
function segmentsIntersect(a, b, c, d) {
    const s1_x = b.x - a.x, s1_z = b.z - a.z;
    const s2_x = d.x - c.x, s2_z = d.z - c.z;
    const denom = (-s2_x * s1_z + s1_x * s2_z);

    if (Math.abs(denom) < 1e-10) return false;

    const s = (-s1_z * (a.x - c.x) + s1_x * (a.z - c.z)) / denom;
    const t = (s2_x * (a.z - c.z) - s2_z * (a.x - c.x)) / denom;

    return (s >= 0 && s <= 1 && t >= 0 && t <= 1);
}

// Distance from point to line segment
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

function checkTrackSafety(track) {
    console.log(`\nChecking Track: ${track.name} (${track.id})`);

    if (!track.path || track.path.length < 2) {
        console.log(`  Skipping: No path data (Arena?)`);
        return true;
    }

    let violations = 0;
    const path = track.path;
    const boundaries = track.boundaries;

    for (let i = 0; i < path.length; i++) {
        // Current position (CPU is at waypoint i)
        const current = path[i];

        // Target position (CPU looks ahead)
        const targetIndex = (i + LOOKAHEAD) % path.length;
        const target = path[targetIndex];

        // Check if the line from current to target intersects any wall
        let hitWall = false;

        for (const wall of boundaries) {
            const wStart = { x: wall.x1, z: wall.z1 };
            const wEnd = { x: wall.x2, z: wall.z2 };

            // Check intersection (crossing the wall)
            if (segmentsIntersect(current, target, wStart, wEnd)) {
                hitWall = true;
                // Log details
                // console.log(`  Intersection at index ${i} -> ${targetIndex}:`);
                // console.log(`    Seg: (${current.x.toFixed(1)},${current.z.toFixed(1)}) -> (${target.x.toFixed(1)},${target.z.toFixed(1)})`);
                // console.log(`    Wall: (${wStart.x},${wStart.z}) -> (${wEnd.x},${wEnd.z})`);
                break;
            }

            // Also check proximity (if we get too close despite not crossing)
            // Ideally we check if the segment comes within CAR_RADIUS of the wall
            // const dist = Math.min(
            //     distanceToSegment(current.x, current.z, wall.x1, wall.z1, wall.x2, wall.z2),
            //     distanceToSegment(target.x, target.z, wall.x1, wall.z1, wall.x2, wall.z2)
            // );
            // But checking the whole segment distance is harder.
            // Simplified: check segment intersection is sufficient to catch "cutting corners through interior walls".
        }

        if (hitWall) {
            violations++;
            if (violations <= 5) {
                console.log(`  ❌ Waypoint ${i} -> ${targetIndex} cuts through a wall!`);
            }
        }
    }

    if (violations > 0) {
        console.log(`  ⚠️  Found ${violations} pathfinding violations.`);
        return false;
    } else {
        console.log(`  ✅ Path looks safe (Lookahead: ${LOOKAHEAD})`);
        return true;
    }
}

// Run
const tracks = getAllTracks();
const targetTrack = tracks.find(t => t.id === 'track_06');

if (targetTrack) {
    checkTrackSafety(targetTrack);
} else {
    console.log("Track not found");
}

console.log("\nChecking all tracks summary:");
tracks.forEach(t => {
    if (t.type === 'race') checkTrackSafety(t);
});
