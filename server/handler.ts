import type { IncomingMessage, ServerResponse } from 'node:http';
import { RoomError, RoomService } from './service.js';
import { getConfiguredStore, type RoomStore } from './store.js';

export type RoomRequest = IncomingMessage & { body?: unknown };
const MAX_BODY_BYTES = 16 * 1024;

function header(req: IncomingMessage, key: string): string {
  const value = req.headers[key];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function send(res: ServerResponse, status: number, value?: unknown) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Vary', 'Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (status === 304) { res.end(); return; }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(value));
}

async function body(req: RoomRequest): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;|$)/i.test(header(req, 'content-type'))) throw new RoomError('Send JSON with Content-Type: application/json.', 415);
  const announced = Number(header(req, 'content-length'));
  if (announced > MAX_BODY_BYTES) throw new RoomError('This request is too large.', 413);
  let data: unknown;
  if (req.body !== undefined) {
    const encoded = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
    if (Buffer.byteLength(encoded ?? '') > MAX_BODY_BYTES) throw new RoomError('This request is too large.', 413);
    try { data = JSON.parse(encoded); } catch { throw new RoomError('Send a valid JSON request.'); }
  } else {
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of req) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += bytes.length;
      if (length > MAX_BODY_BYTES) throw new RoomError('This request is too large.', 413);
      chunks.push(bytes);
    }
    try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new RoomError('Send a valid JSON request.'); }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new RoomError('Send a JSON object.');
  return data as Record<string, unknown>;
}

function checkOrigin(req: IncomingMessage) {
  const origin = header(req, 'origin');
  if (header(req, 'sec-fetch-site') === 'cross-site') throw new RoomError('Use the game website to change your room.', 403);
  if (!origin) return;
  let parsed: URL;
  try { parsed = new URL(origin); } catch { throw new RoomError('This origin is not allowed.', 403); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.host.toLowerCase() !== header(req, 'host').toLowerCase()) throw new RoomError('This origin is not allowed.', 403);
}

export function createRoomHandler(store: RoomStore) {
  const service = new RoomService(store);
  return async (req: RoomRequest, res: ServerResponse): Promise<void> => {
    try {
      const bearer = /^Bearer ([A-Za-z0-9_-]+)$/.exec(header(req, 'authorization'))?.[1];
      if (req.method === 'GET') {
        const url = new URL(req.url ?? '/api/room', 'http://localhost');
        const result = await service.get(url.searchParams.get('code'), bearer, url.searchParams.get('revision'));
        send(res, result ? 200 : 304, result);
      } else if (req.method === 'POST') {
        checkOrigin(req);
        const input = await body(req);
        const ip = (header(req, 'x-vercel-forwarded-for') || header(req, 'x-forwarded-for')).split(',')[0].trim() || req.socket?.remoteAddress || 'local';
        if (input.op === 'create') send(res, 200, await service.create(input, ip));
        else if (input.op === 'join') send(res, 200, await service.join(input, ip));
        else if (input.op === 'action') send(res, 200, await service.action(input, bearer));
        else throw new RoomError('Choose create, join, or action.');
      } else {
        res.setHeader('Allow', 'GET, POST');
        send(res, 405, { error: 'Use GET to read a room or POST to make a move.' });
      }
    } catch (error) {
      if (error instanceof RoomError) send(res, error.status, { error: error.message });
      else if (error instanceof Error && /temporarily unavailable|room is busy/i.test(error.message)) send(res, 503, { error: error.message });
      else if (error instanceof Error) send(res, 400, { error: error.message });
      else send(res, 500, { error: 'The room could not complete this request. Try again.' });
    }
  };
}

let configuredHandler: ReturnType<typeof createRoomHandler> | undefined;
export async function handleRoomRequest(req: RoomRequest, res: ServerResponse): Promise<void> {
  try {
    configuredHandler ??= createRoomHandler(getConfiguredStore());
    await configuredHandler(req, res);
  } catch (error) {
    send(res, 503, { error: error instanceof Error ? error.message : 'The room service is not configured yet.' });
  }
}
