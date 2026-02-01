/**
 * Verify Scenery Clearance
 * Ensures scenery elements are not placed on the track floor where cars drive
 */

const { getAllTracks } = require('../server/tracks');

// Scenery placement logic (mirrored from renderer)
function getSceneryPositions(track) {
    const positions = [];
    const isArena = track.type === 'arena';
    const sceneryType = track.sceneryType;

    if (sceneryType === 'roman') {
        // Roman pillars
        const baseRadius = isArena ? (track.radius || 100) * 1.5 + 20 : 130;
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            positions.push({
                x: Math.cos(angle) * baseRadius,
                z: Math.sin(angle) * baseRadius,
                type: 'pillar'
            });
        }
    } else if (sceneryType === 'stadium') {
        // Neon palms
        const count = 40;
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            let radius;
            if (isArena) {
                radius = (track.radius || 100) * 1.5 + Math.random() * 50;
            } else {
                // Place outside the floor bounds
                const floorRadius = Math.max(track.floorSize.width, track.floorSize.depth) / 2;
                radius = floorRadius + 50 + Math.random() * 50; // Outside floor + margin
            }
            positions.push({
                x: Math.cos(angle) * radius,
                z: Math.sin(angle) * radius,
                type: 'palm'
            });
        }
        // Arena lights
        let lightRadius = 100;
        if (track.type === 'race') {
            const floorRadius = Math.max(track.floorSize.width, track.floorSize.depth) / 2;
            lightRadius = floorRadius + 20;
        }
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            positions.push({
                x: Math.cos(angle) * lightRadius,
                z: Math.sin(angle) * lightRadius,
                type: 'light'
            });
        }
        // Laser beams
        if (track.type === 'arena') {
            for (let i = 0; i < 4; i++) {
                positions.push({
                    x: 0,
                    z: 0,
                    type: 'beam'
                });
            }
        } else {
            const floorRadius = Math.max(track.floorSize.width, track.floorSize.depth) / 2;
            const beamRadius = floorRadius + 30;
            for (let i = 0; i < 4; i++) {
                positions.push({
                    x: beamRadius,
                    z: 0,
                    type: 'beam'
                });
            }
        }
    } else if (sceneryType === 'industrial') {
        // Metal beams
        let radius = 130;
        if (track) {
            const isArena = track.type === 'arena';
            if (isArena) {
                radius = (track.radius || 100) * 1.5 + 20;
            } else {
                const floorRadius = Math.max(track.floorSize.width, track.floorSize.depth) / 2;
                radius = floorRadius + 30;
            }
        }
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            positions.push({
                x: Math.cos(angle) * radius,
                z: Math.sin(angle) * radius,
                type: 'beam'
            });
        }
        // Smoke stacks
        let stackX1 = -100, stackZ = -130, stackX2 = 100;
        if (track) {
            const floorRadius = Math.max(track.floorSize.width, track.floorSize.depth) / 2;
            stackZ = -floorRadius - 20;
            stackX1 = -floorRadius - 20;
            stackX2 = floorRadius + 20;
        }
        positions.push({ x: stackX1, z: stackZ, type: 'smoke' });
        positions.push({ x: stackX2, z: stackZ, type: 'smoke' });
    }
    // Add other scenery types as needed

    return positions;
}

// Check if position is clear of track
function isPositionClear(x, z, track) {
    const halfWidth = track.floorSize.width / 2;
    const halfDepth = track.floorSize.depth / 2;
    // Scenery must be outside the floor bounds
    return Math.abs(x) > halfWidth || Math.abs(z) > halfDepth;
}

// Fix invalid scenery positions by moving them to valid locations
function fixSceneryPositions(issues) {
    const fixed = [];
    issues.forEach(issue => {
        let { x, z, track, type } = issue;
        const trackObj = getAllTracks().find(t => t.name === track);
        if (!trackObj) return;

        // Move to the edge of the floor bounds
        const halfWidth = trackObj.floorSize.width / 2;
        const halfDepth = trackObj.floorSize.depth / 2;

        // Determine the direction to move
        const distX = Math.abs(x) - halfWidth;
        const distZ = Math.abs(z) - halfDepth;

        if (distX < distZ) {
            // Move in Z direction
            z = z > 0 ? halfDepth + 10 : -halfDepth - 10;
        } else {
            // Move in X direction
            x = x > 0 ? halfWidth + 10 : -halfWidth - 10;
        }

        fixed.push({ ...issue, x, z });
    });
    return fixed;
}

// Get list of scenery clearance issues
function getSceneryIssues() {
    const TRACKS = getAllTracks();
    const issues = [];

    TRACKS.forEach(track => {
        const positions = getSceneryPositions(track);
        positions.forEach(pos => {
            if (!isPositionClear(pos.x, pos.z, track)) {
                issues.push({
                    track: track.name,
                    type: pos.type,
                    x: pos.x,
                    z: pos.z
                });
            }
        });
    });

    return issues;
}

// Main verification
function verifySceneryClearance() {
    console.log('Verifying scenery clearance for all tracks...\n');

    const issues = getSceneryIssues();
    let totalIssues = 0;

    const TRACKS = getAllTracks();
    TRACKS.forEach(track => {
        console.log(`Checking track: ${track.name} (${track.sceneryType})`);
        const trackIssues = issues.filter(issue => issue.track === track.name);
        trackIssues.forEach(issue => {
            console.log(`  ❌ ${issue.type} at (${issue.x.toFixed(1)}, ${issue.z.toFixed(1)}) is inside track area`);
        });
        if (trackIssues.length === 0) {
            console.log(`  ✅ All scenery clear`);
        } else {
            console.log(`  ⚠️  ${trackIssues.length} scenery elements inside track`);
            totalIssues += trackIssues.length;
        }
        console.log('');
    });

    if (totalIssues === 0) {
        console.log('🎉 All tracks have clear scenery!');
        process.exit(0);
    } else {
        console.log(`❌ Found ${totalIssues} scenery clearance issues`);
        process.exit(1);
    }
}

if (require.main === module) {
    verifySceneryClearance();
}

module.exports = { verifySceneryClearance, getSceneryPositions, isPositionClear, getSceneryIssues, fixSceneryPositions };