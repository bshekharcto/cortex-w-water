import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // dev-only convenience; production talks to API_BASE_URL from
      // runtime-config.js and never relies on a dev proxy.
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        configure: (proxy) => {
          // Replace Vite's default handler, which prints a full AggregateError
          // stack for every request while the backend is down (the dashboard
          // fires several at once). Log one line per outage instead and answer
          // with a 503 the UI can show.
          let warned = false;
          proxy.removeAllListeners('error');
          proxy.on('error', (err: NodeJS.ErrnoException, _req, res) => {
            if (!warned) {
              warned = true;
              console.warn(
                `[vite] backend at localhost:4000 is unreachable (${err.code ?? err.message}) — start it with "npm run dev" in backend/`
              );
            }
            if (res && 'writeHead' in res && !res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Backend unavailable' }));
            }
          });
          proxy.on('proxyRes', () => {
            warned = false; // backend is back; warn again on the next outage
          });
        },
      },
    },
  },
  build: {
    sourcemap: true,
    // Route-level code splitting: each module folder becomes its own chunk
    // so Settings/Hydraulic/etc. don't bloat the Dashboard's first paint.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
});
