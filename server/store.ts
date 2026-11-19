import { createHash, randomBytes } from 'node:crypto';
import { mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

export { ROOM_TTL_SECONDS } from './store-types.js';
export type { RoomStore, StoredRoom } from './store-types.js';
export { RedisRoomStore } from './redis-store.js';
import { ROOM_TTL_SECONDS, type RoomStore, type StoredRoom } from './store-types.js';
import { RedisRoomStore } from './redis-store.js';

/** Development only. Locks + atomic rename also support concurrent local tabs. */
export class FileRoomStore implements RoomStore {
  constructor(private directory = join(process.cwd(), '.local-data')) {}
  private path(code: string) {
    if (!/^[A-Z2-9]{8}$/.test(code)) throw new Error('Invalid room code.');
    return join(this.directory, `${code}.json`);
  }
  private async locked<T>(key: string, fn: () => Promise<T>): Promise<T> {
    await mkdir(this.directory, { recursive: true });
    const lockPath = join(this.directory, `${key}.lock`);
    for (let attempt = 0; attempt < 100; attempt++) {
      let lock;
      try { lock = await open(lockPath, 'wx'); }
      catch (error) {
        // Windows can report a sharing violation while another worker is
        // closing/removing the lock, rather than the usual EEXIST.
        if (!['EEXIST', 'EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
        try { if (Date.now() - (await stat(lockPath)).mtimeMs > 30_000) await unlink(lockPath); } catch { /* other worker unlocked */ }
        await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 30));
        continue;
      }
      try { return await fn(); }
      finally { await lock.close(); await unlink(lockPath).catch(() => undefined); }
    }
    throw new Error('The room is busy. Please try again.');
  }
  private async atomicWrite(path: string, value: unknown) {
    const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`;
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(value)); }
    finally { await file.close(); }
    try {
      // Windows sync/antivirus processes can briefly hold an existing file open.
      // Retrying rename preserves atomic replacement without deleting the room.
      for (let attempt = 0; ; attempt++) {
        try { await rename(temporary, path); break; }
        catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (!['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '') || attempt >= 19) throw error;
          await new Promise(resolve => setTimeout(resolve, 15 + attempt * 10));
        }
      }
    }
    finally { await unlink(temporary).catch(() => undefined); }
  }
  async get(code: string): Promise<StoredRoom | null> {
    try {
      const room = JSON.parse(await readFile(this.path(code), 'utf8')) as StoredRoom;
      return Date.now() - room.updatedAt > ROOM_TTL_SECONDS * 1000 ? null : room;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }
  async create(room: StoredRoom) {
    return this.locked(room.code, async () => {
      if (await this.get(room.code)) return false;
      await this.atomicWrite(this.path(room.code), room);
      return true;
    });
  }
  async compareAndSwap(code: string, revision: number, room: StoredRoom) {
    return this.locked(code, async () => {
      const existing = await this.get(code);
      if (!existing || existing.revision !== revision) return false;
      await this.atomicWrite(this.path(code), room);
      return true;
    });
  }
  async rateLimit(key: string, limit: number, windowSeconds: number) {
    return this.locked('rates', async () => {
      const path = join(this.directory, 'rates.json');
      let rates: Record<string, { count: number; expiresAt: number }> = {};
      try { rates = JSON.parse(await readFile(path, 'utf8')); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      const now = Date.now();
      for (const id of Object.keys(rates)) if (rates[id].expiresAt < now) delete rates[id];
      const safeKey = createHash('sha256').update(key).digest('hex');
      const bucket = rates[safeKey] ?? { count: 0, expiresAt: now + windowSeconds * 1000 };
      bucket.count++;
      rates[safeKey] = bucket;
      await this.atomicWrite(path, rates);
      return bucket.count <= limit;
    });
  }
}

/** Explicitly injectable, never a production fallback. */
export class MemoryRoomStore implements RoomStore {
  private rooms = new Map<string, StoredRoom>();
  private rates = new Map<string, { count: number; expires: number }>();
  async get(code: string) { return structuredClone(this.rooms.get(code) ?? null); }
  async create(room: StoredRoom) {
    if (this.rooms.has(room.code)) return false;
    this.rooms.set(room.code, structuredClone(room)); return true;
  }
  async compareAndSwap(code: string, revision: number, room: StoredRoom) {
    if (this.rooms.get(code)?.revision !== revision) return false;
    this.rooms.set(code, structuredClone(room)); return true;
  }
  async rateLimit(key: string, limit: number, seconds: number) {
    const previous = this.rates.get(key);
    const bucket = previous && previous.expires > Date.now() ? previous : { count: 0, expires: Date.now() + seconds * 1000 };
    bucket.count++; this.rates.set(key, bucket); return bucket.count <= limit;
  }
}

let configuredStore: RoomStore | undefined;
export function getConfiguredStore(): RoomStore {
  if (configuredStore) return configuredStore;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) configuredStore = new RedisRoomStore(url, token);
  else if (process.env.VERCEL || process.env.NODE_ENV === 'production') throw new Error('Online rooms need a database. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in your Vercel project settings, then redeploy.');
  else if (url || token) throw new Error('Both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured.');
  else configuredStore = new FileRoomStore();
  return configuredStore;
}
