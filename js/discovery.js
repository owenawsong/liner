// Measured listening creates the candidate pool. A validated curator can adjust
// its order within limits; every name and connection still comes from the APIs.
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
    const opinion = taste.items[tasteKey('artist', name)];
    if (!key || opinion?.status === 'hidden' || (opinion?.rating && opinion.rating <= 2)) return;
    const old = map.get(key);
    if (old) { old.weight += weight; old.why.add(why); }
    else map.set(key, { name, weight, why: new Set([why]), tag: cachedArtist(name)?.tags?.[0] || '' });
  };
  const recent = topIn(A, 'artists', A.to - 90 * DAY, A.to + 1, 16);
  const recentTotal = recent.reduce((sum, a) => sum + a.plays, 0) || 1;
  const lifetimeTotal = A.artists.slice(0, 24).reduce((sum, a) => sum + (a.n || 1), 0) || 1;
  recent.forEach((a) => add(a.name, 1.6 * Math.sqrt(a.plays / recentTotal), 'in your recent rotation'));
  A.artists.slice(0, 24).forEach((a) => add(a.name, .75 * Math.sqrt((a.n || 1) / lifetimeTotal), 'an all-time favorite'));
  const favorites = Object.values(taste.items).filter((x) => x.rating >= 4 || x.status === 'saved')
    .sort((a, b) => (b.updated || 0) - (a.updated || 0));
  favorites.forEach((x) => add(x.kind === 'album' ? x.artist : x.name,
    x.rating >= 4 ? .8 + .1 * (x.rating - 4) : .8,
    x.rating >= 4 ? 'rated highly by you' : 'saved by you'));
  const pool = [...map.values()].sort((a, b) => b.weight - a.weight);
  pool.forEach((seed) => {
    seed.recentPlays = recent.find((a) => normalize(a.name) === normalize(seed.name))?.plays || 0;
    seed.lifetimePlays = A.artists.find((a) => normalize(a.name) === normalize(seed.name))?.n || 0;
  });
  const pinned = [...new Set(favorites.map((x) => normalize(x.kind === 'album' ? x.artist : x.name)))]
    .map((key) => map.get(key)).filter(Boolean).slice(0, 5);
  const rest = pool.filter((x) => !pinned.includes(x));
  const core = [...pinned, ...rest.slice(0, 10 - pinned.length)];
  const tail = rest.slice(10 - pinned.length, 25);
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
  if (!rows.length && seeds.length) throw new Error('Artist connections could not be loaded. Your saved picks are still available.');
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
      item.sources.push({ name: seed.name, match: match.match, why: [...seed.why], weight: seed.weight,
        recentPlays:seed.recentPlays || 0,lifetimePlays:seed.lifetimePlays || 0 });
      map.set(key, item);
    }
  }
  return [...map.values()];
}

export function rankCandidates(pool, taste, mode = 'for-you', keepRated = new Set(), curation = []) {
  const editorial = new Map(curation.map((x) => [normalize(x.name), x]));
  const likedAlbums = new Set(Object.values(taste.items).filter((x) => x.kind === 'album' && x.rating >= 4).map((x) => normalize(x.artist)));
  const dislikedArtists = new Set(Object.values(taste.items).filter((x) => x.kind === 'album' && x.rating && x.rating <= 2 && !likedAlbums.has(normalize(x.artist))).map((x) => normalize(x.artist)));
  let allowed = pool.filter((x) => {
    const key = tasteKey('artist', x.name), f = taste.items[key];
    return !dislikedArtists.has(normalize(x.name)) && (!f || (f.status !== 'hidden' && f.status !== 'known' && (!f.rating || keepRated.has(key))));
  });
  if (mode === 'deep') {
    const audienceFor = (x) => cachedListeners(x.name) || x.audience;
    const withAudience = allowed.filter((x) => audienceFor(x) > 0);
    const ceiling = [100000, 500000, 1000000, 3000000].find((n) => withAudience.filter((x) => audienceFor(x) <= n).length >= 8);
    if (ceiling) allowed = withAudience.filter((x) => audienceFor(x) <= ceiling);
    else if (withAudience.length) allowed = withAudience;
  }
  const scored = allowed.map((x) => {
    const audience = cachedListeners(x.name) || x.audience;
    const audienceBonus = audience ? Math.min(1, Math.max(0, (Math.log10(20e6) - Math.log10(Math.max(1, audience))) / 3.8)) : 0;
    const connectionBonus = Math.min(3, x.sources.length) * .06;
    const note = editorial.get(normalize(x.name));
    const base = x.score * (1 + connectionBonus) * (mode === 'for-you' && note ? 1.25 - Math.min(note.rank, 10) * .018 : 1);
    // Keep a famous adjacent artist available, but let a strong less-obvious
    // connection lead the ordinary view once its audience has been checked.
    const novelty = !audience ? 1 : audience > 5000000 ? .76 : audience > 3000000 ? .9 : audience < 3000000 ? 1.12 : 1;
    const score = mode === 'deep' ? base * (1 + audienceBonus * 2.2)
      : mode === 'explore' ? base * (1.3 - x.match * .7) * novelty : base * novelty;
    return { ...x, audience, score, editorial: note?.reason || '' };
  }).sort((a, b) => b.score - a.score);
  const picked = [], used = new Map();
  for (const x of scored) {
    const lead = connectionFor(x)?.name;
    if ((used.get(lead) || 0) >= 3) continue;
    picked.push(x); used.set(lead, (used.get(lead) || 0) + 1);
    if (picked.length === 12) break;
  }
  return picked;
}

export const connectionFor = (x) => [...(x.sources || [])].sort((a,b) =>
  ((b.weight || 1)*b.match)-((a.weight || 1)*a.match))[0];

export function connectionReason(x) {
  const lead = connectionFor(x);
  if (!lead) return 'A new artist from the checked Last.fm catalogue.';
  const history = lead.recentPlays ? `${lead.name} has ${lead.recentPlays.toLocaleString('en')} plays in your latest 90 days.`
    : lead.lifetimePlays ? `${lead.name} has ${lead.lifetimePlays.toLocaleString('en')} plays in your history.`
    : `${lead.name} is ${lead.why?.includes('saved by you') ? 'on your saved shelf' : 'one of your rated favorites'}.`;
  const other = [...(x.sources || [])].filter(s=>s.name!==lead.name).sort((a,b)=>b.weight*b.match-a.weight*a.match)[0];
  return `${history} Last.fm listeners also connect ${x.name} to ${lead.name}${other ? ` and ${other.name}` : ''}.`;
}

export function usefulCuration(reason, candidate) {
  if (typeof reason !== 'string' || reason.trim().length < 30) return false;
  const text = normalize(reason), tags=(candidate.tags || []).filter(t=>normalize(t).length>2);
  const tagCount=tags.filter(t=>text.includes(normalize(t))).length;
  const ties=(candidate.sources || []).some(s=>text.includes(normalize(s.name)));
  // Genre lists are metadata, not an explanation of why this is worth trying.
  const opening=normalize(reason.slice(0,100));
  const openingTags=tags.filter(t=>opening.includes(normalize(t))).length;
  return tagCount < 3 && !(tagCount >= 2 && !ties) && openingTags < 2 && !/^(genres?|tags?)\s*:/i.test(reason)
    && !/\b(offers?|provides?|boasts?|blends? a|unique blend|perfect for|fans of these genres)\b/i.test(reason);
}

export function revisitRecord(A, taste) {
  const boundary = A.to - 90 * DAY, recent = new Set((A.rows || []).filter(r=>r.t>=boundary)
    .map(r=>tasteKey('album',r.album,r.artist)));
  const album = A.albums.find(a=>a.n>=15 && !recent.has(tasteKey('album',a.album,a.artist))
    && !['hidden'].includes(taste.items[tasteKey('album',a.album,a.artist)]?.status)
    && !(taste.items[tasteKey('album',a.album,a.artist)]?.rating && taste.items[tasteKey('album',a.album,a.artist)]?.rating <= 2)
    && taste.items[tasteKey('artist',a.artist)]?.status!=='hidden'
    && !(taste.items[tasteKey('artist',a.artist)]?.rating && taste.items[tasteKey('artist',a.artist)]?.rating <= 2));
  if (!album) return null;
  const rows=A.rows.filter(r=>r.album===album.album&&r.artist===album.artist);
  const last=rows.at(-1)?.t;
  const tracks=new Map();rows.forEach(r=>tracks.set(r.track,(tracks.get(r.track)||0)+1));
  const track=[...tracks].sort((a,b)=>b[1]-a[1])[0];
  return {lane:'revisit',artist:album.artist,recorded:true,album:{name:album.album,artist:album.artist,plays:album.n,group:null},
    track:track?{name:track[0],artist:album.artist,recorded:true,plays:track[1],url:''}:null,
    reason:`You played this record ${album.n.toLocaleString('en')} times, but not in your latest 90 days.${last ? ` Last heard ${new Date(last).toLocaleDateString('en',{month:'short',year:'numeric'})}.` : ''}`};
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
      return !heard.has(key) && !feedback?.status && !feedback?.rating && !/^(\(null\)|unknown|greatest hits|best of)/i.test(album.name);
    });
    if (pick) picks.push({ ...pick, reason: artist.sources.slice(0, 2).map((x) => x.name), match: artist.match });
    onProgress(Math.min(picks.length, 6), 6, artist.name);
    if (picks.length >= 6) break;
  }
  return picks;
}
