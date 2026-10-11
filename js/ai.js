// Talks to /api/ai. Only a short text summary of someone's stats is sent, never
// their raw history. Answers are remembered in this browser too.
import { $$, esc, num, pct, monthYear, idb, hourLabel } from './ui.js';
import { topIn, lowerBound } from './analysis.js';
import { evolution } from './evolution.js';
import { cachedArtist } from './meta.js';

const DAY = 864e5;
const local = new Map();
export const AI_VERSION = 'v19';

async function key(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function write(task, facts, { question = '', fresh = false, signal } = {}) {
  const version = task === 'year' ? 'v21' : AI_VERSION;
  const k = `ai:${version}:${task}:${await key(`${facts}|${question}`)}`;
  if (!fresh) {
    if (local.has(k)) return local.get(k);
    const saved = await idb.get(k);
    if (saved) { local.set(k, saved); return saved; }
  }
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  const ctrl = new AbortController();
  let timedOut = false;
  const abort = () => ctrl.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, 60000);
  let res, d;
  try {
    res = await fetch('/api/ai', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, facts, question, seed: fresh ? Date.now() : '' }),
    });
    d = await res.json().catch(() => ({}));
  } catch (e) {
    if (timedOut) throw new Error('The writer took too long. Try again.');
    if (e.name === 'AbortError') throw e;
    throw new Error("Couldn't reach Sleeve's writer. Check your connection.");
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  if (res.status === 404) throw new Error('AI writing only works on the live site.');
  if (!res.ok) throw new Error(d.error || 'The writer is busy. Try again in a moment.');
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  if(typeof d.text!=='string'||!d.text.trim())throw new Error('The writer returned no usable text. Try again.');
  local.set(k, d.text);
  idb.set(k, d.text);
  return d.text;
}

/* ---------- The summary we send ---------- */
const stripTags = (s) => String(s).replace(/<[^>]+>/g, '');

export function facts(A, p, { year, detailed = false } = {}) {
  const L = [];
  const who = p?.user?.display && p.source !== 'file' ? p.user.display : 'This listener';
  if (!A) {
    L.push(`Listener: ${who}. ${num(p?.user?.playcount || 0)} plays logged${p?.user?.since ? ` since ${monthYear(p.user.since)}` : ''}.`);
    const rec = (p?.recent || []).slice(0, 15).map((t) => `${t.name} by ${t.artist}`);
    if (rec.length) L.push(`Recently played: ${rec.join('; ')}.`);
    if (p?.topArtists?.length) L.push(`Top artists lately: ${p.topArtists.slice(0, 10).map((a) => a.name).join(', ')}.`);
    return L.join('\n');
  }
  let from = -Infinity, to = Infinity;
  if (year) { from = new Date(year, 0, 1).getTime(); to = new Date(year + 1, 0, 1).getTime(); }
  const artists = topIn(A, 'artists', from, to, detailed ? 25 : 12);
  const tracks = topIn(A, 'tracks', from, to, detailed ? 15 : 10);
  const albums = topIn(A, 'albums', from, to, 5);
  const plays = year ? lowerBound(A.rows, to) - lowerBound(A.rows, from) : A.plays;
  L.push(year
    ? `Listener: ${who}. Year: ${year}. ${num(plays)} plays that year.`
    : `Listener: ${who}. Listening since ${monthYear(A.from)}. ${num(A.plays)} plays, about ${num(A.hours)} hours, ${num(A.artists.length)} artists, ${num(A.tracks.length)} songs.`);
  L.push(`Top artists: ${artists.map((a) => `${a.name} (${num(a.plays)})`).join(', ')}.`);
  L.push(`Top songs: ${tracks.map((t) => `${t.name} by ${t.artist} (${num(t.plays)})`).join('; ')}.`);
  if (detailed) {
    const E = evolution(A, A.to + 1);
    L.push(`Taste change across the latest and previous 90 days: ${num(E.total)} vs ${num(E.previous)} plays, ${E.shift == null ? 'not enough data for a shift score' : `${E.shift}/100 shift`}, ${E.newArtists} newly heard artists, ${E.overlap} top-20 artists shared across both periods.`);
    if (E.rising.length) L.push(`Artists gaining share: ${E.rising.slice(0, 5).map((x) => `${x.name} ${x.before} to ${x.plays} plays`).join('; ')}.`);
    if (E.discoveries.length) L.push(`New discoveries: ${E.discoveries.slice(0, 5).map((x) => `${x.name} ${x.plays} plays`).join('; ')}.`);
  }
  if (albums.length) L.push(`Top albums: ${albums.map((a) => `${a.name} by ${a.artist}`).join('; ')}.`);
  const genres = [...new Set(artists.slice(0, 12).map((a) => cachedArtist(a.name)?.tags?.[0]).filter(Boolean))];
  if (detailed && genres.length) L.push(`Genres of their top artists: ${genres.slice(0, 6).join(', ')}.`);
  const eras = A.eras.filter((e) => e.to >= from && e.from < to);
  if (eras.length) L.push(`Eras (stretches led by one artist): ${eras.map((e) => `${e.artist} ${monthYear(e.from)} to ${monthYear(e.to)}`).join('; ')}.`);
  if (!year && A.years.length > 1) L.push(`Top artist each year: ${A.years.map((y) => `${y.y} ${y.topArtist}`).join(', ')}.`);
  const byHour = new Array(24).fill(0);
  A.heat.forEach((r) => r.forEach((v, h) => { byHour[h] += v; }));
  L.push(`Busiest hour: ${hourLabel(byHour.indexOf(Math.max(...byHour)))}.`);
  if (A.skipRate != null) L.push(`Skips ${pct(A.skipRate)} of songs.`);
  if (A.shuffleRate != null) L.push(`${pct(A.shuffleRate)} of plays on shuffle.`);
  if (!year) {
    const recent = topIn(A, 'artists', A.to - 28 * DAY, A.to + 1, 6);
    if (recent.length) L.push(`Last 4 weeks: ${recent.map((a) => a.name).join(', ')}.`);
    L.push(`Things Sleeve noticed: ${A.insights.slice(0, detailed ? 12 : 7).map((i) => stripTags(i.title)).join('. ')}.`);
  }
  if (detailed) {
    L.push(`First plays: ${A.artists.slice(0, 20).map((a) => `${a.name} first played ${monthYear(a.first)}`).join('; ')}.`);
    const lastMonths = A.months.slice(-24).filter((m) => m.n).map((m) => `${monthYear(m.start)} ${m.topArtist}`);
    L.push(`Top artist by month (last 2 years): ${lastMonths.join('; ')}.`);
  }
  return L.join('\n').slice(0, 4900);
}

/* ---------- Rendering helpers ---------- */
export function reveal(el, text) {
  const words = esc(text).split(/(\s+)/);
  el.innerHTML = words.map((w, i) => (/\s/.test(w) ? w : `<span style="animation-delay:${Math.min(i * 12, 1400)}ms">${w}</span>`)).join('');
  el.classList.add('ai__text--in');
}

export const loadingLines = '<div class="ai__loading" aria-label="Writing"><i></i><i></i><i></i><span>Writing from your stats…</span></div>';

export function paragraphs(text) {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

export function bindAll() { return $$('[data-ai]'); }
