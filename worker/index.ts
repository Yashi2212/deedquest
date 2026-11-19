import { createFetchRoomHandler, roomResponse } from '../server/fetch-handler.js';
import { RedisRoomStore } from '../server/redis-store.js';

export interface WorkerEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path !== '/api/room') {
      if (path.startsWith('/api/')) return roomResponse(404, { error: 'This API endpoint does not exist.' });
      return env.ASSETS.fetch(request);
    }
    const databaseUrl = env.UPSTASH_REDIS_REST_URL;
    const databaseToken = env.UPSTASH_REDIS_REST_TOKEN;
    // Workers never use an in-memory or filesystem fallback: every instance shares Redis.
    let validUrl = false;
    try {
      const url = new URL(databaseUrl ?? '');
      validUrl = url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
    } catch { /* Keep configuration errors generic; never expose a secret value. */ }
    if (!validUrl || !databaseToken?.trim()) return roomResponse(503, {
      error: 'Online rooms need a database. Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN as Cloudflare Worker secrets, then retry.',
    });
    return createFetchRoomHandler(new RedisRoomStore(databaseUrl!, databaseToken))(request);
  },
};
