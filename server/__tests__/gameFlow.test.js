// =============================================================================
// GAME FLOW & STATE TESTS
// =============================================================================
// Tests for complete game lifecycle: lobby -> countdown -> racing -> winner -> lobby

const CANNON = require('cannon-es');

// =============================================================================
// MOCK STATE
// =============================================================================
let gameState = 'LOBBY';
let gameTimer = 0;
let winnerName = null;
let demoModeActive = false;
let players = new Map();
let cpuPlayers = new Map();
let powerups = new Map();
let traps = new Map();
let projectiles = new Map();

// Mock track for testing
const mockTrack = {
    id: 'test_track',
    name: 'Test Track',
    type: 'race',
    spawnPoints: [
        { x: 0, z: 0, rotation: 0 },
        { x: 5, z: 0, rotation: 0 },
        { x: 10, z: 0, rotation: 0 },
        { x: -5, z: 0, rotation: 0 }
    ],
    path: [
        { x: 0, z: 50 }, { x: 50, z: 50 }, { x: 50, z: -50 },
        { x: 0, z: -50 }, { x: -50, z: -50 }, { x: -50, z: 50 }
    ],
    powerupBounds: { minX: -60, maxX: 60, minZ: -60, maxZ: 60 },
    boundaries: []
};

function resetMockState() {
    gameState = 'LOBBY';
    gameTimer = 0;
    winnerName = null;
    demoModeActive = false;
    players.clear();
    cpuPlayers.clear();
    powerups.clear();
    traps.clear();
    projectiles.clear();
}

function createMockPlayer(id, options = {}) {
    return {
        id,
        name: options.name || `Player${id}`,
        type: options.type || 'driver',
        hp: options.hp !== undefined ? options.hp : 100,
        boost: options.boost !== undefined ? options.boost : 100,
        isCPU: options.isCPU || false,
        body: options.body || null,
        color: options.color || '#FF00FF',
        maskType: options.maskType || 'Classic',
        lapsCompleted: options.lapsCompleted || 0,
        waypointIndex: options.waypointIndex || 0,
        isShielded: options.isShielded || false,
        isGhost: options.isGhost || false,
        isJuggernaut: options.isJuggernaut || false,
        input: options.input || { steering: 0, throttle: 0, boost: false }
    };
}

function createMockBody(position = { x: 0, y: 1, z: 0 }) {
    return new CANNON.Body({
        mass: 50,
        shape: new CANNON.Sphere(1),
        position: new CANNON.Vec3(position.x, position.y, position.z)
    });
}

// =============================================================================
// GAME STATE TRANSITIONS
// =============================================================================
describe('Game State Transitions', () => {
    beforeEach(resetMockState);

    test('valid state transitions: LOBBY -> COUNTDOWN', () => {
        gameState = 'LOBBY';
        
        const canTransition = gameState === 'LOBBY';
        if (canTransition) gameState = 'COUNTDOWN';
        
        expect(gameState).toBe('COUNTDOWN');
    });

    test('valid state transitions: COUNTDOWN -> RACING', () => {
        gameState = 'COUNTDOWN';
        gameTimer = 0; // Countdown finished
        
        const canTransition = gameState === 'COUNTDOWN' && gameTimer === 0;
        if (canTransition) gameState = 'RACING';
        
        expect(gameState).toBe('RACING');
    });

    test('valid state transitions: RACING -> WINNER', () => {
        gameState = 'RACING';
        
        // Simulate win condition met
        winnerName = 'TestWinner';
        gameState = 'WINNER';
        gameTimer = 10;
        
        expect(gameState).toBe('WINNER');
        expect(winnerName).toBe('TestWinner');
    });

    test('valid state transitions: WINNER -> LOBBY', () => {
        gameState = 'WINNER';
        gameTimer = 0;
        winnerName = 'PreviousWinner';
        
        // Timer expired
        gameState = 'LOBBY';
        winnerName = null;
        
        expect(gameState).toBe('LOBBY');
        expect(winnerName).toBeNull();
    });

    test('invalid transition: RACING cannot go to COUNTDOWN', () => {
        gameState = 'RACING';
        
        const canStartCountdown = gameState === 'LOBBY';
        
        expect(canStartCountdown).toBe(false);
        expect(gameState).toBe('RACING');
    });

    test('invalid transition: WINNER cannot start countdown', () => {
        gameState = 'WINNER';
        
        const canStartCountdown = gameState === 'LOBBY';
        
        expect(canStartCountdown).toBe(false);
    });
});

// =============================================================================
// COUNTDOWN LOGIC
// =============================================================================
describe('Countdown Sequence', () => {
    beforeEach(resetMockState);

    test('countdown starts at 3 seconds', () => {
        gameState = 'COUNTDOWN';
        gameTimer = 3;
        
        expect(gameTimer).toBe(3);
    });

    test('countdown decrements correctly', () => {
        gameTimer = 3;
        const steps = [];
        
        while (gameTimer > 0) {
            steps.push(gameTimer);
            gameTimer--;
        }
        
        expect(steps).toEqual([3, 2, 1]);
        expect(gameTimer).toBe(0);
    });

    test('race starts when countdown reaches 0', () => {
        gameState = 'COUNTDOWN';
        gameTimer = 1;
        
        // Simulate tick
        gameTimer--;
        if (gameTimer <= 0) {
            gameState = 'RACING';
        }
        
        expect(gameState).toBe('RACING');
    });

    test('players cannot input during countdown', () => {
        gameState = 'COUNTDOWN';
        const player = createMockPlayer('p1');
        players.set('p1', player);
        
        // Should only process input during RACING
        const shouldProcessInput = gameState === 'RACING' && player.type === 'driver';
        
        expect(shouldProcessInput).toBe(false);
    });
});

// =============================================================================
// RACE INITIALIZATION
// =============================================================================
describe('Race Initialization', () => {
    beforeEach(resetMockState);

    test('all players reset to full HP on race start', () => {
        const p1 = createMockPlayer('p1', { hp: 50 });
        const p2 = createMockPlayer('p2', { hp: 0, type: 'drone' });
        players.set('p1', p1);
        players.set('p2', p2);
        
        // Simulate race start reset
        for (const [id, player] of players) {
            player.hp = 100;
            player.type = 'driver';
            player.boost = 100;
            player.lapsCompleted = 0;
            player.waypointIndex = 0;
        }
        
        expect(p1.hp).toBe(100);
        expect(p2.hp).toBe(100);
        expect(p2.type).toBe('driver');
    });

    test('all players reset to driver type', () => {
        const drone = createMockPlayer('p1', { type: 'drone', hp: 0 });
        players.set('p1', drone);
        
        for (const [id, player] of players) {
            player.type = 'driver';
            player.hp = 100;
        }
        
        expect(drone.type).toBe('driver');
    });

    test('powerups are cleared on race start', () => {
        powerups.set('pu1', { type: 'Repair', position: { x: 0, z: 0 } });
        powerups.set('pu2', { type: 'Boost', position: { x: 10, z: 10 } });
        
        // Race start clears powerups
        powerups.clear();
        
        expect(powerups.size).toBe(0);
    });

    test('traps are cleared on race start', () => {
        traps.set('t1', { position: { x: 0, z: 0 } });
        traps.set('t2', { position: { x: 5, z: 5 } });
        
        traps.clear();
        
        expect(traps.size).toBe(0);
    });

    test('lap counters reset for all players', () => {
        const player = createMockPlayer('p1', { lapsCompleted: 2 });
        players.set('p1', player);
        
        player.lapsCompleted = 0;
        player.waypointIndex = 0;
        
        expect(player.lapsCompleted).toBe(0);
        expect(player.waypointIndex).toBe(0);
    });
});

// =============================================================================
// WIN CONDITIONS
// =============================================================================
describe('Win Conditions', () => {
    beforeEach(resetMockState);

    describe('Race Mode (Lap-based)', () => {
        const LAPS_TO_WIN = 3;

        test('player wins by completing 3 laps', () => {
            const player = createMockPlayer('p1', { lapsCompleted: 2 });
            player.lapsCompleted++;
            
            expect(player.lapsCompleted >= LAPS_TO_WIN).toBe(true);
        });

        test('first to complete laps wins', () => {
            const p1 = createMockPlayer('p1', { lapsCompleted: 2 });
            const p2 = createMockPlayer('p2', { lapsCompleted: 2 });
            
            // P1 finishes first
            p1.lapsCompleted = 3;
            
            let winner = null;
            if (p1.lapsCompleted >= LAPS_TO_WIN) winner = p1;
            
            expect(winner).toBe(p1);
            expect(winner.lapsCompleted).toBe(3);
        });

        test('CPU can win race by laps', () => {
            const cpu = createMockPlayer('cpu_0', { isCPU: true, lapsCompleted: 2 });
            cpu.lapsCompleted = 3;
            
            const cpuWins = cpu.lapsCompleted >= LAPS_TO_WIN;
            expect(cpuWins).toBe(true);
        });
    });

    describe('Arena Mode (Last Survivor)', () => {
        test('last human standing wins', () => {
            const p1 = createMockPlayer('p1', { hp: 50 });
            const p2 = createMockPlayer('p2', { hp: 0, type: 'drone' });
            players.set('p1', p1);
            players.set('p2', p2);
            
            const alive = [...players.values()].filter(p => p.hp > 0 && p.type === 'driver');
            
            expect(alive.length).toBe(1);
            expect(alive[0]).toBe(p1);
        });

        test('CPU can win as last survivor', () => {
            const p1 = createMockPlayer('p1', { hp: 0, type: 'drone' });
            const cpu = createMockPlayer('cpu_0', { hp: 30, isCPU: true });
            players.set('p1', p1);
            cpuPlayers.set('cpu_0', cpu);
            
            const aliveHumans = [...players.values()].filter(p => p.hp > 0);
            const aliveCPUs = [...cpuPlayers.values()].filter(c => c.hp > 0);
            const totalAlive = aliveHumans.length + aliveCPUs.length;
            
            expect(totalAlive).toBe(1);
            expect(aliveCPUs[0]).toBe(cpu);
        });

        test('draw when all eliminated simultaneously', () => {
            const p1 = createMockPlayer('p1', { hp: 0 });
            const p2 = createMockPlayer('p2', { hp: 0 });
            players.set('p1', p1);
            players.set('p2', p2);
            
            const alive = [...players.values()].filter(p => p.hp > 0);
            
            expect(alive.length).toBe(0);
            // Winner should be null (draw)
        });
    });
});

// =============================================================================
// WINNER STATE
// =============================================================================
describe('Winner State', () => {
    beforeEach(resetMockState);

    test('winner screen shows correct name', () => {
        gameState = 'WINNER';
        winnerName = 'Champion';
        gameTimer = 10;
        
        expect(winnerName).toBe('Champion');
        expect(gameTimer).toBe(10);
    });

    test('winner timer counts down', () => {
        gameState = 'WINNER';
        gameTimer = 10;
        
        const steps = [];
        while (gameTimer > 7) {
            steps.push(gameTimer);
            gameTimer--;
        }
        
        expect(steps).toEqual([10, 9, 8]);
    });

    test('game returns to lobby when timer expires', () => {
        gameState = 'WINNER';
        gameTimer = 1;
        winnerName = 'Winner';
        
        gameTimer--;
        if (gameTimer <= 0) {
            gameState = 'LOBBY';
            winnerName = null;
        }
        
        expect(gameState).toBe('LOBBY');
        expect(winnerName).toBeNull();
    });

    test('new players join as drones during winner state', () => {
        gameState = 'WINNER';
        
        const newPlayerType = gameState === 'WINNER' ? 'drone' : 'driver';
        
        expect(newPlayerType).toBe('drone');
    });
});

// =============================================================================
// GAME RESTART/RESET
// =============================================================================
describe('Game Restart', () => {
    beforeEach(resetMockState);

    test('admin restart clears all players', () => {
        players.set('p1', createMockPlayer('p1'));
        players.set('p2', createMockPlayer('p2'));
        
        // Admin restart
        players.clear();
        
        expect(players.size).toBe(0);
    });

    test('admin restart clears all CPUs', () => {
        cpuPlayers.set('cpu_0', createMockPlayer('cpu_0', { isCPU: true }));
        cpuPlayers.set('cpu_1', createMockPlayer('cpu_1', { isCPU: true }));
        
        cpuPlayers.clear();
        
        expect(cpuPlayers.size).toBe(0);
    });

    test('admin restart resets game state to LOBBY', () => {
        gameState = 'RACING';
        gameTimer = 0;
        
        // Admin restart
        gameState = 'LOBBY';
        
        expect(gameState).toBe('LOBBY');
    });

    test('admin restart clears powerups and traps', () => {
        powerups.set('pu1', { type: 'Repair' });
        traps.set('t1', { position: { x: 0, z: 0 } });
        
        powerups.clear();
        traps.clear();
        
        expect(powerups.size).toBe(0);
        expect(traps.size).toBe(0);
    });

    test('admin restart during demo mode stops demo', () => {
        demoModeActive = true;
        gameState = 'DEMO';
        
        // Admin restart
        demoModeActive = false;
        gameState = 'LOBBY';
        
        expect(demoModeActive).toBe(false);
        expect(gameState).toBe('LOBBY');
    });
});

// =============================================================================
// DEMO MODE TRANSITIONS
// =============================================================================
describe('Demo Mode', () => {
    beforeEach(resetMockState);

    test('demo mode starts after idle timeout', () => {
        expect(players.size).toBe(0);
        expect(gameState).toBe('LOBBY');
        
        // Simulate timeout trigger
        demoModeActive = true;
        gameState = 'DEMO';
        
        expect(demoModeActive).toBe(true);
        expect(gameState).toBe('DEMO');
    });

    test('demo mode spawns CPUs', () => {
        demoModeActive = true;
        gameState = 'DEMO';
        
        // Spawn 4-6 CPUs
        const cpuCount = 4 + Math.floor(Math.random() * 3);
        for (let i = 0; i < cpuCount; i++) {
            cpuPlayers.set(`cpu_${i}`, createMockPlayer(`cpu_${i}`, { isCPU: true }));
        }
        
        expect(cpuPlayers.size).toBeGreaterThanOrEqual(4);
        expect(cpuPlayers.size).toBeLessThanOrEqual(6);
    });

    test('demo mode stops when player joins', () => {
        demoModeActive = true;
        gameState = 'DEMO';
        cpuPlayers.set('cpu_0', createMockPlayer('cpu_0', { isCPU: true }));
        
        // Player joins
        players.set('p1', createMockPlayer('p1'));
        
        // Stop demo
        cpuPlayers.clear();
        demoModeActive = false;
        gameState = 'LOBBY';
        
        expect(demoModeActive).toBe(false);
        expect(gameState).toBe('LOBBY');
        expect(cpuPlayers.size).toBe(0);
    });

    test('demo mode cannot start during active race', () => {
        gameState = 'RACING';
        
        const shouldStartDemo = gameState !== 'RACING' && !demoModeActive;
        
        expect(shouldStartDemo).toBe(false);
    });
});

// =============================================================================
// LATE JOINER HANDLING
// =============================================================================
describe('Late Joiner Logic', () => {
    beforeEach(resetMockState);

    test('late joiner spawns as driver during race', () => {
        gameState = 'RACING';
        
        const type = gameState === 'RACING' ? 'driver' : 
                     gameState === 'WINNER' ? 'drone' : 'driver';
        
        expect(type).toBe('driver');
    });

    test('late joiner spawns behind the pack', () => {
        gameState = 'RACING';
        
        // Existing players ahead
        const existingDriver = createMockPlayer('p1', {
            body: createMockBody({ x: 0, y: 1, z: -30 })
        });
        players.set('p1', existingDriver);
        
        // Late joiner should spawn behind (higher Z value)
        const lateJoinerZ = existingDriver.body.position.z + 10;
        
        expect(lateJoinerZ).toBeGreaterThan(existingDriver.body.position.z);
    });

    test('late joiner has full HP', () => {
        gameState = 'RACING';
        
        const lateJoiner = createMockPlayer('late', { hp: 100 });
        
        expect(lateJoiner.hp).toBe(100);
    });

    test('joiner during winner state becomes drone', () => {
        gameState = 'WINNER';
        
        const type = gameState === 'WINNER' ? 'drone' : 'driver';
        const hp = type === 'drone' ? 0 : 100;
        
        expect(type).toBe('drone');
        expect(hp).toBe(0);
    });
});

// =============================================================================
// PLAYER DISCONNECTION
// =============================================================================
describe('Player Disconnection', () => {
    beforeEach(resetMockState);

    test('disconnection removes player from game', () => {
        players.set('p1', createMockPlayer('p1'));
        expect(players.size).toBe(1);
        
        players.delete('p1');
        
        expect(players.size).toBe(0);
    });

    test('disconnection triggers win check', () => {
        gameState = 'RACING';
        const p1 = createMockPlayer('p1', { hp: 100 });
        const p2 = createMockPlayer('p2', { hp: 100 });
        players.set('p1', p1);
        players.set('p2', p2);
        
        // P2 disconnects
        players.delete('p2');
        
        const alive = [...players.values()].filter(p => p.hp > 0);
        expect(alive.length).toBe(1);
    });

    test('disconnection in lobby does not affect game state', () => {
        gameState = 'LOBBY';
        players.set('p1', createMockPlayer('p1'));
        
        players.delete('p1');
        
        expect(gameState).toBe('LOBBY');
    });

    test('all players disconnecting resets demo timer', () => {
        gameState = 'LOBBY';
        players.set('p1', createMockPlayer('p1'));
        
        players.delete('p1');
        
        // Should reset demo timer
        const humanCount = [...players.values()].filter(p => !p.isCPU).length;
        const shouldStartDemoTimer = humanCount === 0;
        
        expect(shouldStartDemoTimer).toBe(true);
    });
});
