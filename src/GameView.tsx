import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Bot, Coins, Dice5, Eye, Flag, Handshake, MapPin, ScrollText, Trophy, UserMinus } from 'lucide-react';
import { Board, CountryFlag, CopyButton, Modal, Token } from './components';
import { ActivityPanel, Chat, PropertyPanel, Rules, TradeDialog, teamOwns } from './panels';
import { getMap } from './game/maps';
import { getRent } from './game/engine';
import { TradeDetails } from './trades';
import { TEAM_NAMES, type PublicRoom, type RoomAction } from './game/types';
import { markTradesSeen, unreadTrades } from './trade-notifications';

type Act = (action: RoomAction) => Promise<boolean>;
const money = (n: number) => `$${n.toLocaleString()}`;

export function Game({ room, playerId, act, busy }: { room: PublicRoom; playerId: string; act: Act; busy: boolean }) {
  const game = room.game!;
  const map = getMap(game.mapId);
  const current = game.players[game.turnIndex];
  const me = game.players.find(p => p.id === playerId)!;
  const myTurn = current.id === playerId && !me.bankrupt;
  const [selectedTile, setSelectedTile] = useState<number | null>(null);
  const [tab, setTab] = useState<'assets' | 'chat' | 'trades'>('assets');
  const [seenTrades, setSeenTrades] = useState<Set<string>>(() => new Set());
  const newTrades = unreadTrades(game.trades, playerId, seenTrades);
  const newForYou = newTrades.filter(offer => offer.toId === playerId).length;
  const onOffersViewed = useCallback((ids: string[]) => {
    setSeenTrades(seen => ids.every(id => seen.has(id)) ? seen : markTradesSeen(seen, ids));
  }, []);
  const [trade, setTrade] = useState(false);
  const [viewedTrade, setViewedTrade] = useState<string | null>(null);
  const [rules, setRules] = useState(false);
  const [surrender, setSurrender] = useState(false);
  const [kickTarget, setKickTarget] = useState<string | null>(null);
  const kickPlayer = room.players.find(p => p.id === kickTarget);
  const humanVoters = room.kickEligibleVoterIds ?? room.players.filter(p => !p.bot).map(p => p.id);
  const eligibleVoters = humanVoters.filter(id => id !== kickTarget);
  const kickVotes = (kickTarget ? room.kickVotes?.[kickTarget] : []) ?? [];
  const votedKick = kickVotes.includes(playerId);
  useEffect(() => { if (kickTarget && !room.players.some(p => p.id === kickTarget)) setKickTarget(null); }, [kickTarget, room.players]);
  const [bid, setBid] = useState(10);
  const [now, setNow] = useState(Date.now());
  const boardArea = useRef<HTMLDivElement>(null);
  useEffect(() => { const interval = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(interval); }, []);
  useEffect(() => { setBid(Math.max(10, (game.auction?.highestBid || 0) + 10)); }, [game.auction?.highestBid]);
  const ownAssets = map.tiles.filter(t => teamOwns(game, me, t.id));
  const pending = map.tiles[current.position];
  const owner = game.players.find(p => p.id === game.properties[pending.id]?.ownerId);
  const mayTrade = !me.bankrupt && game.phase !== 'finished';
  const myDebt = game.debt?.playerId === me.id;
  const findMe = () => boardArea.current?.querySelector('[data-your-position="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  useEffect(() => {
    if (me.bankrupt) return;
    // Follow your own token within the board without moving the document vertically.
    const area = boardArea.current;
    const tile = area?.querySelector<HTMLElement>('[data-your-position="true"]');
    if (area && tile && area.scrollWidth > area.clientWidth) area.scrollTo({ left: tile.offsetLeft - area.offsetLeft - area.clientWidth / 2 + tile.clientWidth / 2, behavior: 'smooth' });
  }, [me.position, me.bankrupt]);
  const logBox = useRef<HTMLDivElement>(null);
  const logMetrics = useRef({ pinned: true, height: 0, top: 0 });
  const [logPinned, setLogPinned] = useState(true);
  const shortcutLock = useRef(false);
  useLayoutEffect(() => {
    const box = logBox.current;
    if (!box) return;
    const previous = logMetrics.current;
    box.scrollTop = previous.pinned ? 0 : previous.top + Math.max(0, box.scrollHeight - previous.height);
    logMetrics.current = { pinned: previous.pinned, height: box.scrollHeight, top: box.scrollTop };
  }, [game.log.length]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || busy || shortcutLock.current || !myTurn || game.phase !== 'roll') return;
      if (event.key.toLowerCase() !== 'r' && event.code !== 'Space') return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]') || document.querySelector('[role="dialog"]')) return;
      if (event.code === 'Space' && target?.closest('button, a')) return;
      event.preventDefault();
      shortcutLock.current = true;
      void act({ type: 'roll' }).finally(() => { shortcutLock.current = false; });
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [act, busy, myTurn, game.phase]);
  const status = game.phase === 'finished' ? 'Game complete' : myDebt ? 'Your bill needs settling' : game.phase === 'auction' ? 'Auction open to everyone' : myTurn ? (game.phase === 'roll' ? 'Your turn to roll' : game.phase === 'buy' ? `Buy ${pending.name}?` : game.phase === 'end' ? (game.extraRoll ? 'Doubles! Go again.' : 'Your move is complete') : 'Make your move') : `${current.name} is playing`;

  return <main className="arena">
    <div className="arena-heading"><div><h1>{map.name}</h1><span>{game.settings.teams ? 'Team game' : 'Last player standing'} · {room.code}</span></div><div className="arena-heading-actions"><button className="button secondary" onClick={() => setRules(true)}><BookOpen size={16} />Rules</button><CopyButton value={`${window.location.origin}?room=${room.code}`} label="Invite link" /></div></div>
    {game.phase === 'finished' && <div className="winner-banner"><Trophy size={28} /><h2>{game.winnerIds.map(id => game.players.find(p => p.id === id)?.name).join(' & ')} wins!</h2>{room.hostId === playerId && <button className="button primary" disabled={busy} onClick={() => void act({ type: 'rematch' })}>Play again</button>}</div>}
    <div className="arena-layout"><section className="arena-board-column">
      <div className="position-strip"><Token player={me} small /><span>{me.bankrupt ? 'You are spectating' : <>You are at <strong>{map.tiles[me.position].name}</strong>{me.inJail ? ' · In jail' : ''}</>}</span>{!me.bankrupt && <button className="button secondary small-button" onClick={findMe}><MapPin size={14} /> Find me</button>}</div>
      <div className="board-scroll" ref={boardArea}><Board map={map} game={game} viewerId={me.id} selectedTile={selectedTile} onTile={tile => setSelectedTile(tile.id)}>
        <div className="center-action-panel" aria-live="polite"><strong>{status}</strong>
          {myTurn && game.phase === 'roll' && <><button className="button primary roll-button" disabled={busy} onClick={() => void act({ type: 'roll' })}><Dice5 size={24} /> Roll the dice</button><small className="shortcut-hint">Press <kbd>R</kbd> or <kbd>Space</kbd></small>{me.inJail && <><small>Roll doubles to leave jail, or pay bail.</small><button className="button secondary small-button" disabled={busy || me.cash < 50} onClick={() => void act({ type: 'payBail' })}>Pay $50 bail</button></>}</>}
          {myTurn && game.phase === 'buy' && <><div className="center-action-buttons"><button className="button primary" disabled={busy || me.cash < (pending.price || 0)} onClick={() => void act({ type: 'buy' })}>Buy · {money(pending.price || 0)}</button><button className="button secondary" disabled={busy} onClick={() => void act({ type: 'decline' })}>{game.settings.auctions ? 'Auction it' : 'Skip'}</button></div>{me.cash < (pending.price || 0) && <small>Not enough cash to buy. You can {game.settings.auctions ? 'auction it' : 'skip this property'}.</small>}</>}
          {myTurn && game.phase === 'end' && <button className="button primary" disabled={busy} onClick={() => void act({ type: 'endTurn' })}>{game.extraRoll ? 'Continue to bonus roll' : 'End turn'}<ArrowRight size={18} /></button>}
          {game.debt && <div className="center-debt"><span>{game.debt.reason} · {money(game.debt.amount)} due</span>{myDebt ? <><b>You need {money(Math.max(0, game.debt.amount - me.cash))} more.</b><small>{game.settings.mortgages ? 'Sell sites or buildings, make a trade, or mortgage assets to pay.' : 'Sell sites back to the bank at half price, sell buildings, or make a trade. Bankruptcy is always available.'}</small><div className="center-action-buttons"><button className="button secondary small-button" onClick={() => setTab('assets')}>Manage assets</button><button className="button danger small-button" onClick={() => setSurrender(true)}>Declare bankruptcy</button></div></> : <small>Waiting for {current.name} to settle the bill.</small>}</div>}
          {game.auction && <div className="center-auction"><span>{map.tiles[game.auction.tileId].name} · Highest bid {money(game.auction.highestBid)}</span>{!me.bankrupt && !game.auction.passedIds.includes(me.id) && game.auction.highestBidderId !== me.id ? <form onSubmit={e => { e.preventDefault(); void act({ type: 'bid', amount: bid }); }}><input aria-label="Your bid" type="number" min={game.auction.highestBid + 1} max={me.cash} value={bid} onChange={e => setBid(Number(e.target.value))} /><button className="button primary small-button" disabled={busy || !Number.isSafeInteger(bid) || bid > me.cash || bid <= game.auction.highestBid}>Bid</button><button type="button" className="button secondary small-button" disabled={busy} onClick={() => void act({ type: 'passAuction' })}>Pass</button></form> : <small>{game.auction.highestBidderId === me.id ? 'You have the highest bid.' : 'You have passed.'}</small>}</div>}
          {!myTurn && !me.bankrupt && game.phase !== 'finished' && now - game.turnStartedAt >= 180000 && <button className="button secondary small-button" disabled={busy} onClick={() => void act({ type: 'claimTurn' })}>Continue idle turn</button>}
        </div>
      </Board></div>
      <div className="landing-inspector"><CountryFlag tile={pending} /><div><small>{current.name.toUpperCase()} · CURRENT STOP</small><strong>{pending.name}</strong><span>{pending.region || pending.kind}{pending.price ? ` · ${owner ? `${owner.name} owns this · Rent ${money(getRent(game, pending.id, game.dice[0] + game.dice[1]))}` : `For sale · ${money(pending.price)}`}` : ''}</span></div><button className="button secondary small-button" onClick={() => setSelectedTile(pending.id)}><Eye size={16} /> View details</button></div>
    </section>
    <aside className="arena-sidebar">
      <section className="roster-panel panel"><div className="panel-heading"><h3>At the table</h3><span className="small-label">LIVE</span></div><div className="roster-list">{game.players.map(p => <div className={`player-row ${p.bankrupt ? 'bankrupt' : ''} ${p.id === current.id ? 'active' : ''}`} style={{ '--player-color': p.color } as React.CSSProperties} key={p.id}><Token player={p} small /><div><strong>{p.name}{p.id === me.id ? ' (you)' : ''}{p.bot && <Bot size={12} />}</strong><small>{p.bankrupt ? 'Bankrupt' : `${Object.values(game.properties).filter(property => property.ownerId === p.id).length} sites${game.settings.teams ? ` · ${TEAM_NAMES[p.team]}` : ''}`}</small></div><b>{money(p.cash)}</b>{p.id !== me.id && !p.bot && room.players.some(member => member.id === p.id) && <button className="roster-vote-button" aria-label={`Vote to remove ${p.name}`} title={`Vote to remove ${p.name}`} onClick={() => setKickTarget(p.id)}><UserMinus size={15} />{(room.kickVotes?.[p.id]?.length ?? 0) > 0 && <span>{room.kickVotes![p.id].length}</span>}</button>}</div>)}</div><button className="button secondary full small-button" disabled={!mayTrade || busy} onClick={() => setTrade(true)}><Handshake size={15} /> Create trade · any turn</button></section>
      <section className="arena-tools panel"><div className="arena-tabs" role="tablist" aria-label="Game panels">{(['assets', 'chat', 'trades'] as const).map(value => <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{value === 'assets' ? 'Assets' : value === 'chat' ? 'Chat' : <>Trades {newTrades.length > 0 && <span className="trade-badge" aria-label={`${newTrades.length} new trades`}>{newTrades.length}</span>}</>}</button>)}</div><span className="sr-only" role="status">{newTrades.length ? `${newTrades.length} new trade offer${newTrades.length === 1 ? '' : 's'}${newForYou ? `, ${newForYou} for you` : ''}. Open Trades to view.` : ''}</span><div className="arena-tool-content" role="tabpanel">
        {tab === 'assets' && <div className="asset-list">{ownAssets.length ? ownAssets.map(tile => <button key={tile.id} onClick={() => setSelectedTile(tile.id)}><CountryFlag tile={tile} /><div><strong>{tile.name}</strong><small>{game.properties[tile.id].mortgaged ? 'Mortgaged' : game.properties[tile.id].level ? `${game.properties[tile.id].level === 5 ? 'Hotel' : `${game.properties[tile.id].level} houses`} · tap to manage` : 'Tap to manage'}</small></div><Eye size={15} /></button>) : <p className="empty-copy">No properties yet.{myDebt && ' You can declare bankruptcy using the center button.'}</p>}</div>}
        {tab === 'chat' && <Chat room={room} playerId={playerId} act={act} busy={busy} />}
        {tab === 'trades' && <ActivityPanel game={game} playerId={playerId} act={act} busy={busy} unreadCount={newTrades.length} onOffersViewed={onOffersViewed} viewTrade={setViewedTrade} visible={!trade && !rules && selectedTile === null && !surrender && viewedTrade === null && kickTarget === null} />}
      </div></section>
      {!me.bankrupt && game.phase !== 'finished' && <button className="surrender-button" onClick={() => setSurrender(true)}><Flag size={14} /> Declare bankruptcy / leave game</button>}
      <section className="live-log panel"><div className="panel-heading"><h3><ScrollText size={16} /> Game log</h3>{logPinned ? <span className="small-label"><span className="status-dot" /> LIVE</span> : <button className="latest-log" onClick={() => { logMetrics.current.pinned = true; if (logBox.current) logBox.current.scrollTop = 0; setLogPinned(true); }}>Latest ↑</button>}</div><div className="game-feed" role="log" aria-label="Game log" ref={logBox} onScroll={() => { if (logBox.current) { logMetrics.current.top = logBox.current.scrollTop; const pinned = logBox.current.scrollTop < 8; logMetrics.current.pinned = pinned; setLogPinned(pinned); } }}>{game.log.slice().reverse().map(entry => <p key={entry.id}><span className={`log-dot log-${entry.kind}`} /><span>{entry.text}<time>{new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></span></p>)}</div></section>
    </aside></div>
    {selectedTile !== null && <Modal title="Site details" close={() => setSelectedTile(null)}><PropertyPanel key={selectedTile} tile={map.tiles[selectedTile]} game={game} me={me} act={act} busy={busy} /></Modal>}
    {rules && <Rules settings={room.settings} close={() => setRules(false)} />}
    {viewedTrade && <TradeDetails key={viewedTrade} game={game} tradeId={viewedTrade} playerId={playerId} act={act} busy={busy} close={() => setViewedTrade(null)} />}
    {trade && <TradeDialog game={game} me={me} act={act} busy={busy} close={() => setTrade(false)} />}
    {kickPlayer && <Modal title={`Vote to remove ${kickPlayer.name}`} close={() => setKickTarget(null)}><p className="kick-explanation">Everyone else must agree: all {eligibleVoters.length} other human player{eligibleVoters.length === 1 ? '' : 's'}, including teammates and opponents. Bots do not vote. Removing a player retires their seat and revokes their room access.</p><strong className="kick-progress">{kickVotes.length} of {eligibleVoters.length} votes</strong><ul className="kick-voters">{eligibleVoters.map(id => <li key={id}><span>{room.players.find(p => p.id === id)?.name}{id === playerId ? ' (you)' : ''}</span><b>{kickVotes.includes(id) ? 'Voted yes' : 'Not voted'}</b></li>)}</ul><p className="fine-print">You can withdraw your vote before everyone agrees. Votes reset if the room membership changes. Team rules apply equally.</p><div className="modal-actions"><button className="button secondary" onClick={() => setKickTarget(null)}>Back to game</button><button className={`button ${votedKick ? 'secondary' : 'danger'}`} disabled={busy || !eligibleVoters.includes(playerId)} onClick={() => void act({ type: 'voteKick', playerId: kickPlayer.id, vote: !votedKick })}>{votedKick ? 'Withdraw my vote' : 'Vote to remove'}</button></div></Modal>}
    {surrender && <Modal title="Declare bankruptcy?" close={() => setSurrender(false)}><p>You leave this match and can stay to watch. {game.settings.teams ? 'A surviving teammate inherits your cash and properties first. Otherwise, they go to your creditor or the bank.' : 'Your remaining cash and properties go to your creditor, or return to the bank when no one is owed.'}</p><div className="modal-actions"><button className="button secondary" onClick={() => setSurrender(false)}>Keep playing</button><button className="button danger" disabled={busy} onClick={async () => { if (await act({ type: 'surrender' })) setSurrender(false); }}>Declare bankruptcy</button></div></Modal>}
  </main>;
}
