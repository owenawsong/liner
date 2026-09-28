// Discovery uses observed listening and explicit feedback. AI does not rank
// recommendations; the reasons on each card can be traced to API results.
import { idb } from './ui.js';
import { topIn } from './analysis.js';
import { cachedArtist, cachedListeners } from './meta.js';
import { normalize, tasteKey } from './taste.js';
import * as lastfm from './sources/lastfm.js';

const DAY = 864e5;
const TTL = 14 * DAY;

async function cached(key, loader, signal) {
  const stored = await idb.get(`discover:v1:${key}`);
  if (stored && Date.now() - stored.at < TTL) return stored.value;
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  const value = await loader();
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  idb.set(`discover:v1:${key}`, { at: Date.now(), value });
  return value;
}

export function discoverySeeds(A, taste, edition = 0) {
  const map = new Map();
  const add = (name, weight, why) => {
    const key = normalize(name);
    if (!key || taste.items[tasteKey('artist', name)]?.status === 'hidden') return;
    const old = map.get(key);
    if (old) { old.weight += weight; old.why.add(why); }
    else map.set(key, { name, weight, why: new Set([why]), tag: cachedArtist(name)?.tags?.[0] || '' });
  };
  const recent = topIn(A, 'artists', A.to - 180 * DAY, A.to + 1, 10);
  recent.forEach((a, i) => add(a.name, .9 / (i + 2) ** .55, 'in your recent rotation'));
  A.artists.slice(0, 24).forEach((a, i) => add(a.name, .55 / (i + 2) ** .55, 'an all-time favorite'));
  Object.values(taste.items).filter((x) => x.rating >= 4)
    .forEach((x) => add(x.kind === 'album' ? x.artist : x.name, .45 * (x.rating / 5), 'rated highly by you'));
  const pool = [...map.values()].sort((a, b) => b.weight - a.weight);
  const core = pool.slice(0, 10);
  const tail = pool.slice(10, 25);
  if (!tail.length) return core;
  const offset = (Math.max(0, edition) * 2) % tail.length;
  return [...core, tail[offset], tail[(offset + Math.min(6, tail.length - 1)) % tail.length]]
    .filter((x, i, a) => a.indexOf(x) === i);
}

export async function candidatePool(A, seeds, signal, onProgress = () => {}) {
  const rows = [];
  for (let i = 0; i < seeds.length; i += 2) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const batch = seeds.slice(i, i + 2);
    const result = await Promise.allSettled(batch.map((seed) => cached(`similar:${normalize(seed.name)}`,
      () => lastfm.similar(seed.name, signal, 35), signal)));
    result.forEach((r, j) => { if (r.status === 'fulfilled') rows.push({ seed: batch[j], matches: r.value }); });
    onProgress(Math.min(i + batch.length, seeds.length), seeds.length);
  }
  const heard = new Set(A.artists.map((a) => normalize(a.name)));
  const map = new Map();
  for (const { seed, matches } of rows) {
    for (const match of matches) {
      const key = normalize(match.name);
      if (!key || heard.has(key) || match.match < .12) continue;
      const parts = match.name.split(/\s+(?:&|x|feat\.?|ft\.?)\s+|,\s+/i);
      if (parts.length > 1 && parts.some((part) => heard.has(normalize(part)))) continue;
      const item = map.get(key) || { name: match.name, mbid: match.mbid, sources: [], score: 0, match: 0 };
      item.score += seed.weight * Math.pow(match.match, 1.25);
      item.match = Math.max(item.match, match.match);
      if (!item.mbid) item.mbid = match.mbid;
      item.sources.push({ name: seed.name, match: match.match, why: [...seed.why], weight: seed.weight });
      map.set(key, item);
    }
  }
  return [...map.values()];
}

export function rankCandidates(pool, taste, mode = 'for-you') {
  let allowed = pool.filter((x) => {
    const f = taste.items[tasteKey('artist', x.name)];
    return !f || (f.status !== 'hidden' && f.status !== 'known' && !f.rating);
  });
  if (mode === 'deep') {
    const withAudience = allowed.filter((x) => cachedListeners(x.name) > 0);
    const ceiling = [100000, 500000, 1000000, 3000000].find((n) => withAudience.filter((x) => cachedListeners(x.name) <= n).length >= 8);
    if (ceiling) allowed = withAudience.filter((x) => cachedListeners(x.name) <= ceiling);
    else if (withAudience.length) allowed = withAudience;
  }
  const scored = allowed.map((x) => {
    const audience = cachedListeners(x.name);
    const audienceBonus = audience ? Math.min(1, Math.max(0, (Math.log10(20e6) - Math.log10(Math.max(1, audience))) / 3.8)) : 0;
    const connectionBonus = Math.min(3, x.sources.length) * .06;
    const base = x.score * (1 + connectionBonus);
    const score = mode === 'deep' ? base * (1 + audienceBonus * 2.2)
      : mode === 'explore' ? base * (1.3 - x.match * .7) : base;
    return { ...x, audience, score };
  }).sort((a, b) => b.score - a.score);
  const picked = [], used = new Map();
  for (const x of scored) {
    const lead = x.sources.sort((a, b) => b.match - a.match)[0]?.name;
    if ((used.get(lead) || 0) >= 3) continue;
    picked.push(x); used.set(lead, (used.get(lead) || 0) + 1);
    if (picked.length === 12) break;
  }
  if (picked.length < 12) picked.push(...scored.filter((x) => !picked.includes(x)).slice(0, 12 - picked.length));
  return picked;
}

export async function albumsFor(artists, A, taste, signal, onProgress = () => {}) {
  const heard = new Set(A.albums.map((a) => tasteKey('album', a.album, a.artist)));
  const picks = [];
  for (const artist of artists.slice(0, 10)) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    let albums = [];
    try { albums = await cached(`albums:${normalize(artist.name)}`,
      () => lastfm.topAlbums(artist.name, signal, 8), signal); } catch (e) { if (e.name === 'AbortError') throw e; }
    const pick = albums.find((album) => {
      const key = tasteKey('album', album.name, album.artist);
      const feedback = taste.items[key];
      return album.mbid && !heard.has(key) && feedback?.status !== 'hidden' && feedback?.status !== 'known' && !feedback?.rating;
    });
    if (pick) picks.push({ ...pick, reason: artist.sources.slice(0, 2).map((x) => x.name), match: artist.match });
    onProgress(Math.min(picks.length, 6), 6, artist.name);
    if (picks.length >= 6) break;
  }
  return picks;
}
