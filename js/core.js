import { $, store, idb } from './ui.js';
import * as lastfm from './sources/lastfm.js';
import * as listenbrainz from './sources/listenbrainz.js';
import * as spotify from './sources/spotify.js';
import { sampleArchive } from './sources/demo.js';
import { analyze } from './analysis.js';

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
  cache.set(pid, { archive: a });
  if (pid !== 'demo') await idb.set(`archive:${pid}`, a);
}

export async function clearArchive(pid) {
  cache.delete(pid);
  await idb.del(`archive:${pid}`);
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
  const A = rows.length ? analyze(rows, { minMs: state.minMs }) : null;
  cache.set(pid, { archive: a, A, minMs: state.minMs, ver: a.ver });
  return A;
}

export function setMinMs(v) {
  state.minMs = v;
  store.set('liner.minMs', String(v));
}

// Deduplicate plays that arrive from more than one place (same song within a minute).
export function dedupe(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows.sort((x, y) => x.t - y.t)) {
    const k = `${Math.round(r.t / 60000)}|${r.track}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}
