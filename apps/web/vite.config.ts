import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    // Must come before react(): generates src/routeTree.gen.ts from src/routes.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
  server: {
    port: 5173,
    // One origin in dev too: the browser talks only to :5173; /api (incl. WebSockets) goes to
    // `wrangler dev` on :8787.
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: false, ws: true },
    },
  },
  build: {
    outDir: 'dist',
  },
});
