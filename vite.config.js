import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Serve the Vercel-style /api functions from the dev server and `vite preview` so the app works locally.
function localApi() {
  const mount = (server) => {
    server.middlewares.use('/api/bottles', async (req, res) => {
      try {
        const mod = await (server.ssrLoadModule
          ? server.ssrLoadModule('/api/bottles.js')
          : import(/* @vite-ignore */ new URL('./api/bottles.js', import.meta.url).href));
        await mod.default(req, res);
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'server_error' }));
      }
    });
  };
  return { name: 'kloudrift-local-api', configureServer: mount, configurePreviewServer: mount };
}

export default defineConfig({
  plugins: [react(), localApi()],
  // three.js lives in its own lazily-loaded chunk (only fetched when a 3D level starts), so its size is intentional.
  build: { chunkSizeWarningLimit: 700 },
});
