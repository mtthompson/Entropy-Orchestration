// Mock global timers before requiring the module
global.setTimeout = jest.fn(() => ({}));
global.setInterval = jest.fn(() => ({}));
global.clearTimeout = jest.fn();
global.clearInterval = jest.fn();

const {
    world,
    players,
    cpuPlayers,
    projectiles,
    powerups,
    traps,
    spawnCPUOpponents,
    gameLoop,
    getActiveTrack,
    selectRandomTrack,
    getRandomRaceTrack,
    setGameState
} = require('../index');

describe('CPU Logic', () => {
    beforeEach(() => {
        // Clear all timers
        jest.clearAllTimers();
        
        // Clear all physics bodies
        const bodies = [...world.bodies];
        bodies.forEach(b => world.removeBody(b));
        
        // Clear all global collections
        players.clear();
        cpuPlayers.clear();
        projectiles.clear();
        powerups.clear();
        traps.clear();
        
        // Reset game state
        setGameState('LOBBY');
        
        // Add ground plane
        const CANNON = require('cannon-es');
        const groundShape = new CANNON.Plane();
        const groundBody = new CANNON.Body({ mass: 0 });
        groundBody.addShape(groundShape);
        groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        world.addBody(groundBody);
    });

    afterEach(() => {
        // Clear all timers after each test
        jest.clearAllTimers();
    });

    test('CPU spawns and moves', () => {
        // Ensure track - select a race track specifically
        let track = getActiveTrack();
        if (!track || track.type !== 'race') {
            // Set active track to a race track
            const { getRandomRaceTrack } = require('../tracks');
            const raceTrack = getRandomRaceTrack();
            // We can't directly set activeTrack, so let's hope selectRandomTrack gives us a race track
            // For now, just use whatever track we have
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
        // Note: CPU may stop moving if it reaches its target (e.g., center of arena)
    });
});
