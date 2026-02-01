import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    base: '/render',
    plugins: [react()],
    server: {
        port: 5173,
        host: true,
        allowedHosts: [
            'jam.gimongous.net',
            'laptop-4b1imve6.ussuri-neon.ts.net'
        ]
    }
});
