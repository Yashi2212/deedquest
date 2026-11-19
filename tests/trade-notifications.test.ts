import test from 'node:test';
import assert from 'node:assert/strict';
import { markTradesSeen, unreadTrades } from '../src/trade-notifications.js';
import type { Trade } from '../src/game/types.js';

const offer = (id: string, fromId = 'other', toId = 'me', status: Trade['status'] = 'pending'): Trade => ({
  id, fromId, toId, status, version: 1, revisions: [], updatedAt: 1, createdAt: 1, offeredCash: 50, requestedCash: 0, offeredProperties: [], requestedProperties: [],
});
test('trade notifications show new offers to you and between other players, excluding your own and closed offers', () => {
  const trades = [offer('incoming'), offer('table', 'alice', 'bob'), offer('own', 'me', 'other'), offer('closed', 'other', 'me', 'declined')];
  assert.deepEqual(unreadTrades(trades, 'me', new Set()).map(trade => trade.id), ['incoming', 'table']);
});
test('viewing trades clears their badges without hiding offers that arrive afterward', () => {
  const original = new Set<string>();
  const seen = markTradesSeen(original, ['a@1', 'b@1']);
  assert.equal(original.size, 0);
  assert.deepEqual(unreadTrades([offer('a'), offer('b'), offer('c')], 'me', seen).map(trade => trade.id), ['c']);
  assert.equal(unreadTrades([offer('c', 'other', 'me', 'cancelled')], 'me', seen).length, 0);
});

test('a counteroffer in a previously viewed trade produces a new notification', () => {
  const revised = { ...offer('a'), version: 2 };
  assert.equal(unreadTrades([revised], 'me', new Set(['a@1'])).length, 1);
  assert.equal(unreadTrades([revised], 'me', new Set(['a@1', 'a@2'])).length, 0);
});
