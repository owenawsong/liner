// Last.fm source. Public reads only, so a username is all we need from the user.
import { store, hash, wait, idb } from '../ui.js';
import { CATALOG, demoRecent } from './demo.js';

const BASE = 'https://ws.audioscrobbler.com/2.0/';
const STAR = '2a96cbd8b46e442fc41c2b86b821562f';

export const id = 'lastfm';
export const label = 'Last.fm';
export const USERNAME_RE = /^[A-Za-z][A-Za-z0-9_-]{1,14}$/;
export const usernameRule = 'Last.fm usernames are 2 to 15 characters, start with a letter, and use only letters, numbers, - and _.';
export const periods = [
  { id: '7day', label: '7 days' }, { id: '1month', label: 'Month' }, { id: '3month', label: '3 months' },
  { id: '6month', label: '6 months' }, { id: '12month', label: 'Year' }, { id: 'overall', label: 'All time' },
];

export const apiKey = () => (store.get('liner.lfmkey') || window.LINER_CONFIG?.lastfmApiKey || '').trim();
export const isLive = () => apiKey().length > 0;

export class SourceError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

async function call(method, params, signal) {
  const url = new URL(BASE);
  url.search = new URLSearchParams({ method, api_key: apiKey(), format: 'json', ...params });
  const ctrl = new AbortController();
  let timedOut = false;
  const abort = () => ctrl.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) ctrl.abort();
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, 12000);
  let res;
  let data;
  try {
    res = await fetch(url, { signal: ctrl.signal });
    try { data = await res.json(); } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new SourceError('bad', 'Last.fm sent back something unreadable. Try again in a moment.');
    }
  } catch (e) {
    if (timedOut) throw new SourceError('timeout', 'Last.fm took too long to respond. Try again.');
    if (e.name === 'AbortError' || e instanceof SourceError) throw e;
    throw new SourceError('network', "Couldn't reach Last.fm. Check your connection and try again.");
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  if (data.error) {
    const friendly = {
      6: 'There is no Last.fm user with that name.',
      10: "The Last.fm API key isn't valid. Update it in Settings.",
      26: 'This Last.fm API key has been suspended. Update it in Settings.',
      29: 'Last.fm is getting too many requests right now. Wait a few seconds and try again.',
      17: 'This profile hides its recent listening.',
    }[data.error];
    throw new SourceError(data.error === 6 ? 'notfound' : data.error === 17 ? 'hidden' : data.error, friendly || data.message);
  }
  return data;
}

const list = (x) => (x ? (Array.isArray(x) ? x : [x]) : []);
function img(images) {
  const arr = list(images);
  const src = (arr.find((i) => i.size === 'extralarge') || arr.find((i) => i.size === 'large') || arr[arr.length - 1] || {})['#text'] || '';
  return src.includes(STAR) ? '' : src;
}
const track = (t) => ({
  name: t.name,
  artist: t.artist?.['#text'] ?? t.artist?.name ?? '',
  album: t.album?.['#text'] ?? '',
  image: img(t.image),
  nowPlaying: t['@attr']?.nowplaying === 'true',
  t: t.date?.uts ? Number(t.date.uts) * 1000 : Date.now(),
  url: t.url,
});
const user = (u) => ({
  name: u.name,
  display: u.realname || u.name,
  image: img(u.image),
  playcount: Number(u.playcount || 0),
  since: Number(u.registered?.unixtime || u.registered?.['#text'] || 0) * 1000,
  url: u.url,
});

/* ---------- Simulated mode (no API key) ---------- */
async function simLookup(name, signal) {
  await wait(380 + (hash(name) % 360));
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  const key = name.toLowerCase();
  if (key === 'nobody') throw new SourceError('notfound', 'There is no Last.fm user with that name.');
  const h = hash(key);
  const u = {
    name, display: name, image: '',
    playcount: key === 'newuser' ? 0 : 1200 + (h % 90000),
    since: key === 'newuser' ? Date.now() - 3.6e6 : (1262304000 + (h % 480000000)) * 1000,
    url: `https://www.last.fm/user/${encodeURIComponent(name)}`,
  };
  const rec = demoRecent(3);
  let latest = [];
  if (key === 'staleuser') latest = [{ ...rec[1], nowPlaying: false, t: Date.now() - 864e5 * 74 }];
  else if (key !== 'newuser' && key !== 'hiddenuser') latest = h % 3 === 0 ? rec : rec.slice(1);
  return { user: u, latest, hidden: key === 'hiddenuser', simulated: true };
}

/* ---------- Public API ---------- */
export async function lookup(name, signal) {
  if (!isLive()) return simLookup(name, signal);
  const [info, recent] = await Promise.allSettled([
    call('user.getinfo', { user: name }, signal),
    call('user.getrecenttracks', { user: name, limit: 3 }, signal),
  ]);
  if (info.status === 'rejected') throw info.reason;
  const out = { user: user(info.value.user), latest: [], hidden: false, simulated: false };
  if (recent.status === 'fulfilled') out.latest = list(recent.value.recenttracks?.track).map(track);
  else if (recent.reason?.code === 'hidden') out.hidden = true;
  else if (recent.reason?.name === 'AbortError') throw recent.reason;
  return out;
}

export async function recent(name, limit, signal) {
  if (!isLive()) return demoRecent(limit);
  const d = await call('user.getrecenttracks', { user: name, limit }, signal);
  return list(d.recenttracks?.track).map(track).slice(0, limit + 1);
}

export async function profile(name, signal) {
  if (!isLive()) {
    const sim = await simLookup(name, signal);
    return { source: id, simulated: true, user: sim.user, recent: demoRecent(20), today: 23 + (hash(name) % 30), week: 190 + (hash(name) % 140), hidden: sim.hidden };
  }
  const dayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  const weekStart = Math.floor(Date.now() / 1000) - 7 * 86400;
  const [info, rec, today, week] = await Promise.all([
    call('user.getinfo', { user: name }, signal),
    call('user.getrecenttracks', { user: name, limit: 20 }, signal).catch((e) => e),
    call('user.getrecenttracks', { user: name, from: dayStart, limit: 1 }, signal).catch(() => null),
    call('user.getrecenttracks', { user: name, from: weekStart, limit: 1 }, signal).catch(() => null),
  ]);
  const hidden = rec instanceof Error;
  if (hidden && rec.code !== 'hidden') throw rec;
  const total = (r) => Number(r?.recenttracks?.['@attr']?.total || 0);
  return {
    source: id, simulated: false, hidden,
    user: user(info.user),
    recent: hidden ? [] : list(rec.recenttracks?.track).map(track),
    today: total(today),
    week: total(week),
  };
}

// kind: artists | tracks | albums
export async function top(name, period, kind, signal, limit = 25) {
  if (!isLive()) return simTop(name, period, kind);
  const method = { artists: 'user.gettopartists', tracks: 'user.gettoptracks', albums: 'user.gettopalbums' }[kind];
  const d = await call(method, { user: name, period, limit }, signal);
  const key = { artists: 'topartists', tracks: 'toptracks', albums: 'topalbums' }[kind];
  const one = kind.slice(0, -1);
  return list(d[key]?.[one]).map((x) => ({
    name: x.name,
    artist: x.artist?.name || '',
    plays: Number(x.playcount || 0),
    image: kind === 'artists' ? '' : img(x.image),
    url: x.url,
  }));
}

export async function similar(artist, signal, limit = 15) {
  if (!isLive()) return [];
  const d = await call('artist.getsimilar', { artist, autocorrect: 0, limit }, signal);
  return list(d.similarartists?.artist).map((a) => ({ name: a.name, mbid: a.mbid || '', match: Number(a.match || 0) }))
    .filter((a) => a.name && Number.isFinite(a.match));
}

export async function artistContext(artist, signal) {
  if (!isLive()) return { tags: [] };
  const d = await call('artist.getinfo', { artist, autocorrect: 0 }, signal);
  const a = d.artist;
  if (!a || String(a.name).toLowerCase() !== artist.toLowerCase()) return { tags: [] };
  return { tags: list(a.tags?.tag).map((x) => x.name).filter((x) => !/^seen live|favorite|^\d/i.test(x)).slice(0, 5),
    mbid: a.mbid || '', url: a.url || '' };
}

// Last.fm ranks these by global plays. Its album MBID is often a MusicBrainz
// release ID, so Discover resolves it to a release group before showing a rating.
export async function topAlbums(artist, signal, limit = 8) {
  if (!isLive()) return [];
  const d = await call('artist.gettopalbums', { artist, autocorrect: 0, limit }, signal);
  return list(d.topalbums?.album).map((a) => ({ name: a.name, artist: a.artist?.name || artist,
    mbid: a.mbid || '', plays: Number(a.playcount || 0), url: a.url || '' }))
    .filter((a) => a.name && a.artist.toLowerCase() === artist.toLowerCase());
}

function simTop(name, period, kind) {
  const scale = { '7day': 1, '1month': 4, '3month': 12, '6month': 24, '12month': 50, overall: 160 }[period] || 1;
  const artists = Object.keys(CATALOG).sort((a, b) => hash(name + a) - hash(name + b));
  if (kind === 'artists') return artists.slice(0, 15).map((a, i) => ({ name: a, artist: '', plays: Math.round((70 - i * 4.2) * scale), image: '' }));
  const tracks = artists.flatMap((a) => CATALOG[a]).sort((a, b) => hash(name + a.name) - hash(name + b.name));
  if (kind === 'tracks') return tracks.slice(0, 15).map((t, i) => ({ name: t.name, artist: t.artist, plays: Math.round((24 - i * 1.3) * scale), image: '' }));
  const albums = [...new Map(tracks.map((t) => [t.album, t])).values()];
  return albums.slice(0, 15).map((t, i) => ({ name: t.album, artist: t.artist, plays: Math.round((40 - i * 2.4) * scale), image: '' }));
}

// Keep fetched pages separately so a refresh or network failure resumes an
// anchored snapshot instead of starting a large history over again.
const checkpointKey = (pid) => `sync:lastfm:${pid}`;
const pageKey = (pid, page) => `${checkpointKey(pid)}:page:${page}`;

export async function clearCheckpoint(pid) {
  const meta = await idb.get(checkpointKey(pid));
  await idb.delMany([checkpointKey(pid), ...Array.from({ length: Math.max(0, (meta?.next || 1) - 1) }, (_, i) => pageKey(pid, i + 1))]);
}

// Page through a fixed snapshot of the whole scrobble history, 200 per page.
export async function importAll(name, { onProgress, signal, since = 0, pid = name } = {}) {
  if (!isLive()) throw new SourceError('nokey', 'Importing needs a Last.fm API key. Add one in Settings.');
  let meta = await idb.get(checkpointKey(pid));
  if (meta && (meta.name !== name || meta.since !== since || Date.now() - meta.created > 14 * 864e5)) {
    await clearCheckpoint(pid); meta = null;
  }
  const chunks = new Map();
  const unpack = (d) => {
    const rows = [];
    for (const t of list(d.recenttracks?.track)) {
      if (t['@attr']?.nowplaying === 'true' || !t.date?.uts) continue;
      rows.push({ t: Number(t.date.uts) * 1000, track: t.name, artist: t.artist?.['#text'] ?? '', album: t.album?.['#text'] ?? '', ms: null, skipped: null, src: 'lastfm' });
    }
    return rows;
  };
  if (!meta) {
    const to = Math.floor(Date.now() / 1000);
    const params = { user: name, limit: 200, to, ...(since ? { from: Math.floor(since / 1000) + 1 } : {}) };
    const first = await call('user.getrecenttracks', { ...params, page: 1 }, signal);
    const attr = first.recenttracks?.['@attr'] || {};
    const rows = unpack(first);
    meta = { name, since, to, pages: Math.max(1, Number(attr.totalPages || 1)), total: Number(attr.total || 0), next: 2, count: rows.length, created: Date.now() };
    chunks.set(1, rows);
    await idb.set(pageKey(pid, 1), rows);
    await idb.set(checkpointKey(pid), meta);
  }
  onProgress?.(meta.count, meta.total, meta.next > 2 ? 'resuming' : 'reading');
  const params = { user: name, limit: 200, to: meta.to, ...(since ? { from: Math.floor(since / 1000) + 1 } : {}) };
  const fetchPage = async (page) => {
      let tries = 0;
      for (;;) {
        try { return unpack(await call('user.getrecenttracks', { ...params, page }, signal)); } catch (e) {
          if (e.name === 'AbortError' || ++tries > 4) throw e;
          await wait(1200 * tries, signal);
        }
      }
  };
  while (meta.next <= meta.pages) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const pages = Array.from({ length: Math.min(3, meta.pages - meta.next + 1) }, (_, i) => meta.next + i);
    const results = await Promise.all(pages.map(fetchPage));
    for (let i = 0; i < pages.length; i++) {
      chunks.set(pages[i], results[i]);
      await idb.set(pageKey(pid, pages[i]), results[i]);
      meta.count += results[i].length;
    }
    meta.next += pages.length;
    await idb.set(checkpointKey(pid), meta);
    onProgress?.(meta.count, meta.total, 'reading');
    await wait(120, signal);
  }
  const rows = [];
  for (let page = 1; page <= meta.pages; page++) {
    const stored = chunks.get(page) || await idb.get(pageKey(pid, page));
    rows.push(...(stored || await fetchPage(page)));
  }
  rows.sort((a, b) => a.t - b.t);
  return rows;
}

export const estimateImport = (count) => Math.max(5, Math.round((count / 200 / 3) * 0.55));
