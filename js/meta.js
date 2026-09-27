// Artwork and artist details from open sources, cached in this browser.
// iTunes Search gives cover art (about 20 requests a minute), MusicBrainz gives
// genres, origin and start year (1 request a second). Both are fetched slowly in
// the background and every result is remembered, so each lookup happens once.
import { $$, idb, wait } from './ui.js';

const mem = new Map();
let loaded = false;
let dirty = false;
const loading = idb.get('meta').then((m) => { if (m) Object.entries(m).forEach(([k, v]) => mem.set(k, v)); loaded = true; });

function save() {
  if (dirty) return;
  dirty = true;
  setTimeout(() => { dirty = false; idb.set('meta', Object.fromEntries(mem)); }, 1500);
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)|\[.*?\]| - .*$/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const same = (a, b) => { const x = norm(a), y = norm(b); return x && y && (x === y || x.startsWith(y) || y.startsWith(x)); };

/* ---------- A polite queue per host ---------- */
function queue(gap) {
  const jobs = [];
  let running = false;
  const pump = async () => {
    if (running) return;
    running = true;
    while (jobs.length) {
      const job = jobs.shift();
      try { job.resolve(await job.fn()); } catch (e) { job.resolve(null); }
      await wait(gap);
    }
    running = false;
  };
  return (fn, front = false) => new Promise((resolve) => { front ? jobs.unshift({ fn, resolve }) : jobs.push({ fn, resolve }); pump(); });
}
const itunesQ = queue(3200);
const mbQ = queue(1100);
const inflight = new Map();

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

/* ---------- Artwork ---------- */
const big = (u) => u?.replace(/\/\d+x\d+bb\./, '/400x400bb.') || '';

async function fetchArt(kind, name, artist) {
  const term = encodeURIComponent(kind === 'artist' ? name : `${artist} ${name}`);
  const entity = kind === 'track' ? 'song' : 'album';
  const d = await getJSON(`https://itunes.apple.com/search?term=${term}&entity=${entity}&limit=8`);
  const want = kind === 'artist' ? name : artist;
  const hits = (d.results || []).filter((x) => same(x.artistName, want));
  // For an artist picture, prefer a real album over singles and EPs.
  const full = hits.filter((x) => !/ - (single|ep)$/i.test(x.collectionName || '') && (x.trackCount || 0) >= 7);
  let pick = kind === 'artist' ? full[0] || hits[0] : hits[0];
  if (kind === 'album') pick = hits.find((x) => same(x.collectionName, name)) || pick;
  if (kind === 'track') pick = hits.find((x) => same(x.trackName, name)) || pick;
  return pick ? big(pick.artworkUrl100) : '';
}

export const artKey = (kind, name, artist = '') => `art:${kind}:${norm(artist)}|${norm(name)}`;

export function cachedArt(kind, name, artist) {
  const v = mem.get(artKey(kind, name, artist));
  return typeof v === 'string' ? v : undefined;
}

// Liner's own /api/art looks up to 40 pictures on Deezer in one request, with real
// artist photos. If it isn't available (plain static hosting), fall back to iTunes.
let batch = [];
let batchTimer = 0;
let apiOk = location.protocol === 'https:' || ['127.0.0.1', 'localhost'].includes(location.hostname);

function flush() {
  const jobs = batch.splice(0, 40);
  if (batch.length) batchTimer = setTimeout(flush, 0); else batchTimer = 0;
  const q = JSON.stringify(jobs.map((j) => j.item));
  fetch(`/api/art?q=${encodeURIComponent(q)}`)
    .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then((d) => jobs.forEach((j, i) => j.done(d.results?.[i] ?? null)))
    .catch(() => { apiOk = false; jobs.forEach((j) => j.done(undefined)); });
}

function viaApi(item) {
  return new Promise((done) => {
    batch.push({ item, done });
    if (!batchTimer) batchTimer = setTimeout(flush, 30);
  });
}

function viaItunes(kind, name, artist, front) {
  return itunesQ(() => fetchArt(kind, name, artist).catch(() => null), front);
}

export function art(kind, name, artist = '', front = false) {
  const key = artKey(kind, name, artist);
  if (mem.has(key)) return Promise.resolve(mem.get(key));
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    let url = apiOk ? await viaApi([kind, name, artist]) : undefined;
    // Deezer found nothing, or the API is down: try iTunes before giving up.
    if (!url) url = await viaItunes(kind, name, artist, front);
    if (url !== null && url !== undefined) { mem.set(key, url); save(); }
    inflight.delete(key);
    return url || '';
  })();
  inflight.set(key, p);
  return p;
}

// Swap real artwork into every sleeve under root that asks for it.
export async function hydrate(root = document) {
  if (!loaded) await loading;
  const els = $$('[data-art]', root).filter((el) => !el.dataset.done);
  // Visible ones first.
  els.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  for (const el of els) {
    el.dataset.done = '1';
    const [kind, name, artist] = JSON.parse(el.dataset.art);
    const hit = cachedArt(kind, name, artist);
    if (hit !== undefined) { apply(el, hit); continue; }
    art(kind, name, artist).then((url) => {
      $$(`[data-art]`).forEach((x) => { if (x.dataset.art === el.dataset.art) apply(x, url); });
    });
  }
}
function apply(el, url) {
  if (!url || el.dataset.applied) return;
  el.dataset.applied = '1';
  const img = new Image();
  img.alt = '';
  img.decoding = 'async';
  img.onload = () => { el.append(img); requestAnimationFrame(() => img.classList.add('in')); };
  img.src = url;
}

/* ---------- Artist details (MusicBrainz) ---------- */
export function cachedArtist(name) { return mem.get(`mb:${norm(name)}`); }

export function artistInfo(name, front = false) {
  const key = `mb:${norm(name)}`;
  if (mem.has(key)) return Promise.resolve(mem.get(key));
  if (inflight.has(key)) return inflight.get(key);
  const p = mbQ(async () => {
    try {
      const d = await getJSON(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(`artist:"${name}"`)}&fmt=json&limit=3`);
      const a = (d.artists || []).find((x) => x.score >= 90 && same(x.name, name));
      const info = a ? {
        tags: (a.tags || []).sort((x, y) => y.count - x.count).map((t) => t.name).filter((t) => !/^\d|seen live|favorite/i.test(t)).slice(0, 5),
        area: a.area?.name || a['begin-area']?.name || '',
        begin: a['life-span']?.begin?.slice(0, 4) || '',
        type: a.type || '',
        mbid: a.id,
      } : { tags: [], area: '', begin: '', type: '', mbid: '' };
      mem.set(key, info); save();
      return info;
    } catch { return null; } finally { inflight.delete(key); }
  }, front);
  inflight.set(key, p);
  return p;
}

export const ready = () => loading;

/* ---------- Listener counts (Last.fm), for the obscurity score ---------- */
const lastfmQ = queue(220);
export const cachedListeners = (name) => mem.get(`lfl:${norm(name)}`);

export function listeners(name) {
  const key = `lfl:${norm(name)}`;
  if (mem.has(key)) return Promise.resolve(mem.get(key));
  if (inflight.has(key)) return inflight.get(key);
  let apiKey = '';
  try { apiKey = localStorage.getItem('liner.lfmkey') || ''; } catch { /* storage blocked */ }
  apiKey = (apiKey || window.LINER_CONFIG?.lastfmApiKey || '').trim();
  if (!apiKey) return Promise.resolve(null);
  const p = lastfmQ(async () => {
    try {
      const d = await getJSON(`https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(name)}&autocorrect=1&api_key=${apiKey}&format=json`);
      const n = Number(d.artist?.stats?.listeners || 0) || null;
      mem.set(key, n); save();
      return n;
    } catch { return null; } finally { inflight.delete(key); }
  });
  inflight.set(key, p);
  return p;
}
