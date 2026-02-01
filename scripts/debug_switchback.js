const tracks = require('../server/tracks');
const GTB = require('../server/GameTrackBuilder');

const track = tracks.getAllTracks().find(t => t.id === 'track_03');
if (!track) { console.error('Switchback not found'); process.exit(1); }

const pts = track.path;
const width = track.width || 90;
const half = width / 2;

function intersectLines(a1, a2, b1, b2) {
    const A1 = a2.z - a1.z;
    const B1 = a1.x - a2.x;
    const C1 = A1 * a1.x + B1 * a1.z;

    const A2 = b2.z - b1.z;
    const B2 = b1.x - b2.x;
    const C2 = A2 * b1.x + B2 * b1.z;

    const denom = A1 * B2 - A2 * B1;
    if (Math.abs(denom) < 1e-9) return null;

    const x = (B2 * C1 - B1 * C2) / denom;
    const z = (A1 * C2 - A2 * C1) / denom;
    return { x, z };
}

const leftLines = [];
const rightLines = [];
for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;

    leftLines.push({
        p1: { x: p1.x + nx * half, z: p1.z + nz * half },
        p2: { x: p2.x + nx * half, z: p2.z + nz * half }
    });
    rightLines.push({
        p1: { x: p1.x - nx * half, z: p1.z - nz * half },
        p2: { x: p2.x - nx * half, z: p2.z - nz * half }
    });
}

const leftVerts = [];
const rightVerts = [];
for (let i = 0; i < pts.length; i++) {
    const prev = (i - 1 + pts.length) % pts.length;
    const cur = i;

    let leftI = intersectLines(leftLines[prev].p1, leftLines[prev].p2, leftLines[cur].p1, leftLines[cur].p2);
    let rightI = intersectLines(rightLines[prev].p1, rightLines[prev].p2, rightLines[cur].p1, rightLines[cur].p2);

    const maxM = half * 8;
    if (leftI) {
        const dx = leftI.x - pts[i].x;
        const dz = leftI.z - pts[i].z;
        if (Math.sqrt(dx * dx + dz * dz) > maxM) leftI = null;
    }
    if (rightI) {
        const dx = rightI.x - pts[i].x;
        const dz = rightI.z - pts[i].z;
        if (Math.sqrt(dx * dx + dz * dz) > maxM) rightI = null;
    }

    if (leftI) leftVerts.push(leftI);
    else leftVerts.push({ x: (leftLines[prev].p2.x + leftLines[cur].p1.x) * 0.5, z: (leftLines[prev].p2.z + leftLines[cur].p1.z) * 0.5 });

    if (rightI) rightVerts.push(rightI);
    else rightVerts.push({ x: (rightLines[prev].p2.x + rightLines[cur].p1.x) * 0.5, z: (rightLines[prev].p2.z + rightLines[cur].p1.z) * 0.5 });
}

const boundaries = [];
for (let i = 0; i < pts.length; i++) {
    const next = (i + 1) % pts.length;
    boundaries.push({ x1: leftVerts[i].x, z1: leftVerts[i].z, x2: leftVerts[next].x, z2: leftVerts[next].z, height: 4 });
    boundaries.push({ x1: rightVerts[i].x, z1: rightVerts[i].z, x2: rightVerts[next].x, z2: rightVerts[next].z, height: 4 });
}

function getLineIntersection(p0, p1, p2, p3) {
    const s1_x = p1.x - p0.x;
    const s1_z = p1.z - p0.z;
    const s2_x = p3.x - p2.x;
    const s2_z = p3.z - p2.z;

    const denom = (-s2_x * s1_z + s1_x * s2_z);
    if (Math.abs(denom) < 1e-10) return false;

    const s = (-s1_z * (p0.x - p2.x) + s1_x * (p0.z - p2.z)) / denom;
    const t = (s2_x * (p0.z - p2.z) - s2_z * (p0.x - p2.x)) / denom;

    return (s > 0 && s < 1 && t > 0 && t < 1);
}

const idxA = 6, idxB = 7;
console.log('Waypoints', idxA, pts[idxA], idxB, pts[idxB]);
let found = false;
for (let i = 0; i < boundaries.length; i++) {
    const w = boundaries[i];
    if (getLineIntersection(pts[idxA], pts[idxB], { x: w.x1, z: w.z1 }, { x: w.x2, z: w.z2 })) {
        console.log('Intersect boundary index', i, w);
        found = true;
    }
}
if (!found) console.log('No intersection found');
console.log('leftVerts 6-7', leftVerts[6], leftVerts[7]);
console.log('rightVerts 6-7', rightVerts[6], rightVerts[7]);
console.log('Total boundaries', boundaries.length);
