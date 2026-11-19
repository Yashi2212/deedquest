import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseBotAction } from '../server/bots.js';
import { applyGameAction, createGame } from '../src/game/engine.js';
import { MAPS, getMap } from '../src/game/maps.js';
import { DEFAULT_SETTINGS, PLAYER_COLORS, type GameState, type Player, type RoomSettings } from '../src/game/types.js';

const roster = (count = 3): Player[] => Array.from({ length: count }, (_, index) => ({
  id: `bot${index}`, name: `Bot ${index}`, color: PLAYER_COLORS[index], tokenIndex: index, team: index % 2, ready: true, bot: true,
}));
const setup = (settings: Partial<RoomSettings> = {}, count = 3) => createGame(roster(count), { ...DEFAULT_SETTINGS, ...settings }, 1000);
const step = (game: GameState) => {
  const next = chooseBotAction(game);
  assert.ok(next, `Expected bot action in ${game.phase}`);
  return applyGameAction(game, next.playerId, next.action, { now: 2000, rng: () => 0.2 });
};
const firstGroup = (game: GameState) => {
  const tiles = getMap(game.mapId).tiles;
  const property = tiles.find((tile) => tile.kind === 'property')!;
  return tiles.filter((tile) => tile.group === property.group);
};

test('bots leave human turns and finished games alone, without mutating state', () => {
  const game = setup();
  game.players.forEach((player) => { player.bot = false; });
  assert.equal(chooseBotAction(game), null);
  game.players[1].bot = true;
  assert.equal(chooseBotAction(game), null);
  game.players[0].bot = true;
  const original = structuredClone(game);
  assert.deepEqual(chooseBotAction(game), { playerId: 'bot0', action: { type: 'roll' } });
  assert.deepEqual(game, original);
  game.phase = 'finished';
  assert.equal(chooseBotAction(game), null);
});

test('bots buy with a cash reserve and decline properties they cannot afford', () => {
  const game = setup();
  const property = getMap(game.mapId).tiles.find((tile) => tile.kind === 'property')!;
  game.phase = 'buy';
  game.players[0].position = property.id;
  const bought = step(game);
  assert.equal(bought.properties[property.id].ownerId, 'bot0');
  game.players[0].cash = property.price! + 99;
  assert.equal(chooseBotAction(game)?.action.type, 'decline');
  assert.equal(step(game).phase, 'auction');
});

test('bots pay affordable bail once, then roll normally', () => {
  const game = setup();
  game.players[0].inJail = true;
  assert.equal(chooseBotAction(game)?.action.type, 'payBail');
  const bailed = step(game);
  assert.equal(bailed.players[0].cash, 1450);
  assert.equal(chooseBotAction(bailed)?.action.type, 'roll');
  game.players[0].cash = 60;
  assert.equal(chooseBotAction(game)?.action.type, 'roll');
});

test('bot auctions finish, preserve reserves, and do not bid against their own team', () => {
  let game = setup();
  const property = getMap(game.mapId).tiles.find((tile) => tile.kind === 'property')!;
  game.players[0].position = property.id;
  game.phase = 'buy';
  game = applyGameAction(game, 'bot0', { type: 'decline' });
  let count = 0;
  while (game.phase === 'auction' && count++ < 100) game = step(game);
  assert.equal(game.phase, 'end');
  assert.ok(game.players.every((player) => player.cash >= 100));
  assert.ok(game.properties[property.id].ownerId);

  const team = setup({ teams: true }, 4);
  team.phase = 'auction';
  team.auction = { tileId: property.id, highestBid: 10, highestBidderId: 'bot2', passedIds: ['bot1', 'bot3'] };
  assert.deepEqual(chooseBotAction(team), { playerId: 'bot0', action: { type: 'passAuction' } });
  assert.equal(step(team).phase, 'end');
});

test('a bot waits for a human auction response when it holds the highest bid', () => {
  const game = setup({}, 2);
  game.players[1].bot = false;
  const property = getMap(game.mapId).tiles.find((tile) => tile.kind === 'property')!;
  game.phase = 'auction';
  game.auction = { tileId: property.id, highestBid: 10, highestBidderId: 'bot0', passedIds: [] };
  assert.equal(chooseBotAction(game), null);
});

test('bots liquidate buildings evenly before mortgages and surrender only when necessary', () => {
  let game = setup();
  const properties = firstGroup(game);
  for (const tile of properties) game.properties[tile.id] = { ownerId: 'bot0', level: 2, mortgaged: false };
  game.players[0].cash = 0;
  game.phase = 'debt';
  game.debt = { playerId: 'bot0', creditorId: 'bot1', amount: 2000, reason: 'test rent', afterPhase: 'end' };
  assert.equal(chooseBotAction(game)?.action.type, 'sellBuilding');
  let count = 0;
  while (game.phase === 'debt' && count++ < 30) {
    game = step(game);
    const levels = properties.map((tile) => game.properties[tile.id].level);
    assert.ok(Math.max(...levels) - Math.min(...levels) <= 1);
  }
  assert.ok(game.players[0].bankrupt);
  assert.equal(game.properties[properties[0].id].ownerId, 'bot1');

  game = setup({ mortgages: false });
  game.properties[properties[0].id].ownerId = 'bot0';
  game.players[0].cash = 0;
  game.phase = 'debt';
  game.debt = { playerId: 'bot0', creditorId: null, amount: 10, reason: 'tax', afterPhase: 'end' };
  assert.equal(chooseBotAction(game)?.action.type, 'sellProperty');
  game = step(game);
  assert.equal(game.phase, 'end');
  assert.equal(game.players[0].bankrupt, false);
  assert.equal(game.properties[properties[0].id].ownerId, null);
  assert.equal(game.players[0].cash, properties[0].price! / 2 - 10);
});

test('bots clear mortgages and build through legal engine actions with a reserve', () => {
  let game = setup();
  const properties = firstGroup(game);
  for (const tile of properties) game.properties[tile.id] = { ownerId: 'bot0', level: 0, mortgaged: false };
  game.properties[properties[0].id].mortgaged = true;
  game.phase = 'end';
  assert.equal(chooseBotAction(game)?.action.type, 'unmortgage');
  game = step(game);
  assert.equal(chooseBotAction(game)?.action.type, 'build');
  let count = 0;
  while (game.turnIndex === 0 && count++ < 30) game = step(game);
  assert.equal(game.turnIndex, 1);
  assert.ok(game.players[0].cash >= 250);
  assert.ok(properties.every((tile) => game.properties[tile.id].level > 0));
});

test('bots respond to fair trade offers and refuse unfair or unaffordable offers', () => {
  const propose = (offeredCash: number, requestedCash: number, requestedProperties: number[] = []) => {
    const game = setup();
    game.players[0].bot = false;
    for (const id of requestedProperties) game.properties[id].ownerId = 'bot1';
    return applyGameAction(game, 'bot0', { type: 'offerTrade', toId: 'bot1', offeredCash, requestedCash, offeredProperties: [], requestedProperties }, { now: 1100 });
  };
  const fair = propose(120, 60);
  assert.equal(chooseBotAction(fair)?.action.type, 'respondTrade');
  const decision = chooseBotAction(fair)!.action;
  assert.equal(decision.type === 'respondTrade' && decision.offerVersion, 1);
  const accepted = step(fair);
  assert.equal(accepted.trades[0].status, 'accepted');
  assert.equal(accepted.players[1].cash, 1560);
  assert.equal(step(propose(1, 200)).trades[0].status, 'declined');
  const property = getMap(DEFAULT_SETTINGS.mapId).tiles.find((tile) => tile.kind === 'property')!;
  assert.equal(step(propose(property.price!, 0, [property.id])).trades[0].status, 'accepted');
  let lowCash = setup();
  lowCash.players[0].bot = false;
  lowCash.players[1].cash = property.price! + 99;
  lowCash.properties[property.id].ownerId = 'bot0';
  lowCash = applyGameAction(lowCash, 'bot0', { type: 'offerTrade', toId: 'bot1', offeredCash: 0, requestedCash: property.price!, offeredProperties: [property.id], requestedProperties: [] });
  assert.equal(step(lowCash).trades[0].status, 'declined');
});

test('bots respond to the current negotiated revision instead of accepting stale terms', () => {
  let game = setup();
  game.players[0].bot = false;
  game = applyGameAction(game, 'bot1', { type: 'offerTrade', toId: 'bot0', offeredCash: 120, requestedCash: 60, offeredProperties: [], requestedProperties: [] });
  const offerId = game.trades[0].id;
  game = applyGameAction(game, 'bot0', { type: 'counterTrade', offerId, offerVersion: 1, offeredCash: 150, requestedCash: 0, offeredProperties: [], requestedProperties: [] });
  const move = chooseBotAction(game)!;
  assert.equal(move.playerId, 'bot1');
  assert.equal(move.action.type === 'respondTrade' && move.action.offerVersion, 2);
  const accepted = step(game);
  assert.equal(accepted.trades[0].status, 'accepted');
  assert.equal(accepted.trades[0].revisions.length, 2);
  assert.equal(accepted.players[1].cash, 1650);
});

test('bots discount mortgaged deeds and protect completed color groups in trades', () => {
  let game = setup();
  game.players[0].bot = false;
  const properties = firstGroup(game);
  game.properties[properties[0].id] = { ownerId: 'bot0', level: 0, mortgaged: true };
  game = applyGameAction(game, 'bot0', { type: 'offerTrade', toId: 'bot1', offeredCash: 0, requestedCash: properties[0].price!, offeredProperties: [properties[0].id], requestedProperties: [] });
  assert.equal(step(game).trades[0].status, 'declined');

  game = setup();
  game.players[0].bot = false;
  for (const tile of properties) game.properties[tile.id].ownerId = 'bot1';
  game = applyGameAction(game, 'bot0', { type: 'offerTrade', toId: 'bot1', offeredCash: properties[0].price!, requestedCash: 0, offeredProperties: [], requestedProperties: [properties[0].id] });
  assert.equal(step(game).trades[0].status, 'declined');
});

test('seeded bots play every adventure at its player limit and bankruptcy resolves matches', () => {
  assert.equal(MAPS.length, 6);
  for (let mapIndex = 0; mapIndex < MAPS.length; mapIndex++) {
    const map = MAPS[mapIndex];
    for (const teams of [false, true]) {
      let seed = 7241 + mapIndex;
      const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      let game = setup({ mapId: map.id, maxPlayers: map.maxPlayers, teams }, map.maxPlayers);
      let steps = 0;
      while (game.phase !== 'finished' && game.round <= 8 && steps++ < 10000) {
        const move = chooseBotAction(game);
        assert.ok(move, `${map.name} / ${teams ? 'teams' : 'solo'} stalled during ${game.phase}`);
        game = applyGameAction(game, move.playerId, move.action, { rng, now: 1000 + steps });
        assert.ok(game.players.every((player) => Number.isSafeInteger(player.cash) && player.cash >= 0));
        assert.ok(Object.values(game.properties).every((property) => !property.ownerId || game.players.some((player) => player.id === property.ownerId && !player.bankrupt)));
        assert.equal(Boolean(game.debt), game.phase === 'debt');
        assert.equal(Boolean(game.auction), game.phase === 'auction');
      }
      assert.ok(game.phase === 'finished' || game.round > 8, `${map.name} bots must keep progressing`);
      // This test limits its own duration; the game has no turn limit.
      while (game.phase !== 'finished') {
        const departing = game.players.filter((player) => !player.bankrupt).at(-1)!;
        game = applyGameAction(game, departing.id, { type: 'surrender' }, { now: 1000 + ++steps });
      }
      assert.equal(game.phase, 'finished', `${map.name} bankruptcy must resolve the match`);
      assert.ok(game.winnerIds.length > 0);
    }
  }
});
