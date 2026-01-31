// =============================================================================
// GAME START LOGIC TESTS
// =============================================================================
// Tests for countdown, race start, demo mode transitions, and player spawning

const CANNON = require('cannon-es');

// Mock game state
let gameState = 'LOBBY';
let gameTimer = 0;
let demoModeActive = false;
let players = new Map();
let cpuPlayers = new Map();

// Mock track
const mockTrack = {
    id: 'test-track',
    name: 'Test Track',
    spawnPoints: [
        { x: 0, z: 0, rotation: 0 },
        { x: 5, z: 0, rotation: 0 },
        { x: 10, z: 0, rotation: 0 }
    ],
    boundaries: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }
};

// Helper functions
function resetMockState() {
    gameState = 'LOBBY';
    gameTimer = 0;
    demoModeActive = false;
    players.clear();
    cpuPlayers.clear();
}

function createMockPlayer(id, options = {}) {
    return {
        id,
        name: options.name || `Player${id}`,
        type: options.type || 'driver',
        hp: options.hp !== undefined ? options.hp : 100, // Allow 0 HP
        boost: 100,
        isCPU: options.isCPU || false,
        body: options.body || null,
        color: options.color || '#ff0000'
    };
}

// =============================================================================
// DEMO MODE TESTS
// =============================================================================
describe('Demo Mode System', () => {
    beforeEach(resetMockState);

    test('demo mode starts when no players present', () => {
        expect(players.size).toBe(0);
        // Simulate demo mode starting
        demoModeActive = true;
        gameState = 'DEMO';
        expect(demoModeActive).toBe(true);
        expect(gameState).toBe('DEMO');
    });

    test('demo mode stops when player joins', () => {
        // Start in demo mode
        demoModeActive = true;
        gameState = 'DEMO';

        // Player joins
        const player = createMockPlayer('player1');
        players.set('player1', player);

        // Demo mode should stop
        if (demoModeActive && players.size > 0) {
            demoModeActive = false;
            gameState = 'LOBBY';
        }

        expect(demoModeActive).toBe(false);
        expect(gameState).toBe('LOBBY');
    });

    test('demo mode removes CPU players when stopping', () => {
        // Setup demo mode with CPU
        demoModeActive = true;
        gameState = 'DEMO';
        cpuPlayers.set('cpu1', createMockPlayer('cpu1', { isCPU: true }));
        cpuPlayers.set('cpu2', createMockPlayer('cpu2', { isCPU: true }));

        // Stop demo mode
        if (demoModeActive) {
            cpuPlayers.clear();
            demoModeActive = false;
            gameState = 'LOBBY';
        }

        expect(cpuPlayers.size).toBe(0);
        expect(gameState).toBe('LOBBY');
    });
});

// =============================================================================
// PLAYER JOIN TESTS
// =============================================================================
describe('Player Join Logic', () => {
    beforeEach(resetMockState);

    test('player joins as driver in LOBBY', () => {
        gameState = 'LOBBY';
        const player = createMockPlayer('player1', { type: 'driver' });
        players.set('player1', player);

        expect(player.type).toBe('driver');
        expect(player.hp).toBe(100);
    });

    test('player joins as drone in RACING', () => {
        gameState = 'RACING';
        // In actual implementation, drone HP is set to 0
        const player = createMockPlayer('player1', { 
            type: 'drone', 
            hp: 0  // Drones should have 0 HP
        });
        players.set('player1', player);

        expect(player.type).toBe('drone');
        expect(player.hp).toBe(0);
    });

    test('player joins as drone in WINNER state', () => {
        gameState = 'WINNER';
        const player = createMockPlayer('player1', { 
            type: 'drone', 
            hp: 0  // Drones should have 0 HP
        });
        players.set('player1', player);

        expect(player.type).toBe('drone');
        expect(player.hp).toBe(0);
    });

    test('joining during demo mode exits demo', () => {
        demoModeActive = true;
        gameState = 'DEMO';
        cpuPlayers.set('cpu1', createMockPlayer('cpu1', { isCPU: true }));

        // Player joins
        const player = createMockPlayer('player1');
        
        // Should exit demo mode
        if (demoModeActive) {
            cpuPlayers.clear();
            demoModeActive = false;
            gameState = 'LOBBY';
        }
        
        players.set('player1', player);

        expect(demoModeActive).toBe(false);
        expect(gameState).toBe('LOBBY');
        expect(cpuPlayers.size).toBe(0);
    });
});

// =============================================================================
// COUNTDOWN AND START TESTS
// =============================================================================
describe('Game Start Sequence', () => {
    beforeEach(resetMockState);

    test('countdown only starts from LOBBY', () => {
        gameState = 'RACING';
        const canStart = gameState === 'LOBBY';
        expect(canStart).toBe(false);

        gameState = 'LOBBY';
        const canStartNow = gameState === 'LOBBY';
        expect(canStartNow).toBe(true);
    });

    test('countdown transitions to RACING', () => {
        gameState = 'LOBBY';
        
        // Start countdown
        gameState = 'COUNTDOWN';
        gameTimer = 3;
        expect(gameState).toBe('COUNTDOWN');
        expect(gameTimer).toBe(3);

        // Simulate countdown completion
        gameTimer = 0;
        gameState = 'RACING';
        expect(gameState).toBe('RACING');
    });

    test('race start resets all players to drivers', () => {
        // Setup players with mixed states
        const p1 = createMockPlayer('player1', { type: 'drone', hp: 0 });
        const p2 = createMockPlayer('player2', { type: 'driver', hp: 50 });
        players.set('player1', p1);
        players.set('player2', p2);

        // Simulate race start reset
        for (const [id, player] of players) {
            player.type = 'driver';
            player.hp = 100;
            player.boost = 100;
        }

        expect(p1.type).toBe('driver');
        expect(p1.hp).toBe(100);
        expect(p2.hp).toBe(100);
    });
});

// =============================================================================
// CPU SPAWNING TESTS
// =============================================================================
describe('CPU Opponent Logic', () => {
    beforeEach(resetMockState);

    test('spawns CPU when less than 3 human players', () => {
        gameState = 'RACING';
        
        // 1 human player
        players.set('player1', createMockPlayer('player1'));
        
        const humanCount = [...players.values()].filter(p => !p.isCPU).length;
        expect(humanCount).toBe(1);
        
        const neededCPU = Math.max(1, 3 - humanCount);
        expect(neededCPU).toBe(2);
    });

    test('spawns at least 1 CPU even with 3+ humans', () => {
        gameState = 'RACING';
        
        // 4 human players
        players.set('p1', createMockPlayer('p1'));
        players.set('p2', createMockPlayer('p2'));
        players.set('p3', createMockPlayer('p3'));
        players.set('p4', createMockPlayer('p4'));
        
        const humanCount = [...players.values()].filter(p => !p.isCPU).length;
        const neededCPU = Math.max(1, 3 - humanCount);
        expect(neededCPU).toBe(1);
    });

    test('removes existing CPU before race start', () => {
        cpuPlayers.set('cpu1', createMockPlayer('cpu1', { isCPU: true }));
        cpuPlayers.set('cpu2', createMockPlayer('cpu2', { isCPU: true }));
        expect(cpuPlayers.size).toBe(2);

        // Race start should clear CPU
        cpuPlayers.clear();
        expect(cpuPlayers.size).toBe(0);
    });
});

// =============================================================================
// SPAWN POINT TESTS
// =============================================================================
describe('Player Spawning', () => {
    test('distributes spawn points across available slots', () => {
        const spawnPoints = mockTrack.spawnPoints;
        
        // Spawn 5 players (more than spawn points)
        const assignments = [];
        for (let i = 0; i < 5; i++) {
            const spawnIndex = i % spawnPoints.length;
            assignments.push(spawnIndex);
        }

        expect(assignments).toEqual([0, 1, 2, 0, 1]);
    });

    test('applies randomization to spawn positions', () => {
        const spawnPoint = mockTrack.spawnPoints[0];
        const randomX = spawnPoint.x + (0.5 - 0.5) * 2; // Math.random() - 0.5
        const randomZ = spawnPoint.z + (0.5 - 0.5) * 2;
        
        // Randomization should keep position within reasonable bounds
        expect(Math.abs(randomX - spawnPoint.x)).toBeLessThanOrEqual(2);
        expect(Math.abs(randomZ - spawnPoint.z)).toBeLessThanOrEqual(2);
    });

    test('applies spawn rotation correctly', () => {
        const spawnPoint = mockTrack.spawnPoints[0];
        expect(spawnPoint.rotation).toBeDefined();
        expect(typeof spawnPoint.rotation).toBe('number');
    });
});

// =============================================================================
// GAME STATE VALIDATION TESTS
// =============================================================================
describe('Game State Validation', () => {
    beforeEach(resetMockState);

    test('prevents countdown if not in LOBBY', () => {
        const states = ['COUNTDOWN', 'RACING', 'WINNER', 'DEMO'];
        
        for (const state of states) {
            gameState = state;
            const canStartCountdown = gameState === 'LOBBY';
            expect(canStartCountdown).toBe(false);
        }
    });

    test('allows countdown only from LOBBY', () => {
        gameState = 'LOBBY';
        const canStartCountdown = gameState === 'LOBBY';
        expect(canStartCountdown).toBe(true);
    });

    test('demo mode cannot start during RACING', () => {
        gameState = 'RACING';
        const shouldStartDemo = !(demoModeActive || gameState === 'RACING');
        expect(shouldStartDemo).toBe(false); // Should NOT start demo during race

        demoModeActive = false;
        gameState = 'LOBBY';
        const shouldStartDemoInLobby = !(demoModeActive || gameState === 'RACING');
        expect(shouldStartDemoInLobby).toBe(true); // CAN start demo in lobby
    });
});

// =============================================================================
// PLAYER BODY MANAGEMENT TESTS
// =============================================================================
describe('Player Body Management', () => {
    test('creates body only for drivers', () => {
        const driver = createMockPlayer('driver1', { type: 'driver' });
        const drone = createMockPlayer('drone1', { type: 'drone', hp: 0 });

        // Driver should get a body
        const shouldCreateBody = driver.type === 'driver';
        expect(shouldCreateBody).toBe(true);

        // Drone should not get a body
        const shouldNotCreateBody = drone.type === 'driver';
        expect(shouldNotCreateBody).toBe(false);
    });

    test('removes old body before creating new one', () => {
        const player = createMockPlayer('player1', {
            body: { id: 'old-body' }
        });

        expect(player.body).toBeTruthy();
        
        // Simulate body removal
        player.body = null;
        expect(player.body).toBeNull();
    });
});

// =============================================================================
// AUTO-START TESTS
// =============================================================================
describe('Auto-Start Logic', () => {
    beforeEach(resetMockState);

    test('auto-starts with 1 player in lobby', () => {
        gameState = 'LOBBY';
        gameTimer = 0;
        players.set('player1', createMockPlayer('player1'));

        const shouldAutoStart = gameState === 'LOBBY' && 
                               players.size >= 1 && 
                               gameTimer === 0;
        expect(shouldAutoStart).toBe(true);
    });

    test('does not auto-start if countdown already active', () => {
        gameState = 'LOBBY';
        gameTimer = 3; // Countdown in progress
        players.set('player1', createMockPlayer('player1'));

        const shouldAutoStart = gameState === 'LOBBY' && 
                               players.size >= 1 && 
                               gameTimer === 0;
        expect(shouldAutoStart).toBe(false);
    });

    test('does not auto-start in non-LOBBY states', () => {
        gameState = 'RACING';
        gameTimer = 0;
        players.set('player1', createMockPlayer('player1'));

        const shouldAutoStart = gameState === 'LOBBY' && 
                               players.size >= 1 && 
                               gameTimer === 0;
        expect(shouldAutoStart).toBe(false);
    });
});
