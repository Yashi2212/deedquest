import { getMap } from './maps.js';
import { DEFAULT_SETTINGS } from './types.js';
import type { GameAction, GamePlayer, GameState, Phase, Player, RoomSettings, Tile, Trade, TradeRevision } from './types.js';

const TURN_TIMEOUT = 180_000;
const START_BONUS = 200;
const BAIL = 50;
const ownable = (tile: Tile) => ['property', 'station', 'utility'].includes(tile.kind);
function fail(message: string): never { throw new Error(message); }
const integer = (value: unknown, min = 0, max = 1_000_000_000): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const current = (game: GameState) => game.players[game.turnIndex];
const player = (game: GameState, id: string) => game.players.find((item) => item.id === id) ?? fail('Player not found.');
const tiles = (game: GameState) => getMap(game.mapId).tiles;
const tileAt = (game: GameState, id: number) => tiles(game).find((tile) => tile.id === id) ?? fail('Space not found.');
const allied = (game: GameState, a: GamePlayer, b: GamePlayer) => a.id === b.id || (game.settings.teams && a.team === b.team);
export const controlsProperty = (game: GameState, playerId: string, tileId: number) => {
  const actor = game.players.find((item) => item.id === playerId);
  const owner = game.players.find((item) => item.id === game.properties[tileId]?.ownerId);
  return Boolean(actor && owner && !actor.bankrupt && !owner.bankrupt && allied(game, actor, owner));
};
const groupTiles = (game: GameState, tile: Tile) => tile.group ? tiles(game).filter((item) => item.kind === 'property' && item.group === tile.group) : [tile];

function log(game: GameState, text: string, kind: GameState['log'][number]['kind'], now: number) {
  const last = game.log.at(-1)?.id.split(':').at(-1);
  game.log.push({ id: `${now}:${Number(last ?? 0) + 1}`, text, kind, at: now });
}

function controlsGroup(game: GameState, owner: GamePlayer, tile: Tile): boolean {
  if (!tile.group) return false;
  const group = groupTiles(game, tile);
  if (group.length < 2) return false;
  return group.every((item) => {
    const id = game.properties[item.id]?.ownerId;
    if (!id) return false;
    const holder = player(game, id);
    return !holder.bankrupt && allied(game, owner, holder);
  });
}

export function getNetWorth(game: GameState, playerId: string): number {
  const owner = player(game, playerId);
  if (owner.bankrupt) return 0;
  return owner.cash + tiles(game).reduce((sum, tile) => {
    const property = game.properties[tile.id];
    if (!property || property.ownerId !== playerId) return sum;
    const price = tile.price ?? 0;
    return sum + price - (property.mortgaged ? Math.floor(price / 2) : 0) + property.level * (tile.buildCost ?? 0);
  }, 0);
}

export function getRent(game: GameState, tileId: number, diceTotal = game.dice[0] + game.dice[1]): number {
  const tile = tileAt(game, tileId);
  const property = game.properties[tileId];
  if (!property?.ownerId || property.mortgaged) return 0;
  const owner = player(game, property.ownerId);
  if (owner.bankrupt || (!game.settings.rentInJail && owner.inJail)) return 0;
  if (tile.kind === 'property') {
    const rent = tile.rents?.[property.level] ?? 0;
    return rent * (game.settings.doubleRent && property.level === 0 && controlsGroup(game, owner, tile) ? 2 : 1);
  }
  const count = tiles(game).filter((item) => {
    if (item.kind !== tile.kind) return false;
    const holder = game.properties[item.id]?.ownerId;
    return holder && !player(game, holder).bankrupt && allied(game, owner, player(game, holder));
  }).length;
  if (tile.kind === 'station') return 25 * 2 ** Math.max(0, count - 1);
  if (tile.kind === 'utility') return Math.max(0, diceTotal) * (count >= 2 ? 10 : 4);
  return 0;
}

export function canBuild(game: GameState, playerId: string, tileId: number): boolean {
  const owner = game.players.find((item) => item.id === playerId);
  const tile = tiles(game).find((item) => item.id === tileId);
  const property = game.properties[tileId];
  if (!owner || owner.bankrupt || !tile || tile.kind !== 'property' || !property || !controlsProperty(game, playerId, tileId) || property.level >= 5 || property.mortgaged) return false;
  if (game.phase === 'finished' || current(game).id !== playerId || !['roll', 'end'].includes(game.phase)) return false;
  if (owner.cash < (tile.buildCost ?? Infinity) || !controlsGroup(game, owner, tile)) return false;
  const group = groupTiles(game, tile);
  return group.every((item) => !game.properties[item.id].mortgaged && (!game.settings.evenBuild || game.properties[item.id].level >= property.level));
}

function finish(game: GameState, winnerIds: string[], now: number, reason: string) {
  game.phase = 'finished';
  game.winnerIds = winnerIds;
  game.debt = null;
  game.auction = null;
  game.trade = null;
  for (const trade of game.trades) if (trade.status === 'pending') resolveTrade(trade, 'expired', now, 'The game finished.');
  game.extraRoll = false;
  log(game, `${reason} ${winnerIds.map((id) => player(game, id).name).join(' & ')} ${winnerIds.length === 1 ? 'wins' : 'win'}!`, 'system', now);
}

function checkWinner(game: GameState, now: number): boolean {
  const active = game.players.filter((item) => !item.bankrupt);
  if (active.length <= 1) {
    const winners = active.length && game.settings.teams ? game.players.filter((item) => item.team === active[0].team) : active;
    finish(game, winners.map((item) => item.id), now, 'The game is over.');
    return true;
  }
  if (game.settings.teams && new Set(active.map((item) => item.team)).size === 1) {
    finish(game, game.players.filter((item) => item.team === active[0].team).map((item) => item.id), now, 'The last team standing');
    return true;
  }
  return false;
}

function nextTurn(game: GameState, now: number) {
  if (checkWinner(game, now)) return;
  const previousIndex = game.turnIndex;
  do { game.turnIndex = (game.turnIndex + 1) % game.players.length; } while (current(game).bankrupt);
  if (game.turnIndex <= previousIndex) game.round += 1;
  game.doubles = 0;
  game.extraRoll = false;
  game.debt = null;
  game.auction = null;
  game.turnStartedAt = now;
  game.phase = 'roll';
  log(game, `${current(game).name}'s turn.`, 'system', now);
}

function bankrupt(game: GameState, debtor: GamePlayer, creditorId: string | null, now: number) {
  const wasCurrent = current(game).id === debtor.id;
  const creditor = creditorId ? game.players.find((item) => item.id === creditorId && !item.bankrupt && item.id !== debtor.id) : undefined;
  const teammate = game.settings.teams ? game.players.find((item) => !item.bankrupt && item.id !== debtor.id && item.team === debtor.team) : undefined;
  const inheritor = teammate ?? creditor;
  if (inheritor) inheritor.cash += debtor.cash;
  for (const property of Object.values(game.properties)) {
    if (property.ownerId !== debtor.id) continue;
    property.ownerId = inheritor?.id ?? null;
    if (!inheritor) { property.level = 0; property.mortgaged = false; }
  }
  debtor.cash = 0;
  debtor.bankrupt = true;
  debtor.inJail = false;
  for (const trade of game.trades) if (trade.status === 'pending' && (trade.fromId === debtor.id || trade.toId === debtor.id)) resolveTrade(trade, 'expired', now, `${debtor.name} left the game.`);
  if (game.debt?.playerId === debtor.id) game.debt = null;
  else if (game.debt?.creditorId === debtor.id) game.debt.creditorId = inheritor?.id ?? null;
  log(game, `${debtor.name} leaves the game.${teammate ? ` Their remaining cash and properties pass to teammate ${teammate.name} under the shared-team rule.` : creditor ? ` Their remaining cash and properties pass to ${creditor.name}, the player they owed money to.` : ' With no active teammate or player creditor, their properties return to the bank for anyone to buy.'}`, 'system', now);
  if (checkWinner(game, now)) return;
  if (game.auction) {
    if (!game.auction.passedIds.includes(debtor.id)) game.auction.passedIds.push(debtor.id);
    if (game.auction.highestBidderId === debtor.id) {
      game.auction.highestBid = 0;
      game.auction.highestBidderId = null;
      // Earlier bidders may rejoin when the standing bidder leaves.
      game.auction.passedIds = game.players.filter((item) => item.bankrupt).map((item) => item.id);
    }
    if (wasCurrent) closeAuction(game, now);
    else maybeCloseAuction(game, now);
  }
  if (wasCurrent) nextTurn(game, now);
}

function settleDebt(game: GameState, now: number): boolean {
  const debt = game.debt;
  if (!debt) return true;
  const debtor = player(game, debt.playerId);
  if (debtor.cash < debt.amount) return false;
  debtor.cash -= debt.amount;
  const creditor = debt.creditorId ? player(game, debt.creditorId) : null;
  if (creditor && !creditor.bankrupt) creditor.cash += debt.amount;
  else if (debt.fundsVacation) {
    game.vacationPot += debt.amount;
    log(game, `$${debt.amount} tax is added to the vacation jackpot. It now holds $${game.vacationPot}.`, 'event', now);
  }
  log(game, `${debtor.name} pays $${debt.amount}${creditor && !creditor.bankrupt ? ` to ${creditor.name}` : ' to the bank'} for ${debt.reason}.`, 'rent', now);
  game.phase = debt.afterPhase;
  game.debt = null;
  return true;
}

function charge(game: GameState, debtor: GamePlayer, amount: number, creditorId: string | null, reason: string, now: number, afterPhase: Phase = 'end', fundsVacation = false) {
  if (amount <= 0) { game.phase = afterPhase; return; }
  game.debt = { playerId: debtor.id, amount, creditorId, reason, afterPhase, fundsVacation };
  game.phase = 'debt';
  if (!settleDebt(game, now)) log(game, `${debtor.name} needs $${amount - debtor.cash} more for ${reason}. Sell buildings or sites to the bank${game.settings.mortgages ? ', mortgage properties' : ''}, arrange a trade, or declare bankruptcy.`, 'event', now);
}

function goToJail(game: GameState, moving: GamePlayer, now: number) {
  moving.position = tiles(game).findIndex((tile) => tile.kind === 'jail');
  if (moving.position < 0) moving.position = 0;
  moving.inJail = true;
  moving.jailTurns = 0;
  game.extraRoll = false;
  game.doubles = 0;
  game.phase = 'end';
  log(game, `${moving.name} goes to the timeout corner.`, 'event', now);
}

function move(game: GameState, moving: GamePlayer, distance: number, now: number) {
  const size = tiles(game).length;
  const laps = Math.floor((moving.position + distance) / size);
  moving.position = ((moving.position + distance) % size + size) % size;
  if (laps > 0) {
    moving.cash += START_BONUS * laps;
    log(game, `${moving.name} passes Start and collects $${START_BONUS * laps}.`, 'event', now);
  }
}

function randomIndex(rng: () => number, length: number) {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) fail('Random source returned an invalid value.');
  return Math.floor(value * length);
}

function land(game: GameState, moving: GamePlayer, rng: () => number, now: number, depth = 0) {
  const tile = tiles(game)[moving.position];
  game.phase = 'end';
  if (ownable(tile)) {
    const property = game.properties[tile.id];
    if (!property.ownerId) { game.phase = 'buy'; return; }
    const owner = player(game, property.ownerId);
    if (!allied(game, moving, owner)) charge(game, moving, getRent(game, tile.id), owner.id, `rent at ${tile.name}`, now);
  } else if (tile.kind === 'tax') {
    charge(game, moving, tile.amount ?? 100, null, tile.name, now, 'end', true);
  } else if (tile.kind === 'goToJail') {
    goToJail(game, moving, now);
  } else if (tile.kind === 'rest') {
    const amount = game.vacationPot;
    moving.cash += amount;
    game.vacationPot = 0;
    log(game, `${moving.name} collects the vacation pot: $${amount}.`, 'event', now);
  } else if (['treasure', 'surprise', 'chance'].includes(tile.kind) && depth < 4) {
    const map = getMap(game.mapId);
    const deck = tile.kind === 'treasure' ? map.treasureCards : map.surpriseCards;
    if (!deck.length) return;
    const card = deck[randomIndex(rng, deck.length)];
    log(game, `${moving.name} draws ${tile.kind === 'treasure' ? 'Treasure' : 'Surprise'} · ${card.title}: ${card.text}`, 'event', now);
    if (card.effect === 'cash') {
      const amount = card.amount ?? 0;
      if (amount >= 0) moving.cash += amount;
      else charge(game, moving, -amount, null, card.title, now);
    } else if (card.effect === 'repair') {
      const fee = Object.entries(game.properties).filter(([id]) => controlsProperty(game, moving.id, Number(id))).reduce((sum, [, property]) => sum + property.level * (card.amount ?? 25), 0);
      charge(game, moving, fee, null, card.title, now);
    } else if (card.effect === 'start') {
      moving.position = 0;
      const bonus = card.amount ?? START_BONUS;
      moving.cash += bonus;
      log(game, `${moving.name} returns to Start and collects $${bonus}.`, 'event', now);
    } else if (card.effect === 'jail') goToJail(game, moving, now);
    else if (card.effect === 'move') {
      move(game, moving, card.steps ?? 0, now);
      land(game, moving, rng, now, depth + 1);
    }
  }
}

function closeAuction(game: GameState, now: number) {
  const auction = game.auction;
  if (!auction) return;
  const tile = tileAt(game, auction.tileId);
  const bidder = auction.highestBidderId ? player(game, auction.highestBidderId) : null;
  if (bidder && !bidder.bankrupt && bidder.cash >= auction.highestBid) {
    bidder.cash -= auction.highestBid;
    game.properties[tile.id].ownerId = bidder.id;
    log(game, `${bidder.name} wins ${tile.name} at auction for $${auction.highestBid}.`, 'purchase', now);
  } else {
    log(game, `No bids for ${tile.name}. It stays with the bank.`, 'event', now);
  }
  game.auction = null;
  game.phase = 'end';
}

function maybeCloseAuction(game: GameState, now: number) {
  const auction = game.auction;
  if (!auction) return;
  const eligible = game.players.filter((item) => !item.bankrupt && !auction.passedIds.includes(item.id));
  if (eligible.length === 0 || (eligible.length === 1 && eligible[0].id === auction.highestBidderId)) closeAuction(game, now);
}

function assertManage(game: GameState, actor: GamePlayer, tileId: number, allowDebt = false) {
  if (current(game).id !== actor.id || (!['roll', 'end'].includes(game.phase) && !(allowDebt && game.phase === 'debt' && game.debt?.playerId === actor.id))) fail('Manage properties during your turn, before rolling or after resolving your move.');
  if (!integer(tileId)) fail('Choose a valid property.');
  const tile = tileAt(game, tileId);
  const property = game.properties[tileId];
  if (!property || !controlsProperty(game, actor.id, tileId)) fail('You can only manage your own or your team’s property.');
  return { tile, property };
}

function sellBuilding(game: GameState, actor: GamePlayer, tileId: number, now: number) {
  const { tile, property } = assertManage(game, actor, tileId, true);
  if (property.level <= 0) fail('This property has no buildings to sell.');
  if (game.settings.evenBuild && groupTiles(game, tile).some((item) => game.properties[item.id].level > property.level)) fail('Sell buildings evenly across the color group.');
  property.level -= 1;
  const refund = Math.floor((tile.buildCost ?? 0) / 2);
  actor.cash += refund;
  log(game, `${actor.name} sells a building at ${tile.name} for $${refund}.`, 'build', now);
  settleDebt(game, now);
}

function mortgage(game: GameState, actor: GamePlayer, tileId: number, now: number) {
  if (!game.settings.mortgages) fail('Mortgages are disabled in this room.');
  const { tile, property } = assertManage(game, actor, tileId, true);
  if (property.mortgaged) fail('This property is already mortgaged.');
  if (groupTiles(game, tile).some((item) => game.properties[item.id].level > 0)) fail('Sell all buildings in this color group before mortgaging.');
  property.mortgaged = true;
  const value = Math.floor((tile.price ?? 0) / 2);
  actor.cash += value;
  log(game, `${actor.name} mortgages ${tile.name} for $${value}.`, 'purchase', now);
  settleDebt(game, now);
}

export function canSellProperty(game: GameState, playerId: string, tileId: number): boolean {
  const tile = tiles(game).find((item) => item.id === tileId);
  const property = game.properties[tileId];
  if (!tile || !property || !controlsProperty(game, playerId, tileId) || property.mortgaged || current(game).id !== playerId) return false;
  if (!['roll', 'end'].includes(game.phase) && !(game.phase === 'debt' && game.debt?.playerId === playerId)) return false;
  return groupTiles(game, tile).every((item) => game.properties[item.id].level === 0);
}

function sellProperty(game: GameState, actor: GamePlayer, tileId: number, now: number) {
  const { tile, property } = assertManage(game, actor, tileId, true);
  if (property.mortgaged) fail('Clear this mortgage before selling the site to the bank. A mortgaged deed has already paid its half-price value.');
  if (groupTiles(game, tile).some((item) => game.properties[item.id].level > 0)) fail('Sell all buildings in this set before selling a site.');
  const refund = Math.floor((tile.price ?? 0) / 2);
  property.ownerId = null;
  property.level = 0;
  property.mortgaged = false;
  actor.cash += refund;
  log(game, `${actor.name} sells ${tile.name} back to the bank for $${refund} (half its printed price). The site is now unowned.`, 'purchase', now);
  settleDebt(game, now);
}

function autoSettleDebt(game: GameState, now: number) {
  if (!game.debt) return;
  const debtor = player(game, game.debt.playerId);
  const creditor = game.debt.creditorId;
  // Sell the highest eligible building first, preserving even development.
  while (game.debt) {
    const candidates = tiles(game).filter((tile) => controlsProperty(game, debtor.id, tile.id) && game.properties[tile.id].level > 0 && (!game.settings.evenBuild || groupTiles(game, tile).every((item) => game.properties[item.id].level <= game.properties[tile.id].level)));
    if (!candidates.length) break;
    candidates.sort((a, b) => game.properties[b.id].level - game.properties[a.id].level);
    sellBuilding(game, debtor, candidates[0].id, now);
  }
  for (const tile of tiles(game)) {
    if (!game.debt) return;
    const property = game.properties[tile.id];
    if (property && controlsProperty(game, debtor.id, tile.id) && !property.mortgaged && groupTiles(game, tile).every((item) => game.properties[item.id].level === 0)) {
      if (game.settings.mortgages) mortgage(game, debtor, tile.id, now);
      else sellProperty(game, debtor, tile.id, now);
    }
  }
  if (game.debt) bankrupt(game, debtor, creditor, now);
}

function validateTrade(game: GameState, trade: Trade) {
  const from = player(game, trade.fromId);
  const to = player(game, trade.toId);
  if (from.id === to.id || from.bankrupt || to.bankrupt) fail('Choose another active player to trade with.');
  if (!integer(trade.offeredCash) || !integer(trade.requestedCash)) fail('Trade cash must be a non-negative whole number.');
  if (trade.offeredCash > from.cash || trade.requestedCash > to.cash) fail('A player no longer has enough cash for this trade.');
  for (const [participant, incoming, outgoing] of [[from, trade.requestedCash, trade.offeredCash], [to, trade.offeredCash, trade.requestedCash]] as const) {
    const cashAfter = participant.cash + incoming - outgoing;
    if (game.auction?.highestBidderId === participant.id && cashAfter < game.auction.highestBid) fail('This trade would spend cash reserved for a standing auction bid.');
    if (game.debt?.playerId === participant.id && cashAfter < Math.min(participant.cash, game.debt.amount)) fail('This trade would spend cash needed for an unpaid debt. Offer a site or receive more cash instead.');
  }
  if (!Array.isArray(trade.offeredProperties) || !Array.isArray(trade.requestedProperties)) fail('Choose valid trade properties.');
  if (trade.offeredProperties.some((id) => trade.requestedProperties.includes(id))) fail('A property cannot be on both sides of a trade.');
  if (trade.offeredCash === 0 && trade.requestedCash === 0 && trade.offeredProperties.length === 0 && trade.requestedProperties.length === 0) fail('Add money or a property to the trade.');
  for (const [ids, owner] of [[trade.offeredProperties, from], [trade.requestedProperties, to]] as const) {
    if (new Set(ids).size !== ids.length || ids.length > tiles(game).length) fail('Each property can appear only once in a trade.');
    for (const id of ids) {
      if (!integer(id) || !controlsProperty(game, owner.id, id)) fail('A trade property is no longer controlled by the offering player or their team.');
      if (groupTiles(game, tileAt(game, id)).some((tile) => game.properties[tile.id].level > 0)) fail('Sell all buildings in a color group before trading its properties.');
    }
  }
}

function tradeRevision(trade: Trade): TradeRevision {
  return {
    version: trade.version, fromId: trade.fromId, toId: trade.toId,
    offeredCash: trade.offeredCash, requestedCash: trade.requestedCash,
    offeredProperties: [...trade.offeredProperties], requestedProperties: [...trade.requestedProperties], at: trade.updatedAt,
  };
}

// Upgrade persisted offers without changing the terms that players originally saw.
export function normalizeTradeHistory(game: GameState) {
  for (const trade of game.trades) {
    trade.version ??= 1;
    trade.updatedAt ??= trade.createdAt;
    if (!trade.revisions?.length) trade.revisions = [tradeRevision(trade)];
  }
}

function requireTradeVersion(trade: Trade, version: number | undefined) {
  // Older clients can answer an untouched original offer, never a counteroffer.
  if ((version === undefined && trade.version !== 1) || (version !== undefined && (!integer(version, 1) || version !== trade.version))) {
    fail('This trade has changed. View the latest terms before responding.');
  }
}

function resolveTrade(trade: Trade, status: Trade['status'], now: number, resolution: string) {
  trade.status = status;
  trade.updatedAt = now;
  trade.resolvedAt = now;
  trade.resolution = resolution;
}

function refreshTrades(game: GameState, now: number) {
  for (const trade of game.trades) {
    if (trade.status !== 'pending') continue;
    try { validateTrade(game, trade); }
    catch (error) {
      resolveTrade(trade, 'expired', now, error instanceof Error ? error.message : 'The offer is no longer valid.');
      log(game, `A trade from ${player(game, trade.fromId).name} to ${player(game, trade.toId).name} expires: ${trade.resolution}`, 'trade', now);
    }
  }
  game.trade = game.trades.find((trade) => trade.status === 'pending') ?? null;
}

function pendingTrade(game: GameState, actor: GamePlayer, offerId: string | undefined, responding: boolean) {
  const eligible = game.trades.filter((item) => item.status === 'pending' && (responding ? item.toId === actor.id : item.fromId === actor.id));
  if (!offerId && eligible.length > 1) fail('Choose the exact trade offer to update.');
  const trade = offerId ? game.trades.find((item) => item.id === offerId && item.status === 'pending') : eligible[0];
  if (!trade || (responding ? trade.toId !== actor.id : trade.fromId !== actor.id)) fail(responding ? 'There is no trade waiting for your response.' : 'There is no trade to cancel.');
  return trade;
}

export function createGame(players: Player[], settings: RoomSettings, now = Date.now(), rng: () => number = Math.random): GameState {
  settings = { ...DEFAULT_SETTINGS, ...settings, vacationCash: true };
  const map = getMap(settings.mapId);
  if (map.id !== settings.mapId) fail('Choose an available map.');
  if (!integer(settings.maxPlayers, 2, map.maxPlayers) || players.length < 2 || players.length > settings.maxPlayers) fail(`Games on ${map.name} need 2–${map.maxPlayers} players within the room limit.`);
  if (!integer(settings.startingCash, 200, 10_000)) fail('Starting cash must be between $200 and $10,000.');
  if (!integer(settings.teamCount, 2, 5)) fail('Invalid room settings.');
  for (const setting of ['doubleRent', 'vacationCash', 'auctions', 'rentInJail', 'mortgages', 'evenBuild', 'randomOrder', 'teams'] as const) if (typeof settings[setting] !== 'boolean') fail('Invalid room settings.');
  if (new Set(players.map((item) => item.id)).size !== players.length || players.some((item) => !item.id || !item.name)) fail('Every player needs a unique ID and a name.');
  if (settings.teams && (players.some((item) => !integer(item.team, 0, settings.teamCount - 1)) || new Set(players.map((item) => item.team)).size < 2)) fail('Team games need players on at least two different teams.');
  const game: GameState = {
    mapId: map.id, boardVersion: map.version,
    players: structuredClone(players).map((item) => ({ ...item, cash: settings.startingCash, position: 0, inJail: false, jailTurns: 0, bankrupt: false })),
    properties: Object.fromEntries(map.tiles.filter(ownable).map((tile) => [tile.id, { ownerId: null, level: 0, mortgaged: false }])),
    turnIndex: 0, phase: 'roll', dice: [1, 1], doubles: 0, extraRoll: false, round: 1, log: [], debt: null, auction: null, trade: null, trades: [], vacationPot: 0, winnerIds: [], turnStartedAt: now, settings: structuredClone(settings),
  };
  if (settings.randomOrder) for (let i = game.players.length - 1; i > 0; i--) {
    const j = randomIndex(rng, i + 1);
    [game.players[i], game.players[j]] = [game.players[j], game.players[i]];
  }
  log(game, `Welcome to ${map.name}! ${game.players[0].name} goes first.`, 'system', now);
  return game;
}

export function applyGameAction(source: GameState, playerId: string, action: GameAction, options: { rng?: () => number; now?: number } = {}): GameState {
  if (source.phase === 'finished') fail('This game is finished. Start a rematch to play again.');
  const game = structuredClone(source);
  game.settings = { ...DEFAULT_SETTINGS, ...game.settings, vacationCash: true };
  game.trades ??= game.trade ? [{ ...game.trade, status: 'pending', createdAt: game.turnStartedAt }] : [];
  normalizeTradeHistory(game);
  game.vacationPot ??= 0;
  const actor = player(game, playerId);
  if (actor.bankrupt) fail('You are out of this game.');
  const now = options.now ?? Date.now();
  const rng = options.rng ?? Math.random;
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') fail('Invalid game action.');
  const requireTurn = (...phases: Phase[]) => {
    if (current(game).id !== playerId) fail('Wait for your turn.');
    if (!phases.includes(game.phase)) fail('Finish the current action first.');
  };

  switch (action.type) {
    case 'roll': {
      requireTurn('roll');
      game.dice = [randomIndex(rng, 6) + 1, randomIndex(rng, 6) + 1];
      const doubles = game.dice[0] === game.dice[1];
      const total = game.dice[0] + game.dice[1];
      log(game, `${actor.name} rolls ${game.dice[0]} + ${game.dice[1]}.`, 'roll', now);
      if (actor.inJail) {
        game.extraRoll = false;
        if (doubles) {
          actor.inJail = false;
          actor.jailTurns = 0;
          log(game, `${actor.name} rolls doubles and leaves the timeout corner.`, 'event', now);
        } else {
          actor.jailTurns += 1;
          if (actor.jailTurns < 3) { game.phase = 'end'; break; }
          actor.inJail = false;
          actor.jailTurns = 0;
          charge(game, actor, BAIL, null, 'mandatory bail after three attempts', now);
          if (game.debt) autoSettleDebt(game, now);
          if (actor.bankrupt || game.phase === 'finished') break;
        }
      } else {
        game.extraRoll = doubles;
        game.doubles = doubles ? game.doubles + 1 : 0;
        if (game.doubles >= 3) { goToJail(game, actor, now); break; }
      }
      move(game, actor, total, now);
      land(game, actor, rng, now);
      break;
    }
    case 'buy': {
      requireTurn('buy');
      const tile = tiles(game)[actor.position];
      const property = game.properties[tile.id];
      if (!property || property.ownerId) fail('This property is no longer available.');
      if (actor.cash < (tile.price ?? Infinity)) fail('You need more cash. Send this property to auction instead.');
      actor.cash -= tile.price!;
      property.ownerId = actor.id;
      game.phase = 'end';
      log(game, `${actor.name} buys ${tile.name} for $${tile.price}.`, 'purchase', now);
      break;
    }
    case 'decline': {
      requireTurn('buy');
      const tile = tiles(game)[actor.position];
      if (!game.settings.auctions) {
        game.phase = 'end';
        log(game, `${actor.name} skips ${tile.name}; it stays with the bank.`, 'event', now);
        break;
      }
      game.phase = 'auction';
      game.auction = { tileId: tile.id, highestBid: 0, highestBidderId: null, passedIds: game.players.filter((item) => item.bankrupt || item.cash < 1).map((item) => item.id) };
      log(game, `${tile.name} goes to auction. Everyone may bid; passing is final for this auction.`, 'event', now);
      maybeCloseAuction(game, now);
      break;
    }
    case 'bid': {
      if (game.phase !== 'auction' || !game.auction) fail('There is no auction right now.');
      if (game.auction.passedIds.includes(actor.id)) fail('You have already passed in this auction.');
      if (!integer(action.amount, game.auction.highestBid + 1) || action.amount > actor.cash) fail('Bid a whole dollar amount above the current bid and within your cash balance.');
      game.auction.highestBid = action.amount;
      game.auction.highestBidderId = actor.id;
      log(game, `${actor.name} bids $${action.amount}.`, 'purchase', now);
      maybeCloseAuction(game, now);
      game.turnStartedAt = now;
      break;
    }
    case 'passAuction': {
      if (game.phase !== 'auction' || !game.auction) fail('There is no auction right now.');
      if (game.auction.highestBidderId === actor.id) fail('The highest bidder cannot withdraw their bid.');
      if (game.auction.passedIds.includes(actor.id)) fail('You have already passed.');
      game.auction.passedIds.push(actor.id);
      log(game, `${actor.name} passes in the auction.`, 'event', now);
      maybeCloseAuction(game, now);
      game.turnStartedAt = now;
      break;
    }
    case 'endTurn': {
      requireTurn('end');
      if (game.extraRoll) {
        game.phase = 'roll';
        game.extraRoll = false;
        log(game, `${actor.name} rolled doubles and gets another roll.`, 'event', now);
      } else nextTurn(game, now);
      break;
    }
    case 'build': {
      if (!integer(action.tileId) || !canBuild(game, actor.id, action.tileId)) fail('To build, own this property, control its full unmortgaged color group, build evenly, and have enough cash.');
      const tile = tileAt(game, action.tileId);
      actor.cash -= tile.buildCost!;
      game.properties[tile.id].level += 1;
      log(game, `${actor.name} ${game.properties[tile.id].level === 5 ? 'opens a landmark' : 'adds a building'} at ${tile.name}.`, 'build', now);
      break;
    }
    case 'sellBuilding': sellBuilding(game, actor, action.tileId, now); break;
    case 'sellProperty': sellProperty(game, actor, action.tileId, now); break;
    case 'mortgage': mortgage(game, actor, action.tileId, now); break;
    case 'unmortgage': {
      const { tile, property } = assertManage(game, actor, action.tileId);
      const amount = Math.ceil(Math.floor((tile.price ?? 0) / 2) * 11 / 10);
      if (!property.mortgaged) fail('This property is not mortgaged.');
      if (actor.cash < amount) fail(`You need $${amount} to clear this mortgage.`);
      actor.cash -= amount;
      property.mortgaged = false;
      log(game, `${actor.name} clears the mortgage on ${tile.name} for $${amount}.`, 'purchase', now);
      break;
    }
    case 'offerTrade': {
      if (!Array.isArray(action.offeredProperties) || !Array.isArray(action.requestedProperties)) fail('Choose valid trade properties.');
      if (game.trades.filter((trade) => trade.status === 'pending' && trade.fromId === actor.id).length >= 10) fail('You can have up to 10 active trade offers. Cancel an older offer first.');
      const trade: Trade = { id: `${now}:${actor.id}:${game.trades.length + 1}`, fromId: actor.id, toId: action.toId, offeredCash: action.offeredCash, requestedCash: action.requestedCash, offeredProperties: [...action.offeredProperties], requestedProperties: [...action.requestedProperties], version: 1, revisions: [], status: 'pending', createdAt: now, updatedAt: now };
      validateTrade(game, trade);
      trade.revisions.push(tradeRevision(trade));
      game.trades.push(trade);
      log(game, `${actor.name} offers a trade to ${player(game, trade.toId).name}.`, 'trade', now);
      break;
    }
    case 'counterTrade': {
      if (typeof action.offerId !== 'string' || !action.offerId || !integer(action.offerVersion, 1)) fail('Choose the exact trade and version to negotiate.');
      if (!Array.isArray(action.offeredProperties) || !Array.isArray(action.requestedProperties)) fail('Choose valid trade properties.');
      const trade = pendingTrade(game, actor, action.offerId, true);
      requireTradeVersion(trade, action.offerVersion);
      const proposed: Trade = {
        ...trade, fromId: actor.id, toId: trade.fromId,
        offeredCash: action.offeredCash, requestedCash: action.requestedCash,
        offeredProperties: [...action.offeredProperties], requestedProperties: [...action.requestedProperties],
        version: trade.version + 1, updatedAt: now,
      };
      validateTrade(game, proposed);
      Object.assign(trade, proposed);
      trade.revisions.push(tradeRevision(trade));
      log(game, `${actor.name} negotiates trade version ${trade.version} with ${player(game, trade.toId).name}. Review the updated terms.`, 'trade', now);
      break;
    }
    case 'respondTrade': {
      if (typeof action.accept !== 'boolean') fail('Choose whether to accept the trade.');
      const trade = pendingTrade(game, actor, action.offerId, true);
      requireTradeVersion(trade, action.offerVersion);
      if (action.accept) {
        validateTrade(game, trade);
        const from = player(game, trade.fromId);
        from.cash += trade.requestedCash - trade.offeredCash;
        actor.cash += trade.offeredCash - trade.requestedCash;
        for (const id of trade.offeredProperties) game.properties[id].ownerId = actor.id;
        for (const id of trade.requestedProperties) game.properties[id].ownerId = from.id;
        resolveTrade(trade, 'accepted', now, `${actor.name} accepted this offer.`);
        log(game, `${actor.name} accepts ${from.name}'s trade.`, 'trade', now);
        settleDebt(game, now);
      } else {
        resolveTrade(trade, 'declined', now, `${actor.name} declined this offer.`);
        log(game, `${actor.name} declines ${player(game, trade.fromId).name}'s trade.`, 'trade', now);
      }
      break;
    }
    case 'cancelTrade': {
      const trade = pendingTrade(game, actor, action.offerId, false);
      requireTradeVersion(trade, action.offerVersion);
      resolveTrade(trade, 'cancelled', now, `${actor.name} withdrew this offer.`);
      log(game, `${actor.name} cancels their trade with ${player(game, trade.toId).name}.`, 'trade', now);
      break;
    }
    case 'payBail': {
      requireTurn('roll');
      if (!actor.inJail) fail('You are not in the timeout corner.');
      if (actor.cash < BAIL) fail('You need $50 for bail, or you can try rolling doubles.');
      actor.cash -= BAIL;
      actor.inJail = false;
      actor.jailTurns = 0;
      log(game, `${actor.name} pays $50 bail.`, 'event', now);
      break;
    }
    case 'surrender': {
      const creditorId = game.debt?.playerId === actor.id ? game.debt.creditorId : null;
      bankrupt(game, actor, creditorId, now);
      break;
    }
    case 'claimTurn': {
      if (current(game).id === actor.id) fail('You cannot skip your own turn this way.');
      if (now - game.turnStartedAt < TURN_TIMEOUT) fail('A turn can be skipped after 3 minutes of inactivity.');
      const staleId = current(game).id;
      log(game, `${actor.name} skips ${current(game).name}'s inactive turn.`, 'system', now);
      if (game.auction) closeAuction(game, now);
      if (game.debt) autoSettleDebt(game, now);
      if (game.phase !== 'finished' && current(game).id === staleId) nextTurn(game, now);
      break;
    }
    default: fail('Unknown game action.');
  }
  refreshTrades(game, now);
  if (current(game).id === actor.id && !['claimTurn', 'offerTrade', 'counterTrade', 'respondTrade', 'cancelTrade'].includes(action.type)) game.turnStartedAt = now;
  return game;
}
