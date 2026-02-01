
const { generateAudiencePositions } = require('../renderer/src/AudiencePlacement.js');

function runTest() {
    console.log("Running Audience Placement Verification...");

    // 1. Mock a simple square track (CCW)
    // 0,100 ----- 100,100
    //   |           |
    //   |           |
    // 0,0 ------- 100,0
    const squarePolygon = [
        { x: 0, z: 0 },
        { x: 100, z: 0 },
        { x: 100, z: 100 },
        { x: 0, z: 100 }
    ];

    console.log("Testing Square Polygon...");
    const positions = generateAudiencePositions(squarePolygon, 40, 10);

    // We expect points to be OUTSIDE the square.
    // e.g. segment 0,0 -> 100,0 (bottom edge). Midpoint 50,0.
    // Inside is y>0. Outside is y<0. So z should be negative.

    let pass = true;

    positions.forEach((p, i) => {
        const [x, y, z] = p.position;
        const [rx, ry, rz] = p.rotation;

        console.log(`Point ${i}: Pos(${x.toFixed(1)}, ${z.toFixed(1)}) Rot(${ry.toFixed(2)})`);

        // Check if point is roughly outside
        // Simple bounding box check for the square
        const minX = 0, maxX = 100, minZ = 0, maxZ = 100;
        const isInside = x > -1 && x < 101 && z > -1 && z < 101; // epsilon

        if (isInside) {
            console.error(`ERROR: Point ${i} is INSIDE the track!`);
            pass = false;
        }
    });

    if (positions.length === 0) {
        console.error("ERROR: No positions generated!");
        pass = false;
    }

    if (pass) {
        console.log("SUCCESS: All points generated outside polygon.");
    } else {
        console.error("FAILURE: Some points were incorrect.");
        process.exit(1);
    }
}

runTest();
