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
