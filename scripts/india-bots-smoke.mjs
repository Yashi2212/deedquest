// Runs the real HTTP API with one human seat and exactly two bots on India.
// Start `pnpm dev`, then: node --import tsx scripts/india-bots-smoke.mjs
// This creates its own disposable room and never prints session credentials.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { chooseBotAction } from '../server/bots.ts';
import { getMap } from '../src/game/maps.ts';

const base = process.argv[2] || 'http://127.0.0.1:5173';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) throw new Error('This smoke test only targets localhost.');
let session;
async function request(url, options) {
  for (let attempt = 0; ; attempt++) {
    try { return await fetch(url, options); }
    catch (error) {
      if (attempt >= 3) throw error;
      await wait(500 * (attempt + 1));
    }
  }
}
async function call(body) {
  const response = await request(`${base}/api/room`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
    body: JSON.stringify({ ...body, requestId: randomUUID() }),
  });
  const data = await response.json();
  assert.equal(response.status, 200, data.error || 'Unexpected HTTP response');
  return data;
}
async function read() {
  const response = await request(`${base}/api/room?code=${session.code}`, { headers: { Authorization: `Bearer ${session.token}` } });
  assert.equal(response.status, 200);
  return (await response.json()).room;
}
function validate(room) {
  const game = room.game;
  assert.equal(game.mapId, 'india');
  assert.equal(game.players.length, 3);
  assert.equal(game.players.filter(player => player.bot).length, 2);
  assert.ok(game.players.every(player => Number.isSafeInteger(player.cash) && player.cash >= 0));
  assert.ok(game.players.every(player => Number.isInteger(player.position) && player.position >= 0 && player.position < getMap('india').tiles.length));
  assert.ok(Object.values(game.properties).every(property => !property.ownerId || game.players.some(player => player.id === property.ownerId && !player.bankrupt)));
  assert.equal(Boolean(game.debt), game.phase === 'debt');
  assert.equal(Boolean(game.auction), game.phase === 'auction');
}

const startedAt = Date.now();
let room;
let humanActions = 0;
let appliedBotTicks = 0;
try {
  const created = await call({ op: 'create', name: 'India test host', settings: { mapId: 'india', maxPlayers: 3, teams: false, randomOrder: false, auctions: true } });
  session = created.session;
  room = created.room;
  const action = async value => {
    room = (await call({ op: 'action', code: session.code, revision: room.revision, action: value })).room;
  };
  await action({ type: 'addBot' });
  await action({ type: 'addBot' });
  assert.equal(room.players.filter(player => player.bot && player.ready).length, 2);
  await action({ type: 'start' });
  validate(room);
  const botIds = room.game.players.filter(player => player.bot).map(player => player.id);
  while (room.game.round < 3 && room.game.phase !== 'finished') {
    assert.ok(Date.now() - startedAt < 180000, 'India game stalled before two full rounds completed');
    const game = room.game;
    const humanView = structuredClone(game);
    // Only the test driver uses this decision helper for the human seat. The
    // real server roster remains one human and two bots throughout the test.
    humanView.players.forEach(player => { player.bot = player.id === session.playerId; });
    const humanMove = chooseBotAction(humanView);
    if (humanMove) {
      await action(humanMove.action);
      humanActions++;
    } else {
      const previousRevision = room.revision;
      await action({ type: 'botTick' });
      if (room.revision > previousRevision) appliedBotTicks++;
      await wait(1250); // Exercise the real server throttle; do not bypass it.
    }
    validate(room);
  }
  assert.ok(room.game.round >= 3, 'Expected two completed rounds');
  const botResults = botIds.map(id => {
    const bot = room.game.players.find(player => player.id === id);
    const rolls = room.game.log.filter(entry => entry.kind === 'roll' && entry.text.includes(bot.name)).length;
    assert.ok(rolls >= 2, `${bot.name} should roll in both rounds`);
    return { name: bot.name, rolls, cash: bot.cash, properties: Object.values(room.game.properties).filter(property => property.ownerId === id).length };
  });
  const refreshed = await read();
  assert.deepEqual(refreshed.game, room.game, 'Reloading must preserve the game state');
  assert.equal(refreshed.revision, room.revision);
  assert.ok(room.game.log.length > 6);
  console.log(JSON.stringify({ result: 'PASS', map: 'Incredible India', humanSeats: 1, bots: botResults, completedRounds: room.game.round - 1, humanActions, appliedBotTicks, ownedProperties: Object.values(room.game.properties).filter(property => property.ownerId).length, logEntries: room.game.log.length, elapsedSeconds: Math.round((Date.now() - startedAt) / 1000), checks: ['bot readiness', 'legal turn progression', 'real bot throttle', 'cash and position bounds', 'property ownership', 'debt/auction consistency', 'refresh persistence'] }, null, 2));
} finally {
  if (session) {
    const latest = await read();
    await call({ op: 'action', code: session.code, revision: latest.revision, action: { type: 'leave' } });
  }
}
