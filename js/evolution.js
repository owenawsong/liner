// Compare two equal, recent windows using only observed plays. No guessed mood
// or audio features: a scrobble has an artist, song and time, not a sound key.
import { lowerBound } from './analysis.js';

const DAY = 864e5;
const count = (rows) => {
  const map = new Map();
  rows.forEach((r) => map.set(r.artist, (map.get(r.artist) || 0) + 1));
  return map;
};

export function evolution(A, now = Date.now()) {
  const from = now - 90 * DAY, priorFrom = now - 180 * DAY;
  const currentRows = A.rows.slice(lowerBound(A.rows, from), lowerBound(A.rows, now + 1));
  const priorRows = A.rows.slice(lowerBound(A.rows, priorFrom), lowerBound(A.rows, from));
  const current = count(currentRows), prior = count(priorRows);
  const first = new Map(A.artists.map((a) => [a.name, a.first]));
  const total = currentRows.length, previous = priorRows.length;
  const names = new Set([...current.keys(), ...prior.keys()]);
  const changes = [...names].map((name) => {
    const plays = current.get(name) || 0, before = prior.get(name) || 0;
    return { name, plays, before, share: total ? plays / total : 0, priorShare: previous ? before / previous : 0,
      delta: (total ? plays / total : 0) - (previous ? before / previous : 0) };
  });
  const rising = changes.filter((x) => x.plays >= 5 && x.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 8);
  const fading = changes.filter((x) => x.before >= 5 && x.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 8);
  const discoveries = [...current].filter(([name]) => first.get(name) >= from).map(([name, plays]) => ({ name, plays }))
    .sort((a, b) => b.plays - a.plays).slice(0, 8);
  const comebacks = [...current].filter(([name, plays]) => plays >= 5 && (prior.get(name) || 0) <= 1 && first.get(name) < from - 180 * DAY)
    .map(([name, plays]) => ({ name, plays, last: A.artists.find((a) => a.name === name)?.last }))
    .sort((a, b) => b.plays - a.plays).slice(0, 8);
  const dormant = A.artists.filter((a) => a.n >= 20 && a.last < from).slice(0, 8);
  const newPlays = [...current].reduce((sum, [name, plays]) => sum + (first.get(name) >= from ? plays : 0), 0);
  const topCurrent = [...current].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name]) => name);
  const topPrior = new Set([...prior].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name]) => name));
  const overlap = topCurrent.filter((name) => topPrior.has(name)).length;
  let divergence = 0;
  if (total >= 30 && previous >= 30) {
    for (const name of names) {
      const p = (current.get(name) || 0) / total, q = (prior.get(name) || 0) / previous, m = (p + q) / 2;
      if (p) divergence += p * Math.log2(p / m) / 2;
      if (q) divergence += q * Math.log2(q / m) / 2;
    }
  }
  const shift = total >= 30 && previous >= 30 ? Math.round(Math.sqrt(Math.max(0, divergence)) * 100) : null;
  const months = [];
  const start = new Date(now); start.setDate(1); start.setHours(0, 0, 0, 0); start.setMonth(start.getMonth() - 11);
  const buckets = new Map();
  for (let i = 0; i < 12; i++) {
    const date = new Date(start); date.setMonth(date.getMonth() + i);
    const key = date.getFullYear() * 12 + date.getMonth();
    const bucket = { start: date.getTime(), key, plays: 0, newPlays: 0, artists: new Set() };
    buckets.set(key, bucket); months.push(bucket);
  }
  for (let i = lowerBound(A.rows, start.getTime()); i < A.rows.length; i++) {
    const r = A.rows[i], d = new Date(r.t), bucket = buckets.get(d.getFullYear() * 12 + d.getMonth());
    if (!bucket) continue;
    bucket.plays++; bucket.artists.add(r.artist);
    if (first.get(r.artist) >= bucket.start) bucket.newPlays++;
  }
  return { from, priorFrom, now, total, previous, shift, overlap, activeArtists: current.size, previousArtists: prior.size,
    newArtists: [...current.keys()].filter((name) => first.get(name) >= from).length, newPlays,
    rising, fading, discoveries, comebacks, dormant,
    months: months.map(({ start: month, plays, newPlays: fresh, artists }) => ({ month, plays, fresh, artists: artists.size })) };
}
