const {
    world,
    cpuPlayers,
    spawnCPUOpponents,
    gameLoop,
    getActiveTrack,
    selectRandomTrack,
    setGameState
} = require('../index');

describe('CPU Logic', () => {
    beforeEach(() => {
        cpuPlayers.clear();
        for (const body of world.bodies) {
            if (body.mass > 0) world.removeBody(body);
        }
    });

    test('CPU spawns and moves', () => {
        // Ensure track
        let track = getActiveTrack();
        if (!track) {
            selectRandomTrack();
            track = getActiveTrack();
        }

        // Ensure active state
        setGameState('RACING');

        spawnCPUOpponents(1);
        const cpu = cpuPlayers.values().next().value;
        const initialPos = { x: cpu.body.position.x, z: cpu.body.position.z };
        console.log(`Initial Pos: ${initialPos.x}, ${initialPos.z}`);

        // Run game loop
        for (let i = 0; i < 120; i++) {
            gameLoop();
        }

        const newPos = { x: cpu.body.position.x, z: cpu.body.position.z };
        const dist = Math.sqrt(Math.pow(newPos.x - initialPos.x, 2) + Math.pow(newPos.z - initialPos.z, 2));

        console.log(`CPU moved distance: ${dist}`);
        console.log(`Final Velocity: ${cpu.body.velocity.length()}`);

        expect(dist).toBeGreaterThan(0.1);
        expect(cpu.body.velocity.length()).toBeGreaterThan(0.1);
    });
});
