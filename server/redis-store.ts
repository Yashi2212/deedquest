import { createHash } from 'node:crypto';
import { ROOM_TTL_SECONDS, type RoomStore, type StoredRoom } from './store-types.js';

/** Atomic operations are essential: different serverless invocations share this store. */
export class RedisRoomStore implements RoomStore {
  constructor(private url: string, private token: string) {}
  private async command<T>(args: (string | number)[]): Promise<T> {
    const response = await fetch(this.url, {
      method: 'POST', headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args), signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error('The room service is temporarily unavailable.');
    const data = await response.json() as { result: T; error?: string };
    if (data.error) throw new Error('The room service is temporarily unavailable.');
    return data.result;
  }
  async get(code: string) {
    const value = await this.command<string | null>(['GET', `common-ground:room:${code}`]);
    return value ? JSON.parse(value) as StoredRoom : null;
  }
  async create(room: StoredRoom) {
    return (await this.command<string | null>(['SET', `common-ground:room:${room.code}`, JSON.stringify(room), 'NX', 'EX', ROOM_TTL_SECONDS])) === 'OK';
  }
  async compareAndSwap(code: string, revision: number, room: StoredRoom) {
    const script = "local s=redis.call('GET',KEYS[1]); if not s then return 0 end; local r=cjson.decode(s); if r.revision~=tonumber(ARGV[1]) then return 0 end; redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]); return 1";
    return (await this.command<number>(['EVAL', script, 1, `common-ground:room:${code}`, revision, JSON.stringify(room), ROOM_TTL_SECONDS])) === 1;
  }
  async rateLimit(key: string, limit: number, windowSeconds: number) {
    const script = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n";
    const safeKey = createHash('sha256').update(key).digest('hex');
    return (await this.command<number>(['EVAL', script, 1, `common-ground:rate:${safeKey}`, windowSeconds])) <= limit;
  }
}

