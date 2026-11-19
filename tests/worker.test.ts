import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFetchRoomHandler } from '../server/fetch-handler.js';
import { MemoryRoomStore } from '../server/store.js';
import worker, { type WorkerEnv } from '../worker/index.js';
import type { ApiResult } from '../src/game/types.js';

function post(input: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://game.test/api/room', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://game.test', 'CF-Connecting-IP': '192.0.2.4', ...headers }, body: JSON.stringify(input) });
}
const createInput = () => ({ op: 'create', name: 'Worker host', requestId: randomUUID(), settings: { randomOrder: false } });
const assets: WorkerEnv['ASSETS'] = { async fetch() { return new Response('static game page'); } };

test('Worker adapter preserves private authentication, idempotency, revisions and cross-instance room storage', async () => {
  const store = new MemoryRoomStore();
  const first = createFetchRoomHandler(store);
  const second = createFetchRoomHandler(store);
  const input = createInput();
  const createdResponse = await first(post(input));
  assert.equal(createdResponse.status, 200);
  assert.equal(createdResponse.headers.get('Cache-Control'), 'no-store, private');
  const created = await createdResponse.json() as ApiResult;
  assert.ok(created.session?.token);
  const retry = await (await second(post(input))).json() as ApiResult;
  assert.equal(retry.session!.token, created.session.token);
  assert.equal(retry.room.code, created.room.code);
  const url = `https://game.test/api/room?code=${created.room.code}`;
  assert.equal((await second(new Request(url))).status, 401);
  assert.equal((await second(new Request(url, { headers: { Authorization: `Bearer ${'x'.repeat(43)}` } }))).status, 403);
  const headers = { Authorization: `Bearer ${created.session.token}` };
  const unchanged = await second(new Request(`${url}&revision=${created.room.revision}`, { headers }));
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), '');
  assert.equal(unchanged.headers.get('Vary'), 'Authorization');
  const fetched = await (await second(new Request(url, { headers }))).json() as ApiResult;
  assert.equal('auth' in fetched.room, false);
  assert.equal(JSON.stringify(fetched).includes(created.session.token), false);
  const badRevision = await first(post({ op: 'action', code: created.room.code, requestId: randomUUID(), revision: 0, action: { type: 'settings', settings: { startingCash: 2000 } } }, headers));
  assert.equal(badRevision.status, 409);
});

test('Worker adapter enforces origin, method, JSON shape and byte limits before mutating storage', async () => {
  const store = new MemoryRoomStore();
  const handler = createFetchRoomHandler(store);
  assert.equal((await handler(post(createInput(), { Origin: 'https://attacker.test' }))).status, 403);
  assert.equal((await handler(post(createInput(), { Origin: 'http://game.test' }))).status, 403);
  assert.equal((await handler(post(createInput(), { 'Sec-Fetch-Site': 'cross-site' }))).status, 403);
  assert.equal((await handler(post(createInput(), { 'Content-Type': 'text/plain' }))).status, 415);
  assert.equal((await handler(post([]))).status, 400);
  assert.equal((await handler(post(createInput(), { 'Content-Length': '20000' }))).status, 413);
  // Multibyte input without Content-Length is still measured in bytes, not characters.
  assert.equal((await handler(post({ ...createInput(), name: '界'.repeat(6000) }))).status, 413);
  const malformed = new Request('https://game.test/api/room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal((await handler(malformed)).status, 400);
  const method = await handler(new Request('https://game.test/api/room', { method: 'DELETE' }));
  assert.equal(method.status, 405);
  assert.equal(method.headers.get('Allow'), 'GET, POST');
});

test('Worker adapter uses the platform IP for limits, ignoring forwarded IP spoofing', async () => {
  class RecordingStore extends MemoryRoomStore {
    keys: string[] = [];
    override async rateLimit(key: string, limit: number, seconds: number) { this.keys.push(key); return super.rateLimit(key, limit, seconds); }
  }
  const store = new RecordingStore();
  const response = await createFetchRoomHandler(store)(post(createInput(), { 'X-Forwarded-For': 'spoofed-client', 'X-Vercel-Forwarded-For': 'another-spoof' }));
  assert.equal(response.status, 200);
  assert.ok(store.keys.some(key => key.includes('192.0.2.4')));
  assert.ok(store.keys.every(key => !key.includes('spoof')));
});

test('Worker serves static assets without Redis, fails closed for missing secrets and never routes API errors into the SPA', async () => {
  assert.equal(await (await worker.fetch(new Request('https://game.test/'), { ASSETS: assets })).text(), 'static game page');
  const missing = await worker.fetch(new Request('https://game.test/api/room?code=ABCDEFGH'), { ASSETS: assets });
  assert.equal(missing.status, 503);
  assert.equal(missing.headers.get('Cache-Control'), 'no-store, private');
  const malformed = await worker.fetch(new Request('https://game.test/api/room'), { ASSETS: assets, UPSTASH_REDIS_REST_URL: 'http://insecure-secret.test', UPSTASH_REDIS_REST_TOKEN: 'do-not-display' });
  assert.equal(malformed.status, 503);
  const errorText = await malformed.text();
  assert.equal(errorText.includes('do-not-display'), false);
  assert.equal(errorText.includes('insecure-secret'), false);
  assert.equal((await worker.fetch(new Request('https://game.test/api/unknown'), { ASSETS: assets })).status, 404);
});

test('Worker API accepts a joining session before start and prevents a new join after start while allowing authenticated reconnection', async () => {
  const handler = createFetchRoomHandler(new MemoryRoomStore());
  const host = await (await handler(post(createInput()))).json() as ApiResult;
  const guestInput = { op: 'join', code: host.room.code, name: 'Guest', requestId: randomUUID() };
  const guest = await (await handler(post(guestInput))).json() as ApiResult;
  const ready = await (await handler(post({ op: 'action', code: host.room.code, requestId: randomUUID(), revision: guest.room.revision, action: { type: 'ready', ready: true } }, { Authorization: `Bearer ${guest.session!.token}` }))).json() as ApiResult;
  const started = await handler(post({ op: 'action', code: host.room.code, requestId: randomUUID(), revision: ready.room.revision, action: { type: 'start' } }, { Authorization: `Bearer ${host.session!.token}` }));
  assert.equal(started.status, 200);
  assert.equal((await handler(post({ ...guestInput, name: 'Late guest', requestId: randomUUID() }))).status, 409);
  const reconnect = await handler(new Request(`https://game.test/api/room?code=${host.room.code}`, { headers: { Authorization: `Bearer ${guest.session!.token}` } }));
  assert.equal(reconnect.status, 200);
});
