const { io } = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';
const socketOptions = {
    query: { role: 'controller' },
    transports: ['websocket']
};

console.log('Testing Lobby Timer Logic...');

// Helper to create a promise that resolves on specific event
const waitForEvent = (socket, event, validator = () => true) => {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Timeout waiting for event "${event}"`));
        }, 10000); // 10s timeout for most events

        const listener = (data) => {
            if (validator(data)) {
                clearTimeout(timeout);
                socket.off(event, listener);
                resolve(data);
            }
        };
        socket.on(event, listener);
    });
};

// Helper to wait
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runTest() {
    let client1, client2;

    try {
        console.log('[TEST] Connecting Client 1...');
        client1 = io(SERVER_URL, socketOptions);

        await waitForEvent(client1, 'connect');
        console.log('[TEST] Client 1 connected');

        // Verify initial state is LOBBY
        let state = await waitForEvent(client1, 'gameState');
        if (state.state !== 'LOBBY') throw new Error(`Expected LOBBY, got ${state.state}`);

        // Join Client 1
        client1.emit('join', { name: 'Tester1', maskType: 'Classic' });

        // Timer should start (30s)
        console.log('[TEST] Client 1 joined, waiting for timer start...');
        state = await waitForEvent(client1, 'gameState', (data) => data.timer > 0);
        console.log(`[TEST] Timer started: ${state.timer}`);
        if (state.timer !== 30) console.warn(`[WARN] Timer started at ${state.timer}, expected 30`);

        // Wait 2 seconds
        await sleep(2000);

        // Verify timer decreased
        state = await waitForEvent(client1, 'gameState');
        console.log(`[TEST] Timer after 2s: ${state.timer}`);
        if (state.timer >= 30) throw new Error('Timer did not decrease');

        // Connect Client 2
        console.log('[TEST] Connecting Client 2...');
        client2 = io(SERVER_URL, socketOptions);
        await waitForEvent(client2, 'connect');

        client2.emit('join', { name: 'Tester2', maskType: 'Oni' });
        console.log('[TEST] Client 2 joined');

        // Wait another 2 seconds
        await sleep(2000);

        // Verify timer continued (didn't reset to 30)
        state = await waitForEvent(client1, 'gameState');
        console.log(`[TEST] Timer after Client 2 join: ${state.timer}`);
        if (state.timer >= 28) throw new Error('Timer reset or did not continue correctly');

        console.log('[TEST] SUCCESS: Lobby timer logic verified');

    } catch (err) {
        console.error('[TEST] FAILURE:', err.message);
    } finally {
        if (client1) client1.disconnect();
        if (client2) client2.disconnect();
        process.exit(0);
    }
}

runTest();
