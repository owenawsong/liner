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
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } finally { clearTimeout(timer); }
}

/* ---------- Artwork ---------- */
const big = (u) => u?.replace(/\/\d+x\d+bb\./, '/400x400bb.') || '';

async function fetchArt(kind, name, artist) {
  if (kind === 'artist') return '';
  const term = encodeURIComponent(`${artist} ${name}`);
  const entity = kind === 'track' ? 'song' : 'album';
  const d = await getJSON(`https://itunes.apple.com/search?term=${term}&entity=${entity}&limit=8`);
  const hits = (d.results || []).filter((x) => same(x.artistName, artist));
  const pick = kind === 'album' ? hits.find((x) => same(x.collectionName, name)) : hits.find((x) => same(x.trackName, name));
  return pick ? big(pick.artworkUrl100) : '';
}

export const artKey = (kind, name, artist = '') => `art2:${kind}:${norm(artist)}|${norm(name)}`;

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
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  fetch(`/api/art?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
    .then((r) => { if (r.status === 404) apiOk = false; if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then((d) => jobs.forEach((j, i) => j.done(d.results?.[i] ?? null)))
    .catch(() => jobs.forEach((j) => j.done(undefined)))
    .finally(() => clearTimeout(timer));
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
    if (!url && kind !== 'artist') url = await viaItunes(kind, name, artist, front);
    if (url !== null && url !== undefined) { mem.set(key, url); save(); }
    inflight.delete(key);
    return url || '';
  })();
  inflight.set(key, p);
  return p;
}

// Load covers near the viewport so long profiles don't queue hundreds at once.
const watched = new Set();
const observer = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  entries.forEach(({ target, isIntersecting }) => {
    if (!isIntersecting && target.isConnected) return;
    observer.unobserve(target); watched.delete(target);
    if (target.isConnected) startArt(target);
  });
}, { rootMargin: '450px' }) : null;

function startArt(el) {
  if (el.dataset.done) return;
  el.dataset.done = '1';
  const [kind, name, artist] = JSON.parse(el.dataset.art);
  const hit = cachedArt(kind, name, artist);
  if (hit !== undefined) { apply(el, hit); return; }
  art(kind, name, artist).then((url) => {
    $$('[data-art]').forEach((x) => { if (x.dataset.art === el.dataset.art) apply(x, url); });
  });
}

export async function hydrate(root = document) {
  if (!loaded) await loading;
  watched.forEach((el) => { if (!el.isConnected) { observer?.unobserve(el); watched.delete(el); } });
  for (const el of $$('[data-art]', root)) {
    if (el.dataset.done || watched.has(el)) continue;
    if (el.closest('.deck__cover:not(.is-on)')) continue;
    if (observer && !el.closest('.deck__cover')) { watched.add(el); observer.observe(el); }
    else startArt(el);
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
let mbUnavailableUntil = 0;

export function artistInfo(name, front = false) {
  const key = `mb:${norm(name)}`;
  if (mem.has(key)) return Promise.resolve(mem.get(key));
  if (inflight.has(key)) return inflight.get(key);
  if (Date.now() < mbUnavailableUntil) {
    const info = { tags: [], unavailable: true };
    mem.set(key, info);
    return Promise.resolve(info);
  }
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
    } catch {
      mbUnavailableUntil = Date.now() + 60000;
      const info = { tags: [], unavailable: true };
      mem.set(key, info);
      return info;
    } finally { inflight.delete(key); }
  }, front);
  inflight.set(key, p);
  return p;
}

// Last.fm album MBIDs generally identify a particular release. Resolve that
// release to the MusicBrainz release group (the album concept) before reading
// community ratings, and keep these calls on the shared 1/sec MusicBrainz queue.
export async function releaseGroupForAlbum(album) {
  if (!/^[0-9a-f-]{36}$/i.test(album.mbid || '')) return null;
  const key = `rg:v1:${album.mbid}`;
  if (mem.has(key)) return mem.get(key);
  if (inflight.has(key)) return inflight.get(key);
  if (Date.now() < mbUnavailableUntil) return null;
  const p = (async () => {
    const base = 'https://musicbrainz.org/ws/2/';
    const release = await mbQ(() => getJSON(`${base}release/${album.mbid}?inc=release-groups&fmt=json`).catch(() => null));
    const groupId = release?.['release-group']?.id || album.mbid;
    const group = await mbQ(() => getJSON(`${base}release-group/${groupId}?inc=ratings+genres&fmt=json`).catch(() => null));
    if (!group || !same(group.title, album.name)) return null;
    const value = Number(group.rating?.value), count = Number(group.rating?.['votes-count'] || 0);
    const info = { id: group.id, title: group.title, type: group['primary-type'] || '',
      date: group['first-release-date'] || '', rating: Number.isFinite(value) && count ? value : null,
      votes: count, genres: (group.genres || []).sort((a, b) => b.count - a.count).slice(0, 3).map((x) => x.name) };
    mem.set(key, info); save();
    return info;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export async function critiqueCount(groupId) {
  if (!groupId) return null;
  const key = `cb:v1:${groupId}`;
  if (mem.has(key)) return mem.get(key);
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const d = await getJSON(`https://critiquebrainz.org/ws/1/review/?entity_id=${groupId}&entity_type=release_group&review_type=review&limit=0`);
      const count = Number(d.count || 0);
      mem.set(key, count); save();
      return count;
    } catch { return null; }
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export const ready = () => loading;

/* ---------- Listener counts (Last.fm), for the obscurity score ---------- */
const lastfmQ = queue(220);
// Search returns the audience of canonical spelling variants. artist.getInfo
// can attach a small, separate page to punctuation variants (e.g. Travi$ Scott)
// and make a globally popular artist look obscure. v4 checks both stylized
// dollar-sign names and plain spellings before selecting the largest match.
const audienceName = (name) => String(name || '').replace(/\$/g, 's').replace(/[+&]/g, ' and ').toLowerCase()
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export const cachedListeners = (name) => mem.get(`lfl4:${audienceName(name)}`);

export function listeners(name) {
  const key = `lfl4:${audienceName(name)}`;
  if (mem.has(key)) return Promise.resolve(mem.get(key));
  if (inflight.has(key)) return inflight.get(key);
  let apiKey = '';
  try { apiKey = localStorage.getItem('liner.lfmkey') || ''; } catch { /* storage blocked */ }
  apiKey = (apiKey || window.LINER_CONFIG?.lastfmApiKey || '').trim();
  if (!apiKey) return Promise.resolve(null);
  const p = lastfmQ(async () => {
    try {
      const search = async (query) => {
        const d = await getJSON(`https://ws.audioscrobbler.com/2.0/?method=artist.search&artist=${encodeURIComponent(query)}&limit=15&api_key=${apiKey}&format=json`);
        const matches = d.results?.artistmatches?.artist || [];
        return Array.isArray(matches) ? matches : [matches];
      };
      const matches = await search(name);
      if (name.includes('$')) matches.push(...await search(name.replace(/\$/g, 's')));
      const exact = matches.filter((x) => audienceName(x.name) === audienceName(name));
      const n = Math.max(0, ...exact.map((x) => Number(x.listeners || 0))) || null;
      mem.set(key, n); save();
      return n;
    } catch { return null; } finally { inflight.delete(key); }
  });
  inflight.set(key, p);
  return p;
}
