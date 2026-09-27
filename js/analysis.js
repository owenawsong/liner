// Turns a list of plays into timelines, eras, a listening clock and insights.
// Row shape: { t (ms), track, artist, album, ms|null, skipped|null, shuffle|null, platform|null }
import { esc, num, fullDate, monthYear, longMonth, span, pct, plural, hourLabel } from './ui.js';

const DAY = 864e5;
const AVG_SONG_MS = 3.4 * 60000;
const dayIndex = (t) => Math.floor((t - new Date(t).getTimezoneOffset() * 6e4) / DAY);
const dayStart = (di) => { const d = new Date(di * DAY); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime(); };
const trackKey = (r) => `${r.track}\u0000${r.artist}`;
const bump = (m, k, by = 1) => m.set(k, (m.get(k) || 0) + by);
const top1 = (m) => { let bk = null, bv = -1; for (const [k, v] of m) if (v > bv) { bk = k; bv = v; } return [bk, bv]; };
const b = (s) => `<b>${esc(s)}</b>`;

export function lowerBound(rows, t) {
  let lo = 0, hi = rows.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (rows[mid].t < t) lo = mid + 1; else hi = mid; }
  return lo;
}

export function analyze(all, { minMs = 30000 } = {}) {
  const rows = [];
  let msSum = 0, msNull = 0, hasMs = false, short = 0;
  let skipKnown = 0, skipN = 0, shuffleKnown = 0, shuffleN = 0;
  const platforms = new Map();
  const artistSkip = new Map();
  for (const r of all) {
    if (!r.track || !r.artist) continue;
    if (r.skipped != null) {
      skipKnown++; if (r.skipped) skipN++;
      const s = artistSkip.get(r.artist) || [0, 0]; s[1]++; if (r.skipped) s[0]++; artistSkip.set(r.artist, s);
    }
    if (r.ms != null) {
      hasMs = true;
      if (r.ms < minMs) { short++; continue; }
      msSum += r.ms;
    } else msNull++;
    if (r.shuffle != null) { shuffleKnown++; if (r.shuffle) shuffleN++; }
    if (r.platform) bump(platforms, r.platform);
    rows.push(r);
  }

  const A = {
    rows, plays: rows.length, short, minMs, hasMs,
    hours: (msSum + msNull * AVG_SONG_MS) / 3.6e6,
    hoursEstimated: msNull > 0,
    from: rows[0]?.t, to: rows[rows.length - 1]?.t,
    skipRate: skipKnown > 50 ? skipN / skipKnown : null,
    shuffleRate: shuffleKnown > 50 ? shuffleN / shuffleKnown : null,
    platforms: [...platforms.entries()].sort((a, b2) => b2[1] - a[1]),
  };
  if (!rows.length) return { ...A, empty: true, months: [], eras: [], years: [], insights: [], heat: Array.from({ length: 7 }, () => new Array(24).fill(0)), artists: [], tracks: [], albums: [] };

  const artists = new Map(), tracks = new Map(), albums = new Map(), days = new Map(), dayTrack = new Map();
  const months = new Map(), years = new Map();
  const heat = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const r of rows) {
    const d = new Date(r.t);
    heat[(d.getDay() + 6) % 7][d.getHours()]++;
    const di = dayIndex(r.t);
    bump(days, di);
    const tk = trackKey(r);
    bump(dayTrack, `${di}|${tk}`);
    const mi = d.getFullYear() * 12 + d.getMonth();
    let m = months.get(mi);
    if (!m) { m = { n: 0, artists: new Map(), tracks: new Map() }; months.set(mi, m); }
    m.n++; bump(m.artists, r.artist); bump(m.tracks, tk);
    const y = d.getFullYear();
    let yr = years.get(y);
    if (!yr) { yr = { y, n: 0, artists: new Map(), tracks: new Map(), newArtists: 0 }; years.set(y, yr); }
    yr.n++; bump(yr.artists, r.artist); bump(yr.tracks, tk);
    let a = artists.get(r.artist);
    if (!a) { a = { name: r.artist, n: 0, first: r.t, firstTrack: r.track, times: [], tracks: new Map() }; artists.set(r.artist, a); yr.newArtists++; }
    a.n++; a.last = r.t; a.times.push(r.t); bump(a.tracks, r.track);
    let t = tracks.get(tk);
    if (!t) { t = { track: r.track, artist: r.artist, album: r.album, n: 0, first: r.t, times: [] }; tracks.set(tk, t); }
    t.n++; t.last = r.t; t.times.push(r.t);
    if (r.album) {
      const ak = `${r.album}\u0000${r.artist}`;
      const al = albums.get(ak) || { album: r.album, artist: r.artist, n: 0 };
      al.n++; albums.set(ak, al);
    }
  }

  // Months, contiguous from first to last so gaps show as empty bars.
  const mKeys = [...months.keys()];
  const mMin = Math.min(...mKeys), mMax = Math.max(...mKeys);
  A.months = [];
  for (let mi = mMin; mi <= mMax; mi++) {
    const m = months.get(mi);
    const y = Math.floor(mi / 12), mo = mi % 12;
    const [topArtist, topN] = m ? top1(m.artists) : [null, 0];
    const [tk] = m ? top1(m.tracks) : [null];
    A.months.push({ i: mi, y, m: mo, start: new Date(y, mo, 1).getTime(), n: m?.n || 0, topArtist, topN, topTrack: tk ? tk.split('\u0000') : null });
  }

  A.artists = [...artists.values()].sort((x, y) => y.n - x.n);
  A.tracks = [...tracks.values()].sort((x, y) => y.n - x.n);
  A.albums = [...albums.values()].sort((x, y) => y.n - x.n);
  A.heat = heat;
  A.days = days;
  A.activeDays = days.size;
  A.years = [...years.values()].sort((x, y) => x.y - y.y).map((yr) => {
    const [ta, tan] = top1(yr.artists);
    const [tt, ttn] = top1(yr.tracks);
    return { y: yr.y, n: yr.n, topArtist: ta, topArtistN: tan, topTrack: tt?.split('\u0000'), topTrackN: ttn, newArtists: yr.newArtists, artistCount: yr.artists.size };
  });
  A.artistSkip = artistSkip;
  A.eras = findEras(A.months, A.months.map((m) => months.get(m.i)?.artists));
  A.insights = insights(A, { artistSkip, dayTrack });
  return A;
}

/* ---------- Eras: stretches of months led by the same artist ---------- */
function findEras(months, maps) {
  // Leader of a rolling three-month window, so one odd month doesn't split an era.
  const leads = months.map((_, i) => {
    const sum = new Map();
    let n = 0;
    for (let j = i - 1; j <= i + 1; j++) {
      if (!maps[j]) continue;
      for (const [a, c] of maps[j]) { bump(sum, a, c); n += c; }
    }
    const [a, c] = top1(sum);
    return n >= 30 && c / n >= 0.15 ? a : null;
  });
  const eras = [];
  let cur = null;
  leads.forEach((lead, i) => {
    if (!lead) return;
    if (cur && cur.artist === lead && i - cur.end <= 3) { cur.end = i; return; }
    if (cur) eras.push(cur);
    cur = { artist: lead, start: i, end: i };
  });
  if (cur) eras.push(cur);
  const kept = eras.filter((e) => e.end - e.start >= 2);
  kept.forEach((e) => { e.plays = 0; for (let i = e.start; i <= e.end; i++) e.plays += maps[i]?.get(e.artist) || 0; });
  const palette = new Map();
  kept.forEach((e) => {
    if (!palette.has(e.artist)) palette.set(e.artist, palette.size % 6);
    e.color = palette.get(e.artist);
    e.from = months[e.start].start;
    e.to = new Date(months[e.end].y, months[e.end].m + 1, 0).getTime();
    e.months = e.end - e.start + 1;
  });
  return kept;
}

export function topIn(A, kind, from = -Infinity, to = Infinity, limit = 25) {
  const m = new Map();
  const start = from === -Infinity ? 0 : lowerBound(A.rows, from);
  for (let i = start; i < A.rows.length; i++) {
    const r = A.rows[i];
    if (r.t >= to) break;
    if (kind === 'artists') bump(m, r.artist);
    else if (kind === 'tracks') bump(m, trackKey(r));
    else if (r.album) bump(m, `${r.album}\u0000${r.artist}`);
  }
  return [...m.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, limit).map(([k, n]) => {
    if (kind === 'artists') return { name: k, artist: '', plays: n };
    const [name, artist] = k.split('\u0000');
    const album = kind === 'tracks' ? A.tracks.find((t) => t.track === name && t.artist === artist)?.album : name;
    return { name, artist, plays: n, album };
  });
}

export function monthDetail(A, idx) {
  const mo = A.months[idx];
  const to = new Date(mo.y, mo.m + 1, 1).getTime();
  return { month: mo, artists: topIn(A, 'artists', mo.start, to, 5), tracks: topIn(A, 'tracks', mo.start, to, 5) };
}

/* ---------- Insights ---------- */
function weekly(times, center, span_ = 13) {
  const wk = 7 * DAY;
  const out = new Array(span_ * 2 + 1).fill(0);
  for (const t of times) { const i = Math.floor((t - center) / wk) + span_; if (i >= 0 && i < out.length) out[i]++; }
  return out;
}

function insights(A, { artistSkip, dayTrack }) {
  const list = [];
  const add = (x) => list.push(x);
  const topArtists = A.artists.slice(0, 300);

  // Obsession: a song that lived mostly inside one month.
  let best = null;
  for (const t of A.tracks.slice(0, 400)) {
    if (t.n < 15) break;
    let j = 0, max = 0, at = 0;
    for (let i = 0; i < t.times.length; i++) {
      while (t.times[i] - t.times[j] > 30 * DAY) j++;
      if (i - j + 1 > max) { max = i - j + 1; at = t.times[j]; }
    }
    const ratio = max / t.n;
    if (max >= 12 && ratio >= 0.4 && (!best || max * ratio > best.max * best.ratio)) best = { t, max, ratio, at };
  }
  if (best) add({
    id: 'obsession', kicker: 'Obsession',
    title: `${b(best.t.track)}, ${num(best.max)} times in 30 days`,
    body: `That was ${longMonth(best.at)}. You've played it ${plural(best.t.n, 'time')} in total, so ${pct(best.ratio)} of them happened in that one month.`,
    spark: weekly(best.t.times, best.at + 15 * DAY), sparkLabel: 'plays per week around the peak',
  });

  // Resurrection: an artist you came back to after a long break.
  let res = null;
  for (const a of topArtists) {
    if (a.n < 20) continue;
    for (let i = 1; i < a.times.length; i++) {
      const gap = a.times[i] - a.times[i - 1];
      const after = a.times.length - i;
      if (gap >= 300 * DAY && after >= 8 && (!res || gap > res.gap)) res = { a, gap, before: a.times[i - 1], after: a.times[i], n: after };
    }
  }
  if (res) {
    const ys = A.years.map((y) => y.y);
    const counts = ys.map((y) => res.a.times.filter((t) => new Date(t).getFullYear() === y).length);
    add({
      id: 'comeback', kicker: 'Comeback',
      title: `You came back to ${b(res.a.name)} after ${span(res.gap)}`,
      body: `Your last play before the break was in ${monthYear(res.before)}. You came back in ${monthYear(res.after)}, and you've played them ${plural(res.n, 'time')} since.`,
      spark: counts, sparkLabel: `plays per year, ${ys[0]} to ${ys[ys.length - 1]}`,
    });
  }

  // Most-looped song in a single day.
  const [loopKey, loopN] = top1(dayTrack);
  if (loopN >= 6) {
    const [di, tk] = loopKey.split('|');
    const [track, artist] = tk.split('\u0000');
    add({ id: 'loop', kicker: 'On repeat', title: `You played ${b(track)} ${num(loopN)} times in one day`, body: `${fullDate(dayStart(Number(di)))}, by ${esc(artist)}. That's your record for one song in a day.` });
  }

  // Longest streak of days with music.
  const dayList = [...A.days.keys()].sort((x, y) => x - y);
  let run = 1, bestRun = 1, bestEnd = dayList[0];
  for (let i = 1; i < dayList.length; i++) {
    run = dayList[i] === dayList[i - 1] + 1 ? run + 1 : 1;
    if (run > bestRun) { bestRun = run; bestEnd = dayList[i]; }
  }
  if (bestRun >= 7) {
    const current = dayList[dayList.length - 1] >= dayIndex(Date.now()) - 1;
    add({
      id: 'streak', kicker: 'Streak', stat: num(bestRun), statUnit: 'days in a row',
      title: `Your longest streak is ${plural(bestRun, 'day')} straight`,
      body: `From ${fullDate(dayStart(bestEnd - bestRun + 1))} to ${fullDate(dayStart(bestEnd))}${current && bestEnd >= dayIndex(Date.now()) - 1 ? ', and it is still going' : ''}. You've listened on ${num(A.activeDays)} different days overall.`,
    });
  }

  // Biggest single day.
  const [bigDay, bigN] = top1(A.days);
  if (bigN >= 20) {
    const from = dayStart(bigDay), to = from + DAY;
    const byArtist = new Map();
    for (let i = lowerBound(A.rows, from); i < A.rows.length && A.rows[i].t < to; i++) bump(byArtist, A.rows[i].artist);
    const [ta, tn] = top1(byArtist);
    add({ id: 'bigday', kicker: 'Biggest day', stat: num(bigN), statUnit: 'songs', title: `${num(bigN)} songs on ${fullDate(from)}`, body: `Your busiest day ever. ${esc(ta)} made up ${plural(tn, 'play')} of it.` });
  }

  // One artist, one song.
  const one = topArtists.find((a) => a.n >= 40 && top1(a.tracks)[1] / a.n >= 0.7);
  if (one) {
    const [tr, tn] = top1(one.tracks);
    add({ id: 'onesong', kicker: 'One song', title: `For you, ${b(one.name)} is mostly ${b(tr)}`, body: `${pct(tn / one.n)} of your ${esc(one.name)} plays are that one song.` });
  }

  // Loyalty: the artist that shows up every year.
  if (A.years.length >= 3) {
    let loyal = null;
    for (const a of topArtists.slice(0, 80)) {
      const ys = new Map();
      a.times.forEach((t) => bump(ys, new Date(t).getFullYear()));
      const k = [...ys.values()].filter((v) => v >= 5).length;
      if (!loyal || k > loyal.k || (k === loyal.k && a.n > loyal.a.n)) loyal = { a, k };
    }
    if (loyal && loyal.k >= 3) add({ id: 'loyal', kicker: 'Constant', title: `${b(loyal.a.name)} has been there every year`, body: `They show up in ${loyal.k} of your ${A.years.length} years, with ${plural(loyal.a.n, 'play')} in total. Your first was ${b(loyal.a.firstTrack)} on ${fullDate(loyal.a.first)}.` });
  }

  // Time of day.
  const byHour = new Array(24).fill(0);
  A.heat.forEach((row) => row.forEach((v, h) => { byHour[h] += v; }));
  const peak = byHour.indexOf(Math.max(...byHour));
  const night = (byHour[0] + byHour[1] + byHour[2] + byHour[3] + byHour[4]) / A.plays;
  const morning = (byHour[5] + byHour[6] + byHour[7] + byHour[8]) / A.plays;
  if (night >= 0.12) add({ id: 'night', kicker: 'Late nights', stat: pct(night), statUnit: 'after midnight', title: 'A lot of your music happens after midnight', body: `${pct(night)} of your plays start between midnight and 5 am. Your busiest hour overall is ${hourLabel(peak)}.` });
  else if (morning >= 0.16) add({ id: 'morning', kicker: 'Early starts', stat: pct(morning), statUnit: 'from 5 to 9 am', title: 'You start the day with music', body: `${pct(morning)} of your plays happen between 5 and 9 am. Your busiest hour overall is ${hourLabel(peak)}.` });
  else add({ id: 'peak', kicker: 'Rush hour', title: `Your busiest hour is ${hourLabel(peak)}`, body: `More songs start in that hour than any other. Open the Clock tab to see your whole week.` });

  // Discovery.
  if (A.years.length >= 3) {
    const full = A.years.slice(1, -1).length ? A.years.slice(1, -1) : A.years;
    const bestY = [...full].sort((x, y) => y.newArtists - x.newArtists)[0];
    const sorted = full.map((y) => y.newArtists).sort((x, y) => x - y);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (bestY.newArtists >= 12 && bestY.newArtists > median * 1.15) add({ id: 'discovery', kicker: 'Discovery', title: `${bestY.y} was your year for new music`, body: `You played ${num(bestY.newArtists)} artists for the first time that year. A typical year for you is closer to ${num(median)}.` });
  }

  // Skips.
  if (A.skipRate != null) {
    const ranked = [...artistSkip.entries()].filter(([, s]) => s[1] >= 40).map(([a, s]) => [a, s[0] / s[1]]).sort((x, y) => y[1] - x[1]);
    const most = ranked[0], least = ranked[ranked.length - 1];
    add({
      id: 'skips', kicker: 'Skips', stat: pct(A.skipRate), statUnit: 'of songs skipped',
      title: `You skip ${pct(A.skipRate)} of songs`,
      body: most && least && most[0] !== least[0]
        ? `${b(most[0])} gets skipped the most, ${pct(most[1])} of the time. ${b(least[0])} almost never does, at ${pct(least[1])}.`
        : 'Spotify records every skip in your export, so this number is exact.',
    });
  }

  // Where it started with your top artist.
  const no1 = A.artists[0];
  add({ id: 'first', kicker: 'Origin story', title: `Where ${b(no1.name)} started`, body: `Your first ${esc(no1.name)} play was ${b(no1.firstTrack)} on ${fullDate(no1.first)}. You've played them ${plural(no1.n, 'time')} since, more than anyone else.` });

  // Weekends.
  const weekendShare = (A.heat[5].reduce((s, v) => s + v, 0) + A.heat[6].reduce((s, v) => s + v, 0)) / A.plays;
  const ratio = weekendShare / (2 / 7);
  if (ratio > 1.12) add({ id: 'weekend', kicker: 'Weekends', title: 'Weekends are when the music comes on', body: `You play ${pct(ratio - 1)} more per day on Saturdays and Sundays than on weekdays.` });
  else if (ratio < 0.88) add({ id: 'weekday', kicker: 'Weekdays', title: 'Music is part of your working week', body: `You play ${pct(1 - ratio)} less per day on weekends than on weekdays.` });

  // Top album.
  if (A.albums[0]) add({ id: 'album', kicker: 'Album', title: `Your most-played album is ${b(A.albums[0].album)}`, body: `${plural(A.albums[0].n, 'play')} of ${esc(A.albums[0].artist)}.` });

  // Devices and shuffle, only in the Spotify export.
  if (A.platforms.length > 1) {
    const [p, n] = A.platforms[0];
    add({ id: 'devices', kicker: 'Devices', stat: pct(n / A.plays), statUnit: `on ${p}`, title: `Most of your listening happens on ${esc(p)}`, body: A.platforms.slice(1, 4).map(([name, c]) => `${esc(name)} ${pct(c / A.plays)}`).join(' · ') });
  }
  if (A.shuffleRate != null) add({ id: 'shuffle', kicker: 'Shuffle', stat: pct(A.shuffleRate), statUnit: 'on shuffle', title: A.shuffleRate > 0.5 ? 'You mostly let shuffle decide' : 'You mostly pick what comes next', body: `${pct(A.shuffleRate)} of your plays were on shuffle.` });

  // Replay vs variety.
  const perSong = A.plays / A.tracks.length;
  add({ id: 'variety', kicker: perSong > 8 ? 'Replays' : 'Variety', title: perSong > 8 ? 'You come back to the same songs a lot' : 'You keep things moving', body: `${num(A.tracks.length)} different songs across ${num(A.plays)} plays, about ${perSong.toFixed(1)} plays per song.` });

  // Time.
  add({ id: 'hours', kicker: 'Time', stat: num(A.hours), statUnit: 'hours', title: `${num(A.hours)} hours of music${A.hoursEstimated ? ', roughly' : ''}`, body: `That's ${num(A.hours / 24)} full days.${A.hoursEstimated ? ' Some of your sources only log plays, not listening time, so this uses an average song length.' : ''}` });

  return list;
}
