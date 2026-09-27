// ListenBrainz source. Fully open API: no key, no sign-in, just a username.
import { wait } from '../ui.js';
import { SourceError } from './lastfm.js';

const BASE = 'https://api.listenbrainz.org/1';

export const id = 'listenbrainz';
export const label = 'ListenBrainz';
export const USERNAME_RE = /^[^/?#\s][^/?#]{0,63}$/;
export const usernameRule = "That doesn't look like a ListenBrainz username.";
export const periods = [
  { id: 'week', label: '7 days' }, { id: 'month', label: 'Month' }, { id: 'quarter', label: '3 months' },
  { id: 'half_yearly', label: '6 months' }, { id: 'year', label: 'Year' }, { id: 'all_time', label: 'All time' },
];
export const isLive = () => true;

let pauseUntil = 0;
async function get(path, params = {}, signal) {
  const url = new URL(BASE + path);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  if (Date.now() < pauseUntil) await wait(pauseUntil - Date.now(), signal);
  let res;
  try { res = await fetch(url, { signal }); } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new SourceError('network', "Couldn't reach ListenBrainz. Check your connection and try again.");
  }
  const remaining = Number(res.headers.get('X-RateLimit-Remaining'));
  const resetIn = Number(res.headers.get('X-RateLimit-Reset-In'));
  if (!Number.isNaN(remaining) && remaining <= 1 && resetIn) pauseUntil = Date.now() + resetIn * 1000 + 150;
  if (res.status === 204) return null; // stats not calculated yet
  if (res.status === 404) throw new SourceError('notfound', 'There is no ListenBrainz user with that name.');
  if (res.status === 429) {
    pauseUntil = Date.now() + (resetIn || 5) * 1000;
    return get(path, params, signal);
  }
  if (!res.ok) throw new SourceError(res.status, `ListenBrainz returned an error (${res.status}). Try again in a moment.`);
  return res.json();
}

const cover = (m) => (m?.caa_release_mbid && m?.caa_id ? `https://coverartarchive.org/release/${m.caa_release_mbid}/${m.caa_id}-250.jpg` : '');
const track = (l, nowPlaying = false) => {
  const md = l.track_metadata || {};
  return {
    name: md.track_name,
    artist: md.artist_name,
    album: md.release_name || '',
    image: cover(md.mbid_mapping),
    nowPlaying,
    t: nowPlaying ? Date.now() : (l.listened_at || 0) * 1000,
    url: '',
  };
};
const enc = encodeURIComponent;

async function latest(name, count, signal) {
  const [now, listens] = await Promise.all([
    get(`/user/${enc(name)}/playing-now`, {}, signal),
    get(`/user/${enc(name)}/listens`, { count }, signal),
  ]);
  const out = (listens?.payload?.listens || []).map((l) => track(l));
  const np = now?.payload?.listens?.[0];
  if (np) out.unshift(track(np, true));
  return out;
}

export async function lookup(name, signal) {
  const [count, rec] = await Promise.all([
    get(`/user/${enc(name)}/listen-count`, {}, signal),
    latest(name, 3, signal),
  ]);
  return {
    user: { name, display: name, image: '', playcount: count?.payload?.count || 0, since: 0, url: `https://listenbrainz.org/user/${enc(name)}/` },
    latest: rec,
    hidden: false,
    simulated: false,
  };
}

export const recent = (name, limit, signal) => latest(name, limit, signal);

export async function profile(name, signal) {
  const dayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  const weekStart = Math.floor(Date.now() / 1000) - 7 * 86400;
  const [info, rec, today, week] = await Promise.all([
    lookup(name, signal),
    latest(name, 20, signal),
    get(`/user/${enc(name)}/listens`, { min_ts: dayStart, count: 1000 }, signal).catch(() => null),
    get(`/user/${enc(name)}/listens`, { min_ts: weekStart, count: 1000 }, signal).catch(() => null),
  ]);
  return {
    source: id, simulated: false, hidden: false,
    user: info.user,
    recent: rec,
    today: today?.payload?.count ?? 0,
    week: week?.payload?.count ?? 0,
    weekCapped: (week?.payload?.count ?? 0) >= 1000,
  };
}

export async function top(name, period, kind, signal, limit = 25) {
  const path = { artists: 'artists', tracks: 'recordings', albums: 'releases' }[kind];
  const d = await get(`/stats/user/${enc(name)}/${path}`, { range: period, count: limit }, signal);
  if (!d) return null; // ListenBrainz hasn't calculated these yet
  const p = d.payload;
  if (kind === 'artists') return p.artists.map((a) => ({ name: a.artist_name, artist: '', plays: a.listen_count, image: '' }));
  if (kind === 'tracks') return p.recordings.map((r) => ({ name: r.track_name, artist: r.artist_name, plays: r.listen_count, image: cover(r) }));
  return p.releases.map((r) => ({ name: r.release_name, artist: r.artist_name, plays: r.listen_count, image: cover(r) }));
}

// Walk backwards through every listen, 1,000 at a time.
export async function importAll(name, { onProgress, signal, since = 0 } = {}) {
  const countRes = await get(`/user/${enc(name)}/listen-count`, {}, signal);
  const total = countRes?.payload?.count || 0;
  const rows = [];
  // The first page asks for the latest listens with no max_ts: ListenBrainz searches
  // backwards in time windows, which is slow when the newest listen is old.
  let maxTs;
  const minTs = since ? Math.floor(since / 1000) : undefined;
  onProgress?.(0, total);
  for (;;) {
    const d = await get(`/user/${enc(name)}/listens`, { count: 1000, max_ts: maxTs, min_ts: minTs }, signal);
    const ls = d?.payload?.listens || [];
    if (!ls.length) break;
    for (const l of ls) {
      const md = l.track_metadata || {};
      if (!md.track_name || !md.artist_name) continue;
      rows.push({ t: l.listened_at * 1000, track: md.track_name, artist: md.artist_name, album: md.release_name || '', ms: null, skipped: null, src: 'listenbrainz' });
    }
    const oldest = ls[ls.length - 1].listened_at;
    if (maxTs && oldest >= maxTs) break;
    maxTs = oldest;
    onProgress?.(rows.length, Math.max(total, rows.length));
    if (minTs && oldest <= minTs) break;
  }
  rows.sort((a, b) => a.t - b.t);
  return rows;
}

export const estimateImport = (count) => Math.max(10, Math.round((count / 1000) * 12));
