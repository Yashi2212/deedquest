import type { Trade } from './game/types';

export const tradeNoticeKey = (trade: Trade) => `${trade.id}@${trade.version ?? 1}`;

export function unreadTrades(trades: Trade[], playerId: string, seen: ReadonlySet<string>): Trade[] {
  return trades.filter(trade => trade.status === 'pending' && trade.fromId !== playerId && !seen.has(tradeNoticeKey(trade)));
}

export function markTradesSeen(seen: ReadonlySet<string>, ids: string[]): Set<string> {
  return new Set([...seen, ...ids]);
}
