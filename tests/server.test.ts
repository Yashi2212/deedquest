import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import type { ServerResponse } from 'node:http';
import { RoomService, RoomError, publicRoom, validateSettings } from '../server/service.js';
import { FileRoomStore, MemoryRoomStore, getConfiguredStore } from '../server/store.js';
import { createRoomHandler, type RoomRequest } from '../server/handler.js';
import type { ApiResult, RoomAction, RoomSettings, Session } from '../src/game/types.js';
import { LEGACY_PLAYER_COLORS, PLAYER_COLORS } from '../src/game/types.js';

const id = () => randomUUID();
const status = (expected: number) => (error: unknown) => error instanceof RoomError && error.status === expected;

async function fixture(count = 2, settings: Partial<RoomSettings> = {}) {
  const store = new MemoryRoomStore();
  const service = new RoomService(store);
  const host = await service.create({ name: 'Host', requestId: id(), settings }, 'fixture');
  const sessions = [host.session!];
  let room = host.room;
  for (let i = 1; i < count; i++) {
    const result = await service.join({ code: room.code, name: `Friend ${i}`, requestId: id() }, 'fixture');
    room = result.room; sessions.push(result.session!);
  }
  const read = async () => (await service.get(room.code, sessions[0].token))!.room;
  const action = async (session: Session, action: RoomAction, revision?: number, requestId = id()) => service.action({ code: room.code, action, revision: revision ?? (await read()).revision, requestId }, session.token);
  const start = async () => {
    for (const session of sessions.slice(1)) await action(session, { type: 'ready', ready: true });
    return (await action(sessions[0], { type: 'start' })).room;
  };
  return { store, service, sessions, room, read, action, start };
}

async function http(store: MemoryRoomStore, options: { method?: string; headers?: Record<string, string>; body?: unknown; raw?: string; url?: string } = {}) {
  const req = Readable.from(options.raw === undefined ? [] : [Buffer.from(options.raw)]) as RoomRequest;
  req.method = options.method ?? 'POST';
  req.url = options.url ?? '/api/room';
  req.headers = { host: 'game.test', 'content-type': 'application/json', ...options.headers };
  if (options.body !== undefined) req.body = options.body;
  const headers: Record<string, unknown> = {};
  let output = '';
  const res = {
    statusCode: 200,
    setHeader(key: string, value: unknown) { headers[key.toLowerCase()] = value; return this; },
    end(value?: string) { output = value ?? ''; return this; },
  };
  await createRoomHandler(store)(req, res as unknown as ServerResponse);
  return { status: res.statusCode, headers, data: output ? JSON.parse(output) : null, output };
}

test('create retries return the same session, including concurrent creation, and reject changed input', async () => {
  const store = new MemoryRoomStore();
  const service = new RoomService(store);
  const input = { name: 'Host', requestId: id(), settings: {} };
  const results = await Promise.all(Array.from({ length: 8 }, () => service.create(input, 'same-ip')));
  assert.equal(new Set(results.map((value) => value.room.code)).size, 1);
  assert.equal(new Set(results.map((value) => value.session!.token)).size, 1);
  assert.ok(results.every((value) => value.room.players.length === 1));
  await assert.rejects(service.create({ ...input, name: 'Imposter' }, 'same-ip'), status(409));
});

test('public rooms exclude all auth material, join receipts and request histories', async () => {
  const { store, sessions, room, service, action } = await fixture();
  await action(sessions[0], { type: 'chat', text: 'Hello, friends!' });
  const stored = (await store.get(room.code))!;
  const projected = publicRoom(stored);
  const encoded = JSON.stringify(projected);
  for (const key of ['auth', 'joinKey', 'joins', 'requests']) assert.equal(key in projected, false);
  for (const secret of [stored.joinKey, ...Object.values(stored.auth), ...Object.values(stored.joins), ...sessions.map((item) => item.token)]) assert.equal(encoded.includes(secret), false);
  projected.players[0].name = 'Changed clone';
  assert.equal((await service.get(room.code, sessions[0].token))!.room.players[0].name, 'Host');
});

test('room reads and actions require an authentic token belonging to that room', async () => {
  const a = await fixture();
  const other = await a.service.create({ name: 'Other host', requestId: id() }, 'other');
  await assert.rejects(a.service.get(a.room.code, undefined), status(401));
  await assert.rejects(a.service.get(a.room.code, 'x'.repeat(43)), status(403));
  await assert.rejects(a.service.get(a.room.code, other.session!.token), status(403));
  await assert.rejects(a.service.action({ code: a.room.code, requestId: id(), revision: a.room.revision, action: { type: 'start' }, playerId: a.sessions[0].playerId }, other.session!.token), status(403));
  assert.equal(await a.service.get(a.room.code.toLowerCase(), a.sessions[0].token, String(a.room.revision)), null);
});

test('eight concurrent joins keep the eight-seat limit, unique tokens and colors', async () => {
  const { service, room, read } = await fixture(1);
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => service.join({ code: room.code, name: `Guest ${index}`, requestId: id() }, `ip-${index}`)));
  const joined = results.filter((result): result is PromiseFulfilledResult<ApiResult> => result.status === 'fulfilled');
  const refused = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
  assert.equal(joined.length, 7);
  assert.equal(refused.length, 1);
  assert.ok(status(409)(refused[0].reason));
  const full = await read();
  assert.equal(full.players.length, 8);
  assert.equal(full.revision, 8);
  assert.equal(new Set(full.players.map((player) => player.tokenIndex)).size, 8);
  assert.equal(new Set(joined.map((result) => result.value.session!.token)).size, 7);
  await assert.rejects(service.join({ code: room.code, name: 'Ninth', requestId: id() }, 'ninth'), status(409));
});

test('large maps accept ten concurrent seats with ten distinct tokens and reject an eleventh', async () => {
  const { service, room, read, action, sessions } = await fixture(1, { mapId: 'frost', maxPlayers: 10, teams: true, teamCount: 5 });
  const results = await Promise.allSettled(Array.from({ length: 10 }, (_, index) => service.join({ code: room.code, name: `Explorer ${index}`, requestId: id() }, `large-${index}`)));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 9);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  const full = await read();
  assert.equal(full.players.length, 10);
  assert.equal(new Set(full.players.map((player) => player.color)).size, 10);
  assert.equal(new Set(full.players.map((player) => player.tokenIndex)).size, 10);
  assert.equal(new Set(full.players.map((player) => player.team)).size, 5);
  await assert.rejects(action(sessions[0], { type: 'settings', settings: { mapId: 'ember' } }), /already more players/);
  assert.equal((await read()).settings.mapId, 'frost');
});

test('lobby appearance validates colors and tokens, allows shared emoji, and reserves colors for new players', async () => {
  const { action, sessions, service, room, read, start } = await fixture(2);
  const changed = await action(sessions[0], { type: 'appearance', color: PLAYER_COLORS[9], tokenIndex: 1 });
  assert.equal(changed.room.players[0].color, PLAYER_COLORS[9]);
  assert.equal(changed.room.players[0].tokenIndex, changed.room.players[1].tokenIndex, 'Players may choose the same emoji with distinct colors.');
  await assert.rejects(action(sessions[1], { type: 'appearance', color: PLAYER_COLORS[9], tokenIndex: 0 }), status(409));
  await assert.rejects(action(sessions[0], { type: 'appearance', color: '#ffffff', tokenIndex: 0 }), /available player color/);
  for (const tokenIndex of [-1, 10, 1.5, NaN]) await assert.rejects(action(sessions[0], { type: 'appearance', color: PLAYER_COLORS[9], tokenIndex }), /available player token/);
  const joining = await service.join({ code: room.code, name: 'New friend', requestId: id() }, 'appearance');
  assert.equal(joining.room.players.at(-1)!.color, PLAYER_COLORS[0]);
  await action(sessions[0], { type: 'addBot' });
  const roster = (await read()).players;
  assert.equal(new Set(roster.map(player => player.color)).size, 4);
  await action(joining.session!, { type: 'ready', ready: true });
  const started = await start();
  assert.equal(started.game!.players[0].color, PLAYER_COLORS[9]);
  assert.equal(started.game!.players[0].tokenIndex, 1);
  await assert.rejects(action(sessions[0], { type: 'appearance', color: PLAYER_COLORS[8], tokenIndex: 0 }), status(409));
});

test('existing games ignore a saved round limit without losing their state', async () => {
  const { store, room, read, start, action, sessions } = await fixture();
  await start();
  const stored = (await store.get(room.code))!;
  Object.assign(stored.settings, { roundLimit: 1 });
  Object.assign(stored.game!.settings, { roundLimit: 1 });
  stored.game!.phase = 'end';
  stored.game!.turnIndex = 1;
  stored.game!.round = 50;
  const before = structuredClone(stored.game!.players);
  assert.equal(await store.compareAndSwap(room.code, stored.revision, stored), true);
  const loaded = await read();
  assert.equal('roundLimit' in loaded.settings, false);
  assert.equal('roundLimit' in loaded.game!.settings, false);
  assert.deepEqual(loaded.game!.players, before);
  const continued = await action(sessions[1], { type: 'endTurn' });
  assert.equal(continued.room.game!.phase, 'roll');
  assert.deepEqual(continued.room.game!.winnerIds, []);
  assert.throws(() => validateSettings({ roundLimit: 10 }), /Unknown room setting/);
});

test('older rooms migrate to distinct player colors consistently without changing tokens or assets', async () => {
  const { store, room, read, start } = await fixture(3);
  await start();
  const stored = (await store.get(room.code))!;
  for (const [index, participant] of stored.players.entries()) {
    participant.color = LEGACY_PLAYER_COLORS[index];
    stored.game!.players[index].color = LEGACY_PLAYER_COLORS[index];
  }
  stored.game!.properties[1].ownerId = stored.players[0].id;
  stored.settings.vacationCash = false;
  stored.game!.settings.vacationCash = false;
  const before = structuredClone(stored.game!.properties);
  assert.equal(await store.compareAndSwap(room.code, stored.revision, stored), true);
  const migrated = await read();
  assert.deepEqual(migrated.players.map(item => item.color), PLAYER_COLORS.slice(0, 3));
  assert.deepEqual(migrated.game!.players.map(item => item.color), PLAYER_COLORS.slice(0, 3));
  assert.deepEqual(migrated.players.map(item => item.tokenIndex), [0, 1, 2]);
  assert.deepEqual(migrated.game!.properties, before);
  assert.equal(migrated.settings.vacationCash, true);
  assert.equal(migrated.game!.settings.vacationCash, true);
});

test('out-of-turn trade offers and exact responses tolerate unrelated revisions and apply cash once', async () => {
  const { start, sessions, action, read } = await fixture(3);
  const started = await start();
  await action(sessions[0], { type: 'chat', text: 'Playing while a trade is drafted.' });
  const offered = await action(sessions[1], { type: 'offerTrade', toId: sessions[2].playerId, offeredCash: 25, requestedCash: 0, offeredProperties: [], requestedProperties: [] }, started.revision);
  const offerId = offered.room.game!.trades[0].id;
  await action(sessions[0], { type: 'chat', text: 'Another update.' });
  const accepted = await action(sessions[2], { type: 'respondTrade', offerId, accept: true }, offered.room.revision);
  assert.equal(accepted.room.game!.players[1].cash, 1475);
  assert.equal(accepted.room.game!.players[2].cash, 1525);
  assert.equal(accepted.room.game!.turnIndex, 0);
  assert.equal(accepted.room.game!.phase, 'roll');
  await assert.rejects(action(sessions[2], { type: 'respondTrade', offerId, accept: true }, offered.room.revision), /no trade/);
  assert.equal((await read()).game!.players[2].cash, 1525);
});

test('counteroffers tolerate unrelated room changes but enforce trade versions and request idempotency', async () => {
  const { start, sessions, action, read } = await fixture(3);
  await start();
  const offered = await action(sessions[1], { type: 'offerTrade', toId: sessions[2].playerId, offeredCash: 25, requestedCash: 0, offeredProperties: [], requestedProperties: [] });
  const offerId = offered.room.game!.trades[0].id;
  await action(sessions[0], { type: 'chat', text: 'The game continues while this deal is negotiated.' });
  const counter: RoomAction = { type: 'counterTrade', offerId, offerVersion: 1, offeredCash: 0, requestedCash: 50, offeredProperties: [], requestedProperties: [] };
  const requestId = id();
  const [first, retry] = await Promise.all([action(sessions[2], counter, offered.room.revision, requestId), action(sessions[2], counter, offered.room.revision, requestId)]);
  assert.equal(first.room.game!.trades.length, 1);
  assert.equal(retry.room.game!.trades[0].version, 2);
  assert.equal(first.room.game!.trades[0].revisions.length, 2);
  assert.equal(first.room.game!.players[1].cash, 1500);
  assert.equal(first.room.game!.phase, 'roll');
  assert.equal(first.room.game!.turnIndex, 0);
  await assert.rejects(action(sessions[1], { type: 'respondTrade', offerId, offerVersion: 1, accept: true }, offered.room.revision), /latest terms/);
  await assert.rejects(action(sessions[2], { type: 'cancelTrade', offerId, offerVersion: 1 }, offered.room.revision), /latest terms/);
  await action(sessions[0], { type: 'chat', text: 'Another unrelated update.' });
  const accept: RoomAction = { type: 'respondTrade', offerId, offerVersion: 2, accept: true };
  const acceptId = id();
  const results = await Promise.all([action(sessions[1], accept, offered.room.revision, acceptId), action(sessions[1], accept, offered.room.revision, acceptId)]);
  assert.ok(results.every(result => result.room.game!.trades[0].status === 'accepted'));
  assert.equal((await read()).game!.players[1].cash, 1450);
  assert.equal((await read()).game!.players[2].cash, 1550);
});

test('legacy untouched trade terms receive revision one and still support an older client response', async () => {
  const { start, sessions, action, read, store, room } = await fixture(3);
  await start();
  await action(sessions[1], { type: 'offerTrade', toId: sessions[2].playerId, offeredCash: 25, requestedCash: 0, offeredProperties: [], requestedProperties: [] });
  const stored = (await store.get(room.code))!;
  const offer = stored.game!.trades[0];
  for (const key of ['version', 'revisions', 'updatedAt']) delete (offer as unknown as Record<string, unknown>)[key];
  assert.equal(await store.compareAndSwap(room.code, stored.revision, stored), true);
  const normalized = (await read()).game!.trades[0];
  assert.equal(normalized.version, 1);
  assert.equal(normalized.revisions.length, 1);
  assert.equal(normalized.revisions[0].offeredCash, 25);
  assert.equal(normalized.updatedAt, normalized.createdAt);
  const accepted = await action(sessions[2], { type: 'respondTrade', offerId: normalized.id, accept: true });
  assert.equal(accepted.room.game!.trades[0].status, 'accepted');
});

test('only the host adds ready bots, with unique seats and balanced teams, within each map limit', async () => {
  const { action, sessions, read, store, room } = await fixture(2, { mapId: 'frost', maxPlayers: 10, teams: true, teamCount: 5 });
  await assert.rejects(action(sessions[1], { type: 'addBot' }), status(403));
  for (let i = 0; i < 8; i++) await action(sessions[0], { type: 'addBot' });
  const full = await read();
  const bots = full.players.filter((player) => player.bot);
  assert.equal(bots.length, 8);
  assert.ok(bots.every((player) => player.ready));
  assert.equal(new Set(full.players.map((player) => player.name.toLowerCase())).size, 10);
  assert.equal(new Set(full.players.map((player) => player.color)).size, 10);
  for (let team = 0; team < 5; team++) assert.equal(full.players.filter((player) => player.team === team).length, 2);
  const stored = (await store.get(room.code))!;
  assert.equal(Object.keys(stored.auth).length, 2);
  assert.ok(bots.every((player) => !stored.auth[player.id]));
  await assert.rejects(action(sessions[0], { type: 'addBot' }), status(409));
  const small = await fixture(1, { maxPlayers: 2 });
  await small.action(small.sessions[0], { type: 'addBot' });
  await assert.rejects(small.action(small.sessions[0], { type: 'addBot' }), status(409));
});

test('bots stay ready after settings changes, can start a solo-human game, and survive rematch', async () => {
  const { action, sessions, read } = await fixture(1);
  await action(sessions[0], { type: 'addBot' });
  const changed = await action(sessions[0], { type: 'settings', settings: { startingCash: 2000 } });
  assert.ok(changed.room.players.every((player) => player.ready));
  const started = await action(sessions[0], { type: 'start' });
  assert.equal(started.room.game!.players.filter((player) => player.bot).length, 1);
  await assert.rejects(action(sessions[0], { type: 'addBot' }), status(409));
  await action(sessions[0], { type: 'surrender' });
  const rematch = await action(sessions[0], { type: 'rematch' });
  assert.equal(rematch.room.game, null);
  assert.equal(rematch.room.players.length, 2);
  assert.ok(rematch.room.players.every((player) => player.ready));
  await action(sessions[0], { type: 'start' });
  assert.equal((await read()).game!.players.length, 2);
});

test('bot ticks require authentication, ignore injected moves, and leave idle rooms unchanged', async () => {
  const { action, sessions, room, service, read } = await fixture(1);
  const original = await read();
  assert.equal((await action(sessions[0], { type: 'botTick' }, 0)).room.revision, original.revision);
  await assert.rejects(service.action({ code: room.code, requestId: id(), revision: 0, action: { type: 'botTick' } }, undefined), status(401));
  await action(sessions[0], { type: 'addBot' });
  const started = (await action(sessions[0], { type: 'start' })).room;
  const unchanged = await action(sessions[0], { type: 'botTick', playerId: sessions[0].playerId, action: { type: 'roll' } } as unknown as RoomAction, 0);
  assert.equal(unchanged.room.revision, started.revision);
  assert.deepEqual(unchanged.room.game, started.game);
});

test('concurrent bot ticks apply one server-selected move and throttle duplicate browsers', async () => {
  const { action, sessions, room, read, store, start } = await fixture(2);
  await action(sessions[0], { type: 'addBot' });
  await start();
  const stored = (await store.get(room.code))!;
  stored.game!.turnIndex = stored.game!.players.findIndex((player) => player.bot);
  assert.ok(await store.compareAndSwap(room.code, stored.revision, stored));
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => action(sessions[i % 2], { type: 'botTick' }, 0)));
  assert.ok(results.every((result) => result.room.revision === stored.revision + 1));
  const after = await read();
  assert.equal(after.game!.log.filter((entry) => entry.kind === 'roll').length, 1);
  assert.equal(after.revision, stored.revision + 1);
  assert.equal((await action(sessions[1], { type: 'botTick' }, 0)).room.revision, after.revision);
  assert.equal('botActedAt' in after, false);
});

test('a successful bot tick is idempotent and advances a complete bot turn', async () => {
  const { action, sessions, room, store } = await fixture(1, { auctions: false });
  await action(sessions[0], { type: 'addBot' });
  await action(sessions[0], { type: 'start' });
  let stored = (await store.get(room.code))!;
  stored.game!.turnIndex = 1;
  // A known purchase state exercises bot buying, then ending its turn, without
  // relying on any particular random dice result.
  stored.game!.players[1].position = 1;
  stored.game!.phase = 'buy';
  stored.game!.extraRoll = false;
  await store.compareAndSwap(room.code, stored.revision, stored);
  const requestId = id();
  const bought = await action(sessions[0], { type: 'botTick' }, 0, requestId);
  assert.equal(bought.room.game!.properties[1].ownerId, stored.game!.players[1].id);
  stored = (await store.get(room.code))!;
  stored.botActedAt = 0;
  await store.compareAndSwap(room.code, stored.revision, stored);
  const retried = await action(sessions[0], { type: 'botTick' }, 0, requestId);
  assert.equal(retried.room.revision, bought.room.revision);
  const ended = await action(sessions[0], { type: 'botTick' }, 0);
  assert.equal(ended.room.game!.turnIndex, 0);
  assert.equal(ended.room.game!.phase, 'roll');
});

test('host transfer skips bots and a new human can reclaim a bot-only lobby', async () => {
  const { action, sessions, room, service } = await fixture(2);
  const added = await action(sessions[0], { type: 'addBot' });
  const botId = added.room.players.find((player) => player.bot)!.id;
  const left = await action(sessions[0], { type: 'leave' });
  assert.equal(left.room.hostId, sessions[1].playerId);
  const empty = await service.action({ code: room.code, revision: 0, requestId: id(), action: { type: 'leave' } }, sessions[1].token);
  assert.equal(empty.room.hostId, '');
  assert.equal(empty.room.players[0].id, botId);
  const joined = await service.join({ code: room.code, requestId: id(), name: 'New host' }, 'new-host');
  assert.equal(joined.room.hostId, joined.session!.playerId);
  assert.equal(joined.room.players.find((player) => player.id === joined.session!.playerId)!.ready, true);
});

test('legacy maps or games without a trade ledger expire with an actionable message', async () => {
  for (const oldGame of [false, true]) {
    const { store, service, sessions, room, start } = await fixture();
    if (oldGame) await start();
    const stored = (await store.get(room.code))!;
    if (oldGame) delete (stored.game as unknown as Record<string, unknown>).trades;
    else stored.settings.mapId = 'grand';
    await store.compareAndSwap(room.code, stored.revision, stored);
    await assert.rejects(service.get(room.code, sessions[0].token), (error: unknown) => status(410)(error) && /Create a new room/.test((error as Error).message));
  }
});

test('changed board layouts reject old matches instead of relabelling already owned sites', async () => {
  for (const mapId of ['india', 'ember', 'neon', 'astral']) {
    const { store, service, sessions, room, start } = await fixture(2, { mapId });
    await start();
    const stored = (await store.get(room.code))!;
    assert.equal(stored.game!.boardVersion, 2);
    delete (stored.game as unknown as Record<string, unknown>).boardVersion;
    await store.compareAndSwap(room.code, stored.revision, stored);
    await assert.rejects(service.get(room.code, sessions[0].token), (error: unknown) => status(410)(error) && /complete multi-site monopolies/.test((error as Error).message));
  }
  const { store, service, sessions, room, start } = await fixture(2, { mapId: 'frost' });
  await start();
  const stored = (await store.get(room.code))!;
  delete (stored.game as unknown as Record<string, unknown>).boardVersion;
  await store.compareAndSwap(room.code, stored.revision, stored);
  assert.ok((await service.get(room.code, sessions[0].token))!.room.game, 'Unchanged boards remain playable');
});

test('map changes clamp implicit limits, validate explicit capacities and preserve valid rule toggles', async () => {
  const { sessions, action, read } = await fixture(2, { mapId: 'dunes', maxPlayers: 10, teamCount: 5 });
  const smaller = await action(sessions[0], { type: 'settings', settings: { mapId: 'neon' } });
  assert.equal(smaller.room.settings.maxPlayers, 8);
  assert.equal(smaller.room.settings.teamCount, 4);
  for (const mapId of ['ember', 'neon']) assert.throws(() => validateSettings({ mapId, maxPlayers: 9 }), /2 and 8/);
  for (const mapId of ['frost', 'dunes', 'astral', 'india']) assert.equal(validateSettings({ mapId, maxPlayers: 10, teamCount: 5 }).maxPlayers, 10);
  assert.throws(() => validateSettings({ mapId: 'frost', maxPlayers: 11 }), /2 and 10/);
  assert.throws(() => validateSettings({ mapId: 'neon', teamCount: 5 }), /2 and 4 teams/);
  assert.throws(() => validateSettings({ auctions: 'yes' }), /on or off/);
  const changed = await action(sessions[0], { type: 'settings', settings: { auctions: false, doubleRent: false, mortgages: false, evenBuild: false, randomOrder: true, vacationCash: true, rentInJail: false } });
  assert.equal(changed.room.settings.randomOrder, true);
  assert.equal(changed.room.settings.auctions, false);
  assert.equal(changed.room.settings.vacationCash, true);
  assert.equal((await read()).players[1].ready, false);
});

test('join retries are idempotent and names/settings are validated', async () => {
  const { service, room } = await fixture(1);
  const input = { code: room.code, name: '  My   Friend  ', requestId: id() };
  const [a, b] = await Promise.all([service.join(input, 'one'), service.join(input, 'two')]);
  assert.deepEqual(a.session, b.session);
  assert.equal(b.room.players.length, 2);
  assert.equal(b.room.players[1].name, 'My Friend');
  await assert.rejects(service.join({ ...input, name: 'Changed' }, 'one'), status(409));
  await assert.rejects(service.join({ ...input, name: 'my friend', requestId: id() }, 'one'), /already uses that name/);
  for (const settings of [{ maxPlayers: 9 }, { mapId: 'unknown' }, { startingCash: Infinity }, { teams: 'yes' }, { admin: true }]) assert.throws(() => validateSettings(settings));
  await assert.rejects(service.create({ name: 'bad\u0000name', requestId: id() }, 'one'), /Use a name/);
  await assert.rejects(service.create({ name: 'Good', requestId: 'short' }, 'one'), /request ID/);
});

test('only host can change settings, start, remove players or request a rematch', async () => {
  const { sessions, action, read } = await fixture();
  const revision = (await read()).revision;
  for (const command of [{ type: 'settings', settings: { maxPlayers: 4 } }, { type: 'start' }, { type: 'kick', playerId: sessions[0].playerId }, { type: 'rematch' }] as RoomAction[]) await assert.rejects(action(sessions[1], command), status(403));
  assert.equal((await read()).revision, revision);
});

test('everyone must be ready and host setting changes reset guest readiness', async () => {
  const { sessions, action, read, start } = await fixture();
  await assert.rejects(action(sessions[0], { type: 'start' }), /everyone to be ready/);
  await action(sessions[1], { type: 'ready', ready: true });
  await action(sessions[0], { type: 'settings', settings: { mapId: 'ember', maxPlayers: 4 } });
  assert.equal((await read()).players[1].ready, false);
  const started = await start();
  assert.equal(started.game!.players.length, 2);
  await assert.rejects(action(sessions[0], { type: 'settings', settings: { maxPlayers: 6 } }), status(409));
  await assert.rejects(action(sessions[1], { type: 'ready', ready: false }), status(409));
});

test('team selection is validated and at least two teams are required', async () => {
  const { sessions, action, read } = await fixture(2, { teams: true, teamCount: 2 });
  await assert.rejects(action(sessions[1], { type: 'team', team: 2 }), /available team/);
  await action(sessions[1], { type: 'team', team: 0 });
  await action(sessions[1], { type: 'ready', ready: true });
  await assert.rejects(action(sessions[0], { type: 'start' }), /at least two different teams/);
  assert.equal((await read()).game, null);
  await action(sessions[1], { type: 'team', team: 1 });
  assert.equal((await read()).players[1].ready, false);
  await action(sessions[1], { type: 'ready', ready: true });
  assert.equal((await action(sessions[0], { type: 'start' })).room.game!.settings.teams, true);
});

test('replaying a successful move does not roll twice and changed request payload is rejected', async () => {
  const { sessions, action, start, read } = await fixture();
  const started = await start();
  const requestId = id();
  const first = await action(sessions[0], { type: 'roll' }, started.revision, requestId);
  const retry = await action(sessions[0], { type: 'roll' }, started.revision, requestId);
  assert.deepEqual(first, retry);
  assert.equal(retry.room.game!.log.filter((entry) => entry.kind === 'roll').length, 1);
  await assert.rejects(action(sessions[0], { type: 'endTurn' }, started.revision, requestId), status(409));
  assert.equal((await read()).revision, started.revision + 1);
});

test('competing rolls from the same revision apply exactly once', async () => {
  const { sessions, action, start, read } = await fixture();
  const started = await start();
  const results = await Promise.allSettled([action(sessions[0], { type: 'roll' }, started.revision), action(sessions[0], { type: 'roll' }, started.revision)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')!;
  assert.ok(status(409)(rejected.reason));
  assert.equal((await read()).game!.log.filter((entry) => entry.kind === 'roll').length, 1);
});

test('stale settings and auction decisions fail; out-of-turn rolls do not change state', async () => {
  const { sessions, action, room, start, read } = await fixture();
  await action(sessions[0], { type: 'chat', text: 'Hello' });
  await assert.rejects(action(sessions[0], { type: 'settings', settings: { maxPlayers: 4 } }, room.revision), status(409));
  const started = await start();
  await assert.rejects(action(sessions[1], { type: 'roll' }), /Wait for your turn/);
  await assert.rejects(action(sessions[1], { type: 'bid', amount: 1 }, started.revision - 1), status(409));
  await assert.rejects(action(sessions[1], { type: 'passAuction' }, started.revision - 1), status(409));
  assert.equal((await read()).revision, started.revision);
});

test('kicking revokes authentication and a replayed join cannot restore the removed seat', async () => {
  const { service, sessions, room, action, read } = await fixture(1);
  const joinInput = { code: room.code, name: 'Guest', requestId: id() };
  const guest = (await service.join(joinInput, 'guest')).session!;
  await action(sessions[0], { type: 'kick', playerId: guest.playerId });
  await assert.rejects(service.get(room.code, guest.token), status(403));
  await assert.rejects(service.join(joinInput, 'guest'), status(403));
  assert.equal((await read()).players.length, 1);
  const rejoined = await service.join({ ...joinInput, requestId: id() }, 'guest');
  assert.notEqual(rejoined.session!.token, guest.token);
  assert.equal(rejoined.room.players.length, 2);
});

test('host leaving a lobby transfers host authority; the last departure leaves a reusable room', async () => {
  const { service, sessions, room, action } = await fixture();
  const left = await action(sessions[0], { type: 'leave' });
  assert.equal(left.room.hostId, sessions[1].playerId);
  assert.equal(left.room.players.length, 1);
  assert.equal(left.room.players[0].ready, true);
  await assert.rejects(service.get(room.code, sessions[0].token), status(403));
  const empty = await service.action({ code: room.code, requestId: id(), revision: left.room.revision, action: { type: 'leave' } }, sessions[1].token);
  assert.equal(empty.room.hostId, '');
  assert.equal(empty.room.players.length, 0);
  const newcomer = await service.join({ code: room.code, requestId: id(), name: 'New host' }, 'new');
  assert.equal(newcomer.room.hostId, newcomer.session!.playerId);
});

test('leaving an active match surrenders and rematch only retains authenticated players', async () => {
  const { service, sessions, room, action, start } = await fixture();
  await start();
  await assert.rejects(action(sessions[0], { type: 'rematch' }), status(409));
  await assert.rejects(service.join({ code: room.code, requestId: id(), name: 'Late guest' }, 'late'), status(409));
  const left = await action(sessions[1], { type: 'leave' });
  assert.equal(left.room.game!.phase, 'finished');
  assert.equal(left.room.game!.players[1].bankrupt, true);
  assert.deepEqual(left.room.game!.winnerIds, [sessions[0].playerId]);
  const rematch = await action(sessions[0], { type: 'rematch' });
  assert.equal(rematch.room.game, null);
  assert.deepEqual(rematch.room.players.map((player) => player.id), [sessions[0].playerId]);
});

test('chat is authenticated, bounded, and safe to retry independently of revision', async () => {
  const { sessions, action, read } = await fixture();
  await assert.rejects(action(sessions[1], { type: 'chat', text: 'x'.repeat(241) }), /240/);
  await assert.rejects(action(sessions[1], { type: 'chat', text: 'bad\u0000text' }), /240/);
  const requestId = id();
  await action(sessions[1], { type: 'chat', text: ' hello ' }, 0, requestId);
  await action(sessions[1], { type: 'chat', text: ' hello ' }, 0, requestId);
  assert.equal((await read()).chat.length, 1);
  assert.equal((await read()).chat[0].text, 'hello');
  for (let i = 0; i < 65; i++) await action(sessions[1], { type: 'chat', text: String(i) }, 0);
  assert.equal((await read()).chat.length, 60);
});

test('team chat is filtered by authenticated membership on reads, mutations and retries', async () => {
  const { sessions, action, service, room, store } = await fixture(4, { teams: true, teamCount: 2 });
  const privateText = 'Our private team strategy';
  const sent = await action(sessions[0], { type: 'chat', channel: 'team', text: privateText });
  assert.equal(sent.room.chat[0].team, 0);
  assert.equal(sent.room.chat[0].channel, 'team');
  const ally = (await service.get(room.code, sessions[2].token))!.room;
  assert.ok(ally.chat.some((message) => message.text === privateText));
  const rival = (await service.get(room.code, sessions[1].token))!.room;
  assert.equal(rival.chat.some((message) => message.text === privateText), false);
  assert.equal(publicRoom((await store.get(room.code))!).chat.length, 0);
  const requestId = id();
  const move = { type: 'chat', channel: 'general', text: 'Everyone can read this' } as const;
  for (let retry = 0; retry < 2; retry++) {
    const result = await action(sessions[1], move, 0, requestId);
    assert.equal(JSON.stringify(result).includes(privateText), false);
    assert.equal(result.room.chat.length, 1);
  }
  const general = (await service.get(room.code, sessions[2].token))!.room;
  assert.equal(general.chat.length, 2);
  assert.equal(general.chat.find((message) => message.channel === 'general')!.team, null);
  // An old revision must fetch a fresh projection; an up-to-date revision may
  // be reused only after authentication for this viewer has succeeded.
  assert.notEqual(await service.get(room.code, sessions[1].token, String(sent.room.revision)), null);
  assert.equal(await service.get(room.code, sessions[1].token, String(general.revision)), null);
  await assert.rejects(service.get(room.code, undefined, String(general.revision)), status(401));
});

test('team chat preserves its sending team, rejects spoofed channels and is hidden when teams are off', async () => {
  const { sessions, action, read, service, room } = await fixture(3, { teams: true });
  await action(sessions[0], { type: 'chat', channel: 'team', text: 'Team zero before switch' });
  const moved = await action(sessions[0], { type: 'team', team: 1 });
  assert.equal(moved.room.chat.length, 0);
  assert.equal((await service.get(room.code, sessions[2].token))!.room.chat.length, 1);
  await action(sessions[0], { type: 'chat', channel: 'team', text: 'Team one after switch' });
  assert.equal((await service.get(room.code, sessions[1].token))!.room.chat[0].text, 'Team one after switch');
  assert.equal((await service.get(room.code, sessions[2].token))!.room.chat[0].text, 'Team zero before switch');
  await assert.rejects(action(sessions[0], { type: 'chat', channel: 'secret', text: 'Bad channel' } as unknown as RoomAction), /general or team/);
  const disabled = await action(sessions[0], { type: 'settings', settings: { teams: false } });
  assert.equal(disabled.room.chat.length, 0);
  assert.equal((await read()).chat.length, 0);
  await assert.rejects(action(sessions[1], { type: 'chat', channel: 'team', text: 'Cannot send' }), /Turn on teams/);
  await action(sessions[1], { type: 'chat', text: 'Default is general' });
  assert.equal((await read()).chat[0].channel, 'general');
});

test('join and creation receipts never expose another team conversation', async () => {
  const store = new MemoryRoomStore();
  const service = new RoomService(store);
  const input = { name: 'Host', requestId: id(), settings: { teams: true } };
  const host = await service.create(input, 'receipts');
  const guestInput = { code: host.room.code, name: 'Guest', requestId: id() };
  const guest = await service.join(guestInput, 'receipts');
  const secret = 'Only the opposing team should see this';
  const sent = await service.action({ code: host.room.code, requestId: id(), revision: 0, action: { type: 'chat', channel: 'team', text: secret, team: 0 } }, guest.session!.token);
  assert.equal(sent.room.chat[0].team, 1, 'The server must capture the actor team, ignoring an injected team field.');
  assert.equal(JSON.stringify(await service.create(input, 'receipts')).includes(secret), false);
  assert.equal((await service.join(guestInput, 'receipts')).room.chat[0].text, secret);
  const next = await service.join({ ...guestInput, name: 'Ally', requestId: id() }, 'receipts');
  assert.equal(JSON.stringify(next).includes(secret), false);
});

test('entry and action rate limits constrain repeated requests', async () => {
  const { service, sessions, action } = await fixture(1);
  for (let i = 0; i < 60; i++) await assert.rejects(service.join({ code: 'ABCDEFGH', name: 'Guest', requestId: id() }, 'limited'), status(404));
  await assert.rejects(service.join({ code: 'ABCDEFGH', name: 'Guest', requestId: id() }, 'limited'), status(429));
  for (let i = 0; i < 120; i++) await action(sessions[0], { type: 'ready', ready: true }, 0);
  await assert.rejects(action(sessions[0], { type: 'ready', ready: true }, 0), status(429));
});

test('HTTP supports create/read/304 with private cache headers and auth failures', async () => {
  const store = new MemoryRoomStore();
  const created = await http(store, { body: { op: 'create', name: 'Host', requestId: id() }, headers: { origin: 'https://game.test' } });
  assert.equal(created.status, 200);
  const result = created.data as ApiResult;
  assert.equal(created.headers['cache-control'], 'no-store, private');
  assert.equal(created.headers['x-content-type-options'], 'nosniff');
  const url = `/api/room?code=${result.room.code}&revision=${result.room.revision}`;
  assert.equal((await http(store, { method: 'GET', url })).status, 401);
  const unchanged = await http(store, { method: 'GET', url, headers: { authorization: `Bearer ${result.session!.token}` } });
  assert.equal(unchanged.status, 304);
  assert.equal(unchanged.output, '');
  const unsupported = await http(store, { method: 'DELETE' });
  assert.equal(unsupported.status, 405);
  assert.equal(unsupported.headers.allow, 'GET, POST');
});

test('HTTP rejects cross-site writes and mismatched or malformed origins', async () => {
  const store = new MemoryRoomStore();
  const body = { op: 'create', name: 'Host', requestId: id() };
  const rejectedOrigins: Record<string, string>[] = [{ origin: 'https://evil.test' }, { origin: 'null' }, { origin: 'file://game.test' }, { origin: 'https://game.test', 'sec-fetch-site': 'cross-site' }];
  for (const headers of rejectedOrigins) assert.equal((await http(store, { body, headers })).status, 403);
  assert.equal((await http(store, { body, headers: { origin: 'http://game.test' } })).status, 200);
});

test('HTTP enforces JSON shape and 16 KiB limits for pre-parsed and streamed bodies', async () => {
  const store = new MemoryRoomStore();
  const body = { op: 'create', name: 'Host', requestId: id() };
  assert.equal((await http(store, { body, headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await http(store, { body, headers: { 'content-length': '20000' } })).status, 413);
  assert.equal((await http(store, { body: { ...body, padding: 'x'.repeat(16384) } })).status, 413);
  assert.equal((await http(store, { raw: JSON.stringify({ ...body, padding: 'x'.repeat(16384) }) })).status, 413);
  assert.equal((await http(store, { raw: '{broken' })).status, 400);
  assert.equal((await http(store, { body: [] })).status, 400);
  assert.equal((await http(store, { body: 'null' })).status, 400);
  assert.equal((await http(store, { raw: JSON.stringify(body) })).status, 200);
  assert.equal((await http(store, { body: Buffer.from(JSON.stringify(body)) })).status, 200);
});

test('file storage shares atomic room updates across independent service instances', async () => {
  const prefix = resolve(tmpdir(), 'common-ground-server-test-');
  const directory = await mkdtemp(prefix);
  try {
    const a = new RoomService(new FileRoomStore(directory));
    const b = new RoomService(new FileRoomStore(directory));
    const host = await a.create({ requestId: id(), name: 'Host' }, 'file-host');
    const results = await Promise.all(Array.from({ length: 7 }, (_, index) => (index % 2 ? a : b).join({ code: host.room.code, name: `File guest ${index}`, requestId: id() }, `file-${index}`)));
    assert.equal(results.length, 7);
    const full = (await b.get(host.room.code, host.session!.token))!.room;
    assert.equal(full.players.length, 8);
    assert.equal(full.revision, 8);
    assert.equal(new Set(full.players.map((player) => player.id)).size, 8);
  } finally {
    const target = resolve(directory);
    assert.ok(target.startsWith(prefix) && target.startsWith(resolve(tmpdir()) + sep));
    await rm(target, { recursive: true, force: true });
  }
});

test('production refuses an in-memory or file fallback when Redis is unconfigured', () => {
  const keys = ['NODE_ENV', 'VERCEL', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN'] as const;
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    process.env.NODE_ENV = 'production';
    assert.throws(getConfiguredStore, /Online rooms need a database/);
    delete process.env.NODE_ENV;
    process.env.VERCEL = '1';
    assert.throws(getConfiguredStore, /Online rooms need a database/);
    delete process.env.VERCEL;
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.test';
    assert.throws(getConfiguredStore, /Both UPSTASH/);
  } finally {
    for (const key of keys) if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key];
  }
});


test('kick votes require every other human, can be withdrawn, and repeated votes count once', async () => {
  const { action, sessions, start, read } = await fixture(4);
  await start();
  const target = sessions[3].playerId;
  const command: RoomAction = { type: 'voteKick', playerId: target, vote: true };
  const first = await action(sessions[0], command, 0);
  assert.deepEqual(first.room.kickEligibleVoterIds, sessions.map((item) => item.playerId));
  assert.deepEqual(first.room.kickVotes?.[target], [sessions[0].playerId]);
  const requestId = id();
  const repeated = await Promise.all([action(sessions[0], command, 0, requestId), action(sessions[0], command, 0, requestId)]);
  assert.ok(repeated.every((item) => item.room.kickVotes?.[target].length === 1));
  await action(sessions[1], command, 0);
  assert.equal((await read()).players.length, 4);
  await action(sessions[0], { ...command, vote: false }, 0);
  assert.deepEqual((await read()).kickVotes?.[target], [sessions[1].playerId]);
  await action(sessions[2], command, 0);
  assert.equal((await read()).players.length, 4, 'Two out of three votes cannot remove the player');
  const removed = (await action(sessions[0], command, 0)).room;
  assert.equal(removed.players.length, 3);
  assert.equal(removed.game!.players.find((item) => item.id === target)!.bankrupt, true);
  assert.deepEqual(removed.kickVotes, {});
  assert.match(removed.game!.log.at(-1)!.text, /unanimous vote.*3 human/);
});

test('concurrent final votes remove once and revoke the target session including join retries', async () => {
  const { service, sessions, room, action, start, store } = await fixture(3);
  const joinInput = { code: room.code, name: 'Voted guest', requestId: id() };
  const guest = (await service.join(joinInput, 'guest')).session!;
  await action(guest, { type: 'ready', ready: true });
  await start();
  const command: RoomAction = { type: 'voteKick', playerId: guest.playerId, vote: true };
  const requestIds = sessions.map(() => id());
  const results = await Promise.all(sessions.map((session, index) => action(session, command, 0, requestIds[index])));
  const stored = (await store.get(room.code))!;
  assert.equal(stored.players.length, 3);
  assert.equal(stored.game!.log.filter((entry) => entry.text.includes('removed by unanimous')).length, 1);
  assert.equal(guest.playerId in stored.auth, false);
  assert.equal(guest.playerId in stored.requests, false);
  await assert.rejects(service.get(room.code, guest.token), status(403));
  await assert.rejects(service.action({ code: room.code, requestId: id(), revision: stored.revision, action: { type: 'chat', text: 'I am back' } }, guest.token), status(403));
  await assert.rejects(service.join(joinInput, 'guest'), status(403));
  await assert.rejects(service.join({ ...joinInput, requestId: id() }, 'guest'), status(409));
  const retry = await action(sessions[2], command, 0, requestIds[2]);
  assert.equal(retry.room.revision, Math.max(...results.map((item) => item.room.revision)));
});

test('team kick requires votes across both teams and passes assets to the active teammate', async () => {
  const { sessions, action, start, store, room, read } = await fixture(4, { teams: true });
  await start();
  const target = sessions[3].playerId;
  const stored = (await store.get(room.code))!;
  stored.game!.properties[1].ownerId = target;
  assert.equal(await store.compareAndSwap(room.code, stored.revision, stored), true);
  const vote: RoomAction = { type: 'voteKick', playerId: target, vote: true };
  await action(sessions[0], vote, 0);
  await action(sessions[2], vote, 0);
  assert.equal((await read()).players.length, 4, 'Opponents cannot remove someone without their teammate agreeing');
  const removed = (await action(sessions[1], vote, 0)).room;
  assert.equal(removed.game!.properties[1].ownerId, sessions[1].playerId);
  assert.equal(removed.game!.players.find((item) => item.id === sessions[1].playerId)!.cash, 3000);
  assert.equal(removed.game!.phase, 'roll');
});

test('removing the host during their turn passes authority to an authenticated human, not a bot', async () => {
  const { sessions, action, start, store, room, service } = await fixture(3);
  await action(sessions[0], { type: 'addBot' });
  const stored = (await store.get(room.code))!;
  const bot = stored.players.pop()!;
  stored.players.splice(1, 0, bot);
  assert.equal(await store.compareAndSwap(room.code, stored.revision, stored), true);
  await start();
  await assert.rejects(action(sessions[0], { type: 'kick', playerId: sessions[1].playerId }), status(409));
  const command: RoomAction = { type: 'voteKick', playerId: sessions[0].playerId, vote: true };
  await action(sessions[1], command, 0);
  const removed = (await action(sessions[2], command, 0)).room;
  assert.equal(removed.hostId, sessions[1].playerId);
  assert.equal(removed.game!.phase, 'roll');
  assert.equal(removed.game!.players[removed.game!.turnIndex].id, bot.id);
  assert.deepEqual(removed.kickEligibleVoterIds, sessions.slice(1).map((item) => item.playerId));
  await assert.rejects(service.get(room.code, sessions[0].token), status(403));
});

test('votes reject self, unknown players, bots, unauthenticated requests and forged voter identities', async () => {
  const { sessions, action, service, room, store, read } = await fixture(4);
  const added = (await action(sessions[0], { type: 'addBot' })).room;
  const bot = added.players.find((item) => item.bot)!;
  for (const target of [sessions[0].playerId, bot.id, 'missing']) {
    await assert.rejects(action(sessions[0], { type: 'voteKick', playerId: target, vote: true }, 0), /another human/);
  }
  await assert.rejects(action(sessions[0], { type: 'voteKick', playerId: sessions[3].playerId, vote: 'yes' } as unknown as RoomAction, 0), /whether to vote/);
  await assert.rejects(service.action({ code: room.code, revision: 0, requestId: id(), action: { type: 'voteKick', playerId: sessions[3].playerId, vote: true } }, 'x'.repeat(43)), status(403));
  const forged = { type: 'voteKick', playerId: sessions[3].playerId, vote: true, voterId: sessions[1].playerId, votes: sessions.map((item) => item.playerId) } as unknown as RoomAction;
  await action(sessions[0], forged, 0);
  assert.deepEqual((await read()).kickVotes?.[sessions[3].playerId], [sessions[0].playerId]);
  const stored = (await store.get(room.code))!;
  stored.players[0].bot = true;
  assert.equal(await store.compareAndSwap(room.code, stored.revision, stored), true);
  await assert.rejects(action(sessions[0], { type: 'voteKick', playerId: sessions[3].playerId, vote: true }, 0), status(403));
});

test('joining or changing the roster resets votes and a departure never triggers a removal', async () => {
  const { sessions, action, service, room, read } = await fixture(4);
  const vote: RoomAction = { type: 'voteKick', playerId: sessions[3].playerId, vote: true };
  await action(sessions[0], vote, 0);
  await action(sessions[1], vote, 0);
  await action(sessions[2], { type: 'leave' }, 0);
  assert.equal((await read()).players.length, 3);
  assert.ok((await read()).players.some((item) => item.id === sessions[3].playerId));
  assert.deepEqual((await read()).kickVotes, {});
  await action(sessions[0], vote, 0);
  await service.join({ code: room.code, name: 'Another friend', requestId: id() }, 'another');
  assert.deepEqual((await read()).kickVotes, {});
  await action(sessions[0], vote, 0);
  await action(sessions[0], { type: 'addBot' });
  assert.deepEqual((await read()).kickVotes, {});
});

test('removing a debtor clears their debt and removing a standing bidder reopens the auction', async () => {
  for (const phase of ['debt', 'auction'] as const) {
    const { sessions, action, start, store, room } = await fixture(4);
    await start();
    const target = phase === 'debt' ? sessions[0].playerId : sessions[3].playerId;
    const stored = (await store.get(room.code))!;
    stored.game!.phase = phase;
    if (phase === 'debt') {
      stored.game!.players[0].cash = 10;
      stored.game!.debt = { playerId: target, creditorId: sessions[1].playerId, amount: 500, reason: 'rent', afterPhase: 'end' };
      stored.game!.properties[1].ownerId = target;
    } else {
      stored.game!.auction = { tileId: 1, highestBid: 200, highestBidderId: target, passedIds: [sessions[1].playerId] };
    }
    assert.equal(await store.compareAndSwap(room.code, stored.revision, stored), true);
    let result: ApiResult | undefined;
    for (const session of sessions.filter((item) => item.playerId !== target)) {
      result = await action(session, { type: 'voteKick', playerId: target, vote: true }, 0);
    }
    const game = result!.room.game!;
    assert.equal(game.players.find((item) => item.id === target)!.bankrupt, true);
    if (phase === 'debt') {
      assert.equal(game.debt, null);
      assert.equal(game.phase, 'roll');
      assert.equal(game.players[game.turnIndex].id, sessions[1].playerId);
      assert.equal(game.properties[1].ownerId, sessions[1].playerId);
    } else {
      assert.equal(game.phase, 'auction');
      assert.equal(game.auction!.highestBidderId, null);
      assert.equal(game.auction!.highestBid, 0);
      assert.deepEqual(game.auction!.passedIds, [target]);
    }
  }
});

test('new joins stay closed during and after a match while the original session can reconnect', async () => {
  const { service, sessions, room, action } = await fixture(1);
  const input = { code: room.code, name: 'Original guest', requestId: id() };
  const guest = (await service.join(input, 'original')).session!;
  await action(guest, { type: 'ready', ready: true });
  await action(sessions[0], { type: 'start' });
  for (const phase of ['running', 'finished']) {
    if (phase === 'finished') await action(guest, { type: 'surrender' });
    await assert.rejects(service.join({ code: room.code, name: 'Late guest', requestId: id() }, 'late'), status(409));
    assert.deepEqual((await service.join(input, 'original')).session, guest);
    assert.ok((await service.get(room.code, guest.token))!.room.game);
  }
});

test('older rooms without votes expose empty votes and finished-room removal does not rewrite the result', async () => {
  const { sessions, action, start, read } = await fixture(2);
  assert.deepEqual((await read()).kickVotes, {});
  await start();
  const finished = (await action(sessions[1], { type: 'surrender' })).room;
  const removed = (await action(sessions[0], { type: 'voteKick', playerId: sessions[1].playerId, vote: true }, 0)).room;
  assert.deepEqual(removed.game!.winnerIds, finished.game!.winnerIds);
  assert.equal(removed.game!.phase, 'finished');
  assert.equal(removed.players.length, 1);
  assert.deepEqual(removed.kickVotes, {});
  const rematch = (await action(sessions[0], { type: 'rematch' })).room;
  assert.deepEqual(rematch.kickVotes, {});
});
