import { canBuild, canSellProperty, controlsProperty } from '../src/game/engine.js';
import { getMap } from '../src/game/maps.js';
import type { GameAction, GamePlayer, GameState, Tile, Trade } from '../src/game/types.js';

export interface BotMove { playerId: string; action: GameAction }

const PURCHASE_RESERVE = 100;
const BUILD_RESERVE = 250;
const allied = (game: GameState, first: GamePlayer, second: GamePlayer) =>
  first.id === second.id || (game.settings.teams && first.team === second.team);

function group(game: GameState, tile: Tile): Tile[] {
  return tile.group ? getMap(game.mapId).tiles.filter((item) => item.kind === 'property' && item.group === tile.group) : [tile];
}

// Bots make decisions from the same public board and cash balances as a human.
// They return one ordinary game action; the authoritative engine validates it.
function propertyValue(game: GameState, tileId: number): number {
  const tile = getMap(game.mapId).tiles.find((item) => item.id === tileId);
  const property = game.properties[tileId];
  if (!tile || !property) return 0;
  return Math.max(0, (tile.price ?? 0) - (property.mortgaged ? Math.ceil(Math.floor((tile.price ?? 0) / 2) * 11 / 10) : 0));
}

function acceptsTrade(game: GameState, bot: GamePlayer, trade: Trade): boolean {
  const proposer = game.players.find((item) => item.id === trade.fromId && !item.bankrupt);
  if (!proposer || proposer.cash < trade.offeredCash || bot.cash < trade.requestedCash) return false;
  for (const [participant, incoming, outgoing] of [[proposer, trade.requestedCash, trade.offeredCash], [bot, trade.offeredCash, trade.requestedCash]] as const) {
    const balance = participant.cash + incoming - outgoing;
    if (game.auction?.highestBidderId === participant.id && balance < game.auction.highestBid) return false;
    if (game.debt?.playerId === participant.id && balance < Math.min(participant.cash, game.debt.amount)) return false;
  }
  if (trade.offeredProperties.some((id) => !controlsProperty(game, proposer.id, id)) ||
      trade.requestedProperties.some((id) => !controlsProperty(game, bot.id, id))) return false;
  const incoming = trade.offeredCash + trade.offeredProperties.reduce((sum, id) => sum + propertyValue(game, id), 0);
  let outgoing = trade.requestedCash + trade.requestedProperties.reduce((sum, id) => sum + propertyValue(game, id), 0);
  // Breaking a completed color group costs more than the printed deed price.
  for (const id of trade.requestedProperties) {
    const tile = getMap(game.mapId).tiles[id];
    if (tile?.group && group(game, tile).every((item) => controlsProperty(game, bot.id, item.id))) outgoing += Math.round((tile.price ?? 0) * 0.25);
  }
  return incoming >= outgoing && incoming > 0 && bot.cash + trade.offeredCash - trade.requestedCash >= PURCHASE_RESERVE;
}

function resolveDebt(game: GameState, bot: GamePlayer): GameAction {
  const tiles = getMap(game.mapId).tiles.filter((tile) => controlsProperty(game, bot.id, tile.id));
  const buildings = tiles.filter((tile) => game.properties[tile.id].level > 0 &&
    (!game.settings.evenBuild || group(game, tile).every((item) => game.properties[item.id].level <= game.properties[tile.id].level)));
  buildings.sort((a, b) => game.properties[b.id].level - game.properties[a.id].level || (b.buildCost ?? 0) - (a.buildCost ?? 0));
  if (buildings[0]) return { type: 'sellBuilding', tileId: buildings[0].id };
  if (game.settings.mortgages) {
    const candidates = tiles.filter((tile) => !game.properties[tile.id].mortgaged && group(game, tile).every((item) => game.properties[item.id].level === 0));
    candidates.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    if (candidates[0]) return { type: 'mortgage', tileId: candidates[0].id };
  }
  const sellable = tiles.filter((tile) => canSellProperty(game, bot.id, tile.id)).sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
  if (sellable[0]) return { type: 'sellProperty', tileId: sellable[0].id };
  return { type: 'surrender' };
}

export function chooseBotAction(game: GameState): BotMove | null {
  if (game.phase === 'finished') return null;
  const bots = game.players.filter((item) => item.bot && !item.bankrupt);
  if (!bots.length) return null;

  {
    const offer = game.trades?.find((trade) => trade.status === 'pending' && bots.some((bot) => bot.id === trade.toId));
    if (offer) {
      const recipient = bots.find((bot) => bot.id === offer.toId)!;
      return { playerId: recipient.id, action: { type: 'respondTrade', offerId: offer.id, offerVersion: offer.version ?? 1, accept: acceptsTrade(game, recipient, offer) } };
    }
  }

  if (game.phase === 'auction' && game.auction) {
    const auction = game.auction;
    const bidder = bots.find((bot) => bot.id !== auction.highestBidderId && !auction.passedIds.includes(bot.id));
    if (!bidder) return null;
    const leader = game.players.find((item) => item.id === auction.highestBidderId);
    const price = getMap(game.mapId).tiles[auction.tileId]?.price ?? 0;
    const budget = Math.min(bidder.cash - PURCHASE_RESERVE, Math.floor(price * 1.15));
    const amount = auction.highestBid + 10;
    const action: GameAction = amount <= budget && (!leader || !allied(game, bidder, leader))
      ? { type: 'bid', amount }
      : { type: 'passAuction' };
    return { playerId: bidder.id, action };
  }

  const bot = game.players[game.turnIndex];
  if (!bot?.bot || bot.bankrupt) return null;
  const move = (action: GameAction): BotMove => ({ playerId: bot.id, action });
  if (game.phase === 'debt') return game.debt?.playerId === bot.id ? move(resolveDebt(game, bot)) : null;
  if (game.phase === 'roll') return move(bot.inJail && bot.cash >= BUILD_RESERVE ? { type: 'payBail' } : { type: 'roll' });
  if (game.phase === 'buy') {
    const tile = getMap(game.mapId).tiles[bot.position];
    return move({ type: bot.cash - (tile.price ?? Infinity) >= PURCHASE_RESERVE ? 'buy' : 'decline' });
  }
  if (game.phase === 'end') {
    const tiles = getMap(game.mapId).tiles;
    const mortgaged = tiles.find((tile) => controlsProperty(game, bot.id, tile.id) && game.properties[tile.id].mortgaged &&
      bot.cash - Math.ceil(Math.floor((tile.price ?? 0) / 2) * 11 / 10) >= BUILD_RESERVE);
    if (mortgaged) return move({ type: 'unmortgage', tileId: mortgaged.id });
    const buildable = tiles.filter((tile) => canBuild(game, bot.id, tile.id) && bot.cash - (tile.buildCost ?? Infinity) >= BUILD_RESERVE);
    buildable.sort((a, b) => game.properties[a.id].level - game.properties[b.id].level || (b.rents?.[1] ?? 0) - (a.rents?.[1] ?? 0));
    if (buildable[0]) return move({ type: 'build', tileId: buildable[0].id });
    return move({ type: 'endTurn' });
  }
  return null;
}
