import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { handleRoomRequest } from './server/handler';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']) {
    if (env[key]) process.env[key] = env[key];
  }
  return {
    plugins: [react(), {
      name: 'local-private-room-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.split('?')[0] === '/api/room') {
            void handleRoomRequest(req, res).catch(() => {
              if (!res.headersSent) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'Could not reach your room. Please try again.' })); }
            });
          } else next();
        });
      },
    }],
    server: { host: '0.0.0.0', port: 5173 },
    build: { outDir: 'dist' },
  };
});
