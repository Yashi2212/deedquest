import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ShieldCheck } from 'lucide-react';
import { mayRequestAd, sponsorUrl, type ConsentData } from './ad-policy';
type Tcf = (command: string, version: number, callback: (data: ConsentData & { listenerId?: number }, success: boolean) => void, parameter?: number) => void;
type GoogleFc = { callbackQueue?: Record<string, () => void>[]; showRevocationMessage?: () => void; usstatesoptout?: { getInitialUsStatesOptOutStatus?: () => number; openConfirmationDialog?: (callback: (optedOut: boolean) => void) => void } };
declare global { interface Window { __tcfapi?: Tcf; googlefc?: GoogleFc; adsbygoogle?: object[]; } }
const mode = import.meta.env.VITE_AD_MODE ?? 'off';
const client = import.meta.env.VITE_ADSENSE_CLIENT ?? '';
const slot = import.meta.env.VITE_ADSENSE_SLOT ?? '';
const validAccount = /^ca-pub-\d{16}$/.test(client) && /^\d{10}$/.test(slot);
let scriptPromise: Promise<void> | undefined;
let consentRevoked = false;
function loadAdScript(): Promise<void> {
  return scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true; script.crossOrigin = 'anonymous';
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
    script.onload = () => resolve(); script.onerror = () => reject(new Error('Ad unavailable'));
    document.head.appendChild(script);
  });
}
function useAdvertisingConsent() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let active = true, attached = false, listener: number | undefined;
    let lastData: ConsentData | undefined, lastSuccess = false, usStatus: number | undefined;
    const sync = () => { if (active) setAllowed(!consentRevoked && mayRequestAd(lastData, lastSuccess, usStatus, (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl)); };
    const attach = () => {
      if (!active || !window.__tcfapi || attached) return;
      attached = true;
      window.__tcfapi('addEventListener', 2, (data, success) => {
        if (!active) { if (data?.listenerId !== undefined) window.__tcfapi?.('removeEventListener', 2, () => {}, data.listenerId); return; }
        listener = data?.listenerId; lastData = data; lastSuccess = success; sync();
      });
    };
    const fc = window.googlefc ??= {}; fc.callbackQueue ??= [];
    fc.callbackQueue.push({ CONSENT_API_READY: attach });
    fc.callbackQueue.push({ INITIAL_US_STATES_OPT_OUT_DATA_READY: () => { if (!active) return; usStatus = window.googlefc?.usstatesoptout?.getInitialUsStatesOptOutStatus?.(); sync(); } });
    attach();
    window.addEventListener('deedquest-ad-revoke', sync);
    return () => { active = false; window.removeEventListener('deedquest-ad-revoke', sync); if (listener !== undefined) window.__tcfapi?.('removeEventListener', 2, () => {}, listener); };
  }, []);
  return allowed;
}
function ManualAd() {
  const element = useRef<HTMLModElement>(null);
  const requested = useRef(false);
  const allowed = useAdvertisingConsent();
  useEffect(() => {
    if (!allowed || !element.current || requested.current) return;
    const target = element.current;
    let active = true;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting) || requested.current) return;
      observer.disconnect();
      void loadAdScript().then(() => {
        if (!active || consentRevoked || !target.isConnected || requested.current) return;
        requested.current = true;
        try { (window.adsbygoogle ??= []).push({}); } catch { /* Ad blockers never interrupt the game. */ }
      }).catch(() => {});
    });
    observer.observe(target);
    return () => { active = false; observer.disconnect(); };
  }, [allowed]);
  return <section className="sponsor-zone" aria-label="Advertisement"><span className="ad-label">Advertisement</span><div className="manual-ad-frame">{allowed ? <ins ref={element} className="adsbygoogle" style={{ display: 'block', width: '100%', height: 100 }} data-ad-client={client} data-ad-slot={slot} data-ad-format="horizontal" data-full-width-responsive="false" /> : <p className="ad-fallback">Your next adventure is always free to play.</p>}</div><small>Advertising stays outside your game.</small></section>;
}
export function Advertising() {
  const preview = import.meta.env.DEV && new URLSearchParams(location.search).get('adPreview') === '1';
  const url = sponsorUrl(import.meta.env.VITE_SPONSOR_URL);
  const name = import.meta.env.VITE_SPONSOR_NAME?.trim();
  if (preview) return <section className="sponsor-zone" aria-label="Advertisement preview"><span className="ad-label">Advertisement · layout preview</span><div className="sponsor-card"><div className="sponsor-icon"><ShieldCheck size={29} /></div><div><h3>A little support. More game nights.</h3><p>A single sponsor lives here. Your board stays completely yours.</p></div><span className="sponsor-preview-label">Sample placement</span></div><small>Preview only · no ad requests or tracking</small></section>;
  if (mode === 'sponsor' && url && name) return <section className="sponsor-zone" aria-label="Advertisement"><span className="ad-label">Advertisement · sponsored</span><div className="sponsor-card"><div className="sponsor-icon"><ShieldCheck size={29} /></div><div><h3>{name}</h3><p>{import.meta.env.VITE_SPONSOR_TEXT || 'Supporting more game nights.'}</p></div><a href={url} target="_blank" rel="sponsored noopener noreferrer" className="sponsor-link">Visit sponsor <ArrowUpRight size={16} /></a></div></section>;
  if (mode === 'adsense' && validAccount) return <ManualAd />;
  return null;
}
export function AdChoices() {
  if (mode !== 'adsense') return null;
  const notify = () => { consentRevoked = true; window.dispatchEvent(new Event('deedquest-ad-revoke')); };
  const eu = () => { notify(); const fc = window.googlefc ??= {}; (fc.callbackQueue ??= []).push({ CONSENT_API_READY: () => window.googlefc?.showRevocationMessage?.() }); };
  const us = () => { notify(); const fc = window.googlefc ??= {}; (fc.callbackQueue ??= []).push({ CONSENT_API_READY: () => window.googlefc?.usstatesoptout?.openConfirmationDialog?.(() => {}) }); };
  return <><button onClick={eu}>Privacy & cookie choices</button><button onClick={us}>Do not sell or share my personal information</button></>;
}
