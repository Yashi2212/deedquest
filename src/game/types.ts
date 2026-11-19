export type TileKind = 'start' | 'property' | 'station' | 'utility' | 'chance' | 'treasure' | 'surprise' | 'tax' | 'jail' | 'rest' | 'goToJail';
export interface Tile {
  countryCode?: string;
  countryName?: string;
  region?: string;
  placeIcon?: string;
  placeIconLabel?: string;
  id: number;
  name: string;
  kind: TileKind;
  group?: string;
  color?: string;
  price?: number;
  rents?: number[];
  buildCost?: number;
  amount?: number;
}
export interface AdventureCard {
  id: string;
  title: string;
  text: string;
  effect: 'cash' | 'repair' | 'move' | 'jail' | 'start';
  amount?: number;
  steps?: number;
}
export interface BoardMap {
  id: string;
  version: number;
  name: string;
  subtitle: string;
  description: string;
  tag: string;
  theme: string;
  accent: string;
  background: string;
  artwork: string;
  size: number;
  maxPlayers: number;
  rules: string[];
  treasureCards: AdventureCard[];
  surpriseCards: AdventureCard[];
  tiles: Tile[];
}
export interface RoomSettings {
  mapId: string;
  maxPlayers: number;
  teams: boolean;
  teamCount: number;
  startingCash: number;
  doubleRent: boolean;
  vacationCash: boolean;
  auctions: boolean;
  rentInJail: boolean;
  mortgages: boolean;
  evenBuild: boolean;
  randomOrder: boolean;
}
export interface Player {
  bot?: boolean;
  id: string;
  name: string;
  color: string;
  tokenIndex: number;
  team: number;
  ready: boolean;
}
export interface GamePlayer extends Player {
  cash: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  bankrupt: boolean;
}
export interface PropertyState { ownerId: string | null; level: number; mortgaged: boolean }
export type Phase = 'roll' | 'buy' | 'auction' | 'end' | 'debt' | 'finished';
export interface GameLog { id: string; text: string; kind: 'roll' | 'purchase' | 'rent' | 'event' | 'build' | 'trade' | 'system'; at: number }
export interface Debt { playerId: string; creditorId: string | null; amount: number; reason: string; afterPhase: Phase; fundsVacation?: boolean }
export interface Auction { tileId: number; highestBid: number; highestBidderId: string | null; passedIds: string[] }
export interface TradeRevision {
  readonly version: number;
  readonly fromId: string;
  readonly toId: string;
  readonly offeredCash: number;
  readonly requestedCash: number;
  readonly offeredProperties: readonly number[];
  readonly requestedProperties: readonly number[];
  readonly at: number;
}
export interface Trade {
  id: string;
  fromId: string;
  toId: string;
  offeredCash: number;
  requestedCash: number;
  offeredProperties: number[];
  requestedProperties: number[];
  version: number;
  revisions: TradeRevision[];
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
  resolution?: string;
}
export interface GameState {
  mapId: string;
  boardVersion: number;
  players: GamePlayer[];
  properties: Record<number, PropertyState>;
  turnIndex: number;
  phase: Phase;
  dice: [number, number];
  doubles: number;
  extraRoll: boolean;
  round: number;
  log: GameLog[];
  debt: Debt | null;
  auction: Auction | null;
  trade: Trade | null;
  trades: Trade[];
  vacationPot: number;
  winnerIds: string[];
  turnStartedAt: number;
  settings: RoomSettings;
}
export type GameAction =
  | { type: 'roll' }
  | { type: 'buy' }
  | { type: 'decline' }
  | { type: 'bid'; amount: number }
  | { type: 'passAuction' }
  | { type: 'endTurn' }
  | { type: 'build'; tileId: number }
  | { type: 'sellBuilding'; tileId: number }
  | { type: 'sellProperty'; tileId: number }
  | { type: 'mortgage'; tileId: number }
  | { type: 'unmortgage'; tileId: number }
  | { type: 'offerTrade'; toId: string; offeredCash: number; requestedCash: number; offeredProperties: number[]; requestedProperties: number[] }
  | { type: 'counterTrade'; offerId: string; offerVersion: number; offeredCash: number; requestedCash: number; offeredProperties: number[]; requestedProperties: number[] }
  | { type: 'respondTrade'; offerId?: string; offerVersion?: number; accept: boolean }
  | { type: 'cancelTrade'; offerId?: string; offerVersion?: number }
  | { type: 'payBail' }
  | { type: 'surrender' }
  | { type: 'claimTurn' };
export type RoomAction = GameAction
  | { type: 'appearance'; color: string; tokenIndex: number }
  | { type: 'addBot' }
  | { type: 'botTick' }
  | { type: 'settings'; settings: Partial<RoomSettings> }
  | { type: 'ready'; ready: boolean }
  | { type: 'team'; team: number }
  | { type: 'start' }
  | { type: 'leave' }
  | { type: 'kick'; playerId: string }
  | { type: 'voteKick'; playerId: string; vote: boolean }
  | { type: 'rematch' }
  | { type: 'chat'; text: string; channel?: 'general' | 'team' };
export interface ChatMessage { id: string; playerId: string; name: string; text: string; at: number; channel: 'general' | 'team'; team: number | null }
export interface PublicRoom {
  /** Target player ID to human voters. Optional for rooms saved before voting existed. */
  kickVotes?: Record<string, string[]>;
  /** Authenticated human room members; all except the target must agree. */
  kickEligibleVoterIds?: string[];
  code: string;
  hostId: string;
  settings: RoomSettings;
  players: Player[];
  game: GameState | null;
  revision: number;
  createdAt: number;
  updatedAt: number;
  chat: ChatMessage[];
}
export interface Session { code: string; token: string; playerId: string }
export interface ApiResult { room: PublicRoom; session?: Session }
export const LEGACY_PLAYER_COLORS = ['#fb9266', '#64b5ed', '#bf8fe8', '#f2c85b', '#63d5b1', '#f18eb9', '#a3c66b', '#929df0', '#ef7783', '#62d6df'];
export const PLAYER_COLORS = ['#ff7a18', '#168bff', '#9d55ff', '#ffe129', '#15c96a', '#ff4bcb', '#b4e51c', '#eeeef2', '#ff334b', '#00d7e8'];
export const TEAM_NAMES = ['Ember Crew', 'Tide Crew', 'Moon Crew', 'Grove Crew', 'Aurora Crew'];
export const TEAM_COLORS = ['#fb9266', '#64b5ed', '#bf8fe8', '#63d5b1', '#f2c85b'];
export const DEFAULT_SETTINGS: RoomSettings = { mapId: 'ember', maxPlayers: 8, teams: false, teamCount: 2, startingCash: 1500, doubleRent: true, vacationCash: true, auctions: true, rentInJail: true, mortgages: true, evenBuild: true, randomOrder: false };
