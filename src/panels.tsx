import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRightLeft, BookOpen, Building2, Check, ChevronRight, Coins, Gift, HelpCircle, History, LockKeyhole, MessageCircle, Plus, ScrollText, Send, Shield, X } from 'lucide-react';
import { MAPS, getMap, getPropertySetName } from './game/maps';
import { canBuild, canSellProperty, getRent } from './game/engine';
import { DEFAULT_SETTINGS, TEAM_NAMES, type BoardMap, type GamePlayer, type GameState, type PublicRoom, type RoomAction, type RoomSettings, type Tile, type Trade } from './game/types';
import { Board, CountryFlag, Modal, Token } from './components';
import { TradeEditor, TradeSummary } from './trades';
import { tradeNoticeKey } from './trade-notifications';

export type Act = (action: RoomAction) => Promise<boolean>;
export const money = (value: number) => `$${value.toLocaleString()}`;
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
export function Toggle({ title, description, checked, disabled, onChange }: { title: string; description: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <label className="toggle-row"><span><strong>{title}</strong><small>{description}</small></span><input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} /><i className="switch" /></label>;
}
export const RULE_OPTIONS: { key: 'doubleRent' | 'vacationCash' | 'auctions' | 'rentInJail' | 'mortgages' | 'evenBuild' | 'randomOrder'; title: string; description: string }[] = [
  { key: 'doubleRent', title: 'Double rent on full sets', description: 'Complete country or state sets earn twice the base rent before building.' },
  { key: 'auctions', title: 'Property auctions', description: 'Declined properties go to the highest bidder.' },
  { key: 'rentInJail', title: 'Collect rent in jail', description: 'Your properties keep earning while you are in jail.' },
  { key: 'mortgages', title: 'Allow mortgages', description: 'Borrow half the price; repay it with 10% interest.' },
  { key: 'evenBuild', title: 'Build evenly', description: 'Keep building levels within one across a complete country or state set.' },
  { key: 'randomOrder', title: 'Shuffle turn order', description: 'Choose a random player order when the game starts.' },
];

export function Rules({ close, settings = DEFAULT_SETTINGS }: { close: () => void; settings?: RoomSettings }) {
  const [mapId, setMapId] = useState(settings.mapId);
  const map = getMap(mapId);
  return <Modal title="The rulebook" close={close} wide><p className="modal-lead">Everything you need to plan your next move.</p>
    <div className="rule-summary"><span><Coins size={17} /> Start with {money(settings.startingCash)}</span><span><Shield size={17} /> {settings.teams ? `${settings.teamCount} teams` : 'Individual players'}</span><span>Last player or team standing</span></div>
    <div className="rules-grid">
      <article><b>01</b><h3>Roll & explore</h3><p>Two dice move you clockwise. Collect $200 when you pass or land on Start. Doubles give another roll after your turn; three doubles in a row send you to jail.</p></article>
      <article><b>02</b><h3>Buy & earn rent</h3><p>Buy an unowned property for its price. {settings.auctions ? 'Decline it to open an auction for every active player. Highest bid wins; pass to leave that auction.' : 'Decline it to leave it with the bank.'} Pay rent when you land on a rival’s property. Stations earn more when your side owns more stations. Utilities use the dice total.</p></article>
      <article><b>03</b><h3>Build an empire</h3><p>Own every property site in a country to build up to four houses, then a hotel. On the India board, own every property site in one state or union territory instead. India has three sites per state; every country on other maps also has multiple sites. Buying just one site never unlocks houses. Transport sites and utilities cannot have houses. Property details show each required site and your progress. {settings.evenBuild ? 'Build and sell evenly across the set.' : 'You can build unevenly across the set.'} Sell buildings for half their cost. Manage assets before rolling or after resolving your landing, on your turn.</p></article>
      <article><b>04</b><h3>Shared team assets</h3><p>Teammates combine property sets and never pay each other rent. Every teammate can manage the team’s properties on their own turn. Cash stays personal: the acting player pays for building or receives sale and mortgage proceeds. Rent goes to the property’s named holder.</p></article>
      <article><b>05</b><h3>Bankruptcy & inheritance</h3><p>If you cannot pay, sell buildings to settle the debt automatically. You can also sell unimproved, unmortgaged sites back to the bank for half price. When mortgages are enabled, you can mortgage properties instead and keep ownership. If you still cannot pay, choose Declare bankruptcy in the board center. This option also works with mortgages off. A surviving teammate inherits your cash and every property, including buildings and mortgages, before an opposing creditor. If several teammates remain, the first active teammate in turn order inherits. With no teammate, assets go to the creditor or bank.</p></article>
      <article><b>06</b><h3>Make a deal</h3><p>Create and respond to offers at any time during a live game, independent of turns. Money committed to a standing auction bid or an unpaid bill stays reserved. Teammates may offer shared assets. All players can see offers, but only the recipient can accept, decline, or negotiate. Open View trade to review full terms. A counteroffer stays in the same trade, shows what changed, and goes back to the other player for approval. Sell every building in a set before trading it. Sell an unmortgaged site back to the bank for half its purchase price during your turn or while settling your debt; it becomes unowned. Sell its set’s buildings first. Accepted deals settle together; unavailable assets expire conflicting offers. Trade log keeps every offer and its outcome.</p></article>
      <article><b>07</b><h3>Jail & mortgages</h3><p>Pay $50 before rolling, or try for doubles. After three failed attempts, pay $50 and move. {settings.rentInJail ? 'Property holders can collect rent in jail.' : 'A jailed property holder does not collect rent.'} {settings.mortgages ? 'Mortgage unimproved properties for 50% of their price. They stop earning rent. Repay that value plus 10% to restore them.' : 'Mortgages are disabled for this room.'}</p></article>
      <article><b>08</b><h3>Winning & taking a break</h3><p>The last active player, or team, wins. There is no turn or round limit. Net worth counts cash, purchase prices and building cost, minus mortgage debt. A disconnected player keeps their seat. After three idle minutes, another active player can resolve or continue the idle turn. Paid tax-space fees go into the vacation jackpot shown on the vacation tile; the next player landing there collects it. Other bank fees do not enter the jackpot.</p></article>
    </div>
    <h3 className="section-label">This room’s settings</h3><div className="rule-switch-list">{RULE_OPTIONS.map(option => <div key={option.key}><span>{option.title}</span><b className={settings[option.key] ? 'enabled' : ''}>{settings[option.key] ? 'ON' : 'OFF'}</b></div>)}</div>
    <div className="rule-map-heading"><h3>Adventure cards & map rules</h3><select aria-label="Rules for map" value={mapId} onChange={e => setMapId(e.target.value)}>{MAPS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
    <p className="muted">{map.size} spaces · 2–{map.maxPlayers} players. Each landing draws one random card from that space’s deck; cards can repeat.</p><ul className="map-rules">{map.rules.map(rule => <li key={rule}>{rule}</li>)}</ul>
    <div className="card-decks">{(['treasure', 'surprise'] as const).map(kind => <section key={kind}><h3>{kind === 'treasure' ? <Gift size={20} /> : <HelpCircle size={20} />}{kind === 'treasure' ? 'Treasure' : 'Surprise'}</h3>{(kind === 'treasure' ? map.treasureCards : map.surpriseCards).map(card => <article key={card.id}><strong>{card.title}</strong><p>{card.text}</p></article>)}</section>)}</div>
    <div className="rules-note"><LockKeyhole size={20} /><p>General chat is visible to the room. Team chat is visible only to your current teammates. Rooms are private: invite people using your link or room code before starting. New joins are locked once the game starts; existing sessions may reconnect. To remove a person during play, use the remove-player icon beside their name. Every other human in the room must vote yes, across teams; bots do not vote. Votes can be withdrawn and reset when membership changes.</p></div>
  </Modal>;
}

export function MapPreview({ map, close, choose }: { map: BoardMap; close: () => void; choose?: () => void }) {
  const [tile, setTile] = useState<Tile | null>(null);
  return <Modal title={map.name} close={close} wide><p className="modal-lead">{map.description}</p><div className="preview-board-wrap board-scroll"><Board map={map} selectedTile={tile?.id ?? null} onTile={setTile} /></div>{tile && <div className="tile-preview-note"><strong className="property-place-title"><CountryFlag tile={tile} />{tile.name}</strong><span>{tile.countryName}{tile.region ? ` · ${tile.region} · ` : " · "}{tile.price ? `${money(tile.price)} to buy${tile.buildCost ? ` · ${money(tile.buildCost)} per building` : ''}` : tile.kind === 'treasure' ? 'Draw one treasure card.' : tile.kind === 'surprise' ? 'Draw one surprise card.' : tile.kind === 'tax' ? `Pay ${money(tile.amount || 0)}.` : tile.kind === 'start' ? 'Collect $200 each lap.' : tile.kind === 'goToJail' ? 'Go directly to jail.' : tile.kind === 'jail' ? 'Just visiting, unless sent to jail.' : 'Vacation: rest here and collect the pot if enabled.'}</span></div>}<ul className="map-rules">{map.rules.map(rule => <li key={rule}>{rule}</li>)}</ul>{choose && <button className="button primary full" onClick={choose}>Choose {map.name}<Check size={17} /></button>}</Modal>;
}

export function Chat({ room, playerId, act, busy }: { room: PublicRoom; playerId: string; act: Act; busy: boolean }) {
  const [text, setText] = useState('');
  const [channel, setChannel] = useState<'general' | 'team'>('general');
  const end = useRef<HTMLDivElement>(null);
  const team = room.players.find(player => player.id === playerId)?.team ?? 0;
  const activeChannel = room.settings.teams ? channel : 'general';
  const messages = room.chat.filter(message => (message.channel || 'general') === activeChannel);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length, activeChannel]);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (text.trim() && await act({ type: 'chat', text: text.trim(), channel: activeChannel })) setText(''); };
  return <section className="chat-panel panel"><div className="panel-heading"><h3><MessageCircle size={17} /> Chat</h3>{activeChannel === 'team' && <LockKeyhole size={14} />}</div><div className="chat-tabs"><button className={activeChannel === 'general' ? 'active' : ''} onClick={() => setChannel('general')}>General</button><button className={activeChannel === 'team' ? 'active' : ''} onClick={() => setChannel('team')} disabled={!room.settings.teams}><Shield size={13} /> Team only</button></div><p className="channel-description">{activeChannel === 'team' ? `Only ${TEAM_NAMES[team]} can read these messages.` : 'Everyone in this room can read these messages.'}</p><div className="chat-messages" role="log" aria-label={`${activeChannel} chat`}>{messages.length ? messages.map(message => <div className={`chat-message ${message.playerId === playerId ? 'mine' : ''}`} key={message.id}><div><strong style={{ color: room.players.find(p => p.id === message.playerId)?.color }}>{message.name}</strong><time>{new Date(message.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div><p>{message.text}</p></div>) : <div className="empty-state"><MessageCircle size={26} /><p>{activeChannel === 'team' ? 'Plan your next move together.' : 'The table is yours. Say hello!'}</p></div>}<div ref={end} /></div><form onSubmit={submit}><input aria-label={activeChannel === 'team' ? 'Team message' : 'General message'} placeholder={activeChannel === 'team' ? 'A message for your team…' : 'Say something…'} value={text} maxLength={240} onChange={e => setText(e.target.value)} /><button className="icon-button" disabled={!text.trim() || busy} aria-label="Send message"><Send size={17} /></button></form></section>;
}

export function teamOwns(game: GameState, player: GamePlayer, tileId: number): boolean {
  const owner = game.players.find(p => p.id === game.properties[tileId]?.ownerId);
  return !!owner && !owner.bankrupt && (owner.id === player.id || (game.settings.teams && owner.team === player.team));
}

export function TradeDialog({ game, me, act, close, busy }: { game: GameState; me: GamePlayer; act: Act; close: () => void; busy: boolean }) {
  return <Modal title="Create a trade" close={close} wide><TradeEditor game={game} me={me} act={act} close={close} busy={busy} /></Modal>;
}

export function ActivityPanel({ game, playerId, act, busy, viewTrade, unreadCount = 0, onOffersViewed, visible = true }: { game: GameState; playerId: string; act: Act; busy: boolean; viewTrade: (id: string) => void; unreadCount?: number; onOffersViewed?: (ids: string[]) => void; visible?: boolean }) {
  const [tab, setTab] = useState<'trades' | 'history'>('trades');
  const pending = (game.trades || []).filter(trade => trade.status === 'pending');
  const history = (game.trades || []).filter(trade => trade.status !== 'pending');
  const pendingIds = pending.map(tradeNoticeKey).join(',');
  useEffect(() => {
    if (tab !== 'trades' || !visible || !onOffersViewed) return;
    const acknowledge = () => { if (!document.hidden) onOffersViewed(pendingIds ? pendingIds.split(',') : []); };
    acknowledge();
    document.addEventListener('visibilitychange', acknowledge);
    return () => document.removeEventListener('visibilitychange', acknowledge);
  }, [tab, visible, pendingIds, onOffersViewed]);
  const me = game.players.find(p => p.id === playerId)!;
  const mayTrade = !me.bankrupt && game.phase !== 'finished';
  return <section className="activity-panel panel"><div className="activity-tabs"><button className={tab === 'trades' ? 'active' : ''} onClick={() => setTab('trades')}><ArrowRightLeft size={16} /><span>Trades {pending.length > 0 && <b>{pending.length}</b>}{unreadCount > 0 && <span className="trade-badge" aria-label={`${unreadCount} new trades`}>{unreadCount} new</span>}</span></button><button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><History size={16} /><span>Trade log</span></button></div><div className="activity-content">{<><div className="panel-heading"><h3>{tab === 'trades' ? 'Open trades' : 'Trade history'}</h3></div><p className="channel-description">{tab === 'trades' ? 'Live offers between all players.' : 'Accepted, declined, cancelled and expired offers.'}</p><div className="trades-list">{(tab === 'trades' ? pending : history).length ? (tab === 'trades' ? pending : history).slice().reverse().map(trade => <TradeSummary key={trade.id} trade={trade} game={game} playerId={playerId} view={() => viewTrade(trade.id)} />) : <div className="empty-state">{tab === 'trades' ? <ArrowRightLeft size={28} /> : <History size={28} />}<p>{tab === 'trades' ? 'Your next deal starts here.' : 'Finished offers will appear here.'}</p></div>}</div></>}</div></section>;
}

export function PropertyPanel({ tile, game, me, act, busy }: { tile: Tile; game: GameState; me: GamePlayer; act: Act; busy: boolean }) {
  const [confirmSale, setConfirmSale] = useState(false);
  const map = getMap(game.mapId);
  const prop = game.properties[tile.id];
  const owner = game.players.find(p => p.id === prop?.ownerId);
  const own = teamOwns(game, me, tile.id);
  const manage = game.players[game.turnIndex].id === me.id && ['roll', 'end', 'debt'].includes(game.phase) && !me.bankrupt;
  const set = tile.group ? map.tiles.filter(site => site.kind === 'property' && site.group === tile.group) : [];
  const missing = set.filter(site => !teamOwns(game, me, site.id));
  const setMortgaged = set.some(site => game.properties[site.id].mortgaged);
  const buildable = canBuild(game, me.id, tile.id);
  const saleAllowed = canSellProperty(game, me.id, tile.id);
  const buildingReason = set.length < 2 ? 'Houses require a monopoly with multiple sites.' : missing.length ? `Still needed: ${missing.map(site => site.name).join(', ')}.` : setMortgaged ? 'Unmortgage every site in this set before building.' : prop?.level === 5 ? 'This site already has a hotel.' : game.players[game.turnIndex].id !== me.id ? 'The set is complete. Build on your turn.' : !['roll', 'end'].includes(game.phase) ? 'Finish your purchase, auction, or debt before building.' : me.cash < (tile.buildCost || 0) ? `You need ${money(tile.buildCost || 0)} to build here.` : !buildable ? 'Build evenly: improve the least developed site in this set first.' : 'Set complete — you can build here.';
  return <section className="property-panel panel">
    <div className="property-header" style={{ borderColor: owner?.color || map.accent }}><span>{tile.kind.toUpperCase()}</span>{owner && <span>Owned by {owner.name}</span>}</div>
    <h3 className="property-place-title"><CountryFlag tile={tile} />{tile.name}</h3>
    {tile.placeIconLabel && <p className="place-story">{tile.placeIconLabel}</p>}
    {tile.countryName && <p className="place-region">{tile.countryName}{tile.region ? ` · ${tile.region}` : ''}</p>}
    {tile.price ? <>
      <div className="property-facts"><span>Price<strong>{money(tile.price)}</strong></span><span>Rent now<strong>{money(getRent(game, tile.id, game.dice[0] + game.dice[1]))}</strong></span><span>Holder<strong>{owner?.name || 'The bank'}</strong></span>{game.settings.teams && owner && <span>Team<strong>{TEAM_NAMES[owner.team]}</strong></span>}{tile.buildCost && <span>Build cost<strong>{money(tile.buildCost)}</strong></span>}</div>
      {prop?.mortgaged && <p className="notice">Mortgaged · no rent collected</p>}
      {set.length > 0 && <section className="set-progress"><h4>{getPropertySetName(tile)} · {set.length - missing.length}/{set.length} sites owned by your {game.settings.teams ? 'team' : 'side'}</h4><div>{set.map(site => <span className={teamOwns(game, me, site.id) ? 'held' : ''} key={site.id}>{teamOwns(game, me, site.id) ? '✓' : '○'} {site.name}</span>)}</div><p>{buildingReason}</p></section>}
      {tile.rents && tile.kind === 'property' && <div className="rent-table">{tile.rents.map((rent, i) => <span className={prop?.level === i ? 'current-rent' : ''} key={i}>{i === 0 ? 'Base rent' : i === 5 ? 'Hotel' : `${i} house${i > 1 ? 's' : ''}`}<b>{money(rent)}</b></span>)}</div>}
      {own && <div className="property-actions">
        {tile.kind === 'property' && <><button className="button primary small-button" disabled={busy || !manage || !buildable} onClick={() => void act({ type: 'build', tileId: tile.id })}><Building2 size={15} />{prop.level === 4 ? 'Build a hotel' : 'Build a house'}</button>{prop.level > 0 && <button className="button secondary small-button" disabled={busy || !manage} onClick={() => void act({ type: 'sellBuilding', tileId: tile.id })}>Sell building · +{money((tile.buildCost || 0) / 2)}</button>}</>}
        {game.settings.mortgages && prop.level === 0 && <button className="button secondary small-button" disabled={busy || !manage || (prop.mortgaged && game.phase === 'debt')} onClick={() => void act({ type: prop.mortgaged ? 'unmortgage' : 'mortgage', tileId: tile.id })}>{prop.mortgaged ? `Unmortgage · ${money(Math.ceil(Math.floor(tile.price / 2) * 11 / 10))}` : `Mortgage · +${money(Math.floor(tile.price / 2))}`}</button>}
        <button className="button secondary small-button sell-site" disabled={busy || !manage || !saleAllowed} onClick={() => setConfirmSale(true)}>Sell site to bank · +{money(Math.floor(tile.price / 2))}</button>
        {confirmSale && <div className="confirm-site-sale"><p>Sell {tile.name} for {money(Math.floor(tile.price / 2))}? You give up ownership and the site becomes available to buy again.</p><button className="button danger small-button" disabled={busy || !saleAllowed} onClick={async () => { if (await act({ type: 'sellProperty', tileId: tile.id })) setConfirmSale(false); }}>Confirm sale</button><button className="button secondary small-button" onClick={() => setConfirmSale(false)}>Cancel</button></div>}
        {!saleAllowed && <p className="fine-print">To sell a site, clear its mortgage and sell all buildings in its set first.</p>}
        <p className="fine-print">{game.settings.teams ? 'Shared team asset. Actions use your personal cash.' : 'Manage this property on your turn or while settling your debt.'}</p>
      </div>}
    </> : <p className="fine-print">{['treasure', 'surprise', 'chance'].includes(tile.kind) ? 'Draw a card when you land here. Open Rules to see every possible card.' : tile.kind === 'tax' ? `Pay ${money(tile.amount || 0)} into the vacation jackpot when you land here.` : tile.kind === 'start' ? 'Collect $200 every trip around the board.' : tile.kind === 'jail' ? 'Just visiting? Carry on. In jail? Pay $50 or try doubles.' : tile.kind === 'goToJail' ? 'Go straight to jail without a start bonus.' : `Collect the tax jackpot: ${money(game.vacationPot || 0)}.`}</p>}
  </section>;
}
