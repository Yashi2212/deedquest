import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseBotAction } from '../server/bots.js';
import { applyGameAction, createGame } from '../src/game/engine.js';
import { getMap } from '../src/game/maps.js';
import { DEFAULT_SETTINGS, PLAYER_COLORS, type Player } from '../src/game/types.js';

test('India progresses through ten turn cycles with one automated human seat and exactly two bots', () => {
  const roster: Player[] = Array.from({ length: 3 }, (_, index) => ({
    id: `india-${index}`, name: index === 0 ? 'Human host' : `India bot ${index}`,
    color: PLAYER_COLORS[index], tokenIndex: index, team: index % 2, ready: true, bot: index > 0,
  }));
  for (const initialSeed of [4102, 7241, 20261002]) {
    let seed = initialSeed;
    const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    let game = createGame(roster, { ...DEFAULT_SETTINGS, mapId: 'india', maxPlayers: 3 }, 1000);
    const moves = new Map(roster.map(player => [player.id, 0]));
    let steps = 0;
    while (game.phase !== 'finished' && game.round <= 10 && steps++ < 3000) {
      let move = chooseBotAction(game);
      if (!move) {
        const humanView = structuredClone(game);
        humanView.players.forEach(player => { player.bot = player.id === roster[0].id; });
        move = chooseBotAction(humanView);
      }
      assert.ok(move, `Seed ${initialSeed} stalled in ${game.phase}`);
      moves.set(move.playerId, moves.get(move.playerId)! + 1);
      game = applyGameAction(game, move.playerId, move.action, { rng, now: 1000 + steps });
      assert.equal(game.players.filter(player => player.bot).length, 2);
      assert.ok(game.players.every(player => Number.isSafeInteger(player.cash) && player.cash >= 0));
      assert.ok(game.players.every(player => player.position >= 0 && player.position < getMap('india').tiles.length));
      assert.ok(Object.values(game.properties).every(property => !property.ownerId || game.players.some(player => player.id === property.ownerId && !player.bankrupt)));
      assert.equal(Boolean(game.debt), game.phase === 'debt');
      assert.equal(Boolean(game.auction), game.phase === 'auction');
    }
    assert.ok(game.phase === 'finished' || game.round > 10, `Seed ${initialSeed} must keep progressing`);
    if (game.phase !== 'finished') assert.deepEqual(game.winnerIds, []);
    assert.ok([...moves.values()].every(count => count >= 10));
    assert.ok(game.log.some(entry => entry.kind === 'purchase'));
    assert.ok(game.log.some(entry => entry.kind === 'rent'));
  }
});
