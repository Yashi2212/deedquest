import { Car, Cat, Coffee, Crown, Dog, Rocket, Sailboat, TreePine, X, ArrowUpRight, Check, Copy, Dice5, Globe2, Sparkles, TrainFront, Zap, Palmtree, LockKeyhole, FastForward, Gem, Ghost, HelpCircle, Gift } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { BoardMap, GameState, Player, Tile } from './game/types';

export const TOKEN_CHOICES = [
  { emoji: '🐱', label: 'Cat' }, { emoji: '🚀', label: 'Rocket' }, { emoji: '☕', label: 'Coffee' },
  { emoji: '⛵', label: 'Sailboat' }, { emoji: '🚗', label: 'Car' }, { emoji: '🌲', label: 'Tree' },
  { emoji: '👑', label: 'Crown' }, { emoji: '🐶', label: 'Dog' }, { emoji: '💎', label: 'Gem' }, { emoji: '👻', label: 'Ghost' },
];
export function Token({ player, small = false }: { player: Pick<Player, 'color' | 'tokenIndex' | 'name'>; small?: boolean }) {
  const token = TOKEN_CHOICES[player.tokenIndex % TOKEN_CHOICES.length];
  return <span className={`token ${small ? 'small' : ''}`} style={{ '--token-color': player.color } as CSSProperties} title={`${player.name} · ${token.label}`}><span role="img" aria-label={`${player.name}'s ${token.label} token`}>{token.emoji}</span></span>;
}
export function Brand({ onClick }: { onClick?: () => void }) {
  return <button className="brand deedquest-brand" onClick={onClick} aria-label="DeedQuest home"><DeedQuestMark /><span className="deedquest-wordmark">Deed<span>Quest</span></span></button>;
}
function DeedQuestMark() {
  return <svg className="deedquest-mark" viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M32 3 58 18v28L32 61 6 46V18Z" fill="#142b30" stroke="#34585a" strokeWidth="2" /><path d="m14 28 18-16 18 16" stroke="#f0b777" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /><path d="M44 17v9" stroke="#f0b777" strokeWidth="5" strokeLinecap="round" /><rect x="18" y="28" width="28" height="25" rx="6" fill="#51d8bc" /><path d="M18 45v2a6 6 0 0 0 6 6h16a6 6 0 0 0 6-6v-2" fill="#279f90" /><g fill="#0a302c"><circle cx="25" cy="35" r="2.3" /><circle cx="39" cy="35" r="2.3" /><circle cx="32" cy="40.5" r="2.3" /><circle cx="25" cy="46" r="2.3" /><circle cx="39" cy="46" r="2.3" /></g></svg>;
}
export function CountryFlag({ tile }: { tile: Pick<Tile, 'countryCode' | 'countryName' | 'placeIcon' | 'placeIconLabel'> }) {
  if (tile.placeIcon) return <span className="place-icon" role="img" aria-label={tile.placeIconLabel} title={tile.placeIconLabel}>{tile.placeIcon}</span>;
  return tile.countryCode ? <img className="country-flag" src={`/flags/${tile.countryCode.toLowerCase()}.svg`} alt={`${tile.countryName || tile.countryCode.toUpperCase()} flag`} title={tile.countryName || tile.countryCode.toUpperCase()} /> : null;
}
export function Modal({ title, children, close, wide }: { title: string; children: ReactNode; close: () => void; wide?: boolean }) {
  const dialog = useRef<HTMLElement>(null);
  const onClose = useRef(close); onClose.current = close;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose.current();
      if (event.key === 'Tab') {
        const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]') || [])];
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', key); const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = previous; before?.focus(); };
  }, []);
  return <div className="modal-shade" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><section ref={dialog} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-title"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={close} autoFocus><X size={20} /></button></div>{children}</section></div>;
}
export function CopyButton({ value, label = 'Copy invite link' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(false);
  return <><button className="button secondary" onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setFallback(true); } }}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copied!' : label}</button>{fallback && <input aria-label="Select and copy invite link" readOnly value={value} onFocus={e => e.target.select()} />}</>;
}
export function MapCard({ map, selected, onSelect, compact }: { map: BoardMap; selected?: boolean; onSelect: () => void; compact?: boolean }) {
  return <button className={`map-card ${selected ? 'selected' : ''} ${compact ? 'compact' : ''}`} onClick={onSelect} aria-pressed={selected} style={{ '--map-accent': map.accent, '--map-bg': map.background } as CSSProperties}>
      <div className="map-art"><img src={map.artwork} alt="" loading="lazy" /><span className="map-tag">{map.size > 40 ? 'BIG' : 'SMALL'} · {map.tiles.length} spaces · {map.maxPlayers} players</span>{selected && <span className="map-selected"><Check size={14} /></span>}</div>
    <div className="map-info"><span><strong>{map.name}</strong><small>{map.subtitle}</small></span><ArrowUpRight size={19} /></div>
  </button>;
}
export function TileIcon({ tile, size = 18 }: { tile: Tile; size?: number }) {
  const icons = { start: FastForward, station: TrainFront, utility: Zap, chance: Sparkles, treasure: Gift, surprise: HelpCircle, tax: Globe2, jail: LockKeyhole, rest: Palmtree, goToJail: LockKeyhole, property: null };
  const Icon = icons[tile.kind];
  return Icon ? <Icon size={size} /> : null;
}
export function Dice({ value }: { value: number }) {
  const positions: Record<number, number[]> = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  return <span className="die" aria-label={`Die showing ${value}`}>{Array.from({ length: 9 }, (_, i) => <i key={i} className={positions[value]?.includes(i + 1) ? 'pip' : ''} />)}</span>;
}
export function Board({ map, game, onTile, selectedTile, children, viewerId }: { map: BoardMap; game?: GameState | null; onTile: (tile: Tile) => void; selectedTile: number | null; children?: ReactNode; viewerId?: string }) {
  const perSide = map.tiles.length / 4;
  const dimension = perSide + 1;
  const current = game?.players[game.turnIndex];
  const place = (i: number): CSSProperties => {
    if (i <= perSide) return { gridRow: 1, gridColumn: i + 1 };
    if (i <= perSide * 2) return { gridRow: i - perSide + 1, gridColumn: dimension };
    if (i <= perSide * 3) return { gridRow: dimension, gridColumn: dimension - (i - perSide * 2) };
    return { gridRow: dimension - (i - perSide * 3), gridColumn: 1 };
  };
  return <div className={`board board-${map.id} ${map.size > 40 ? 'board-large' : ''}`} style={{ '--board-size': dimension, '--map-accent': map.accent, '--map-bg': map.background } as CSSProperties} aria-label={`${map.name}, ${map.tiles.length}-space board`}>
    <div className="board-center" style={{ gridColumn: `2 / ${dimension}`, gridRow: `2 / ${dimension}` }}>
      <img className="board-center-art" src={map.artwork} alt="" />
      <div className="board-center-title"><span className="eyebrow">{game ? (game.settings.teams ? 'LAST TEAM STANDING' : 'LAST PLAYER STANDING') : `${map.size} SPACES · UP TO ${map.maxPlayers} FRIENDS`}</span><h2>{map.name}</h2><p>{map.subtitle}</p></div>
      {game && current ? <div className="center-turn"><div className="dice-pair"><Dice value={game.dice[0] || 1} /><Dice value={game.dice[1] || 1} /></div><div className="turn-person"><Token player={current} small /><span>{game.phase === 'finished' ? 'Adventure complete' : `${current.name}’s turn`}</span></div></div> : <div className="preview-emblem"><Dice5 size={42} /><span>YOUR NEXT ADVENTURE</span></div>}
      {children && <div className="board-center-controls">{children}</div>}
      <div className="center-wordmark deedquest-board-wordmark"><DeedQuestMark /><span>DeedQuest</span></div>
    </div>
    {map.tiles.map(tile => {
      const property = game?.properties[tile.id];
      const owner = game?.players.find(p => p.id === property?.ownerId);
      const here = game?.players.filter(p => !p.bankrupt && p.position === tile.id) || [];
      const corner = tile.id % perSide === 0;
      const viewer = game?.players.find(p => p.id === viewerId);
      const youHere = here.some(p => p.id === viewerId);
      return <button key={tile.id} data-your-position={youHere || undefined} onClick={() => onTile(tile)} className={`board-tile ${corner ? 'corner' : ''} side-${Math.floor(tile.id / perSide)} tile-${tile.kind} ${selectedTile === tile.id ? 'inspected' : ''} ${here.some(p => p.id === current?.id) ? 'current-tile' : ''} ${youHere ? 'your-position' : ''} ${owner ? 'owned-tile' : ''} ${property?.mortgaged ? 'mortgaged' : ''}`} style={{ ...place(tile.id), '--tile-color': tile.color || map.accent, '--owner-color': owner?.color || 'transparent', '--your-color': viewer?.color || '#ffffff' } as CSSProperties} title={`${tile.name}${owner ? ` · Owned by ${owner.name}` : ''}${tile.price ? ` · $${tile.price}` : ''}`} aria-label={`${tile.name}${owner ? `, owned by ${owner.name}` : ''}${here.length ? `, ${here.map(p => p.name).join(', ')} here` : ''}`}>
        {tile.kind === 'property' && <span className="property-stripe" />}
        <span className="tile-content"><CountryFlag tile={tile} /><TileIcon tile={tile} size={corner ? 25 : 17} />
        <span className="tile-name">{tile.name}</span>
        {tile.price && <span className="tile-price">${tile.price}</span>}
        {tile.kind === 'start' && <span className="tile-price">COLLECT $200</span>}{tile.kind === 'rest' && game && <span className="vacation-prize">${game.vacationPot || 0}</span>}</span>
        {!!property?.level && <span className="tile-buildings">{property.level === 5 ? 'H' : '▪'.repeat(property.level)}</span>}
        {owner && <span className="owner-mark" title={`Owned by ${owner.name}`}>{owner.name.replace(/ Bot$/, "").slice(0, 2).toUpperCase()}</span>}
        {youHere && <span className="you-marker">YOU</span>}
        {here.length > 0 && <span className="tile-tokens">{here.map(p => <span className={p.id === viewerId ? 'your-token' : ''} key={p.id}><Token player={p} small /></span>)}</span>}
      </button>;
    })}
  </div>;
}
