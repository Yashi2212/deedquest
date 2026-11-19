// Exercises the actual Vite middleware / Vercel-compatible API with ten clients.
// Run only against a disposable local development instance.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base = process.argv[2] || 'http://127.0.0.1:5173';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) throw new Error('This smoke test only targets localhost.');
async function call(body, session, expected = 200) {
  const result = await fetch(`${base}/api/room`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.token}` } : {}) }, body: JSON.stringify({ ...body, requestId: body.requestId || randomUUID() }) });
  const data = await result.json();
  assert.equal(result.status, expected, data.error || 'Unexpected status');
  return data;
}
async function read(session) {
  const result = await fetch(`${base}/api/room?code=${session.code}`, { headers: { Authorization: `Bearer ${session.token}` } });
  assert.equal(result.status,200); return (await result.json()).room;
}
const created = await call({ op: 'create', name: 'Smoke host', settings: { mapId: 'india', teams: true, maxPlayers: 10 } });
const host = created.session;
const guests = await Promise.all(Array.from({length:9}, (_,i) => call({ op: 'join', code: host.code, name: `Smoke friend ${i+1}` })));
assert.equal((await read(host)).players.length,10);
await call({ op:'join', code:host.code, name:'Eleventh friend' }, undefined,409);
await call({op:'action',code:host.code,revision:0,action:{type:'chat',channel:'team',text:'Private host-team strategy'}},host);
const privateRoom = await read(host);
const rivalId = privateRoom.players.find(player => player.team !== privateRoom.players.find(player => player.id === host.playerId).team).id;
const allyId = privateRoom.players.find(player => player.id !== host.playerId && player.team === privateRoom.players.find(player => player.id === host.playerId).team).id;
const rival = guests.find(guest => guest.session.playerId === rivalId).session;
const ally = guests.find(guest => guest.session.playerId === allyId).session;
assert.equal((await read(rival)).chat.some(message => message.text === 'Private host-team strategy'),false);
assert.equal((await read(ally)).chat.some(message => message.text === 'Private host-team strategy'),true);
await call({op:'action',code:host.code,revision:0,action:{type:'chat',channel:'general',text:'Hello everyone'}},host);
assert.equal((await read(rival)).chat.some(message => message.text === 'Hello everyone'),true);
await Promise.all(guests.map(({session}) => call({ op:'action', code:host.code, revision:0, action:{type:'ready',ready:true} }, session)));
let room = await read(host);
const started = await call({op:'action',code:host.code,revision:room.revision,action:{type:'start'}},host);
assert.equal(started.room.game.players.length,10);
assert.equal(started.room.game.mapId,'india');
const requestId = randomUUID();
const rollBody = {op:'action',code:host.code,revision:started.room.revision,action:{type:'roll'},requestId};
const roll = await call(rollBody,host);
const retry = await call(rollBody,host);
assert.equal(retry.room.revision,roll.room.revision,'A retried roll must not apply twice.');
const seen = await read(guests[0].session);
assert.deepEqual(seen.game.dice,roll.room.game.dice);
assert.equal('auth' in seen,false);
assert.equal('joinKey' in seen,false);
const unauth = await fetch(`${base}/api/room?code=${host.code}`);
assert.equal(unauth.status,401);
await call({op:'action',code:host.code,revision:seen.revision,action:{type:'roll'}},guests[0].session,400);
room = await read(host);
const cached = await fetch(`${base}/api/room?code=${host.code}&revision=${room.revision}`, {headers:{Authorization:`Bearer ${host.token}`}});
assert.equal(cached.status,304);
// End these test sessions so they do not occupy a live lobby or leave active tabs.
for(const session of guests.map(x=>x.session).concat(host)) {
  const state = await read(session);
  await call({op:'action',code:host.code,revision:state.revision,action:{type:'leave'}},session);
}
console.log('PASS: live HTTP 10-player room, concurrent joins, full-room rejection, private team chat, team ready/start, server dice, idempotent retry, cross-client synchronization, auth isolation, and session cleanup.');

const solo = await call({op:'create',name:'Bot smoke host',settings:{mapId:'ember',maxPlayers:2,randomOrder:false,auctions:false}});
const botHost = solo.session;
const added = await call({op:'action',code:botHost.code,revision:solo.room.revision,action:{type:'addBot'}},botHost);
assert.equal(added.room.players.filter(player => player.bot && player.ready).length,1);
let botRoom = (await call({op:'action',code:botHost.code,revision:added.room.revision,action:{type:'start'}},botHost)).room;
// Let the human finish its turn using the same legal actions as the UI. Doubles
// may require extra rolls; buying/declining never bypasses engine validation.
for(let step=0;step<25 && botRoom.game.players[botRoom.game.turnIndex].id === botHost.playerId && botRoom.game.phase !== 'finished';step++) {
  const game = botRoom.game;
  const type = game.phase === 'roll' ? 'roll' : game.phase === 'buy' ? 'buy' : game.phase === 'end' ? 'endTurn' : 'surrender';
  botRoom = (await call({op:'action',code:botHost.code,revision:botRoom.revision,action:{type}},botHost)).room;
}
assert.equal(botRoom.game.players[botRoom.game.turnIndex].bot,true);
const beforeTick = botRoom.revision;
const ticks = await Promise.all(Array.from({length:5},()=>call({op:'action',code:botHost.code,revision:0,action:{type:'botTick'}},botHost)));
assert.ok(ticks.every(result=>result.room.revision === beforeTick+1));
botRoom = await read(botHost);
assert.equal(botRoom.game.log.filter(entry=>entry.kind === 'roll' && entry.text.includes(added.room.players.find(player=>player.bot).name)).length,1);
await call({op:'action',code:botHost.code,revision:botRoom.revision,action:{type:'leave'}},botHost);
console.log('PASS: live HTTP solo bot game, bot readiness, server-selected bot turn, concurrent tick throttling, and session cleanup.');
