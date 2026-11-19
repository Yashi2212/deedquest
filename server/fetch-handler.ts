import { RoomError, RoomService } from './service.js';
import type { RoomStore } from './store-types.js';

const MAX_BODY_BYTES = 16 * 1024;

export function roomResponse(status: number, value?: unknown, extraHeaders: Record<string, string> = {}): Response {
  const headers = {
    'Cache-Control': 'no-store, private',
    Vary: 'Authorization',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  };
  if (status === 304) return new Response(null, { status, headers });
  return new Response(JSON.stringify(value), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
}

async function readInput(request: Request): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') ?? '')) throw new RoomError('Send JSON with Content-Type: application/json.', 415);
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) throw new RoomError('This request is too large.', 413);
  // A length header is not trusted. Bound bytes while streaming, including chunked requests.
  const reader = request.body?.getReader();
  if (!reader) throw new RoomError('Send a valid JSON request.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new RoomError('This request is too large.', 413);
      }
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let input: unknown;
  try { input = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new RoomError('Send a valid JSON request.'); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RoomError('Send a JSON object.');
  return input as Record<string, unknown>;
}

function checkOrigin(request: Request): void {
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new RoomError('Use the game website to change your room.', 403);
  const origin = request.headers.get('Origin');
  if (!origin) return;
  let parsed: URL;
  try { parsed = new URL(origin); } catch { throw new RoomError('This origin is not allowed.', 403); }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.origin !== new URL(request.url).origin) throw new RoomError('This origin is not allowed.', 403);
}

/** Fetch adapter used by Workers; all game rules, authorization and atomic updates stay in RoomService. */
export function createFetchRoomHandler(store: RoomStore): (request: Request) => Promise<Response> {
  const service = new RoomService(store);
  return async request => {
    try {
      const bearer = /^Bearer ([A-Za-z0-9_-]+)$/.exec(request.headers.get('Authorization') ?? '')?.[1];
      if (request.method === 'GET') {
        const url = new URL(request.url);
        const result = await service.get(url.searchParams.get('code'), bearer, url.searchParams.get('revision'));
        return roomResponse(result ? 200 : 304, result);
      }
      if (request.method !== 'POST') return roomResponse(405, { error: 'Use GET to read a room or POST to make a move.' }, { Allow: 'GET, POST' });
      checkOrigin(request);
      const input = await readInput(request);
      // Cloudflare supplies this header. Do not trust user-supplied X-Forwarded-For.
      const ip = request.headers.get('CF-Connecting-IP') || 'local-worker';
      if (input.op === 'create') return roomResponse(200, await service.create(input, ip));
      if (input.op === 'join') return roomResponse(200, await service.join(input, ip));
      if (input.op === 'action') return roomResponse(200, await service.action(input, bearer));
      throw new RoomError('Choose create, join, or action.');
    } catch (error) {
      if (error instanceof RoomError) return roomResponse(error.status, { error: error.message });
      if (error instanceof Error && /temporarily unavailable|room is busy/i.test(error.message)) return roomResponse(503, { error: error.message });
      if (error instanceof Error) return roomResponse(400, { error: error.message });
      return roomResponse(500, { error: 'The room could not complete this request. Try again.' });
    }
  };
}
