import { $, store, idb } from './ui.js';
import * as lastfm from './sources/lastfm.js';
import * as listenbrainz from './sources/listenbrainz.js';
import * as spotify from './sources/spotify.js';
import { sampleArchive } from './sources/demo.js';
import { analyze } from './analysis.js';
import { clearTaste } from './taste.js';

export const SOURCES = { lastfm, listenbrainz, spotify };
export const view = () => $('#view');
export const state = { minMs: Number(store.get('liner.minMs') ?? 30000) };

/* ---------- Route lifecycle ---------- */
let cleanups = [];
export const onLeave = (fn) => cleanups.push(fn);
export function leave() { cleanups.forEach((f) => { try { f(); } catch { /* ignore */ } }); cleanups = []; }
export const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
export function go(hash) { if (location.hash === hash) rerender(); else location.hash = hash; }

/* ---------- Profiles ----------
   pid is "lastfm:name", "listenbrainz:name", "spotify", "file" or "demo". */
export const pidFor = (source, name) => (source === 'lastfm' || source === 'listenbrainz' ? `${source}:${name.toLowerCase()}` : source);
export function hrefFor(pid, tab = '') {
  const t = tab ? `/${tab}` : '';
  if (pid === 'demo' || pid === 'spotify' || pid === 'file') return `#/${pid}${t}`;
  const [source, ...rest] = pid.split(':');
  return `#/u/${source}/${encodeURIComponent(rest.join(':'))}${t}`;
}
export const profiles = {
  list: () => store.json('liner.profiles', []),
  remember(p) {
    const list = profiles.list().filter((x) => x.pid !== p.pid);
    list.unshift({ ...p, seen: Date.now() });
    store.setJson('liner.profiles', list.slice(0, 4));
  },
  forget(pid) { store.setJson('liner.profiles', profiles.list().filter((x) => x.pid !== pid)); },
};

/* ---------- Archives ----------
   An archive holds a Spotify export and/or a full history imported from a live
   source. The export is exact, so it wins wherever the two overlap. */
const cache = new Map();

export async function getArchive(pid) {
  if (cache.has(pid)) return cache.get(pid).archive;
  let a;
  if (pid === 'demo') {
    const rows = sampleArchive();
    a = { export: { rows, extended: true, from: rows[0].t, to: rows[rows.length - 1].t, sample: true, podcasts: 0 }, live: null, ver: 1 };
  } else {
    a = (await idb.get(`archive:${pid}`)) || { export: null, live: null, ver: 0 };
  }
  cache.set(pid, { archive: a });
  return a;
}

export async function setArchive(pid, a) {
  a.ver = Date.now();
  if (pid !== 'demo' && !await idb.set(`archive:${pid}`, a)) throw new Error('This browser could not save your listening history. Check available storage and try again.');
  cache.set(pid, { archive: a });
}

export async function clearArchive(pid) {
  const { forgetPreparation } = await import('./preparation.js');
  const { forgetRecommendations } = await import('./recommendations.js');
  const { forgetSync } = await import('./sync.js');
  await forgetSync(pid);
  await forgetPreparation(pid);
  await forgetRecommendations(pid);
  cache.delete(pid);
  await idb.del(`archive:${pid}`);
  await clearTaste(pid);
  if (pid.startsWith('lastfm:')) await lastfm.clearCheckpoint(pid);
}

export function mergedRows(a) {
  const ex = a?.export?.rows || [];
  const live = a?.live?.rows || [];
  if (!ex.length) return live;
  if (!live.length) return ex;
  const cut = a.export.to + 60000;
  return ex.concat(live.filter((r) => r.t > cut));
}

export const hasArchive = (a) => !!(a?.export?.rows?.length || a?.live?.rows?.length);

export function analysisFor(pid, a) {
  const c = cache.get(pid) || { archive: a };
  if (c.A && c.minMs === state.minMs && c.ver === a.ver) return c.A;
  const rows = mergedRows(a);
  const result = rows.length ? analyze(rows, { minMs: state.minMs }) : null;
  const A = result?.plays ? result : null;
  cache.set(pid, { archive: a, A, minMs: state.minMs, ver: a.ver });
  return A;
}

export function setMinMs(v) {
  state.minMs = v;
  store.set('liner.minMs', String(v));
}

// A large first import should not freeze the setup screen while stats are built.
export async function prepareAnalysis(pid,a,signal) {
  const c=cache.get(pid);
  if(c?.A&&c.minMs===state.minMs&&c.ver===a.ver)return c.A;
  const rows=mergedRows(a),minMs=state.minMs;
  if(rows.length<12000||typeof Worker==='undefined')return analysisFor(pid,a);
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  let A;
  try {
    A=await new Promise((resolve,reject)=>{
      const worker=new Worker(new URL('./analysis-worker.js',import.meta.url),{type:'module'});
      const close=()=>{worker.terminate();clearTimeout(timer);signal?.removeEventListener('abort',abort);};
      const abort=()=>{close();reject(new DOMException('Cancelled','AbortError'));};
      const timer=setTimeout(()=>{close();reject(new Error('The history calculation timed out.'));},45000);
      signal?.addEventListener('abort',abort,{once:true});
      worker.onmessage=({data})=>{close();data.error?reject(new Error(data.error)):resolve(data.result);};
      worker.onerror=()=>{close();reject(new Error('Background calculations are unavailable in this browser.'));};
      try{worker.postMessage({rows,minMs});}catch(error){close();reject(error);}
    });
  }catch(error){if(error.name==='AbortError'||signal?.aborted)throw new DOMException('Cancelled','AbortError');return analysisFor(pid,a);}
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  A=A?.plays?A:null;
  if(A)A.rows=rows.filter(r=>r.track&&r.artist&&(r.ms==null||r.ms>=minMs));
  cache.set(pid,{archive:a,A,minMs,ver:a.ver});
  return A;
}

// Deduplicate plays that arrive from more than one place (same song within a minute).
export function dedupe(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows.sort((x, y) => x.t - y.t)) {
    const k = `${Math.round(r.t / 60000)}|${String(r.artist || '').toLowerCase()}|${String(r.track || '').toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}
