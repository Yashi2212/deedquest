import { useState } from 'react';
import { ArrowRightLeft, Check, Eye, Pencil, Send, X } from 'lucide-react';
import { CountryFlag, Modal, Token } from './components';
import { getMap } from './game/maps';
import { controlsProperty } from './game/engine';
import type { GamePlayer, GameState, RoomAction, Trade, TradeRevision } from './game/types';

type Act = (action: RoomAction) => Promise<boolean>;
const money = (n: number) => `$${n.toLocaleString()}`;
const version = (trade: Trade) => trade.version ?? 1;

function Terms({ game, terms }: { game: GameState; terms: Pick<Trade, 'fromId' | 'toId' | 'offeredCash' | 'requestedCash'> & { offeredProperties: readonly number[]; requestedProperties: readonly number[] } }) {
  const map = getMap(game.mapId);
  return <div className="trade-detail-terms">{[
    { id: terms.fromId, cash: terms.offeredCash, sites: terms.offeredProperties },
    { id: terms.toId, cash: terms.requestedCash, sites: terms.requestedProperties },
  ].map(side => {
    const player = game.players.find(p => p.id === side.id)!;
    return <section key={side.id}><h3><Token player={player} small /> {player.name} gives</h3><strong className="trade-cash">{money(side.cash)}</strong><div className="trade-detail-sites">{side.sites.length ? side.sites.map(id => <div key={id}><CountryFlag tile={map.tiles[id]} /><span>{map.tiles[id].name}{game.properties[id]?.mortgaged && <small>Mortgaged</small>}</span></div>) : <p>No properties</p>}</div></section>;
  })}</div>;
}

function Changes({ game, previous, current }: { game: GameState; previous: TradeRevision; current: TradeRevision }) {
  const map = getMap(game.mapId);
  const side = (offer: TradeRevision, id: string) => offer.fromId === id ? { cash: offer.offeredCash, sites: offer.offeredProperties } : { cash: offer.requestedCash, sites: offer.requestedProperties };
  return <ul className="trade-changes">{[current.fromId, current.toId].flatMap(id => {
    const before = side(previous, id), after = side(current, id);
    const name = game.players.find(p => p.id === id)!.name;
    const changes: string[] = [];
    if (before.cash !== after.cash) changes.push(`${name} gives ${money(after.cash)} (was ${money(before.cash)})`);
    for (const tileId of after.sites.filter(id => !before.sites.includes(id))) changes.push(`${name} adds ${map.tiles[tileId].name}`);
    for (const tileId of before.sites.filter(id => !after.sites.includes(id))) changes.push(`${name} removes ${map.tiles[tileId].name}`);
    return changes.map(text => <li key={text}>{text}</li>);
  })}</ul>;
}

export function TradeEditor({ game, me, act, busy, close, counter }: { game: GameState; me: GamePlayer; act: Act; busy: boolean; close: () => void; counter?: Trade }) {
  const others = game.players.filter(p => p.id !== me.id && !p.bankrupt);
  const [toId, setToId] = useState(counter?.fromId ?? others[0]?.id ?? '');
  const [offeredCash, setOfferedCash] = useState(counter?.requestedCash ?? 0);
  const [requestedCash, setRequestedCash] = useState(counter?.offeredCash ?? 0);
  const [offeredProperties, setOfferedProperties] = useState<number[]>([...(counter?.requestedProperties ?? [])]);
  const [requestedProperties, setRequestedProperties] = useState<number[]>([...(counter?.offeredProperties ?? [])]);
  const [editingVersion] = useState(counter ? version(counter) : 0);
  const recipient = game.players.find(p => p.id === toId);
  const map = getMap(game.mapId);
  const stale = !!counter && (counter.status !== 'pending' || version(counter) !== editingVersion || counter.toId !== me.id);
  const eligible = (player: GamePlayer) => map.tiles.filter(tile => controlsProperty(game, player.id, tile.id) && !game.properties[tile.id].level && (!tile.group || !map.tiles.some(other => other.group === tile.group && game.properties[other.id]?.level)));
  const validCash = Number.isSafeInteger(offeredCash) && offeredCash >= 0 && offeredCash <= me.cash && Number.isSafeInteger(requestedCash) && requestedCash >= 0 && requestedCash <= (recipient?.cash ?? 0);
  const selectedValid = offeredProperties.every(id => eligible(me).some(tile => tile.id === id)) && !!recipient && requestedProperties.every(id => eligible(recipient).some(tile => tile.id === id));
  const changed = !counter || offeredCash !== counter.requestedCash || requestedCash !== counter.offeredCash || [...offeredProperties].sort().join() !== [...counter.requestedProperties].sort().join() || [...requestedProperties].sort().join() !== [...counter.offeredProperties].sort().join();
  const nonempty = offeredCash || requestedCash || offeredProperties.length || requestedProperties.length;
  const toggle = (id: number, selected: number[], set: (ids: number[]) => void) => set(selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id]);
  return <form className="trade-editor" onSubmit={async e => {
    e.preventDefault();
    if (stale || !validCash || !selectedValid || !nonempty || !changed) return;
    const terms = { offeredCash, requestedCash, offeredProperties, requestedProperties };
    if (await act(counter ? { type: 'counterTrade', offerId: counter.id, offerVersion: editingVersion, ...terms } : { type: 'offerTrade', toId, ...terms })) close();
  }}>
    <p className="modal-lead">{counter ? `Edit what each side gives. Your counteroffer stays in this trade and goes back to ${recipient?.name} for approval.` : 'Choose cash and properties for both sides. Only the recipient can accept or negotiate.'}</p>
    {stale && <p role="alert" className="notice">This offer changed while you were editing. Return to the trade to review the latest terms.</p>}
    {!counter && <label className="field"><span>TRADE WITH</span><select value={toId} onChange={e => { setToId(e.target.value); setRequestedProperties([]); setRequestedCash(0); }}>{others.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
    <div className="trade-columns">{[{ player: me, cash: offeredCash, setCash: setOfferedCash, selected: offeredProperties, set: setOfferedProperties, label: 'You give' }, ...(recipient ? [{ player: recipient, cash: requestedCash, setCash: setRequestedCash, selected: requestedProperties, set: setRequestedProperties, label: `${recipient.name} gives` }] : [])].map(side => <section key={side.player.id}>
      <h3><Token player={side.player} small />{side.label}</h3><label className="field"><span>Cash · {money(side.player.cash)} available</span><input aria-label={`${side.label} cash`} type="number" min={0} max={side.player.cash} step={1} value={side.cash} onChange={e => side.setCash(Number(e.target.value))} /></label>
      <div className="trade-property-list">{eligible(side.player).length ? eligible(side.player).map(tile => <label className={`trade-property ${side.selected.includes(tile.id) ? 'selected' : ''}`} key={tile.id}><input type="checkbox" checked={side.selected.includes(tile.id)} onChange={() => toggle(tile.id, side.selected, side.set)} /><CountryFlag tile={tile} /><span>{tile.name}<small>{game.properties[tile.id].mortgaged ? 'Mortgaged' : money(tile.price ?? 0)}</small></span></label>) : <p className="empty-copy">No eligible properties.</p>}</div>
    </section>)}</div>
    {!selectedValid && <p role="alert" className="notice">A selected property is no longer eligible. Return to the trade and start again.</p>}
    <p className="fine-print">Shared team deeds may be offered. Mortgages transfer with deeds. Sell buildings before trading a developed set.</p>
    <div className="trade-editor-actions"><button type="button" className="button secondary" onClick={close}>{counter ? 'Back to trade' : 'Cancel'}</button><button className="button primary" disabled={busy || stale || !validCash || !selectedValid || !nonempty || !changed}><Send size={16} />{counter ? 'Send counteroffer' : 'Send trade offer'}</button></div>
  </form>;
}

export function TradeSummary({ trade, game, playerId, view }: { trade: Trade; game: GameState; playerId: string; view: () => void }) {
  const from = game.players.find(p => p.id === trade.fromId)!, to = game.players.find(p => p.id === trade.toId)!;
  return <article className={`trade-card trade-summary ${trade.toId === playerId && trade.status === 'pending' ? 'trade-for-you' : ''}`}>
    <div className="trade-summary-top"><strong>{from.name} <ArrowRightLeft size={13} /> {to.name}</strong><span className={`trade-status ${trade.status}`}>{trade.status}</span></div>
    <p>{trade.status === 'pending' ? trade.toId === playerId ? 'Your response needed' : `Waiting for ${to.name}` : trade.resolution}</p>
    <div className="trade-summary-values"><span>{money(trade.offeredCash)} · {trade.offeredProperties.length} sites</span><ArrowRightLeft size={13} /><span>{money(trade.requestedCash)} · {trade.requestedProperties.length} sites</span></div>
    <button className="button secondary full" onClick={view}><Eye size={15} />View trade{version(trade) > 1 ? ` · Offer ${version(trade)}` : ''}</button>
  </article>;
}

export function TradeDetails({ game, tradeId, playerId, act, busy, close }: { game: GameState; tradeId: string; playerId: string; act: Act; busy: boolean; close: () => void }) {
  const [editing, setEditing] = useState(false);
  const trade = game.trades.find(offer => offer.id === tradeId);
  if (!trade) return <Modal title="Trade details" close={close}><p>This trade is no longer available.</p></Modal>;
  const me = game.players.find(p => p.id === playerId)!;
  const from = game.players.find(p => p.id === trade.fromId)!;
  const to = game.players.find(p => p.id === trade.toId)!;
  const history = trade.revisions ?? [];
  const canRespond = trade.status === 'pending' && trade.toId === me.id && !me.bankrupt;
  return <Modal title={editing ? 'Negotiate this trade' : 'Trade details'} close={close} wide>
    {editing ? <TradeEditor game={game} me={me} act={act} busy={busy} close={() => setEditing(false)} counter={trade} /> : <div className="trade-detail">
      <div className="trade-detail-heading"><span className={`trade-status ${trade.status}`}>{trade.status}</span><span>Offer {version(trade)} · {from.name} → {to.name}</span></div>
      <p className="modal-lead">{canRespond ? 'Review both sides, then accept, decline, or suggest different terms.' : trade.status === 'pending' ? `Waiting for ${to.name} to respond.` : trade.resolution}</p>
      <Terms game={game} terms={trade} />
      {history.length > 1 && <section className="trade-latest-changes"><h3>Changes in this counteroffer</h3><Changes game={game} previous={history[history.length - 2]} current={history[history.length - 1]} /></section>}
      <div className="trade-response-actions">{canRespond ? <><button className="button primary" disabled={busy} onClick={() => void act({ type: 'respondTrade', offerId: trade.id, offerVersion: version(trade), accept: true })}><Check size={17} />Accept trade</button><button className="button secondary" disabled={busy} onClick={() => setEditing(true)}><Pencil size={16} />Negotiate</button><button className="button danger" disabled={busy} onClick={() => void act({ type: 'respondTrade', offerId: trade.id, offerVersion: version(trade), accept: false })}><X size={17} />Decline</button></> : trade.status === 'pending' && trade.fromId === me.id ? <button className="button secondary" disabled={busy} onClick={() => void act({ type: 'cancelTrade', offerId: trade.id, offerVersion: version(trade) })}>Withdraw offer</button> : null}</div>
      {history.length > 1 && <section className="trade-revision-history"><h3>Negotiation history</h3><p className="fine-print">Every version stays in this same trade. Only the latest offer can be accepted.</p>{history.slice(0, -1).reverse().map(revision => <details key={revision.version}><summary>Offer {revision.version} · {game.players.find(p => p.id === revision.fromId)?.name} · {new Date(revision.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</summary><Terms game={game} terms={revision} /></details>)}</section>}
    </div>}
  </Modal>;
}
