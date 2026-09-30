// Local, reproducible charts from the actual listening record.
import { lowerBound } from './analysis.js';

const DAY = 864e5;

export function patterns(A, now = Date.now()) {
  const first = new Map(A.artists.map((a) => [a.name, a.first]));
  const months = A.months.slice(-24).map((m) => ({
    start: m.start, year: m.y, month: m.m, plays: 0, artists: new Map(), newPlays: 0, newArtists: new Set(),
  }));
  const byMonth = new Map(months.map((m) => [m.year * 12 + m.month, m]));
  const recentFrom = now - 90 * DAY;
  const recentArtists = new Set(), activeDays = new Set();
  let recentPlays = 0, recentNewPlays = 0;
  for (let i = lowerBound(A.rows, months[0]?.start ?? Infinity); i < A.rows.length; i++) {
    const row = A.rows[i], date = new Date(row.t), key = date.getFullYear() * 12 + date.getMonth();
    const bucket = byMonth.get(key);
    if (bucket) {
      bucket.plays++;
      bucket.artists.set(row.artist, (bucket.artists.get(row.artist) || 0) + 1);
      if (first.get(row.artist) >= bucket.start && first.get(row.artist) < new Date(bucket.year, bucket.month + 1, 1).getTime()) {
        bucket.newPlays++; bucket.newArtists.add(row.artist);
      }
    }
    if (row.t >= recentFrom && row.t <= now) {
      recentPlays++; recentArtists.add(row.artist);
      activeDays.add(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`);
      if (first.get(row.artist) >= recentFrom) recentNewPlays++;
    }
  }
  const chart = months.map((m) => {
    const top = [...m.artists].sort((a, b) => b[1] - a[1])[0];
    return { start: m.start, plays: m.plays, breadth: m.artists.size, novelty: m.plays ? Math.round(m.newPlays / m.plays * 100) : 0,
      dominance: m.plays ? Math.round((top?.[1] || 0) / m.plays * 100) : 0, newArtists: m.newArtists.size,
      topArtist: top?.[0] || '', topPlays: top?.[1] || 0 };
  });
  const peak = chart.reduce((best, m) => m.plays > (best?.plays || 0) ? m : best, null);
  return { months: chart, peak, recentPlays, recentArtists: recentArtists.size, activeDays: activeDays.size,
    playsPerActiveDay: activeDays.size ? recentPlays / activeDays.size : 0,
    recentNewShare: recentPlays ? Math.round(recentNewPlays / recentPlays * 100) : 0 };
}

// Artist tags are a proxy for styles, not a measurement of each recording.
// Keep the unmatched share visible so thin metadata cannot look like a trend.
export function genreEvolution(A, tagByArtist, limit = 4) {
  const totals = new Map();
  const years = new Map(A.years.map((y) => [y.y, { year: y.y, plays: y.n, matched: 0, tags: new Map() }]));
  for (const row of A.rows) {
    const tag = tagByArtist.get(row.artist);
    if (!tag) continue;
    const year = years.get(new Date(row.t).getFullYear());
    if (!year) continue;
    year.matched++;
    year.tags.set(tag, (year.tags.get(tag) || 0) + 1);
    totals.set(tag, (totals.get(tag) || 0) + 1);
  }
  const genres = [...totals].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, plays]) => ({ name, plays }));
  return { genres, years: [...years.values()].map((y) => ({ year: y.year, plays: y.plays, matched: y.matched,
    segments: genres.map((g) => ({ name: g.name, plays: y.tags.get(g.name) || 0 })) })) };
}
