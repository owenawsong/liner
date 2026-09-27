// Small render helpers shared by every view. Each returns an HTML string;
// the matching bind* function wires up behaviour after it's in the DOM.
import { $, $$, esc, sleeve, trackSleeve, num, ago, longMonth, monthYear, hourLabel, icon, eq } from './ui.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* ---------- Connection health ---------- */
export function health(tracks, hidden) {
  if (hidden) return { state: 'hidden' };
  const t = tracks?.[0];
  if (!t) return { state: 'empty' };
  if (t.nowPlaying) return { state: 'live', track: t };
  const age = Date.now() - t.t;
  if (age < 3 * 864e5) return { state: 'ok', track: t };
  if (age < 30 * 864e5) return { state: 'quiet', track: t };
  return { state: 'stale', track: t };
}

export function healthLine(h, fixHref) {
  const tr = (t) => `<b>${esc(t.name)}</b> by ${esc(t.artist)}`;
  const line = (tone, html) => `<p class="health health--${tone}"><span class="dot${tone === 'live' ? ' dot--live' : ''}"></span><span>${html}</span></p>`;
  switch (h.state) {
    case 'live': return line('live', `Listening now: ${tr(h.track)}`);
    case 'ok': return line('ok', `Connected. Last played ${tr(h.track)}, ${ago(h.track.t)}.`);
    case 'quiet': return line('ok', `Last played ${ago(h.track.t)}. Listened since? <a href="${fixHref}">Check the Spotify connection</a>.`);
    case 'stale': return line('warn', `Nothing logged for ${ago(h.track.t).replace(' ago', '')}. Spotify may have disconnected. <a href="${fixHref}">Reconnect it</a>`);
    case 'empty': return line('warn', `Nothing logged yet. <a href="${fixHref}">Connect Spotify</a> to start.`);
    case 'hidden': return line('bad', 'This profile hides its listening. Turn off "Hide recent listening" in <a href="https://www.last.fm/settings/privacy" target="_blank" rel="noopener">Last.fm privacy settings</a>, then try again.');
    default: return '';
  }
}

/* ---------- Lists ---------- */
export function trackRows(tracks, limit = 10, link) {
  if (!tracks.length) return '<p class="empty">Nothing played yet.</p>';
  return `<ol class="rows">${tracks.slice(0, limit).map((t) => {
    const inner = `
      ${trackSleeve(t, { img: t.image, size: 40 })}
      <span class="row__t"><b>${esc(t.name)}</b><span>${esc(t.artist)}</span></span>
      ${t.nowPlaying ? `<span class="row__meta row__meta--live">${eq} Now</span>` : `<span class="row__meta">${ago(t.t)}</span>`}`;
    return link ? `<li><a class="row" href="${link(t)}">${inner}</a></li>` : `<li><div class="row">${inner}</div></li>`;
  }).join('')}</ol>`;
}

export function rankList(items, { kind = 'artists', start = 0, size = 40, max: maxIn, link, byline = true } = {}) {
  if (!items?.length) return '<p class="empty">Nothing here for this period yet.</p>';
  const max = maxIn || Math.max(1, ...items.map((x) => x.plays || 0));
  const counts = items.some((x) => x.plays != null);
  const cover = (x) => (kind === 'artists' ? sleeve(x.name, x.name, { img: x.image, size, round: true, kind: 'artist' })
    : kind === 'albums' ? sleeve(x.name, x.artist, { img: x.image, size, kind: 'album' })
      : trackSleeve({ name: x.name, artist: x.artist, album: x.album }, { img: x.image, size }));
  return `<ol class="rank${start ? ' rank--rest' : ''}">${items.map((x, i) => {
    const inner = `
      <span class="rank__n">${i + 1 + start}</span>
      ${cover(x)}
      <span class="rank__main">
        <span class="rank__name"><b>${esc(x.name)}</b>${x.artist && byline ? `<span>${esc(x.artist)}</span>` : ''}</span>
        ${counts ? `<span class="rank__bar"><i style="width:${((x.plays || 0) / max) * 100}%;animation-delay:${i * 25}ms"></i></span>` : ''}
      </span>
      <span class="rank__v">${counts ? num(x.plays) : ''}</span>`;
    const href = link?.(x, kind);
    return href ? `<li><a class="rank__item" href="${href}">${inner}</a></li>` : `<li><div class="rank__item">${inner}</div></li>`;
  }).join('')}</ol>`;
}

/* ---------- Numbers ---------- */
export function statStrip(A) {
  return `<div class="stats">
    <div><b>${num(A.plays)}</b><span>plays</span></div>
    <div><b>${A.hoursEstimated ? '≈' : ''}${num(A.hours)}</b><span>hours listened</span></div>
    <div><b>${num(A.artists.length)}</b><span>artists</span></div>
    <div><b>${monthYear(A.from)}</b><span>first play</span></div>
  </div>`;
}

/* ---------- Timeline ---------- */
export function timeline(A, { height = 220, selected = -1, labels = true, fit = false } = {}) {
  const n = A.months.length;
  const max = Math.max(1, ...A.months.map((m) => m.n));
  const eraAt = new Array(n).fill(null);
  A.eras.forEach((e) => { for (let i = e.start; i <= e.end; i++) eraAt[i] = e; });
  const years = [];
  A.months.forEach((m, i) => { if (i === 0 || m.m === 0) years.push({ y: m.y, i }); });
  years.forEach((y, k) => { y.span = (years[k + 1]?.i ?? n) - y.i; });
  return `
    <div class="tl${fit ? ' tl--fit' : ''}" style="--n:${n};--h:${height}px">
      <div class="tl__scroll">
        <div class="tl__inner">
          ${labels ? `<div class="tl__eras">${A.eras.map((e) => `<span class="tl__era" style="left:${(e.start / n) * 100}%;width:${((e.end - e.start + 1) / n) * 100}%;--era:var(--c${e.color})" title="${esc(e.artist)}, ${monthYear(e.from)} to ${monthYear(e.to)}">${(e.months / n) * (fit ? 560 : Math.max(760, n * 7)) > 64 ? esc(e.artist) : ''}</span>`).join('')}</div>` : ''}
          <div class="tl__bars">${A.months.map((m, i) => `<button type="button" class="tl__bar" data-i="${i}"${eraAt[i] ? ` data-era style="--era:var(--c${eraAt[i].color})"` : ''} aria-pressed="${i === selected}" aria-label="${longMonth(m.start)}: ${num(m.n)} plays"><i style="height:${(m.n / max) * 100}%;animation-delay:${Math.min(i * 5, 500)}ms"></i></button>`).join('')}</div>
          <div class="tl__years">${years.map((y) => `<span style="grid-column:${y.i + 1} / span ${y.span}">${y.span >= 6 ? y.y : ''}</span>`).join('')}</div>
        </div>
      </div>
    </div>`;
}

export function bindTimeline(root, A, onSelect) {
  const tl = $('.tl', root);
  if (!tl) return;
  const tip = document.createElement('div');
  tip.className = 'tl__tip';
  tip.hidden = true;
  tl.append(tip);
  const show = (bar) => {
    const m = A.months[Number(bar.dataset.i)];
    const r = bar.getBoundingClientRect(), fr = $('i', bar).getBoundingClientRect(), box = tl.getBoundingClientRect();
    tip.innerHTML = `<b>${longMonth(m.start)}</b> · ${num(m.n)} plays${m.topArtist ? `<br><span>Mostly ${esc(m.topArtist)}</span>` : ''}`;
    tip.hidden = false;
    const x = Math.min(Math.max(r.left + r.width / 2 - box.left, 90), box.width - 90);
    tip.style.left = `${x}px`;
    tip.style.top = `${fr.top - box.top}px`;
  };
  $$('.tl__bar', tl).forEach((bar) => {
    bar.addEventListener('mouseenter', () => show(bar));
    bar.addEventListener('focus', () => show(bar));
    bar.addEventListener('mouseleave', () => { tip.hidden = true; });
    bar.addEventListener('blur', () => { tip.hidden = true; });
    if (onSelect) bar.addEventListener('click', () => onSelect(Number(bar.dataset.i)));
  });
  const scroller = $('.tl__scroll', tl);
  scroller.scrollLeft = scroller.scrollWidth;
}

/* ---------- Listening clock ---------- */
export function heatmap(A) {
  const max = Math.max(1, ...A.heat.flat());
  let html = '';
  A.heat.forEach((row, d) => {
    html += `<span class="heat__d">${WEEKDAYS[d]}</span>`;
    row.forEach((v, h) => { html += `<i class="heat__c" style="--v:${(0.04 + 0.96 * Math.pow(v / max, 1.8)).toFixed(3)}"${v ? '' : ' data-z'} title="${WEEKDAYS[d]}, ${hourLabel(h)}: ${num(v)} plays"></i>`; });
  });
  html += '<span></span>';
  for (let h = 0; h < 24; h++) html += `<span class="heat__h">${h % 3 === 0 ? hourLabel(h).replace(' ', '') : ''}</span>`;
  return `<div class="heat-wrap"><div class="heat" role="img" aria-label="Plays by day of week and hour">${html}</div></div>`;
}

export function heatLegend() {
  return `<div class="legend"><span>Fewer</span>${[0.06, 0.2, 0.42, 0.7, 1].map((v) => `<i style="background:color-mix(in srgb, var(--accent) ${v * 100}%, var(--bg-2))"></i>`).join('')}<span>More</span></div>`;
}

export function hoursChart(A) {
  const byHour = new Array(24).fill(0);
  A.heat.forEach((row) => row.forEach((v, h) => { byHour[h] += v; }));
  const max = Math.max(1, ...byHour);
  return `<div class="hours" role="img" aria-label="Plays by hour of day">${byHour.map((v, h) => `<i class="${v === max ? 'hi' : ''}" style="height:${(v / max) * 100}%" title="${hourLabel(h)}: ${num(v)} plays"></i>`).join('')}</div>
    <div class="hours-x"><span>12 am</span><span>6 am</span><span>12 pm</span><span>6 pm</span></div>`;
}

export function daysChart(A) {
  const byDay = A.heat.map((row) => row.reduce((s, v) => s + v, 0));
  const max = Math.max(1, ...byDay);
  const total = byDay.reduce((s, v) => s + v, 0) || 1;
  return `<div class="days">${byDay.map((v, d) => `<div><span>${WEEKDAYS[d]}</span><span class="rank__bar"><i style="width:${(v / max) * 100}%;${v === max ? 'background:var(--accent)' : ''}"></i></span><em>${Math.round((v / total) * 100)}%</em></div>`).join('')}</div>`;
}

/* ---------- Insights ---------- */
export function spark(values) {
  const max = Math.max(1, ...values);
  return `<div class="spark" aria-hidden="true">${values.map((v) => `<i class="${v === max ? 'hi' : ''}" style="height:${Math.max(2, (v / max) * 100)}%"></i>`).join('')}</div>`;
}

export function insightCard(ins, feature = false) {
  return `<article class="insight${feature ? ' insight--feature' : ''}">
    <span class="label">${esc(ins.kicker)}</span>
    ${ins.stat ? `<div class="insight__stat"><b>${esc(ins.stat)}</b><span>${esc(ins.statUnit || '')}</span></div>` : ''}
    <h3>${ins.title}</h3>
    <p>${ins.body}</p>
    ${ins.spark ? `${spark(ins.spark)}<small>${esc(ins.sparkLabel || '')}</small>` : ''}
  </article>`;
}

/* ---------- Drop zones ---------- */
export function dropzone({ title = 'Drop your Spotify export', sub = 'The ZIP from Spotify, or the JSON files inside it', big = false } = {}) {
  return `<button type="button" class="drop${big ? ' drop--big' : ''}" data-drop>${icon.upload}<span><b data-label>${esc(title)}</b><small>${esc(sub)}</small></span></button>
    <input type="file" accept=".zip,.json,application/zip,application/json" multiple hidden>`;
}

export function bindDrops(root, onFiles) {
  $$('[data-drop]', root).forEach((el) => {
    const input = el.nextElementSibling;
    el.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { if (input.files.length) onFiles(input.files, el); input.value = ''; });
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('is-drag'); });
    el.addEventListener('dragleave', () => el.classList.remove('is-drag'));
    el.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation();
      el.classList.remove('is-drag');
      document.getElementById('dropveil').hidden = true;
      if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files, el);
    });
  });
}

export function sourceBadge(p) {
  if (p.source === 'demo') return '<span class="chip chip--line">Demo profile</span>';
  if (p.simulated) return '<span class="chip chip--warn">Simulated data</span>';
  const name = { lastfm: 'Last.fm', listenbrainz: 'ListenBrainz', spotify: 'Spotify', file: 'Spotify export' }[p.source];
  return `<span class="chip chip--line">${name}</span>`;
}
