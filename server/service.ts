import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { applyGameAction, createGame, normalizeTradeHistory } from '../src/game/engine.js';
import { MAPS } from '../src/game/maps.js';
import { DEFAULT_SETTINGS, LEGACY_PLAYER_COLORS, PLAYER_COLORS, type ApiResult, type Player, type PublicRoom, type RoomAction, type RoomSettings, type Session } from '../src/game/types.js';
import type { RoomStore, StoredRoom } from './store.js';
import { chooseBotAction } from './bots.js';

export class RoomError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const assert = (condition: unknown, message: string, status = 400): void => { if (!condition) throw new RoomError(message, status); };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GAME_ACTIONS = new Set(['roll', 'buy', 'decline', 'bid', 'passAuction', 'endTurn', 'build', 'sellBuilding', 'sellProperty', 'mortgage', 'unmortgage', 'offerTrade', 'counterTrade', 'respondTrade', 'cancelTrade', 'payBail', 'surrender', 'claimTurn']);
// Auction decisions must target the exact state the player saw: a delayed pass
// or bid must never carry over into a different auction.
const FLEXIBLE_ACTIONS = new Set(['chat', 'ready', 'team', 'leave', 'surrender', 'claimTurn', 'botTick', 'offerTrade', 'voteKick']);
const RECORD_LIMIT = 96;
const BOT_INTERVAL_MS = 1_200;
const BOT_NAMES = ['Pixel', 'Nova', 'Bolt', 'Orbit', 'Echo', 'Pip', 'Comet', 'Ziggy', 'Fable', 'Mochi'];
const secureRng = () => randomInt(0, 0x1_0000_0000) / 0x1_0000_0000;

export function publicRoom(room: StoredRoom, viewerId?: string): PublicRoom {
  const viewer = room.players.find((player) => player.id === viewerId && room.auth[player.id]);
  const chat = room.chat.filter((message) => message.channel !== 'team' || (room.settings.teams && viewer && message.team === viewer.team));
  return structuredClone({ code: room.code, hostId: room.hostId, settings: room.settings, players: room.players, game: room.game, revision: room.revision, createdAt: room.createdAt, updatedAt: room.updatedAt, chat, kickVotes: room.kickVotes ?? {}, kickEligibleVoterIds: eligibleKickVoters(room) });
}

export function normalizeCode(value: unknown): string {
  assert(typeof value === 'string', 'Enter an eight-character room code.');
  const code = (value as string).trim().toUpperCase();
  assert(/^[A-Z2-9]{8}$/.test(code), 'Enter an eight-character room code.');
  return code;
}

function requestId(value: unknown): string {
  assert(typeof value === 'string' && /^[A-Za-z0-9_-]{16,80}$/.test(value), 'A valid request ID is required.');
  return value as string;
}

function name(value: unknown): string {
  assert(typeof value === 'string', 'Enter a name for the table.');
  const clean = (value as string).normalize('NFKC').trim().replace(/\s+/g, ' ');
  assert(clean.length >= 1 && [...clean].length <= 24 && !/[\x00-\x1f\x7f]/.test(clean), 'Use a name between 1 and 24 characters.');
  return clean;
}

export function validateSettings(value: unknown, base: RoomSettings = DEFAULT_SETTINGS): RoomSettings {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), 'Choose valid room settings.');
  const partial = value as Record<string, unknown>;
  const booleans = ['teams', 'doubleRent', 'vacationCash', 'auctions', 'rentInJail', 'mortgages', 'evenBuild', 'randomOrder'] as const;
  const keys = ['mapId', 'maxPlayers', 'teamCount', 'startingCash', ...booleans];
  assert(Object.keys(partial).every((key) => keys.includes(key)), 'Unknown room setting.');
  const result = { ...DEFAULT_SETTINGS, ...base, ...partial } as RoomSettings;
  delete (result as RoomSettings & { roundLimit?: unknown }).roundLimit;
  assert(typeof result.mapId === 'string' && MAPS.some((map) => map.id === result.mapId), 'Choose an available map.');
  const map = MAPS.find((map) => map.id === result.mapId)!;
  // A map-only change keeps the chosen seat count where possible. An explicit
  // oversized limit is a mistake, while a smaller map can clamp a previous limit.
  if (partial.maxPlayers === undefined) result.maxPlayers = Math.min(result.maxPlayers, map.maxPlayers);
  assert(Number.isInteger(result.maxPlayers) && result.maxPlayers >= 2 && result.maxPlayers <= map.maxPlayers, `Choose between 2 and ${map.maxPlayers} seats for this map.`);
  for (const key of booleans) assert(typeof result[key] === 'boolean', `${key} must be on or off.`);
  result.vacationCash = true; // Tax jackpots are part of every game; keep the legacy key compatible.
  const maxTeams = Math.floor(map.maxPlayers / 2);
  if (partial.teamCount === undefined) result.teamCount = Math.min(result.teamCount, maxTeams);
  assert(Number.isInteger(result.teamCount) && result.teamCount >= 2 && result.teamCount <= maxTeams, `Choose between 2 and ${maxTeams} teams for this map.`);
  assert([1000, 1500, 2000].includes(result.startingCash), 'Starting cash must be $1,000, $1,500, or $2,000.');
  return result;
}

function newPlayer(displayName: string, tokenIndex: number, teamCount: number, host = false, color = PLAYER_COLORS[tokenIndex]): Player {
  return { id: randomBytes(12).toString('hex'), name: displayName, color, tokenIndex, team: tokenIndex % teamCount, ready: host };
}

// Retry receipts are encrypted, never included in the public projection. Authentication
// always compares token hashes; request IDs alone cannot read a room or take a turn.
function seal(room: StoredRoom, value: object): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(room.joinKey, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

function unseal(room: StoredRoom, value: string): { session: Session; fingerprint: string } {
  const [iv, tag, encrypted] = value.split('.');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(room.joinKey, 'hex'), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8'));
}

function sessionFor(room: StoredRoom, player: Player): Session {
  const token = randomBytes(32).toString('base64url');
  room.auth[player.id] = hash(token);
  return { code: room.code, playerId: player.id, token };
}

function recoverSession(room: StoredRoom, key: string, fingerprint: string): Session | null {
  const receipt = room.joins[key];
  if (!receipt) return null;
  const recovered = unseal(room, receipt);
  assert(recovered.fingerprint === fingerprint, 'This request ID has already been used for a different request.', 409);
  assert(room.auth[recovered.session.playerId] === hash(recovered.session.token), 'This room session has ended. Join again with a new request.', 403);
  return recovered.session;
}

function authenticate(room: StoredRoom, token: unknown): string {
  assert(typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token), 'Your room session is missing. Join the room again.', 401);
  const digest = Buffer.from(hash(token as string), 'hex');
  const id = Object.keys(room.auth).find((playerId) => {
    const stored = Buffer.from(room.auth[playerId], 'hex');
    return stored.length === digest.length && timingSafeEqual(stored, digest);
  });
  assert(id, 'This session cannot access this room. Join the room again.', 403);
  return id!;
}

function eligibleKickVoters(room: StoredRoom): string[] {
  return room.players.filter((item) => !item.bot && room.auth[item.id]).map((item) => item.id);
}

function removeSession(room: StoredRoom, playerId: string) {
  room.kickVotes = {};
  delete room.auth[playerId];
  delete room.requests[playerId];
  // Keep encrypted join receipts so a retry cannot resurrect a removed player.
}

function nextHost(room: StoredRoom) {
  if (!room.auth[room.hostId]) {
    room.hostId = room.players.find((item) => !item.bot && room.auth[item.id] && !room.game?.players.find((player) => player.id === item.id)?.bankrupt)?.id
      ?? room.players.find((item) => !item.bot && room.auth[item.id])?.id ?? '';
    const host = room.players.find((item) => item.id === room.hostId);
    if (host) host.ready = true;
  }
}

export class RoomService {
  constructor(private store: RoomStore) {}

  private async load(code: string): Promise<StoredRoom> {
    const room = await this.store.get(code);
    assert(room, 'This room is no longer available. Ask your friend for a new invite.', 404);
    assert(MAPS.some((map) => map.id === room!.settings.mapId) && (!room!.game || Array.isArray(room!.game.trades)), 'This room uses an older game version. Create a new room to play the updated maps.', 410);
    assert(!room!.game || (room!.game.boardVersion ?? 1) === MAPS.find(map => map.id === room!.game!.mapId)?.version, 'This board has changed to require complete multi-site monopolies. Create a new room to use the corrected map; your old match cannot be converted fairly.', 410);
    if (room!.game) normalizeTradeHistory(room!.game);
    // Existing rooms continue with the same players and assets. The removed
    // setting must not end an in-progress match or reappear in its public state.
    delete (room!.settings as RoomSettings & { roundLimit?: unknown }).roundLimit;
    if (room!.game) delete (room!.game.settings as RoomSettings & { roundLimit?: unknown }).roundLimit;
    room!.settings.vacationCash = true;
    if (room!.game) room!.game.settings.vacationCash = true;
    const usedColors = new Set<string>();
    for (const participant of room!.players) {
      const legacyIndex = LEGACY_PLAYER_COLORS.indexOf(participant.color);
      const desired = legacyIndex < 0 ? participant.color : PLAYER_COLORS[legacyIndex];
      participant.color = PLAYER_COLORS.includes(desired) && !usedColors.has(desired) ? desired : PLAYER_COLORS.find((color) => !usedColors.has(color))!;
      usedColors.add(participant.color);
      const inGame = room!.game?.players.find((item) => item.id === participant.id);
      if (inGame) inGame.color = participant.color;
    }
    return room!;
  }

  async get(rawCode: unknown, token: unknown, revision?: unknown): Promise<ApiResult | null> {
    const room = await this.load(normalizeCode(rawCode));
    const playerId = authenticate(room, token);
    if (typeof revision === 'string' && /^\d+$/.test(revision) && Number(revision) === room.revision) return null;
    return { room: publicRoom(room, playerId) };
  }

  async create(input: Record<string, unknown>, ip: string): Promise<ApiResult> {
    assert(await this.store.rateLimit(`entry:${ip}`, 60, 3600), 'Too many room requests. Please try again later.', 429);
    const id = requestId(input.requestId);
    const displayName = name(input.name);
    const settings = validateSettings(input.settings ?? {});
    const key = hash(`create:${id}`);
    const fingerprint = hash(JSON.stringify({ name: displayName, settings }));
    // A UUID-derived random-looking code makes a create retry idempotent without a
    // second index. 40 bits of code entropy; session secrets remain 256 bits.
    const entropy = createHash('sha256').update(`common-ground:create:${id}`).digest();
    const code = Array.from(entropy.subarray(0, 8), (byte) => ALPHABET[byte & 31]).join('');
    const existing = await this.store.get(code);
    if (existing) {
      const recovered = recoverSession(existing, key, fingerprint);
      assert(recovered, 'This room code is busy. Try creating another room.', 409);
      return { room: publicRoom(existing, recovered!.playerId), session: recovered! };
    }
    const now = Date.now();
    const host = newPlayer(displayName, 0, settings.teamCount, true);
    const room: StoredRoom = { code, hostId: host.id, settings, players: [host], game: null, revision: 1, createdAt: now, updatedAt: now, chat: [], auth: {}, joinKey: randomBytes(32).toString('hex'), joins: {}, requests: {} };
    const session = sessionFor(room, host);
    room.joins[key] = seal(room, { session, fingerprint });
    if (await this.store.create(room)) return { room: publicRoom(room, session.playerId), session };
    const winner = await this.load(code);
    const recovered = recoverSession(winner, key, fingerprint);
    assert(recovered, 'This room code is busy. Try creating another room.', 409);
    return { room: publicRoom(winner, recovered!.playerId), session: recovered! };
  }

  async join(input: Record<string, unknown>, ip: string): Promise<ApiResult> {
    assert(await this.store.rateLimit(`entry:${ip}`, 60, 3600), 'Too many room requests. Please try again later.', 429);
    const code = normalizeCode(input.code);
    const id = requestId(input.requestId);
    const displayName = name(input.name);
    const key = hash(`join:${id}`);
    const fingerprint = hash(JSON.stringify({ name: displayName, code }));
    for (let attempt = 0; attempt < 16; attempt++) {
      const room = await this.load(code);
      const recovered = recoverSession(room, key, fingerprint);
      if (recovered) return { room: publicRoom(room, recovered.playerId), session: recovered };
      assert(!room.game, 'This game has already started. Ask the host to finish it and open a rematch.', 409);
      assert(room.players.length < room.settings.maxPlayers, 'This table is full.', 409);
      assert(!room.players.some((item) => item.name.toLocaleLowerCase() === displayName.toLocaleLowerCase()), 'Someone at this table already uses that name. Choose another.');
      const tokenIndex = Array.from({ length: PLAYER_COLORS.length }, (_, index) => index).find((index) => !room.players.some((item) => item.tokenIndex === index))!;
      const color = PLAYER_COLORS.find((candidate) => !room.players.some((item) => item.color === candidate));
      assert(color, 'This table has no available colors.', 409);
      const joining = newPlayer(displayName, tokenIndex, room.settings.teamCount, !room.hostId, color!);
      const session = sessionFor(room, joining);
      const revision = room.revision;
      room.players.push(joining);
      room.kickVotes = {};
      if (!room.hostId) room.hostId = joining.id;
      room.joins[key] = seal(room, { session, fingerprint });
      // Bound old retry receipts while retaining current players' receipts.
      if (Object.keys(room.joins).length > 128) delete room.joins[Object.keys(room.joins)[0]];
      room.revision++;
      room.updatedAt = Date.now();
      if (await this.store.compareAndSwap(code, revision, room)) return { room: publicRoom(room, session.playerId), session };
    }
    throw new RoomError('The table is busy. Please try joining again.', 409);
  }

  async action(input: Record<string, unknown>, token: unknown): Promise<ApiResult> {
    const code = normalizeCode(input.code);
    const id = requestId(input.requestId);
    assert(input.action && typeof input.action === 'object' && !Array.isArray(input.action), 'Choose a valid room action.');
    const action = input.action as RoomAction;
    assert(typeof action.type === 'string', 'Choose a valid room action.');
    assert(Number.isSafeInteger(input.revision) && (input.revision as number) >= 0, 'A valid room revision is required.');
    const fingerprint = hash(JSON.stringify(action));
    let rateChecked = false;
    for (let attempt = 0; attempt < 16; attempt++) {
      const room = await this.load(code);
      const playerId = authenticate(room, token);
      const previous = room.requests[playerId]?.find((value) => value.startsWith(`${id}:`));
      if (previous) {
        assert(previous === `${id}:${fingerprint}`, 'This request ID has already been used for another action.', 409);
        return { room: publicRoom(room, playerId) };
      }
      if (!rateChecked) {
        assert(await this.store.rateLimit(`actions:${code}:${playerId}`, 120, 60), 'You are moving a little too quickly. Try again in a moment.', 429);
        rateChecked = true;
      }
      const exactTradeResponse = (action.type === 'respondTrade' || action.type === 'cancelTrade' || action.type === 'counterTrade') && typeof action.offerId === 'string';
      if (!FLEXIBLE_ACTIONS.has(action.type) && !exactTradeResponse) assert(input.revision === room.revision, 'The table changed while you were deciding. Try your move again.', 409);
      const actor = room.players.find((item) => item.id === playerId);
      assert(actor, 'Your seat is no longer at this table.', 403);
      const hostOnly = () => assert(room.hostId === playerId, 'Only the host can do that.', 403);
      const lobbyOnly = () => assert(!room.game, 'This setting can only change in the lobby.', 409);
      const revision = room.revision;
      const now = Date.now();

      switch (action.type) {
        case 'appearance': {
          lobbyOnly();
          assert(typeof action.color === 'string' && PLAYER_COLORS.includes(action.color), 'Choose an available player color.');
          assert(Number.isInteger(action.tokenIndex) && action.tokenIndex >= 0 && action.tokenIndex < 10, 'Choose an available player token.');
          assert(!room.players.some((item) => item.id !== playerId && item.color === action.color), 'Another player already uses that color. Choose a different color.', 409);
          actor!.color = action.color;
          actor!.tokenIndex = action.tokenIndex;
          break;
        }
        case 'settings': {
          hostOnly(); lobbyOnly();
          const settings = validateSettings(action.settings, room.settings);
          assert(settings.maxPlayers >= room.players.length, 'There are already more players than that seat limit.');
          room.settings = settings;
          for (const item of room.players) { item.team %= settings.teamCount; item.ready = item.bot === true || item.id === room.hostId; }
          break;
        }
        case 'addBot': {
          hostOnly(); lobbyOnly();
          assert(room.players.length < room.settings.maxPlayers, 'This table is full.', 409);
          const tokenIndex = PLAYER_COLORS.findIndex((_, index) => !room.players.some((item) => item.tokenIndex === index));
          assert(tokenIndex >= 0, 'This table is full.', 409);
          const color = PLAYER_COLORS.find((candidate) => !room.players.some((item) => item.color === candidate));
          assert(color, 'This table has no available colors.', 409);
          const usedNames = new Set(room.players.map((item) => item.name.toLocaleLowerCase()));
          let botName = BOT_NAMES.find((candidate) => !usedNames.has(`${candidate} Bot`.toLocaleLowerCase()));
          let suffix = 1;
          while (!botName) {
            const candidate = `Pixel ${suffix++}`;
            if (!usedNames.has(`${candidate} Bot`.toLocaleLowerCase())) botName = candidate;
          }
          const bot = newPlayer(`${botName} Bot`, tokenIndex, room.settings.teamCount, true, color!);
          bot.bot = true;
          const teams = Array.from({ length: room.settings.teamCount }, (_, team) => ({ team, count: room.players.filter((item) => item.team === team).length }));
          teams.sort((a, b) => a.count - b.count || a.team - b.team);
          bot.team = teams[0].team;
          room.players.push(bot);
          room.kickVotes = {};
          break;
        }
        case 'botTick': {
          // Any authenticated human can wake bots, but the server selects both
          // the bot and its ordinary engine action. CAS plus this timestamp keep
          // multiple open browsers from speeding up or duplicating a bot turn.
          assert(!actor!.bot, 'Only a human player can advance bots.', 403);
          if (!room.game || room.game.phase === 'finished' || now - (room.botActedAt ?? 0) < BOT_INTERVAL_MS) return { room: publicRoom(room, playerId) };
          const move = chooseBotAction(room.game);
          if (!move) return { room: publicRoom(room, playerId) };
          room.game = applyGameAction(room.game, move.playerId, move.action, { rng: secureRng, now });
          room.botActedAt = now;
          break;
        }
        case 'ready': {
          lobbyOnly(); assert(typeof action.ready === 'boolean', 'Ready must be on or off.');
          actor!.ready = action.ready;
          break;
        }
        case 'team': {
          lobbyOnly(); assert(room.settings.teams, 'Turn on teams first.');
          assert(Number.isInteger(action.team) && action.team >= 0 && action.team < room.settings.teamCount, 'Choose an available team.');
          actor!.team = action.team; actor!.ready = actor!.id === room.hostId;
          break;
        }
        case 'start': {
          hostOnly(); lobbyOnly();
          assert(room.players.length >= 2, 'Invite a friend or add a bot before starting.');
          assert(room.players.every((item) => item.id === room.hostId || item.ready), 'Wait for everyone to be ready.');
          room.kickVotes = {};
          room.game = createGame(room.players, room.settings, now, secureRng);
          room.botActedAt = 0;
          break;
        }
        case 'kick': {
          hostOnly(); lobbyOnly();
          assert(typeof action.playerId === 'string' && action.playerId !== playerId && room.players.some((item) => item.id === action.playerId), 'Choose another player to remove.');
          room.players = room.players.filter((item) => item.id !== action.playerId);
          removeSession(room, action.playerId);
          break;
        }
        case 'voteKick': {
          assert(!actor!.bot, 'Only human room members can vote.', 403);
          assert(typeof action.vote === 'boolean', 'Choose whether to vote or withdraw your vote.');
          const target = room.players.find((item) => item.id === action.playerId);
          assert(typeof action.playerId === 'string' && target && !target.bot && target.id !== playerId && room.auth[target.id], 'Choose another human player still in this room.');
          const eligible = eligibleKickVoters(room).filter((id) => id !== target!.id);
          const votes = new Set((room.kickVotes?.[target!.id] ?? []).filter((id) => eligible.includes(id)));
          if (action.vote) votes.add(playerId);
          else votes.delete(playerId);
          room.kickVotes ??= {};
          if (votes.size) room.kickVotes[target!.id] = [...votes];
          else delete room.kickVotes[target!.id];
          if (eligible.length > 0 && eligible.every((id) => votes.has(id))) {
            const gamePlayer = room.game?.players.find((item) => item.id === target!.id);
            if (room.game && room.game.phase !== 'finished' && gamePlayer && !gamePlayer.bankrupt) {
              room.game = applyGameAction(room.game, target!.id, { type: 'surrender' }, { now });
            }
            if (room.game) {
              room.game.log.push({ id: `${now}:${Number(room.game.log.at(-1)?.id.split(':').at(-1) ?? 0) + 1}`, text: `${target!.name} was removed by unanimous vote of the other ${eligible.length} human room member${eligible.length === 1 ? '' : 's'}.`, kind: 'system', at: now });
            }
            room.players = room.players.filter((item) => item.id !== target!.id);
            removeSession(room, target!.id);
            nextHost(room);
          }
          break;
        }
        case 'leave': {
          if (room.game) {
            const gamePlayer = room.game.players.find((item) => item.id === playerId);
            if (room.game.phase !== 'finished' && gamePlayer && !gamePlayer.bankrupt) room.game = applyGameAction(room.game, playerId, { type: 'surrender' }, { now });
          } else room.players = room.players.filter((item) => item.id !== playerId);
          removeSession(room, playerId);
          nextHost(room);
          break;
        }
        case 'rematch': {
          hostOnly(); assert(room.game?.phase === 'finished', 'Finish this game before opening a rematch.', 409);
          room.game = null;
          room.kickVotes = {};
          room.players = room.players.filter((item) => item.bot || room.auth[item.id]);
          for (const item of room.players) item.ready = item.bot === true || item.id === room.hostId;
          room.botActedAt = 0;
          break;
        }
        case 'chat': {
          const channel = action.channel ?? 'general';
          assert(channel === 'general' || channel === 'team', 'Choose general or team chat.');
          assert(channel !== 'team' || room.settings.teams, 'Turn on teams to use team chat.');
          assert(typeof action.text === 'string', 'Write a message first.');
          const text = action.text.trim();
          assert(text.length > 0 && [...text].length <= 240 && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text), 'Messages must be between 1 and 240 characters.');
          room.chat.push({ id: randomBytes(12).toString('hex'), playerId, name: actor!.name, text, at: now, channel, team: channel === 'team' ? actor!.team : null });
          // Keep each channel independently bounded so a busy general chat does
          // not erase the teams' conversations (and vice versa).
          const count = new Map<string, number>();
          room.chat = room.chat.slice().reverse().filter((message) => {
            const key = message.channel === 'team' ? `team:${message.team}` : 'general';
            count.set(key, (count.get(key) ?? 0) + 1);
            return count.get(key)! <= 60;
          }).reverse();
          break;
        }
        default: {
          assert(GAME_ACTIONS.has(action.type), 'Unknown room action.');
          assert(room.game, 'The game has not started yet.', 409);
          room.game = applyGameAction(room.game!, playerId, action, { rng: secureRng, now });
        }
      }
      room.requests[playerId] = [...(room.requests[playerId] ?? []), `${id}:${fingerprint}`].slice(-RECORD_LIMIT);
      room.revision++;
      room.updatedAt = now;
      if (await this.store.compareAndSwap(code, revision, room)) return { room: publicRoom(room, playerId) };
    }
    throw new RoomError('Another move is finishing. Please try again.', 409);
  }
}
