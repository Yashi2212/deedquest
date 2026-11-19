import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiResult, PublicRoom, RoomAction, RoomSettings, Session } from './game/types';

const SESSION_KEY = 'common-ground-session-v1';
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
function newRequestId(): string {
  // getRandomValues also works on a local Wi-Fi HTTP origin, unlike randomUUID.
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), value => value.toString(16).padStart(2, '0')).join('');
}

async function request(body?: object, session?: Session, revision?: number): Promise<ApiResult | null> {
  const url = body ? '/api/room' : `/api/room?code=${encodeURIComponent(session!.code)}${revision === undefined ? '' : `&revision=${revision}`}`;
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 304) return null;
  const payload = await response.json().catch(() => ({ error: 'The server did not respond. Please try again.' }));
  if (!response.ok) throw new ApiError(typeof payload.error === 'string' ? payload.error : 'Could not complete that move.', response.status);
  return payload;
}

function readSession(): Session | null {
  try { const value = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); return value?.token && value?.code && value?.playerId ? value : null; } catch { return null; }
}

export function useRoom() {
  const [session, setSession] = useState<Session | null>(readSession);
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState<'connecting' | 'online' | 'reconnecting'>('connecting');
  const roomRef = useRef(room);
  const sessionRef = useRef(session);
  const actionLock = useRef(false);
  sessionRef.current = session;
  const accept = useCallback((result: ApiResult | null) => {
    if (!result) return;
    if (!roomRef.current || roomRef.current.code !== result.room.code || result.room.revision >= roomRef.current.revision) {
      roomRef.current = result.room;
      setRoom(result.room);
    }
  }, []);
  const forget = useCallback(() => {
    localStorage.removeItem(SESSION_KEY); sessionRef.current = null; setSession(null); setRoom(null); roomRef.current = null;
    window.history.replaceState({}, '', window.location.pathname);
    window.scrollTo(0, 0);
  }, []);
  useEffect(() => {
    if (!session) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const poll = async () => {
      try {
        const result = await request(undefined, session, roomRef.current?.revision);
        if (disposed || sessionRef.current?.token !== session.token) return;
        accept(result); setConnection('online'); failures = 0;
      } catch (err) {
        if (disposed || sessionRef.current?.token !== session.token) return;
        if (err instanceof ApiError && [401, 403, 404, 410].includes(err.status)) {
          forget(); setError(err.message); return;
        }
        failures++; setConnection('reconnecting');
        if (!roomRef.current) setError(err instanceof Error ? err.message : 'Trying to reconnect…');
      }
      if (!disposed) timer = setTimeout(poll, document.hidden ? 12000 : Math.min(2000 * (failures + 1), 10000));
    };
    poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [session, accept, forget]);

  useEffect(() => {
    if (!session) return;
    let disposed = false;
    let running = false;
    const timer = setInterval(async () => {
      const currentRoom = roomRef.current;
      const game = currentRoom?.game;
      if (disposed || running || actionLock.current || !game || game.phase === 'finished' || sessionRef.current?.token !== session.token) return;
      const botIds = new Set(game.players.filter(player => player.bot && !player.bankrupt).map(player => player.id));
      const needsBot = botIds.has(game.players[game.turnIndex].id)
        || (game.auction && game.players.some(player => botIds.has(player.id) && !game.auction!.passedIds.includes(player.id) && game.auction!.highestBidderId !== player.id))
        || (['roll', 'end'].includes(game.phase) && game.trades?.some(trade => trade.status === 'pending' && botIds.has(trade.toId)));
      if (!needsBot) return;
      running = true;
      try {
        const result = await request({ op: 'action', code: session.code, action: { type: 'botTick' }, requestId: newRequestId(), revision: currentRoom!.revision }, session);
        if (!disposed && sessionRef.current?.token === session.token) accept(result);
      } catch { /* Normal polling handles reconnects. A bot tick can retry safely. */ }
      finally { running = false; }
    }, 1800);
    return () => { disposed = true; clearInterval(timer); };
  }, [session, accept]);

  const enter = async (name: string, code?: string, settings?: Partial<RoomSettings>) => {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setError('');
    const body = code ? { op: 'join', name, code: code.toUpperCase().trim(), requestId: newRequestId() } : { op: 'create', name, settings, requestId: newRequestId() };
    try {
      let result: ApiResult | null;
      try { result = await request(body); }
      catch (err) { if (err instanceof ApiError) throw err; result = await request(body); }
      if (!result?.session) throw new Error('No room session was returned. Please try again.');
      localStorage.setItem(SESSION_KEY, JSON.stringify(result.session));
      localStorage.setItem('common-ground-name', name);
      sessionRef.current = result.session; setSession(result.session); accept(result); setConnection('online');
      window.history.replaceState({}, '', `?room=${result.room.code}`);
      window.scrollTo(0, 0);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not open the room.'); }
    finally { actionLock.current = false; setBusy(false); }
  };

  const act = async (action: RoomAction) => {
    const current = sessionRef.current;
    if (!current || actionLock.current) return false;
    actionLock.current = true; setBusy(true); setError('');
    const body = { op: 'action', code: current.code, action, requestId: newRequestId(), revision: roomRef.current?.revision };
    try {
      let result: ApiResult | null;
      try { result = await request(body, current); }
      catch (err) { if (err instanceof ApiError) throw err; result = await request(body, current); }
      if (sessionRef.current?.token !== current.token) return false;
      accept(result); setConnection('online');
      if (action.type === 'leave') forget();
      return true;
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not send your move.'); return false; }
    finally { actionLock.current = false; setBusy(false); }
  };
  return { session, room, busy, error, setError, connection, enter, act, forget };
}
