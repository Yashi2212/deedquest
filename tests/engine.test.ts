import test from 'node:test';
import assert from 'node:assert/strict';
import { applyGameAction, canBuild, canSellProperty, createGame, getNetWorth, getRent } from '../src/game/engine.js';
import { MAPS, getMap } from '../src/game/maps.js';
import { DEFAULT_SETTINGS, PLAYER_COLORS, type GameAction, type GameState, type Player, type RoomSettings } from '../src/game/types.js';

const players = (count = 3): Player[] => Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, color: PLAYER_COLORS[i], tokenIndex: i, team: i % 2, ready: true }));
const game = (settings: Partial<RoomSettings> = {}, count = 3) => createGame(players(count), { ...DEFAULT_SETTINGS, ...settings }, 1_000);
const act = (state: GameState, id: string, action: GameAction, values: number[] = [0, 0.2], now = 2_000) => {
  let index = 0;
  return applyGameAction(state, id, action, { rng: () => values[index++ % values.length], now });
};
const propertyIds = (state: GameState, kind = 'property') => getMap(state.mapId).tiles.filter((tile) => tile.kind === kind).map((tile) => tile.id);
const firstGroup = (state: GameState) => {
  const board = getMap(state.mapId).tiles;
  const tile = board.find((item) => item.kind === 'property')!;
  return board.filter((item) => item.group === tile.group).map((item) => item.id);
};

function assertInvariants(state: GameState) {
  const map = getMap(state.mapId);
  assert.ok(state.players.every((item) => Number.isSafeInteger(item.cash) && item.cash >= 0));
  assert.ok(state.players.every((item) => item.position >= 0 && item.position < map.size));
  assert.ok(Object.values(state.properties).every((item) => item.level >= 0 && item.level <= 5));
  assert.ok(Object.values(state.properties).every((item) => !item.ownerId || state.players.some((owner) => owner.id === item.ownerId && !owner.bankrupt)));
  assert.ok(Object.values(state.properties).every((item) => !item.mortgaged || item.level === 0));
  assert.equal(new Set(state.log.map((entry) => entry.id)).size, state.log.length);
  assert.equal(Boolean(state.debt), state.phase === 'debt');
  assert.equal(Boolean(state.auction), state.phase === 'auction');
  if (state.phase !== 'finished') assert.equal(state.players[state.turnIndex].bankrupt, false);
}

test('six adventure maps enforce 8-player small and 10-player big boards and clone inputs', () => {
  assert.equal(MAPS.length, 6);
  assert.equal(MAPS.filter((map) => map.size === 40).length, 2);
  assert.equal(MAPS.filter((map) => map.size === 56).length, 4);
  assert.deepEqual([...new Set(MAPS.map((map) => map.size))].sort(), [40, 56]);
  for (const map of MAPS) {
    const roster = players(map.maxPlayers);
    const settings = { ...DEFAULT_SETTINGS, mapId: map.id, maxPlayers: map.maxPlayers };
    const state = createGame(roster, settings, 1000);
    assert.equal(state.players.length, map.size === 40 ? 8 : 10);
    assert.throws(() => createGame(players(map.maxPlayers + 1), { ...settings, maxPlayers: map.maxPlayers + 1 }), /room limit/);
    assert.equal(state.mapId, map.id);
    assert.equal(Object.keys(state.properties).length, map.tiles.filter((tile) => ['property', 'station', 'utility'].includes(tile.kind)).length);
    assert.equal(map.tiles.length, map.size);
    assert.equal(new Set(map.tiles.map((tile) => tile.id)).size, map.size);
    assert.ok(map.tiles.every((tile, index) => tile.id === index && !!tile.name));
    settings.startingCash = 1;
    roster[0].name = 'Changed outside';
    assert.equal(state.settings.startingCash, 1500);
    assert.equal(state.players[0].name, 'Player 0');
    assertInvariants(state);
  }
});

test('rejects invalid setup, unknown actions, non-turn actions and forged money', () => {
  assert.throws(() => game({ mapId: 'missing' }), /map/);
  assert.throws(() => game({ maxPlayers: 2 }, 8), /2–8/);
  assert.throws(() => game({ startingCash: NaN }), /Starting cash/);
  assert.throws(() => game({ teams: true, teamCount: 1 }), /settings/);
  assert.throws(() => createGame(players(2).map((item) => ({ ...item, team: 0 })), { ...DEFAULT_SETTINGS, teams: true }), /two different teams/);
  const state = game();
  assert.throws(() => act(state, 'p1', { type: 'roll' }), /Wait/);
  assert.throws(() => act(state, 'p0', { type: 'endTurn' }), /current action/);
  assert.throws(() => act(state, 'intruder', { type: 'roll' }), /not found/);
  assert.throws(() => act(state, 'p0', { type: 'mint', amount: 999 } as unknown as GameAction), /Unknown/);
  assert.throws(() => act(state, 'p0', { type: 'offerTrade', toId: 'p1', offeredCash: -10, requestedCash: 0, offeredProperties: [], requestedProperties: [] }), /whole number/);
  assert.equal(state.phase, 'roll');
  assert.equal(state.players[0].cash, 1500);
});

test('roll, buy, and end turn preserve source state and transfer exact purchase price', () => {
  const source = game();
  const before = structuredClone(source);
  const landed = act(source, 'p0', { type: 'roll' }); // 1 + 2 -> Shellhaven
  assert.deepEqual(source, before);
  assert.deepEqual(landed.dice, [1, 2]);
  assert.equal(landed.players[0].position, 3);
  assert.equal(landed.phase, 'buy');
  const bought = act(landed, 'p0', { type: 'buy' });
  assert.equal(bought.properties[3].ownerId, 'p0');
  assert.equal(bought.players[0].cash, 1440);
  assert.equal(landed.properties[3].ownerId, null);
  assert.equal(act(bought, 'p0', { type: 'endTurn' }).turnIndex, 1);
});

test('crossing Start pays exactly $200 on both board lengths', () => {
  for (const mapId of ['ember', 'frost']) {
    const state = game({ mapId });
    state.players[0].position = getMap(mapId).size - 2;
    const moved = act(state, 'p0', { type: 'roll' });
    assert.equal(moved.players[0].position, 1);
    assert.equal(moved.players[0].cash, 1700);
  }
});

test('auctions stay open for opponents, reject unaffordable bids, and charge once', () => {
  let state = act(game(), 'p0', { type: 'roll' });
  state = act(state, 'p0', { type: 'decline' });
  assert.equal(state.phase, 'auction');
  assert.throws(() => act(state, 'p1', { type: 'bid', amount: NaN }), /Bid/);
  assert.throws(() => act(state, 'p1', { type: 'bid', amount: 1501 }), /Bid/);
  state = act(state, 'p1', { type: 'bid', amount: 15 });
  assert.equal(state.phase, 'auction');
  assert.throws(() => act(state, 'p1', { type: 'passAuction' }), /highest bidder/);
  state = act(state, 'p2', { type: 'bid', amount: 17 });
  state = act(state, 'p1', { type: 'passAuction' });
  assert.throws(() => act(state, 'p1', { type: 'bid', amount: 20 }), /already passed/);
  state = act(state, 'p0', { type: 'passAuction' });
  assert.equal(state.phase, 'end');
  assert.equal(state.properties[3].ownerId, 'p2');
  assert.equal(state.players[2].cash, 1483);
  assert.equal(state.players[1].cash, 1500);
  assert.equal(state.auction, null);
});

test('auction with everyone passing returns the property to bank', () => {
  let state = act(act(game(), 'p0', { type: 'roll' }), 'p0', { type: 'decline' });
  for (const person of state.players) state = act(state, person.id, { type: 'passAuction' });
  assert.equal(state.phase, 'end');
  assert.equal(state.properties[3].ownerId, null);
});

test('allied ownership completes sets, enforces even builds, and skips ally rent', () => {
  let state = game({ teams: true }, 4);
  const group = firstGroup(state);
  state.properties[group[0]].ownerId = 'p0';
  state.properties[group[1]].ownerId = 'p2';
  assert.equal(canBuild(state, 'p0', group[0]), true);
  assert.equal(canBuild(state, 'p0', group[1]), true);
  assert.equal(getRent(state, group[0]), getMap(state.mapId).tiles[group[0]].rents![0] * 2);
  state = act(state, 'p0', { type: 'build', tileId: group[0] });
  assert.equal(state.properties[group[0]].level, 1);
  assert.equal(canBuild(state, 'p0', group[0]), false);
  assert.throws(() => act(state, 'p0', { type: 'mortgage', tileId: group[0] }), /all buildings/);
  const cash = state.players[0].cash;
  state = act(state, 'p0', { type: 'roll' });
  assert.equal(state.players[0].position, group[1]);
  assert.equal(state.players[0].cash, cash);
  assert.equal(state.phase, 'end');
});

test('stations scale with ownership and utilities use the rolled dice total', () => {
  const state = game();
  const stations = propertyIds(state, 'station');
  for (let i = 0; i < stations.length; i++) {
    state.properties[stations[i]].ownerId = 'p0';
    assert.equal(getRent(state, stations[0]), 25 * 2 ** i);
  }
  const utilities = propertyIds(state, 'utility');
  state.properties[utilities[0]].ownerId = 'p1';
  assert.equal(getRent(state, utilities[0], 7), 28);
  state.properties[utilities[1]].ownerId = 'p1';
  assert.equal(getRent(state, utilities[0], 7), 70);
  state.properties[utilities[0]].mortgaged = true;
  assert.equal(getRent(state, utilities[0], 7), 0);
});

test('normal rent moves money exactly and mortgage suppresses rent', () => {
  const source = game();
  source.properties[3].ownerId = 'p1';
  const rent = getRent(source, 3);
  const result = act(source, 'p0', { type: 'roll' });
  assert.equal(result.players[0].cash, 1500 - rent);
  assert.equal(result.players[1].cash, 1500 + rent);
  source.properties[3].mortgaged = true;
  assert.equal(act(source, 'p0', { type: 'roll' }).players[0].cash, 1500);
});

test('mortgaging settles pending debt once and unmortgaging charges 10% interest', () => {
  let state = game();
  state.properties[3].ownerId = 'p1';
  state.properties[5].ownerId = 'p0';
  state.players[0].cash = 0;
  const owed = getRent(state, 3);
  state = act(state, 'p0', { type: 'roll' });
  assert.equal(state.phase, 'debt');
  assert.throws(() => act(state, 'p0', { type: 'endTurn' }), /current action/);
  assert.throws(() => act(state, 'p1', { type: 'mortgage', tileId: 5 }), /your turn/);
  state = act(state, 'p0', { type: 'mortgage', tileId: 5 });
  assert.equal(state.phase, 'end');
  assert.equal(state.players[0].cash, 100 - owed);
  assert.equal(state.players[1].cash, 1500 + owed);
  assert.equal(state.debt, null);
  assert.throws(() => act(state, 'p0', { type: 'unmortgage', tileId: 5 }), /need/);
  state.players[0].cash = 200;
  state = act(state, 'p0', { type: 'unmortgage', tileId: 5 });
  assert.equal(state.players[0].cash, 90);
  assert.equal(state.properties[5].mortgaged, false);
});

test('buildings must sell evenly and their cash settles debt', () => {
  let state = game();
  const [a, b] = firstGroup(state);
  state.properties[a] = { ownerId: 'p0', level: 2, mortgaged: false };
  state.properties[b] = { ownerId: 'p0', level: 1, mortgaged: false };
  state.players[0].cash = 0;
  state.phase = 'debt';
  state.debt = { playerId: 'p0', creditorId: 'p1', amount: 20, reason: 'rent', afterPhase: 'end' };
  assert.throws(() => act(state, 'p0', { type: 'sellBuilding', tileId: b }), /evenly/);
  state = act(state, 'p0', { type: 'sellBuilding', tileId: a });
  assert.equal(state.properties[a].level, 1);
  assert.equal(state.players[0].cash, 5);
  assert.equal(state.players[1].cash, 1520);
  assert.equal(state.phase, 'end');
});

test('accepted trades exchange cash and properties atomically with ownership revalidation', () => {
  const source = game();
  source.properties[1].ownerId = 'p0';
  source.properties[6].ownerId = 'p1';
  let offered = act(source, 'p0', { type: 'offerTrade', toId: 'p1', offeredCash: 100, requestedCash: 20, offeredProperties: [1], requestedProperties: [6] });
  assert.throws(() => act(offered, 'p2', { type: 'respondTrade', accept: true }), /response/);
  const result = act(offered, 'p1', { type: 'respondTrade', accept: true });
  assert.equal(result.players[0].cash, 1420);
  assert.equal(result.players[1].cash, 1580);
  assert.equal(result.properties[1].ownerId, 'p1');
  assert.equal(result.properties[6].ownerId, 'p0');
  assert.equal(result.trade, null);
  assert.equal(source.players[0].cash, 1500);
  offered.players[1].cash = 0;
  assert.throws(() => act(offered, 'p1', { type: 'respondTrade', accept: true }), /enough cash/);
  assert.throws(() => act(source, 'p0', { type: 'offerTrade', toId: 'p1', offeredCash: 0, requestedCash: 0, offeredProperties: [1, 1], requestedProperties: [] }), /only once/);
  source.properties[1].level = 1;
  assert.throws(() => act(source, 'p0', { type: 'offerTrade', toId: 'p1', offeredCash: 0, requestedCash: 0, offeredProperties: [1], requestedProperties: [] }), /all buildings/);
});

test('negotiation keeps one trade and independent revision snapshots before an atomic acceptance', () => {
  let state = game();
  const [first, second] = propertyIds(state);
  state.properties[first].ownerId = 'p0';
  state.properties[second].ownerId = 'p1';
  state = act(state, 'p0', { type: 'offerTrade', toId: 'p1', offeredCash: 100, requestedCash: 10, offeredProperties: [first], requestedProperties: [second] });
  const original = structuredClone(state);
  const offerId = state.trades[0].id;
  const changed = act(state, 'p1', { type: 'counterTrade', offerId, offerVersion: 1, offeredCash: 20, requestedCash: 150, offeredProperties: [second], requestedProperties: [first] }, [], 3000);
  assert.deepEqual(state, original);
  assert.equal(changed.trades.length, 1);
  const offer = changed.trades[0];
  assert.equal(offer.id, offerId);
  assert.equal(offer.version, 2);
  assert.equal(offer.createdAt, 2000);
  assert.equal(offer.updatedAt, 3000);
  assert.equal(offer.fromId, 'p1');
  assert.equal(offer.toId, 'p0');
  assert.deepEqual(offer.revisions.map(revision => [revision.version, revision.fromId, revision.offeredCash, revision.offeredProperties]), [[1, 'p0', 100, [first]], [2, 'p1', 20, [second]]]);
  assert.notEqual(offer.revisions[1].offeredProperties, offer.offeredProperties);
  assert.equal(changed.players[0].cash, 1500);
  assert.equal(changed.properties[first].ownerId, 'p0');
  assert.equal(changed.turnStartedAt, original.turnStartedAt);
  const accepted = act(changed, 'p0', { type: 'respondTrade', offerId, offerVersion: 2, accept: true }, [], 4000);
  assert.equal(accepted.trades.length, 1);
  assert.equal(accepted.trades[0].status, 'accepted');
  assert.deepEqual(accepted.trades[0].revisions, offer.revisions);
  assert.equal(accepted.players[0].cash, 1370);
  assert.equal(accepted.players[1].cash, 1630);
  assert.equal(accepted.properties[first].ownerId, 'p1');
  assert.equal(accepted.properties[second].ownerId, 'p0');
  assert.throws(() => act(accepted, 'p0', { type: 'respondTrade', offerId, offerVersion: 2, accept: true }), /no trade/);
  assertInvariants(accepted);
});

test('only the current recipient negotiates, and stale or missing trade versions cannot resolve changed terms', () => {
  let state = act(game(), 'p0', { type: 'offerTrade', toId: 'p1', offeredCash: 100, requestedCash: 0, offeredProperties: [], requestedProperties: [] });
  const offerId = state.trades[0].id;
  const counter: GameAction = { type: 'counterTrade', offerId, offerVersion: 1, offeredCash: 0, requestedCash: 120, offeredProperties: [], requestedProperties: [] };
  for (const actor of ['p0', 'p2']) assert.throws(() => act(state, actor, counter), /response/);
  state = act(state, 'p1', counter);
  for (const offerVersion of [undefined, 1, 0, 2.5]) {
    assert.throws(() => act(state, 'p0', { type: 'respondTrade', offerId, offerVersion, accept: true }), /latest terms/);
    assert.throws(() => act(state, 'p0', { type: 'respondTrade', offerId, offerVersion, accept: false }), /latest terms/);
    assert.throws(() => act(state, 'p1', { type: 'cancelTrade', offerId, offerVersion }), /latest terms/);
  }
  assert.throws(() => act(state, 'p0', { ...counter, offerVersion: 1 }), /latest terms/);
  assert.throws(() => act(state, 'p0', { ...counter, offerVersion: undefined } as unknown as GameAction), /exact trade and version/);
  state = act(state, 'p0', { ...counter, offerVersion: 2, offeredCash: 110, requestedCash: 0 });
  assert.equal(state.trades[0].version, 3);
  assert.equal(state.trades[0].toId, 'p1');
  assert.throws(() => act(state, 'p1', { type: 'respondTrade', offerId, offerVersion: 1, accept: true }), /latest terms/);
  assert.equal(act(state, 'p1', { type: 'respondTrade', offerId, offerVersion: 3, accept: false }).trades[0].status, 'declined');
  assert.equal(act(state, 'p0', { type: 'cancelTrade', offerId, offerVersion: 3 }).trades[0].status, 'cancelled');
});

test('counteroffers revalidate current cash, auction reservations and property ownership without changing history on failure', () => {
  let state = game();
  const [first] = propertyIds(state);
  state.properties[first].ownerId = 'p0';
  state = act(state, 'p0', { type: 'offerTrade', toId: 'p1', offeredCash: 10, requestedCash: 0, offeredProperties: [first], requestedProperties: [] });
  const offerId = state.trades[0].id;
  const counter: GameAction = { type: 'counterTrade', offerId, offerVersion: 1, offeredCash: 0, requestedCash: 20, offeredProperties: [], requestedProperties: [first] };
  assert.throws(() => act(state, 'p1', { ...counter, requestedCash: 1501 }), /enough cash/);
  assert.throws(() => act(state, 'p1', { ...counter, offeredProperties: [first], requestedProperties: [] }), /no longer controlled/);
  assert.equal(state.trades[0].revisions.length, 1);
  assert.equal(state.trades[0].version, 1);
  state.phase = 'auction';
  state.auction = { tileId: propertyIds(state)[1], highestBid: 1490, highestBidderId: 'p0', passedIds: [] };
  assert.throws(() => act(state, 'p1', counter), /standing auction bid/);
  assert.equal(act(state, 'p1', { ...counter, requestedCash: 10 }).trades[0].version, 2);
});

test('third consecutive double sends player to jail without a fourth roll', () => {
  let state = game();
  // Own landing spaces to keep this focused on the doubles sequence.
  for (const property of Object.values(state.properties)) property.ownerId = 'p0';
  for (let i = 0; i < 3; i++) {
    state = act(state, 'p0', { type: 'roll' }, [0.2, 0.2]); // 2+2
    if (i < 2) state = act(state, 'p0', { type: 'endTurn' });
  }
  assert.equal(state.players[0].inJail, true);
  assert.equal(state.players[0].position, 10);
  assert.equal(state.extraRoll, false);
  assert.equal(act(state, 'p0', { type: 'endTurn' }).turnIndex, 1);
});

test('jail doubles release without bonus roll and third failure pays bail then moves', () => {
  const jailed = game();
  jailed.players[0].position = 10;
  jailed.players[0].inJail = true;
  const doubles = act(jailed, 'p0', { type: 'roll' }, [0.2, 0.2]);
  assert.equal(doubles.players[0].inJail, false);
  assert.equal(doubles.players[0].position, 14);
  assert.equal(doubles.extraRoll, false);
  const failed = act(jailed, 'p0', { type: 'roll' });
  assert.equal(failed.players[0].inJail, true);
  assert.equal(failed.players[0].jailTurns, 1);
  assert.equal(failed.phase, 'end');
  jailed.players[0].jailTurns = 2;
  const third = act(jailed, 'p0', { type: 'roll' });
  assert.equal(third.players[0].inJail, false);
  assert.equal(third.players[0].cash, 1450);
  assert.equal(third.players[0].position, 13);
  assert.equal(third.phase, 'buy');
  const bailed = act(jailed, 'p0', { type: 'payBail' });
  assert.equal(bailed.players[0].cash, 1450);
  assert.equal(bailed.players[0].inJail, false);
  assert.equal(bailed.phase, 'roll');
});

test('forced bail liquidates property or eliminates insolvent jailed player without stale debt', () => {
  const jailed = game();
  jailed.players[0].position = 10;
  jailed.players[0].inJail = true;
  jailed.players[0].jailTurns = 2;
  jailed.players[0].cash = 0;
  jailed.properties[5].ownerId = 'p0';
  const result = act(jailed, 'p0', { type: 'roll' });
  assert.equal(result.players[0].cash, 50);
  assert.equal(result.properties[5].mortgaged, true);
  assert.equal(result.players[0].position, 13);
  jailed.properties[5].ownerId = null;
  const eliminated = act(jailed, 'p0', { type: 'roll' });
  assert.equal(eliminated.players[0].bankrupt, true);
  assert.equal(eliminated.turnIndex, 1);
  assert.equal(eliminated.phase, 'roll');
  assert.equal(eliminated.debt, null);
});

test('surrender during rent debt gives assets to creditor and makes final opponent winner', () => {
  let state = game({}, 2);
  state.players[0].cash = 0;
  state.properties[3].ownerId = 'p1';
  state.properties[1].ownerId = 'p0';
  state = act(state, 'p0', { type: 'roll' });
  state = act(state, 'p0', { type: 'surrender' });
  assert.equal(state.properties[1].ownerId, 'p1');
  assert.equal(state.players[0].bankrupt, true);
  assert.equal(state.phase, 'finished');
  assert.deepEqual(state.winnerIds, ['p1']);
  assert.equal(state.debt, null);
  assert.throws(() => act(state, 'p1', { type: 'roll' }), /finished/);
});

test('mortgages disabled never traps a debtor: bankruptcy clears debt and transfers assets', () => {
  for (const teams of [false, true]) {
    let state = game({ mortgages: false, teams }, teams ? 4 : 2);
    state.players[0].cash = 0;
    state.properties[3].ownerId = 'p1';
    state.properties[1].ownerId = 'p0';
    state = act(state, 'p0', { type: 'roll' });
    assert.equal(state.phase, 'debt');
    assert.throws(() => act(state, 'p0', { type: 'mortgage', tileId: 1 }), /off|disabled/i);
    assert.ok(state.log.some(entry => entry.text.includes('declare bankruptcy')));
    state = act(state, 'p0', { type: 'surrender' });
    assert.equal(state.debt, null);
    assert.equal(state.players[0].bankrupt, true);
    assert.equal(state.properties[1].ownerId, teams ? 'p2' : 'p1');
    if (teams) {
      assert.equal(state.phase, 'roll');
      assert.equal(state.turnIndex, 1);
    } else {
      assert.equal(state.phase, 'finished');
      assert.deepEqual(state.winnerIds, ['p1']);
    }
    assertInvariants(state);
  }
});

test('voluntary team surrender transfers assets to ally and team victory includes teammates', () => {
  let state = game({ teams: true }, 4);
  state.properties[1].ownerId = 'p0';
  state = act(state, 'p0', { type: 'surrender' });
  assert.equal(state.properties[1].ownerId, 'p2');
  assert.equal(state.players[2].cash, 3000);
  assert.equal(state.turnIndex, 1);
  state = act(state, 'p1', { type: 'surrender' });
  state = act(state, 'p3', { type: 'surrender' });
  assert.equal(state.phase, 'finished');
  assert.deepEqual(state.winnerIds, ['p0', 'p2']);
});

test('teammates can build, sell, mortgage and clear shared deeds using their own cash', () => {
  let state = game({ teams: true }, 4);
  const [a, b] = firstGroup(state);
  state.properties[a].ownerId = 'p0';
  state.properties[b].ownerId = 'p2';
  state = act(state, 'p0', { type: 'build', tileId: b });
  assert.equal(state.properties[b].level, 1);
  assert.equal(state.properties[b].ownerId, 'p2');
  assert.equal(state.players[0].cash, 1450);
  assert.equal(state.players[2].cash, 1500);
  state = act(state, 'p0', { type: 'sellBuilding', tileId: b });
  state = act(state, 'p0', { type: 'mortgage', tileId: b });
  assert.equal(state.players[0].cash, 1505);
  assert.equal(state.properties[b].mortgaged, true);
  state = act(state, 'p0', { type: 'unmortgage', tileId: b });
  assert.equal(state.players[0].cash, 1472);
  assert.equal(state.properties[b].mortgaged, false);
  state.turnIndex = 1;
  assert.throws(() => act(state, 'p1', { type: 'mortgage', tileId: b }), /team’s property/);
});

test('bankruptcy transfers shared assets to an active teammate before an opposing creditor', () => {
  let state = game({ teams: true }, 4);
  state.properties[1] = { ownerId: 'p0', level: 2, mortgaged: false };
  state.properties[5] = { ownerId: 'p0', level: 0, mortgaged: true };
  state.players[0].cash = 7;
  state.phase = 'debt';
  state.debt = { playerId: 'p0', creditorId: 'p1', amount: 999, reason: 'rent', afterPhase: 'end' };
  state = act(state, 'p0', { type: 'surrender' });
  assert.deepEqual(state.properties[1], { ownerId: 'p2', level: 2, mortgaged: false });
  assert.deepEqual(state.properties[5], { ownerId: 'p2', level: 0, mortgaged: true });
  assert.equal(state.players[2].cash, 1507);
  assert.equal(state.players[1].cash, 1500);
  assert.equal(state.players[0].cash, 0);
  assert.equal(state.players[0].bankrupt, true);
  assert.equal(state.debt, null);
  assert.equal(state.turnIndex, 1);
});

test('shared deeds may be traded by a teammate and invalid overlapping offers expire', () => {
  let state = game({ teams: true }, 4);
  state.properties[1].ownerId = 'p2';
  const offer = { type: 'offerTrade' as const, offeredCash: 0, requestedCash: 100, offeredProperties: [1], requestedProperties: [] };
  state = act(state, 'p0', { ...offer, toId: 'p1' });
  state = act(state, 'p0', { ...offer, toId: 'p3' });
  const [first, second] = state.trades.map((trade) => trade.id);
  assert.notEqual(first, second);
  assert.equal(state.trades.filter((trade) => trade.status === 'pending').length, 2);
  state = act(state, 'p1', { type: 'respondTrade', offerId: first, accept: true });
  assert.equal(state.properties[1].ownerId, 'p1');
  assert.equal(state.players[0].cash, 1600);
  assert.equal(state.players[2].cash, 1500);
  assert.deepEqual(state.trades.map((trade) => trade.status), ['accepted', 'expired']);
  assert.match(state.trades[1].resolution!, /no longer controlled/);
  assert.ok(state.trades.every((trade) => trade.resolvedAt === 2000));
  assert.equal(state.trade, null);
  assert.throws(() => act(state, 'p3', { type: 'respondTrade', offerId: second, accept: true }), /no trade/);
});

test('multiple trade offers survive turn changes and keep declined and cancelled history', () => {
  let state = game();
  const offer = { type: 'offerTrade' as const, toId: 'p1', offeredCash: 10, requestedCash: 0, offeredProperties: [], requestedProperties: [] };
  state = act(state, 'p0', offer);
  state = act(state, 'p0', { ...offer, offeredCash: 20 });
  const [first, second] = state.trades.map((trade) => trade.id);
  assert.throws(() => act(state, 'p1', { type: 'respondTrade', accept: false }), /exact trade/);
  assert.throws(() => act(state, 'p0', { type: 'cancelTrade' }), /exact trade/);
  assert.throws(() => act(state, 'p2', { type: 'respondTrade', offerId: first, accept: true }), /response/);
  state.phase = 'end';
  state = act(state, 'p0', { type: 'endTurn' });
  assert.equal(state.trades.filter((trade) => trade.status === 'pending').length, 2);
  state = act(state, 'p1', { type: 'respondTrade', offerId: first, accept: false });
  state = act(state, 'p0', { type: 'cancelTrade', offerId: second });
  assert.deepEqual(state.trades.map((trade) => trade.status), ['declined', 'cancelled']);
  assert.equal(state.players[0].cash, 1500);
  assert.equal(state.players[1].cash, 1500);
  assert.equal(state.trade, null);
  assert.equal(state.log.filter((entry) => entry.kind === 'trade').length, 4);
});

test('trade offers expire after funds are spent, a participant leaves, or the game finishes', () => {
  const offer = { type: 'offerTrade' as const, toId: 'p1', offeredCash: 1490, requestedCash: 0, offeredProperties: [], requestedProperties: [] };
  let spent = game();
  for (const id of firstGroup(spent)) spent.properties[id].ownerId = 'p0';
  spent = act(spent, 'p0', offer);
  spent = act(spent, 'p0', { type: 'build', tileId: firstGroup(spent)[0] });
  assert.equal(spent.trades[0].status, 'expired');
  assert.match(spent.trades[0].resolution!, /enough cash/);

  let departed = act(game(), 'p0', offer);
  departed = act(departed, 'p1', { type: 'surrender' });
  assert.equal(departed.trades[0].status, 'expired');
  assert.match(departed.trades[0].resolution!, /left/);

  let finished = act(game({ teams: true }, 4), 'p0', { ...offer, toId: 'p2' });
  finished = act(finished, 'p1', { type: 'surrender' });
  finished = act(finished, 'p3', { type: 'surrender' });
  assert.equal(finished.trades[0].status, 'expired');
  assert.match(finished.trades[0].resolution!, /finished/);
  assert.equal(finished.trade, null);
});

test('treasure and surprise decks award and charge each adventure’s distinct amounts', () => {
  const treasureRewards = new Set<number>();
  for (const map of MAPS) {
    for (const kind of ['treasure', 'surprise'] as const) {
      const deck = kind === 'treasure' ? map.treasureCards : map.surpriseCards;
      const landing = map.tiles.find((tile) => tile.kind === kind)!;
      for (const [index, card] of deck.entries()) {
        if (card.effect !== 'cash') continue;
        const state = game({ mapId: map.id });
        state.players[0].position = landing.id - 2;
        const result = act(state, 'p0', { type: 'roll' }, [0, 0, (index + 0.5) / deck.length]);
        assert.equal(result.players[0].cash, 1500 + card.amount!, `${map.name}: ${card.title}`);
        assert.ok(result.log.some((entry) => entry.text.includes(card.title)));
        assert.equal(result.phase, 'end');
        if (kind === 'treasure') treasureRewards.add(card.amount!);
      }
    }
  }
  assert.ok(treasureRewards.size >= 8, 'Maps must have distinct reward/risk economies.');
});

test('adventure movement resolves destinations, returning home pays once, and jail pays nothing', () => {
  for (const map of MAPS) {
    for (const kind of ['treasure', 'surprise'] as const) {
      const deck = kind === 'treasure' ? map.treasureCards : map.surpriseCards;
      for (const [index, card] of deck.entries()) {
        if (!['start', 'jail', 'move'].includes(card.effect)) continue;
        const landing = map.tiles.find((tile) => tile.kind === kind && (card.effect !== 'move' || ['property', 'station', 'utility', 'start', 'rest', 'jail'].includes(map.tiles[(tile.id + card.steps! + map.size) % map.size].kind)))!;
        assert.ok(landing, `${map.name}: need a simple destination for ${card.title}`);
        const state = game({ mapId: map.id });
        state.players[0].position = landing.id - 2;
        const result = act(state, 'p0', { type: 'roll' }, [0, 0, (index + 0.5) / deck.length]);
        if (card.effect === 'start') {
          assert.equal(result.players[0].position, 0);
          assert.equal(result.players[0].cash, 1700);
        } else if (card.effect === 'jail') {
          assert.equal(result.players[0].position, map.size / 4);
          assert.equal(result.players[0].inJail, true);
          assert.equal(result.players[0].cash, 1500);
          assert.equal(result.extraRoll, false);
        } else {
          const target = (landing.id + card.steps! + map.size) % map.size;
          assert.equal(result.players[0].position, target);
          assert.equal(result.players[0].cash, 1500 + (landing.id + card.steps! >= map.size ? 200 : 0));
          assert.equal(result.phase, ['property', 'station', 'utility'].includes(map.tiles[target].kind) ? 'buy' : 'end');
        }
      }
    }
  }
});

test('repair surprises include team buildings and unpaid card costs become resolvable debt', () => {
  for (const map of MAPS) {
    const repairIndex = map.surpriseCards.findIndex((card) => card.effect === 'repair');
    const repair = map.surpriseCards[repairIndex];
    const landing = map.tiles.find((tile) => tile.kind === 'surprise')!;
    const state = game({ mapId: map.id, teams: true }, 4);
    const [a, b] = firstGroup(state);
    state.properties[a] = { ownerId: 'p0', level: 2, mortgaged: false };
    state.properties[b] = { ownerId: 'p2', level: 5, mortgaged: false };
    state.players[0].position = landing.id - 2;
    const repaired = act(state, 'p0', { type: 'roll' }, [0, 0, (repairIndex + 0.5) / map.surpriseCards.length]);
    assert.equal(repaired.players[0].cash, 1500 - 7 * repair.amount!);
    assert.equal(repaired.players[2].cash, 1500);
    state.players[0].cash = 0;
    const indebted = act(state, 'p0', { type: 'roll' }, [0, 0, (repairIndex + 0.5) / map.surpriseCards.length]);
    assert.equal(indebted.phase, 'debt');
    assert.equal(indebted.debt?.amount, 7 * repair.amount!);
    assert.equal(indebted.debt?.creditorId, null);
  }
});

test('house rules control auctions, double rent, prison rent, mortgages, and uneven building', () => {
  let state = game({ auctions: false, doubleRent: false, rentInJail: false, mortgages: false, evenBuild: false });
  const [a, b] = firstGroup(state);
  state.properties[a].ownerId = 'p0';
  state.properties[b].ownerId = 'p0';
  assert.equal(getRent(state, a), getMap(state.mapId).tiles[a].rents![0]);
  state = act(state, 'p0', { type: 'build', tileId: a });
  state = act(state, 'p0', { type: 'build', tileId: a });
  assert.equal(state.properties[a].level, 2);
  assert.equal(state.properties[b].level, 0);
  state.players[0].inJail = true;
  assert.equal(getRent(state, a), 0);
  assert.throws(() => act(state, 'p0', { type: 'mortgage', tileId: 5 }), /disabled/);
  state = act(game({ auctions: false }), 'p0', { type: 'roll' });
  state = act(state, 'p0', { type: 'decline' });
  assert.equal(state.phase, 'end');
  assert.equal(state.auction, null);
  assert.equal(state.properties[3].ownerId, null);
});

test('vacation jackpot pools only paid taxes, excludes bail and rent, and the next visitor collects it', () => {
  let state = game({ vacationCash: true });
  state.players[0].position = 1;
  state = act(state, 'p0', { type: 'roll' }); // tax at 4
  assert.equal(state.players[0].cash, 1300);
  assert.equal(state.vacationPot, 200);
  state = act(state, 'p0', { type: 'endTurn' });
  state.players[1].inJail = true;
  state = act(state, 'p1', { type: 'payBail' });
  assert.equal(state.vacationPot, 200);
  state.players[1].position = 17;
  state = act(state, 'p1', { type: 'roll' }); // rest at 20
  assert.equal(state.players[1].cash, 1650);
  assert.equal(state.vacationPot, 0);
  state = act(state, 'p1', { type: 'endTurn' });
  state.properties[3].ownerId = 'p0';
  state = act(state, 'p2', { type: 'roll' });
  assert.equal(state.vacationPot, 0, 'Rent belongs to the property holder.');
  let disabled = game({ vacationCash: false });
  disabled.players[0].position = 1;
  disabled = act(disabled, 'p0', { type: 'roll' });
  assert.equal(disabled.vacationPot, 200, 'Old rooms with the disabled setting also use the required tax jackpot.');
});

test('selling a site pays half its printed price, releases ownership and settles debt with mortgages off', () => {
  let state = game({ mortgages: false });
  state.properties[5].ownerId = 'p0';
  state.properties[3].ownerId = 'p1';
  state.players[0].cash = 0;
  state = act(state, 'p0', { type: 'roll' });
  const rent = state.debt!.amount;
  assert.equal(canSellProperty(state, 'p0', 5), true);
  assert.equal(canSellProperty(state, 'p1', 5), false);
  state = act(state, 'p0', { type: 'sellProperty', tileId: 5 });
  assert.deepEqual(state.properties[5], { ownerId: null, level: 0, mortgaged: false });
  assert.equal(state.players[0].cash, 100 - rent);
  assert.equal(state.players[1].cash, 1500 + rent);
  assert.equal(state.phase, 'end');
  assert.equal(state.vacationPot, 0);
  assert.throws(() => act(state, 'p0', { type: 'sellProperty', tileId: 5 }), /team’s property/);
  assertInvariants(state);
});

test('site sales reject mortgaged or developed sets and teammates can sell shared bare deeds', () => {
  let state = game({ teams: true }, 4);
  const [a, b] = firstGroup(state);
  state.properties[a].ownerId = 'p2';
  state.properties[b].ownerId = 'p0';
  state.properties[a].mortgaged = true;
  assert.equal(canSellProperty(state, 'p0', a), false);
  assert.throws(() => act(state, 'p0', { type: 'sellProperty', tileId: a }), /Clear this mortgage/);
  state.properties[a].mortgaged = false;
  state.properties[b].level = 1;
  assert.equal(canSellProperty(state, 'p0', a), false);
  assert.throws(() => act(state, 'p0', { type: 'sellProperty', tileId: a }), /all buildings/);
  state.properties[b].level = 0;
  const value = Math.floor(getMap(state.mapId).tiles[a].price! / 2);
  state = act(state, 'p0', { type: 'sellProperty', tileId: a });
  assert.equal(state.players[0].cash, 1500 + value);
  assert.equal(state.players[2].cash, 1500);
  assert.equal(state.properties[a].ownerId, null);
});

test('out-of-turn trades work during moves and debt, and a cash rescue settles debt once', () => {
  let state = act(game({ mortgages: false }), 'p0', { type: 'roll' });
  const started = state.turnStartedAt;
  state = act(state, 'p1', { type: 'offerTrade', toId: 'p2', offeredCash: 15, requestedCash: 0, offeredProperties: [], requestedProperties: [] });
  state = act(state, 'p2', { type: 'respondTrade', offerId: state.trades[0].id, accept: true });
  assert.equal(state.phase, 'buy');
  assert.equal(state.turnIndex, 0);
  assert.equal(state.turnStartedAt, started);
  assert.equal(state.players[1].cash, 1485);
  state.players[0].cash = 5;
  state.properties[5].ownerId = 'p0';
  state.phase = 'debt';
  state.debt = { playerId: 'p0', creditorId: 'p2', amount: 50, reason: 'rent', afterPhase: 'end' };
  assert.throws(() => act(state, 'p0', { type: 'offerTrade', toId: 'p1', offeredCash: 5, requestedCash: 0, offeredProperties: [], requestedProperties: [] }), /unpaid debt/);
  state = act(state, 'p0', { type: 'offerTrade', toId: 'p1', offeredCash: 0, requestedCash: 100, offeredProperties: [5], requestedProperties: [] });
  state = act(state, 'p1', { type: 'respondTrade', offerId: state.trades.at(-1)!.id, accept: true });
  assert.equal(state.players[0].cash, 55);
  assert.equal(state.players[1].cash, 1385);
  assert.equal(state.players[2].cash, 1565);
  assert.equal(state.properties[5].ownerId, 'p1');
  assert.equal(state.phase, 'end');
  assert.equal(state.debt, null);
});

test('trades remain available during auctions without spending a standing bid', () => {
  let state = act(act(game(), 'p0', { type: 'roll' }), 'p0', { type: 'decline' });
  state = act(state, 'p1', { type: 'bid', amount: 1400 });
  assert.throws(() => act(state, 'p1', { type: 'offerTrade', toId: 'p2', offeredCash: 101, requestedCash: 0, offeredProperties: [], requestedProperties: [] }), /standing auction bid/);
  state = act(state, 'p1', { type: 'offerTrade', toId: 'p2', offeredCash: 100, requestedCash: 0, offeredProperties: [], requestedProperties: [] });
  state = act(state, 'p2', { type: 'respondTrade', offerId: state.trades[0].id, accept: true });
  assert.equal(state.phase, 'auction');
  state = act(state, 'p0', { type: 'passAuction' });
  state = act(state, 'p2', { type: 'passAuction' });
  assert.equal(state.players[1].cash, 0);
  assert.equal(state.properties[3].ownerId, 'p1');
  assert.equal(state.phase, 'end');
});

test('unpaid taxes enter the vacation jackpot only when cash is actually paid', () => {
  let state = game({ mortgages: false });
  state.players[0].cash = 150;
  state.players[0].position = 1;
  state.properties[5].ownerId = 'p0';
  state = act(state, 'p0', { type: 'roll' });
  assert.equal(state.phase, 'debt');
  assert.equal(state.vacationPot, 0);
  state = act(state, 'p0', { type: 'sellProperty', tileId: 5 });
  assert.equal(state.vacationPot, 200);
  assert.equal(state.players[0].cash, 50);
  assert.equal(state.phase, 'end');
});

test('random turn order preserves every player and never mutates the lobby roster', () => {
  const roster = players(8);
  const original = structuredClone(roster);
  const state = createGame(roster, { ...DEFAULT_SETTINGS, randomOrder: true }, 1000, () => 0);
  assert.deepEqual(roster, original);
  assert.deepEqual(state.players.map((item) => item.id).sort(), roster.map((item) => item.id).sort());
  assert.notDeepEqual(state.players.map((item) => item.id), roster.map((item) => item.id));
  assert.ok(state.log[0].text.includes(state.players[0].name));
});

test('timeout cannot be claimed early or by self and skips a stale purchase', () => {
  const source = act(game(), 'p0', { type: 'roll' });
  assert.throws(() => act(source, 'p1', { type: 'claimTurn' }, [], 181_999), /3 minutes/);
  assert.throws(() => act(source, 'p0', { type: 'claimTurn' }, [], 182_000), /own turn/);
  const result = act(source, 'p1', { type: 'claimTurn' }, [], 182_000);
  assert.equal(result.turnIndex, 1);
  assert.equal(result.phase, 'roll');
  assert.equal(result.properties[3].ownerId, null);
  assert.equal(result.turnStartedAt, 182_000);
});

test('timeout completes auction and resolves debt before moving to the next player', () => {
  let auction = act(act(game(), 'p0', { type: 'roll' }), 'p0', { type: 'decline' });
  auction = act(auction, 'p2', { type: 'bid', amount: 100 });
  auction = act(auction, 'p1', { type: 'claimTurn' }, [], 182_000);
  assert.equal(auction.properties[3].ownerId, 'p2');
  assert.equal(auction.players[2].cash, 1400);
  assert.equal(auction.turnIndex, 1);
  assert.equal(auction.auction, null);
  let debt = game();
  debt.players[0].cash = 0;
  debt.properties[3].ownerId = 'p1';
  debt.properties[5].ownerId = 'p0';
  debt = act(debt, 'p0', { type: 'roll' });
  debt = act(debt, 'p2', { type: 'claimTurn' }, [], 182_000);
  assert.equal(debt.turnIndex, 1);
  assert.equal(debt.players[0].bankrupt, false);
  assert.equal(debt.properties[5].mortgaged, true);
  assert.equal(debt.debt, null);
  assertInvariants(debt);
});

test('timeout insolvency advances exactly once', () => {
  let state = game();
  state.players[0].cash = 0;
  state.properties[3].ownerId = 'p1';
  state = act(state, 'p0', { type: 'roll' });
  state = act(state, 'p2', { type: 'claimTurn' }, [], 182_000);
  assert.equal(state.turnIndex, 1);
  assert.equal(state.players[0].bankrupt, true);
  assert.equal(state.phase, 'roll');
  assertInvariants(state);
});

test('games continue after any number of turns until only one player or team survives', () => {
  let state = game({ teams: true }, 4);
  state.turnIndex = 3;
  state.phase = 'end';
  state.round = 9999;
  Object.assign(state.settings, { roundLimit: 1 }); // Previously saved games also ignore the removed setting.
  state.properties[1].ownerId = 'p0';
  assert.equal(getNetWorth(state, 'p0'), 1560);
  state = act(state, 'p3', { type: 'endTurn' });
  assert.equal(state.phase, 'roll');
  assert.deepEqual(state.winnerIds, []);
  assert.equal(state.round, 10000);
  state = act(state, 'p1', { type: 'surrender' });
  state = act(state, 'p3', { type: 'surrender' });
  assert.deepEqual(state.winnerIds, ['p0', 'p2']);
  let tie = game({}, 2);
  tie.turnIndex = 1;
  tie.phase = 'end';
  tie.round = 10000;
  tie = act(tie, 'p1', { type: 'endTurn' });
  assert.equal(tie.phase, 'roll');
  assert.deepEqual(tie.winnerIds, []);
  tie = act(tie, 'p0', { type: 'surrender' });
  assert.deepEqual(tie.winnerIds, ['p1']);
});

test('seeded play at every map player limit preserves full logs and resolves voluntary bankruptcy', () => {
  for (const [index, map] of MAPS.entries()) {
    let state = game({ mapId: map.id, maxPlayers: map.maxPlayers, teams: index % 2 === 1 }, map.maxPlayers);
    const firstLog = structuredClone(state.log[0]);
    let seed = index + 17;
    let now = 2_000;
    const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const run = (id: string, action: GameAction) => { state = applyGameAction(state, id, action, { rng, now: ++now }); assertInvariants(state); };
    for (let actions = 0; state.phase !== 'finished' && state.round <= 12 && actions < 3000; actions++) {
      const owner = state.players[state.turnIndex];
      if (state.phase === 'roll') {
        const buildable = propertyIds(state).find((id) => canBuild(state, owner.id, id));
        if (buildable !== undefined && owner.cash > 500) run(owner.id, { type: 'build', tileId: buildable });
        run(owner.id, { type: 'roll' });
      } else if (state.phase === 'buy') {
        const tile = getMap(state.mapId).tiles[owner.position];
        run(owner.id, { type: owner.cash >= tile.price! ? 'buy' : 'decline' });
      } else if (state.phase === 'auction') {
        const bidder = state.players.find((item) => !item.bankrupt && !state.auction!.passedIds.includes(item.id) && state.auction!.highestBidderId !== item.id);
        assert.ok(bidder, 'An auction must have an eligible bidder or close.');
        if (state.auction!.highestBidderId === null && bidder.cash >= 10) run(bidder.id, { type: 'bid', amount: 10 });
        else run(bidder.id, { type: 'passAuction' });
      } else if (state.phase === 'debt') {
        const claimant = state.players.find((item) => !item.bankrupt && item.id !== owner.id)!;
        now += 180_000;
        run(claimant.id, { type: 'claimTurn' });
      } else run(owner.id, { type: 'endTurn' });
    }
    // Unlimited matches do not promise a time to victory. End this bounded
    // simulation through ordinary surrender actions, never a wealth cutoff.
    while (state.phase !== 'finished') {
      const active = state.players.filter((item) => !item.bankrupt);
      run(active.at(-1)!.id, { type: 'surrender' });
    }
    assert.equal(state.phase, 'finished', `The ${map.name} game must resolve bankruptcy.`);
    assert.ok(state.winnerIds.length > 0);
    assert.ok(state.log.length > 80, 'Long games must preserve the full game log.');
    assert.deepEqual(state.log[0], firstLog);
    assertInvariants(state);
  }
});
