// Artist, song and year pages, plus the pieces that link into them.
import { $, $$, esc, sleeve, trackSleeve, num, pct, plural, fullDate, longMonth, monthYear, span, icon, toast } from '../ui.js';
import { hrefFor } from '../core.js';
import { topIn, lowerBound } from '../analysis.js';
import { rankList, insightCard } from '../components.js';
import { artistInfo, cachedArtist } from '../meta.js';

const DAY = 864e5;
const enc = encodeURIComponent;

/* ---------- Links ---------- */
export function linker(pid, A) {
  if (!A) return {};
  const artist = (name) => hrefFor(pid, `artist/${enc(name)}`);
  const song = (name, by) => hrefFor(pid, `song/${enc(by)}/${enc(name)}`);
  return {
    artist,
    song,
    year: (y) => hrefFor(pid, `year/${y}`),
    rank: (x, kind) => (kind === 'artists' ? artist(x.name) : kind === 'tracks' ? song(x.name, x.artist) : x.artist ? artist(x.artist) : null),
    track: (t) => song(t.name, t.artist),
  };
}

/* ---------- Plays per month for one artist or song ---------- */
function perMonth(A, times) {
  const counts = new Array(A.months.length).fill(0);
  const first = A.months[0].i;
  for (const t of times) { const d = new Date(t); const i = d.getFullYear() * 12 + d.getMonth() - first; if (i >= 0 && i < counts.length) counts[i]++; }
  return counts;
}
function monthBars(A, counts, height = 120) {
  const max = Math.max(1, ...counts);
  const years = [];
  A.months.forEach((m, i) => { if (i === 0 || m.m === 0) years.push({ y: m.y, i }); });
  years.forEach((y, k) => { y.span = (years[k + 1]?.i ?? counts.length) - y.i; });
  return `<div class="tl tl--fit" style="--n:${counts.length};--h:${height}px"><div class="tl__inner">
    <div class="tl__bars">${counts.map((v, i) => `<span class="tl__bar" title="${longMonth(A.months[i].start)}: ${num(v)} plays"><i style="height:${(v / max) * 100}%;${v === max ? 'background:var(--accent)' : v ? 'background:color-mix(in srgb, var(--ink) 62%, var(--bg))' : ''}"></i></span>`).join('')}</div>
    <div class="tl__years">${years.map((y) => `<span style="grid-column:${y.i + 1} / span ${y.span}">${y.span >= 6 ? y.y : ''}</span>`).join('')}</div>
  </div></div>`;
}

function notFound(what, back) {
  return `<div class="flow"><span class="label">Not in your history</span><h1>No plays of ${esc(what)}</h1><p class="flow__lede">It isn't in the history Liner has for this profile${back ? ', or it was filtered out by your counting rule' : ''}.</p><div class="flow__actions"><a class="btn btn--line" href="${back}">${icon.back} Back</a></div></div>`;
}

/* ---------- Artist ---------- */
export function artistPage(ctx, name) {
  const { A, pid } = ctx;
  const L = linker(pid, A);
  const idx = A.artists.findIndex((x) => x.name === name || x.name.toLowerCase() === name.toLowerCase());
  if (idx < 0) return notFound(name, hrefFor(pid, 'top'));
  const a = A.artists[idx];
  const counts = perMonth(A, a.times);
  const peakI = counts.indexOf(Math.max(...counts));
  let ms = 0, known = 0;
  for (const r of A.rows) if (r.artist === a.name && r.ms != null) { ms += r.ms; known++; }
  const hours = (ms + (a.n - known) * 3.4 * 60000) / 3.6e6;
  const skip = A.artistSkip?.get(a.name);
  const eras = A.eras.filter((e) => e.artist === a.name);
  const songs = [...a.tracks.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12).map(([track, n]) => ({ name: track, artist: a.name, plays: n, album: A.tracks.find((t) => t.track === track && t.artist === a.name)?.album }));
  const albums = A.albums.filter((al) => al.artist === a.name).slice(0, 6).map((al) => ({ name: al.album, artist: a.name, plays: al.n }));
  const activeYears = new Set(a.times.map((t) => new Date(t).getFullYear())).size;
  const gap = biggestGap(a.times);
  const info = cachedArtist(a.name);

  const html = `
    <header class="dhead">
      ${sleeve(a.name, a.name, { size: 132, round: true, kind: 'artist' })}
      <div class="dhead__body">
        <span class="label">Artist · No. ${idx + 1} of ${num(A.artists.length)}</span>
        <h1>${esc(a.name)}</h1>
        <div class="dhead__meta" id="artist-meta">${metaChips(info)}</div>
      </div>
    </header>
    <div class="stats">
      <div><b>${num(a.n)}</b><span>plays</span></div>
      <div><b>${pct(a.n / A.plays)}</b><span>of all your listening</span></div>
      <div><b>${A.hasMs && known === a.n ? '' : '≈'}${num(hours)}</b><span>hours</span></div>
      <div><b>${plural(activeYears, 'year')}</b><span>you've played them in</span></div>
    </div>
    <section class="panel" style="margin-top:16px">
      <div class="panel__head"><h2>Your plays over time</h2><span class="label">Peak: ${longMonth(A.months[peakI].start)}, ${num(counts[peakI])} plays</span></div>
      ${monthBars(A, counts)}
    </section>
    <div class="grid" style="margin-top:16px">
      <section class="panel c-7"><div class="panel__head"><h2>Your top songs</h2><span class="label">${plural(a.tracks.size, 'song')} played</span></div>${rankList(songs, { kind: 'tracks', link: L.rank, size: 36, byline: false })}</section>
      <section class="panel c-5">
        <div class="panel__head"><h2>Moments</h2></div>
        <dl class="facts">
          <div><dt>First play</dt><dd><a href="${L.song(a.firstTrack, a.name)}">${esc(a.firstTrack)}</a><span>${fullDate(a.first)}</span></dd></div>
          <div><dt>Most recent</dt><dd>${fullDate(a.last)}</dd></div>
          <div><dt>Biggest month</dt><dd>${longMonth(A.months[peakI].start)}<span>${plural(counts[peakI], 'play')}</span></dd></div>
          ${gap ? `<div><dt>Longest break</dt><dd>${span(gap.ms)}<span>${monthYear(gap.from)} to ${monthYear(gap.to)}</span></dd></div>` : ''}
          ${eras.length ? `<div><dt>${eras.length > 1 ? 'Eras' : 'Era'}</dt><dd>${eras.map((e) => `${monthYear(e.from)} to ${monthYear(e.to)}`).join('<br>')}</dd></div>` : ''}
          ${skip && skip[1] >= 20 ? `<div><dt>Skip rate</dt><dd>${pct(skip[0] / skip[1])}<span>${A.skipRate != null ? `you average ${pct(A.skipRate)}` : ''}</span></dd></div>` : ''}
        </dl>
      </section>
      ${albums.length ? `<section class="panel c-12"><div class="panel__head"><h2>Albums</h2></div><div class="albums">${albums.map((al) => `<div class="album">${sleeve(al.name, a.name, { size: 180, kind: 'album' })}<b>${esc(al.name)}</b><span>${plural(al.plays, 'play')}</span></div>`).join('')}</div></section>` : ''}
    </div>`;
  if (!info) artistInfo(a.name, true).then((i) => { const el = $('#artist-meta'); if (el && i) el.innerHTML = metaChips(i); });
  return html;
}

function metaChips(info) {
  if (!info) return '<span class="faint" style="font-size:14px">Looking up genre and origin…</span>';
  const bits = [];
  if (info.area) bits.push(`<span>${esc(info.area)}</span>`);
  if (info.begin) bits.push(`<span>${info.type === 'Person' ? 'Born' : info.type === 'Group' ? 'Formed' : 'Since'} ${esc(info.begin)}</span>`);
  return `${info.tags.slice(0, 4).map((t) => `<span class="chip chip--line">${esc(t)}</span>`).join('')}${bits.join('')}` || '<span class="faint" style="font-size:14px">No details found on MusicBrainz.</span>';
}

function biggestGap(times) {
  let best = null;
  for (let i = 1; i < times.length; i++) {
    const g = times[i] - times[i - 1];
    if (g > 60 * DAY && (!best || g > best.ms)) best = { ms: g, from: times[i - 1], to: times[i] };
  }
  return best;
}

/* ---------- Song ---------- */
export function songPage(ctx, artist, track) {
  const { A, pid } = ctx;
  const L = linker(pid, A);
  const idx = A.tracks.findIndex((t) => t.track === track && t.artist === artist);
  if (idx < 0) return notFound(`${track} by ${artist}`, L.artist(artist));
  const t = A.tracks[idx];
  const a = A.artists.find((x) => x.name === artist);
  const counts = perMonth(A, t.times);
  const peakI = counts.indexOf(Math.max(...counts));
  const byDay = new Map();
  t.times.forEach((x) => { const d = new Date(x).toDateString(); byDay.set(d, (byDay.get(d) || 0) + 1); });
  const [bestDay, bestDayN] = [...byDay.entries()].sort((x, y) => y[1] - x[1])[0];
  let j = 0, win = 0, winAt = t.first;
  for (let i = 0; i < t.times.length; i++) { while (t.times[i] - t.times[j] > 30 * DAY) j++; if (i - j + 1 > win) { win = i - j + 1; winAt = t.times[j]; } }
  const gap = biggestGap(t.times);
  return `
    <header class="dhead">
      ${trackSleeve({ name: t.track, artist: t.artist, album: t.album }, { size: 150 })}
      <div class="dhead__body">
        <span class="label">Song · No. ${idx + 1} of ${num(A.tracks.length)}</span>
        <h1>${esc(t.track)}</h1>
        <div class="dhead__meta"><a href="${L.artist(t.artist)}">${esc(t.artist)}</a>${t.album ? `<span>${esc(t.album)}</span>` : ''}</div>
      </div>
    </header>
    <div class="stats">
      <div><b>${num(t.n)}</b><span>plays</span></div>
      <div><b>${a ? pct(t.n / a.n) : '—'}</b><span>of your ${esc(t.artist)} plays</span></div>
      <div><b>${num(bestDayN)}</b><span>plays on its biggest day</span></div>
      <div><b>${num(win)}</b><span>plays in its best 30 days</span></div>
    </div>
    <section class="panel" style="margin-top:16px">
      <div class="panel__head"><h2>Your plays over time</h2><span class="label">Peak: ${longMonth(A.months[peakI].start)}</span></div>
      ${monthBars(A, counts)}
    </section>
    <section class="panel" style="margin-top:16px">
      <div class="panel__head"><h2>Moments</h2></div>
      <dl class="facts facts--wide">
        <div><dt>First play</dt><dd>${fullDate(t.first)}</dd></div>
        <div><dt>Most recent</dt><dd>${fullDate(t.last)}</dd></div>
        <div><dt>Biggest day</dt><dd>${fullDate(Date.parse(bestDay))}<span>${plural(bestDayN, 'play')}</span></dd></div>
        <div><dt>Best 30 days</dt><dd>From ${fullDate(winAt)}<span>${plural(win, 'play')}</span></dd></div>
        ${gap ? `<div><dt>Longest break</dt><dd>${span(gap.ms)}<span>${monthYear(gap.from)} to ${monthYear(gap.to)}</span></dd></div>` : ''}
      </dl>
    </section>`;
}

/* ---------- Year in review ---------- */
export function yearPage(ctx, y) {
  const { A, pid } = ctx;
  const L = linker(pid, A);
  const yr = A.years.find((x) => x.y === y);
  if (!yr) return notFound(String(y), hrefFor(pid, 'timeline'));
  const from = new Date(y, 0, 1).getTime(), to = new Date(y + 1, 0, 1).getTime();
  const i0 = lowerBound(A.rows, from), i1 = lowerBound(A.rows, to);
  const rows = A.rows.slice(i0, i1);
  const artists = topIn(A, 'artists', from, to, 10);
  const tracks = topIn(A, 'tracks', from, to, 10);
  const albums = topIn(A, 'albums', from, to, 6);
  const months = A.months.filter((m) => m.y === y);
  const maxM = Math.max(1, ...months.map((m) => m.n));
  let ms = 0, nullMs = 0;
  const days = new Map();
  rows.forEach((r) => { if (r.ms != null) ms += r.ms; else nullMs++; const d = new Date(r.t).toDateString(); days.set(d, (days.get(d) || 0) + 1); });
  const hours = (ms + nullMs * 3.4 * 60000) / 3.6e6;
  const [bigDay, bigN] = [...days.entries()].sort((a, b) => b[1] - a[1])[0] || [null, 0];
  const discovered = A.artists.filter((a) => a.first >= from && a.first < to).map((a) => ({ name: a.name, plays: a.times.filter((t) => t >= from && t < to).length })).sort((a, b) => b.plays - a.plays).slice(0, 5);
  const prev = A.years.find((x) => x.y === y - 1);
  const change = prev ? (yr.n - prev.n) / prev.n : null;
  const eras = A.eras.filter((e) => e.from < to && e.to >= from);
  const years = A.years.map((x) => x.y);
  const top = artists[0];

  ctx.yearCard = { y, plays: yr.n, hours, artists: artists.slice(0, 5), tracks: tracks.slice(0, 5), discovered: discovered[0]?.name, days: days.size };
  return `
    <div class="yearnav">${years.map((x) => `<a href="${L.year(x)}"${x === y ? ' aria-current="page"' : ''}>${x}</a>`).join('')}</div>
    <section class="recap">
      <div class="recap__lead">
        <span class="label">Your year in music</span>
        <h1>${y}</h1>
        <p>${num(yr.n)} plays across ${plural(days.size, 'day')}${change != null ? `, ${change >= 0 ? 'up' : 'down'} ${pct(Math.abs(change))} on ${y - 1}` : ''}. ${top ? `Mostly ${esc(top.name)}.` : ''}</p>
        <div class="flow__actions"><button type="button" class="btn btn--ink" data-card>Save as image ${icon.arrow}</button></div>
      </div>
      ${top ? `<a class="recap__top" href="${L.artist(top.name)}">${sleeve(top.name, top.name, { size: 220, round: true, kind: 'artist' })}<span class="label">Artist of the year</span><b>${esc(top.name)}</b><span>${plural(top.plays, 'play')}</span></a>` : ''}
    </section>
    <div class="stats" style="margin-top:16px">
      <div><b>${num(yr.n)}</b><span>plays</span></div>
      <div><b>${nullMs ? '≈' : ''}${num(hours)}</b><span>hours</span></div>
      <div><b>${num(yr.artistCount)}</b><span>artists</span></div>
      <div><b>${num(yr.newArtists)}</b><span>new to you</span></div>
    </div>
    <div class="grid" style="margin-top:16px">
      <section class="panel c-6"><div class="panel__head"><h2>Top songs</h2></div>${rankList(tracks, { kind: 'tracks', link: L.rank, size: 36 })}</section>
      <section class="panel c-6"><div class="panel__head"><h2>Top artists</h2></div>${rankList(artists, { link: L.rank, size: 36 })}</section>
      <section class="panel c-7">
        <div class="panel__head"><h2>Month by month</h2></div>
        <div class="ymonths">${months.map((m) => `<div><span class="ymonths__bar"><i style="height:${(m.n / maxM) * 100}%"></i></span><b>${new Date(m.start).toLocaleDateString('en', { month: 'short' })}</b><span>${m.topArtist ? esc(m.topArtist) : ''}</span></div>`).join('')}</div>
      </section>
      <section class="panel c-5">
        <div class="panel__head"><h2>Highlights</h2></div>
        <dl class="facts">
          ${bigDay ? `<div><dt>Biggest day</dt><dd>${fullDate(Date.parse(bigDay))}<span>${plural(bigN, 'play')}</span></dd></div>` : ''}
          ${discovered.length ? `<div><dt>Best discovery</dt><dd><a href="${L.artist(discovered[0].name)}">${esc(discovered[0].name)}</a><span>${plural(discovered[0].plays, 'play')} in their first year</span></dd></div>` : ''}
          ${eras.length ? `<div><dt>Eras</dt><dd>${eras.map((e) => `<a href="${L.artist(e.artist)}">${esc(e.artist)}</a>`).join(', ')}</dd></div>` : ''}
          ${albums[0] ? `<div><dt>Album of the year</dt><dd>${esc(albums[0].name)}<span>${esc(albums[0].artist)}</span></dd></div>` : ''}
        </dl>
      </section>
      ${discovered.length > 1 ? `<section class="panel c-12"><div class="panel__head"><h2>New to you in ${y}</h2><span class="label">Artists you played for the first time</span></div>${rankList(discovered, { link: L.rank, size: 36 })}</section>` : ''}
    </div>`;
}

export function bindYear(ctx) {
  $('[data-card]')?.addEventListener('click', () => shareCard(ctx.yearCard, ctx.p.user.display));
}

// Draw a portrait share card with the current theme's colours and save it as a PNG.
async function shareCard(c, who) {
  const css = getComputedStyle(document.documentElement);
  const v = (n) => css.getPropertyValue(n).trim();
  const W = 1080, H = 1350;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  await document.fonts.ready;
  const disp = '"Funnel Display", sans-serif', mono = '"Geist Mono", monospace';
  g.fillStyle = v('--bg'); g.fillRect(0, 0, W, H);
  // Record in the corner.
  g.save(); g.translate(W - 170, 190);
  g.fillStyle = v('--ink'); g.beginPath(); g.arc(0, 0, 250, 0, Math.PI * 2); g.fill();
  g.strokeStyle = v('--bg'); g.globalAlpha = 0.12;
  for (let r = 90; r < 250; r += 14) { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); }
  g.globalAlpha = 1; g.fillStyle = v('--accent'); g.beginPath(); g.arc(0, 0, 70, 0, Math.PI * 2); g.fill();
  g.restore();
  const text = (s, x, y, font, color, max) => { g.font = font; g.fillStyle = color; let t = s; while (max && g.measureText(t).width > max && t.length > 3) t = `${t.slice(0, -2)}…`; g.fillText(t, x, y); };
  text('LINER · YEAR IN MUSIC', 80, 110, `400 26px ${mono}`, v('--ink-3'));
  text(String(c.y), 72, 330, `500 230px ${disp}`, v('--ink'));
  text(`${who}`, 80, 400, `500 40px ${disp}`, v('--ink-2'), 560);
  const stat = (label, val, x) => { text(val, x, 530, `500 76px ${disp}`, v('--ink')); text(label.toUpperCase(), x, 575, `400 22px ${mono}`, v('--ink-3')); };
  stat('plays', num(c.plays), 80); stat('hours', num(c.hours), 420); stat('days', num(c.days), 720);
  g.fillStyle = v('--line'); g.fillRect(80, 640, W - 160, 2);
  text('TOP ARTISTS', 80, 710, `400 24px ${mono}`, v('--ink-3'));
  c.artists.forEach((a, i) => text(`${i + 1}  ${a.name}`, 80, 770 + i * 62, `500 ${i ? 40 : 48}px ${disp}`, i ? v('--ink') : v('--accent'), 440));
  text('TOP SONGS', 560, 710, `400 24px ${mono}`, v('--ink-3'));
  c.tracks.forEach((t, i) => { text(t.name, 560, 770 + i * 62, `500 ${i ? 36 : 40}px ${disp}`, v('--ink'), 440); });
  g.fillStyle = v('--line'); g.fillRect(80, 1130, W - 160, 2);
  if (c.discovered) text(`Best discovery: ${c.discovered}`, 80, 1200, `400 32px ${disp}`, v('--ink-2'), W - 160);
  text('Made with Liner', 80, 1270, `400 24px ${mono}`, v('--ink-3'));
  cv.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `liner-${c.y}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(`Saved liner-${c.y}.png`);
  }, 'image/png');
}

/* ---------- On this day ---------- */
export function onThisDay(A, L) {
  const now = new Date();
  const out = [];
  for (const yr of A.years) {
    if (yr.y >= now.getFullYear()) continue;
    const from = new Date(yr.y, now.getMonth(), now.getDate()).getTime();
    const to = from + DAY;
    const i0 = lowerBound(A.rows, from), i1 = lowerBound(A.rows, to);
    if (i1 <= i0) continue;
    const tally = new Map();
    for (let i = i0; i < i1; i++) { const r = A.rows[i]; const k = `${r.track}\u0000${r.artist}`; tally.set(k, (tally.get(k) || 0) + 1); }
    const [k] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    const [track, artist] = k.split('\u0000');
    out.push({ y: yr.y, n: i1 - i0, track, artist, album: A.tracks.find((t) => t.track === track && t.artist === artist)?.album });
  }
  if (!out.length) return '';
  return `<section class="panel c-12">
    <div class="panel__head"><h2>On this day</h2><span class="label">${now.toLocaleDateString('en', { month: 'long', day: 'numeric' })} in past years</span></div>
    <div class="otd">${out.reverse().slice(0, 6).map((d) => `<a class="otd__item" href="${L.song(d.track, d.artist)}">
      ${trackSleeve({ name: d.track, artist: d.artist, album: d.album }, { size: 56 })}
      <span><span class="label">${d.y} · ${plural(d.n, 'play')}</span><b>${esc(d.track)}</b><span class="faint">${esc(d.artist)}</span></span>
    </a>`).join('')}</div>
  </section>`;
}

/* ---------- Search ---------- */
export function mountSearch(root, A, L) {
  if (!root || !A) return;
  root.innerHTML = `<div class="search"><label class="sr" for="q">Search your history</label><input id="q" class="search__input" type="search" placeholder="Search ${num(A.artists.length)} artists and ${num(A.tracks.length)} songs" autocomplete="off"><div class="search__out" hidden></div></div>`;
  const input = $('#q', root), out = $('.search__out', root);
  const run = () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { out.hidden = true; return; }
    const artists = A.artists.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 5);
    const songs = A.tracks.filter((t) => t.track.toLowerCase().includes(q)).slice(0, 6);
    out.hidden = false;
    out.innerHTML = (!artists.length && !songs.length) ? '<p class="empty" style="padding:14px">Nothing in your history matches that.</p>'
      : `${artists.map((a) => `<a href="${L.artist(a.name)}">${sleeve(a.name, a.name, { size: 32, round: true, kind: 'artist' })}<span><b>${esc(a.name)}</b><span>Artist · ${plural(a.n, 'play')}</span></span></a>`).join('')}
         ${songs.map((t) => `<a href="${L.song(t.track, t.artist)}">${trackSleeve({ name: t.track, artist: t.artist, album: t.album }, { size: 32 })}<span><b>${esc(t.track)}</b><span>${esc(t.artist)} · ${plural(t.n, 'play')}</span></span></a>`).join('')}`;
  };
  input.addEventListener('input', run);
  input.addEventListener('focus', run);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.value = ''; out.hidden = true; input.blur(); }
    if (e.key === 'Enter') { const first = $('a', out); if (first) location.hash = first.getAttribute('href'); }
  });
  document.addEventListener('click', (e) => { if (!root.contains(e.target)) out.hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); input.focus(); } });
}

/* ---------- Genres ---------- */
// Weight each artist's plays by their top MusicBrainz tag. Tags arrive slowly,
// so this re-renders as more artists are looked up.
export function genres(items, onUpdate) {
  const pending = items.filter((a) => !cachedArtist(a.name));
  const tally = new Map();
  let covered = 0;
  for (const a of items) {
    const info = cachedArtist(a.name);
    const tag = info?.tags?.[0];
    if (!tag) continue;
    covered += a.plays;
    const g = tally.get(tag) || { name: tag, plays: 0, artists: [] };
    g.plays += a.plays; g.artists.push(a.name);
    tally.set(tag, g);
  }
  let alive = true;
  (async () => {
    for (const a of pending) {
      if (!alive) return;
      await artistInfo(a.name);
      if (alive) onUpdate();
    }
  })();
  return { list: [...tally.values()].sort((a, b) => b.plays - a.plays), pending: pending.length, covered, stop: () => { alive = false; } };
}

export function genresHTML(g, total) {
  const max = Math.max(1, ...g.list.map((x) => x.plays));
  return `${g.pending ? `<p class="faint" style="font-size:14px;margin-bottom:12px"><span class="spinner" style="display:inline-block;vertical-align:-2px;margin-right:8px"></span>Looking up ${plural(g.pending, 'more artist')} on MusicBrainz…</p>` : ''}
    ${g.list.length ? `<ol class="genres">${g.list.slice(0, 16).map((x) => `<li>
      <div class="genres__top"><b>${esc(x.name)}</b><span class="mono faint">${total ? pct(x.plays / total) : num(x.plays)}</span></div>
      <span class="rank__bar"><i style="width:${(x.plays / max) * 100}%"></i></span>
      <span class="genres__who">${x.artists.slice(0, 4).map(esc).join(', ')}${x.artists.length > 4 ? ` and ${x.artists.length - 4} more` : ''}</span>
    </li>`).join('')}</ol>` : '<p class="empty">No genres yet.</p>'}`;
}

export { insightCard };
