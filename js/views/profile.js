import { $, $$, esc, avatar, sleeve, trackSleeve, num, monthYear, longMonth, ago, icon, eq, toast, store, idb } from '../ui.js';
import { SOURCES, state, view, onLeave, go, rerender, hrefFor, profiles, getArchive, setArchive, clearArchive, analysisFor, setMinMs } from '../core.js';
import { topIn, monthDetail, lowerBound } from '../analysis.js';
import { health, healthLine, trackRows, rankList, statStrip, timeline, bindTimeline, heatmap, heatLegend, hoursChart, daysChart, insightCard, dropzone, bindDrops, sourceBadge } from '../components.js';
import { handleFiles, importHistory, keepSpotifyPlays } from '../actions.js';
import { linker, artistPage, songPage, yearPage, bindYear, onThisDay, mountSearch, genres, genresHTML } from './detail.js';
import { hydrate, art } from '../meta.js';
import { palette, paint } from '../color.js';
import { mainstreamPanel, bindMainstream, milestonesPanel } from './mainstream.js';
import { notesPanel, bindNotes, askPanel, bindAsk, nameEras, yearNotes, bindYearNotes } from './aiviews.js';
import { demoRecent, DEMO_USER } from '../sources/demo.js';
import * as lastfm from '../sources/lastfm.js';
import * as spotify from '../sources/spotify.js';

const TABS = [['overview', 'Overview'], ['top', 'Top'], ['timeline', 'Timeline'], ['insights', 'Insights'], ['clock', 'Clock'], ['data', 'Data']];
const LABEL = { lastfm: 'Last.fm', listenbrainz: 'ListenBrainz', spotify: 'Spotify', file: 'Spotify export', demo: 'Demo' };
const DAY = 864e5;
let overviewPick = -1;

// Cache the live profile between tab switches so switching tabs is instant.
let live = { pid: null, p: null, at: 0 };

const DETAIL = { artist: 'top', song: 'top', year: 'timeline' };

export async function renderProfile({ pid, source, name, tab = 'overview', args = [] }) {
  if (!TABS.some(([t]) => t === tab) && !DETAIL[tab]) tab = 'overview';
  state.pid = pid;
  onLeave(() => { state.pid = null; });
  if (source === 'spotify' && !spotify.isConnected()) return go('#/connect/spotify');

  const ctrl = new AbortController();
  onLeave(() => ctrl.abort());
  const fresh = live.pid === pid && Date.now() - live.at < 60000;
  if (!fresh) view().innerHTML = skeleton();

  let p, archive, A;
  try {
    archive = await getArchive(pid);
    if (source === 'file' && !archive.export) return go('#/connect/file');
    A = analysisFor(pid, archive);
    if (fresh) p = live.p;
    else if (source === 'demo') p = demoProfile(A);
    else if (source === 'file') p = fileProfile(archive);
    else p = await SOURCES[source].profile(name, ctrl.signal);
  } catch (e) {
    if (e.name === 'AbortError') return;
    return renderError(e, source, name);
  }
  if (ctrl.signal.aborted) return;
  live = { pid, p, at: fresh ? live.at : Date.now() };
  if (source === 'spotify' && p.recentRows) {
    await keepSpotifyPlays(p.recentRows);
    archive = await getArchive(pid);
    A = analysisFor(pid, archive);
  }
  if (source !== 'demo') profiles.remember({ pid, source, display: p.user.display, image: p.user.image });

  const ctx = { pid, source, name, tab, args, p, archive, A, L: linker(pid, A), signal: ctrl.signal };
  const current = DETAIL[tab] || tab;
  view().innerHTML = `
    <div class="wrap">${header(ctx)}</div>
    <nav class="tabs" aria-label="Profile sections"><div class="wrap tabs__inner">${TABS.map(([t, l]) => `<a href="${hrefFor(pid, t === 'overview' ? '' : t)}"${t === current ? ' aria-current="page"' : ''}>${l}${t === 'insights' && A ? `<small>${A.insights.length}</small>` : ''}</a>`).join('')}</div></nav>
    <div class="wrap fade-in" id="tab"></div>`;
  ({ overview, top, timeline: timelineTab, insights: insightsTab, clock, data, artist: detail, song: detail, year: detail })[tab](ctx);
  mountSearch($('#search'), A, ctx.L);
  paintHeader(ctx);
  if (source !== 'file') startPolling(ctx);
}

/* ---------- Profile sources ---------- */
function demoProfile(A) {
  const now = Date.now();
  const today = A.rows.length - lowerBound(A.rows, new Date().setHours(0, 0, 0, 0));
  const week = A.rows.length - lowerBound(A.rows, now - 7 * DAY);
  return { source: 'demo', simulated: false, user: { ...DEMO_USER, playcount: A.plays }, recent: demoRecent(20), today, week };
}
function fileProfile(archive) {
  const ex = archive.export;
  return { source: 'file', simulated: false, user: { name: 'export', display: 'Your Spotify history', image: '', playcount: ex?.rows.length || 0, since: ex?.from || 0 }, recent: [], today: 0, week: 0 };
}

function skeleton() {
  return `<div class="wrap"><div class="phead"><div class="skel" style="padding:0;gap:18px;width:100%"><i style="width:64px;height:64px;border-radius:50%"></i><span style="flex:1;display:grid;gap:10px"><i style="width:min(300px,60%);height:30px"></i><i style="width:min(420px,80%);height:12px"></i></span></div></div></div>`;
}

function renderError(e, source, name) {
  const nf = e.code === 'notfound';
  view().innerHTML = `<div class="wrap"><div class="flow">
    <span class="label">${nf ? 'Not found' : 'Something went wrong'}</span>
    <h1>${nf ? `No one called ${esc(name)} on ${LABEL[source]}` : "We couldn't load this profile"}</h1>
    <p class="flow__lede">${nf ? 'Check the spelling, or set up an account in about a minute.' : esc(e.message)}</p>
    <div class="flow__actions">${nf ? `<a class="btn btn--ink" href="#/connect/${source}">Set up ${LABEL[source]}</a>` : '<button type="button" class="btn btn--ink" id="retry">Try again</button>'}<a class="btn btn--line" href="#/">Back to start</a></div>
  </div></div>`;
  $('#retry')?.addEventListener('click', rerender);
}

/* ---------- Header ---------- */
function header({ p, A, source }) {
  const u = p.user;
  const bits = [];
  if (source === 'lastfm' || source === 'listenbrainz') bits.push(`<span class="mono">@${esc(u.name)}</span>`);
  const total = A ? A.plays : u.playcount;
  if (total) bits.push(`<span>${num(total)} plays</span>`);
  const since = A?.from || u.since;
  if (since) bits.push(`<span>Listening since ${monthYear(since)}</span>`);
  bits.push(sourceBadge(p));
  const catno = { lastfm: 'LAST.FM', listenbrainz: 'LISTENBRAINZ', spotify: 'SPOTIFY', file: 'SPOTIFY EXPORT', demo: 'DEMO' }[source] || '';
  return `<header class="phead" id="phead">
    ${avatar(u.display, u.image, 64)}
    <div class="phead__body"><span class="phead__catno">SLV · ${catno}${A ? ` · ${new Date(A.from).getFullYear()}–${new Date(A.to).getFullYear()}` : ''}</span><h1>${esc(u.display)}</h1><div class="phead__meta">${bits.join('')}</div></div>
    <div class="phead__covers" id="phead-covers"></div>
    <div class="phead__side"><span id="pill">${pill(p)}</span>${source === 'lastfm' || source === 'listenbrainz' ? `<a class="btn btn--line btn--sm" href="#/compare/${source}/${encodeURIComponent(p.user.name)}">Compare</a>` : ''}${A ? '<div id="search"></div>' : ''}</div>
  </header>`;
}
const pill = (p) => (p.recent?.[0]?.nowPlaying ? `<span class="chip chip--good"><span class="dot dot--live"></span>Listening now</span>` : '');

function banner({ p, source }) {
  if (source === 'demo') return `<div class="banner"><span>This is a demo profile. Every number is example data.</span><a class="link" href="#/">See your own ${icon.arrow}</a></div>`;
  if (p.simulated) return `<div class="banner banner--warn"><span>Last.fm is in simulated mode, so these numbers are made up. Add a free API key in Settings for ${esc(p.user.name)}'s real stats.</span><button type="button" class="link" data-settings>Open Settings</button></div>`;
  if (p.hidden) return `<div class="banner banner--warn"><span>This profile hides its recent listening, so live stats are off. Turn off "Hide recent listening" in <a href="https://www.last.fm/settings/privacy" target="_blank" rel="noopener">Last.fm privacy settings</a>.</span></div>`;
  return '';
}

/* ---------- Overview ---------- */
export function overviewHTML(ctx) {
  const { p, A, pid, source } = ctx;
  const liveSource = source !== 'file';
  const parts = [];
  if (liveSource) {
    parts.push(`<section class="panel c-7" id="now">${nowHTML(p)}</section>`);
    parts.push(`<section class="panel c-5">${countsHTML(p, A)}</section>`);
  }
  if (A) {
    parts.push(`<div class="c-12">${statStrip(A)}</div>`);
    if (!ctx.preview) parts.push(notesPanel(A));
    parts.push(`<section class="panel c-12"><div class="panel__head"><h2>Month by month</h2><a class="link link--quiet" href="${hrefFor(pid, 'timeline')}">Open the timeline ${icon.arrow}</a></div>${timeline(A, { height: 140, fit: true })}</section>`);
  } else if (!ctx.preview) {
    if (liveSource) parts.push(notesPanel());
    parts.push(importCTA(ctx));
  }
  const topLabel = source === 'file' ? 'All time' : source === 'spotify' ? 'Last 4 weeks' : 'Last 7 days';
  parts.push(`<section class="panel c-5"><div class="panel__head"><h2>Top artists</h2><span class="label" id="top-label">${topLabel}</span></div><div id="top-artists">${ctx.topArtists ? rankList(ctx.topArtists.slice(0, 8), { link: ctx.L?.rank }) : loadingRows()}</div></section>`);
  if (liveSource) parts.push(`<section class="panel c-7"><div class="panel__head"><h2>Recent plays</h2><span class="label">${source === 'listenbrainz' ? 'Updates every few minutes' : 'Live'}</span></div><div id="recent">${trackRows(p.recent, 9, ctx.L?.track)}</div></section>`);
  else parts.push(`<section class="panel c-7"><div class="panel__head"><h2>Top songs</h2><span class="label">All time</span></div>${rankList(topIn(A, 'tracks', -Infinity, Infinity, 8), { kind: 'tracks', link: ctx.L?.rank })}</section>`);
  if (source === 'spotify') parts.push(`<section class="panel c-12" id="watch">${watchHTML()}</section>`);
  if (A && ctx.L?.song) parts.push(onThisDay(A, ctx.L));
  if (A?.insights.length) {
    parts.push(`<div class="c-12"><div class="subhead"><h2>Things we noticed</h2><a class="link link--quiet" href="${hrefFor(pid, 'insights')}">All ${A.insights.length} ${icon.arrow}</a></div>
      <div class="insights">${A.insights.slice(0, 3).map((x, i) => insightCard(x, i === 0)).join('')}</div></div>`);
  }
  return `${ctx.preview ? '' : banner(ctx)}<div class="grid">${parts.join('')}</div>`;
}

function overview(ctx) {
  const { A, source, name } = ctx;
  if (source === 'demo' || source === 'file') {
    ctx.topArtists = source === 'demo' ? topIn(A, 'artists', Date.now() - 7 * DAY) : topIn(A, 'artists');
  }
  $('#tab').innerHTML = overviewHTML(ctx);
  bindCommon(ctx);
  if (A) bindTimeline($('#tab'), A, (i) => { overviewPick = i; go(hrefFor(ctx.pid, 'timeline')); });
  if (!ctx.topArtists) {
    const src = SOURCES[source];
    // Fall back to longer periods when the short one is empty or not calculated yet.
    (async () => {
      for (const per of src.periods.slice(0, source === 'spotify' ? 1 : 4)) {
        const items = await src.top(name, per.id, 'artists', ctx.signal);
        if (items?.length) return [items, per.label];
      }
      return [null];
    })().then(([items, label]) => {
      const el = $('#top-artists');
      if (!el) return;
      if (items) { el.innerHTML = rankList(items.slice(0, 8), { link: ctx.L?.rank }); hydrate(el); $('#top-label').textContent = label === 'All time' ? label : `Last ${label.toLowerCase().replace(/^last /, '')}`; }
      else el.innerHTML = `<p class="empty">${source === 'listenbrainz' ? 'ListenBrainz works out top lists once a day. Check back tomorrow.' : 'Nothing played recently.'}</p>`;
    }).catch((e) => {
      if (e.name === 'AbortError') return;
      const el = $('#top-artists');
      if (el) el.innerHTML = `<p class="empty">${esc(e.message)}</p>`;
    });
  }
  if (source === 'spotify') startWatch();
  if (source !== 'spotify') bindNotes(ctx);
  else $('#ai-notes')?.remove();
}

function nowHTML(p) {
  const t = p.recent?.[0];
  const head = `<div class="panel__head"><h2>Right now</h2><span class="label">${p.source === 'listenbrainz' ? 'Checks every 30 s' : 'Checks every 15 s'}</span></div>`;
  if (!t) return `${head}<p class="empty">${p.hidden ? 'This profile hides its listening.' : 'Nothing played yet. Play something on Spotify and it shows up here.'}</p>`;
  return `${head}<div class="now">
    ${sleeve(t.album || t.name, t.artist, { img: t.image, size: 156 })}
    <div class="now__body">
      <span class="now__state${t.nowPlaying ? ' now__state--live' : ''}">${t.nowPlaying ? `${eq} Playing now` : `Last played ${ago(t.t)}`}</span>
      <p class="now__title">${esc(t.name)}</p>
      <p class="now__artist">${esc(t.artist)}</p>
      ${t.album ? `<p class="now__album">${esc(t.album)}</p>` : ''}
      ${t.progress != null && t.duration ? `<div class="progress"><i style="width:${(t.progress / t.duration) * 100}%"></i></div>` : ''}
    </div>
  </div>`;
}

function countsHTML(p, A) {
  let summary = '';
  if (A) summary = `You've played ${num(A.plays)} songs since ${monthYear(A.from)}.`;
  else if (p.user.playcount) summary = `${num(p.user.playcount)} plays in total${p.user.since ? ` since ${monthYear(p.user.since)}` : ''}.`;
  return `<div class="panel__head"><h2>Your listening</h2>${p.capped ? '<span class="label">From your last 50 plays</span>' : ''}</div>
    <div class="pair">
      <div class="big"><b>${num(p.today)}</b><span>songs today</span></div>
      <div class="big"><b>${p.weekCapped ? '1k+' : num(p.week)}</b><span>in the last 7 days</span></div>
    </div>
    ${summary ? `<p class="muted" style="font-size:14.5px;margin-top:auto">${summary}</p>` : ''}`;
}

const loadingRows = () => `<div class="skel" style="flex-direction:column;align-items:stretch;padding:0;gap:14px">${Array.from({ length: 6 }, () => '<i style="height:34px"></i>').join('')}</div>`;

function estimate(sec) {
  if (sec < 60) return `${Math.max(10, Math.round(sec / 10) * 10)} seconds`;
  const m = Math.round(sec / 60);
  return `${m} minute${m === 1 ? '' : 's'}`;
}

function importCTA({ p, source }) {
  const exportDrop = `<div style="border-top:1px solid var(--line);padding-top:18px">${dropzone({ title: source === 'spotify' ? 'Drop your Spotify export' : 'Or drop your Spotify export', sub: 'For exact listening time and skips. Read on your device, never uploaded.' })}</div>`;
  if (source === 'spotify') {
    return `<section class="panel c-12"><div class="cta"><div><span class="label">Your full history</span><h2 style="margin-top:8px">Spotify only shares your last 50 plays</h2><p>Sleeve keeps every batch it sees, so your history grows each time you visit. For everything since day one, add your Spotify export.</p></div><div class="cta__actions"><a class="btn btn--line" href="#/connect/file">How to get it</a></div></div>${exportDrop}</section>`;
  }
  const src = SOURCES[source];
  if (source === 'lastfm' && !lastfm.isLive()) {
    return `<section class="panel c-12"><div class="cta"><div><span class="label">Your full history</span><h2 style="margin-top:8px">Build your timeline</h2><p>Importing a whole Last.fm history needs a free API key. Add one in Settings, or see what the timeline looks like on the demo profile.</p></div><div class="cta__actions"><button type="button" class="btn btn--ink" data-settings>Add an API key</button><a class="btn btn--line" href="#/demo/timeline">See the demo</a></div></div>${exportDrop}</section>`;
  }
  const count = p.user.playcount;
  const bigLB = source === 'listenbrainz' && count > 40000;
  return `<section class="panel c-12" id="import">
    <div class="cta"><div><span class="label">Your full history</span><h2 style="margin-top:8px">Build your timeline</h2>
      <p>Sleeve can read ${count ? `all ${num(count)} of your` : 'your'} ${src.label} plays in about ${estimate(src.estimateImport(count || 1000))}, then show your eras, a month-by-month timeline, your listening clock and what stands out. It's saved in this browser, so you only do it once.${bigLB ? " With a history this big, ListenBrainz's own export is faster: in ListenBrainz settings choose Export, then drop the file below." : ''}</p></div>
      <div class="cta__actions"><button type="button" class="btn btn--ink" data-import>Import my history ${icon.arrow}</button></div></div>
    <div class="importing" data-importing hidden>
      <div class="panel__head"><span data-import-text class="muted">Starting…</span><button type="button" class="link link--quiet" data-import-stop>Cancel</button></div>
      <div class="bar"><i data-import-bar></i></div>
    </div>
    ${exportDrop}
  </section>`;
}

function bindCommon(ctx) {
  const root = $('#tab');
  bindDrops(root, handleFiles);
  $$('[data-settings]', root).forEach((b) => b.addEventListener('click', () => (location.hash = '#/settings')));
  const go_ = $('[data-import]', root);
  if (!go_) return;
  go_.addEventListener('click', async () => {
    const box = $('[data-importing]', root), text = $('[data-import-text]', root), bar = $('[data-import-bar]', root);
    const ctrl = new AbortController();
    onLeave(() => ctrl.abort());
    box.hidden = false;
    go_.setAttribute('aria-disabled', 'true');
    $('[data-import-stop]', root).onclick = () => ctrl.abort();
    try {
      const n = await importHistory(ctx.pid, ctx.source, ctx.name, {
        signal: ctrl.signal,
        onProgress: (done, total) => {
          text.textContent = total ? `Read ${num(done)} of ${num(total)} plays` : `Read ${num(done)} plays`;
          bar.style.width = `${total ? Math.min(100, (done / total) * 100) : 20}%`;
        },
      });
      toast(`Imported ${num(n)} plays. Your timeline is ready.`);
      rerender();
    } catch (e) {
      box.hidden = true;
      go_.removeAttribute('aria-disabled');
      if (e.name !== 'AbortError') toast(e.message, 'bad');
      else toast('Import cancelled. Nothing was saved.');
    }
  });
}

/* ---------- Spotify skip watcher ---------- */
function watchHTML() {
  const log = spotify.watchLog();
  const today = log.filter((r) => r.t >= new Date().setHours(0, 0, 0, 0));
  const skipped = today.filter((r) => r.skipped).length;
  return `<div class="panel__head"><h2>Skip tracker</h2><span class="chip chip--good"><span class="dot dot--live"></span>Watching while this tab is open</span></div>
    <p class="muted" style="font-size:14.5px">Spotify doesn't report skips, so Sleeve checks what's playing every few seconds and notes how long each song actually played. Today: <b>${num(today.length)}</b> songs, <b>${num(skipped)}</b> skipped.</p>
    ${log.length ? `<ol class="rows">${log.slice(-6).reverse().map((r) => `<li class="row">${sleeve(r.album || r.track, r.artist, { size: 36 })}<span class="row__t"><b>${esc(r.track)}</b><span>${esc(r.artist)}</span></span><span class="row__meta">${r.skipped ? '<span class="chip chip--warn">Skipped</span>' : ''} ${Math.floor(r.ms / 60000)}:${String(Math.floor((r.ms % 60000) / 1000)).padStart(2, '0')}</span></li>`).join('')}</ol>` : '<p class="empty">Play something on Spotify. Each song is logged here when it ends or you skip it.</p>'}`;
}
function startWatch() {
  const stop = spotify.watch(() => { const el = $('#watch'); if (el) el.innerHTML = watchHTML(); });
  onLeave(stop);
}

/* ---------- Polling for what's playing ---------- */
function startPolling(ctx) {
  if (ctx.source === 'demo' || ctx.p.hidden) return;
  const every = ctx.source === 'listenbrainz' ? 30000 : 15000;
  let timer = 0;
  const run = async () => {
    try {
      const rec = ctx.source === 'demo' ? demoRecent(20) : await SOURCES[ctx.source].recent(ctx.name, 20, ctx.signal);
      ctx.p.recent = rec;
      live.p = ctx.p;
      const now = $('#now'), recent = $('#recent'), pl = $('#pill');
      if (now) now.innerHTML = nowHTML(ctx.p);
      if (recent) { recent.innerHTML = trackRows(rec, 9, ctx.L?.track); hydrate(recent); }
      if (pl) pl.innerHTML = pill(ctx.p);
    } catch (e) { if (e.name === 'AbortError') return; }
    timer = setTimeout(run, document.hidden ? every * 3 : every);
  };
  timer = setTimeout(run, every);
  onLeave(() => clearTimeout(timer));
}

/* ---------- Top ---------- */
const topState = { kind: 'artists', period: null, mode: null, metric: 'plays', custom: null, all: false };
const isoDay = (t) => new Date(t - new Date(t).getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

function top(ctx) {
  const { A, source } = ctx;
  const src = SOURCES[source];
  const hasLive = !!src;
  if (!topState.mode || (topState.mode === 'archive' && !A) || (topState.mode === 'live' && !hasLive)) topState.mode = A ? 'archive' : 'live';
  const archive = topState.mode === 'archive';
  const periods = archive
    ? [{ id: '4w', label: '4 weeks' }, { id: '6m', label: '6 months' }, { id: '12m', label: '12 months' }, { id: 'all', label: 'All time' }, ...[...A.years].reverse().map((y) => ({ id: `y${y.y}`, label: String(y.y) })), { id: 'custom', label: 'Custom…' }]
    : src.periods;
  if (!periods.some((x) => x.id === topState.period)) topState.period = periods[archive ? 3 : 0].id;
  if (!archive || !A.hasMs) topState.metric = 'plays';
  const kinds = [['artists', 'Artists'], ['tracks', 'Songs'], ['albums', 'Albums'], ['genres', 'Genres']];
  const custom = topState.custom || [A ? Math.max(A.from, A.to - 90 * DAY) : 0, A ? A.to : 0];
  $('#tab').innerHTML = `${banner(ctx)}
    <div class="toolbar">
      <div class="seg" role="group" aria-label="What to rank">${kinds.map(([k, l]) => `<button type="button" data-kind="${k}" aria-pressed="${k === topState.kind}">${l}</button>`).join('')}</div>
      <div class="toolbar__right">
        ${archive && A.hasMs && topState.kind !== 'genres' ? `<div class="seg" role="group" aria-label="Rank by"><button type="button" data-metric="plays" aria-pressed="${topState.metric === 'plays'}">Plays</button><button type="button" data-metric="minutes" aria-pressed="${topState.metric === 'minutes'}">Minutes</button></div>` : ''}
        ${A && hasLive ? `<div class="seg" role="group" aria-label="Data source"><button type="button" data-mode="archive" aria-pressed="${archive}">Your archive</button><button type="button" data-mode="live" aria-pressed="${!archive}">Live from ${src.label}</button></div>` : ''}
      </div>
    </div>
    <div class="toolbar"><div class="seg" role="group" aria-label="Time period">${periods.map((x) => `<button type="button" data-period="${x.id}" aria-pressed="${x.id === topState.period}">${x.label}</button>`).join('')}</div></div>
    ${archive && topState.period === 'custom' ? `<form class="range" id="range">
      <label>From <input class="input" type="date" id="range-from" value="${isoDay(custom[0])}" min="${isoDay(A.from)}" max="${isoDay(A.to)}"></label>
      <label>To <input class="input" type="date" id="range-to" value="${isoDay(custom[1])}" min="${isoDay(A.from)}" max="${isoDay(A.to)}"></label>
      <button class="btn btn--ink btn--sm" type="submit">Show</button>
    </form>` : ''}
    <div id="top-body">${loadingRows()}</div>`;
  $$('[data-kind]').forEach((b) => b.addEventListener('click', () => { topState.kind = b.dataset.kind; topState.all = false; top(ctx); }));
  $$('[data-period]').forEach((b) => b.addEventListener('click', () => { topState.period = b.dataset.period; topState.all = false; top(ctx); }));
  $$('[data-mode]').forEach((b) => b.addEventListener('click', () => { topState.mode = b.dataset.mode; topState.period = null; top(ctx); }));
  $$('[data-metric]').forEach((b) => b.addEventListener('click', () => { topState.metric = b.dataset.metric; top(ctx); }));
  $('#range')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new Date(`${$('#range-from').value}T00:00`).getTime();
    const t = new Date(`${$('#range-to').value}T23:59:59`).getTime();
    if (!(f < t)) { toast('Pick a start date before the end date.', 'bad'); return; }
    topState.custom = [f, t];
    top(ctx);
  });
  $('[data-settings]')?.addEventListener('click', () => (location.hash = '#/settings'));
  const periodLabel = topState.period === 'custom'
    ? `${new Date(custom[0]).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })} to ${new Date(custom[1]).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : periods.find((x) => x.id === topState.period).label;

  const draw = (items, total) => {
    const el = $('#top-body');
    if (!el) return;
    if (topState.kind === 'genres') {
      const sum = total || items.reduce((s, x) => s + (x.plays || 0), 0);
      let g;
      const paint = () => {
        const e = $('#top-body');
        g?.stop();
        if (!e) return;
        g = genres(items.slice(0, 60), () => setTimeout(paint, 0));
        e.innerHTML = `<section class="panel">${genresHTML(g, sum)}</section>`;
      };
      paint();
      onLeave(() => g?.stop());
      return;
    }
    el.innerHTML = topBody(items, topState.kind, periodLabel, total, ctx.L);
    $('[data-more]', el)?.addEventListener('click', () => { topState.all = true; draw(items, total); });
    hydrate(el);
  };
  const fetchKind = topState.kind === 'genres' ? 'artists' : topState.kind;

  if (archive) {
    const end = A.to + 1;
    const range = topState.period === 'custom' ? custom : {
      '4w': [end - 28 * DAY, end], '6m': [end - 182 * DAY, end], '12m': [end - 365 * DAY, end], all: [-Infinity, Infinity],
    }[topState.period] || (() => { const y = Number(topState.period.slice(1)); return [new Date(y, 0, 1).getTime(), new Date(y + 1, 0, 1).getTime()]; })();
    const from = range[0] === -Infinity ? 0 : lowerBound(A.rows, range[0]);
    const to = range[1] === Infinity ? A.rows.length : lowerBound(A.rows, range[1]);
    const metric = topState.kind === 'genres' ? 'plays' : topState.metric;
    draw(topIn(A, fetchKind, range[0], range[1], topState.kind === 'genres' ? 60 : 100, metric), metric === 'plays' ? to - from : 0);
  } else {
    src.top(ctx.name, topState.period, fetchKind, ctx.signal, topState.kind === 'genres' ? 60 : 100).then((items) => {
      if (items) draw(items);
      else { const el = $('#top-body'); if (el) el.innerHTML = '<div class="panel"><p class="empty">ListenBrainz works out top lists once a day, and hasn\'t done this one yet. Check back tomorrow, or import your history to rank it yourself.</p></div>'; }
    }).catch((e) => { if (e.name !== 'AbortError') { const el = $('#top-body'); if (el) el.innerHTML = `<div class="panel"><p class="empty">${esc(e.message)}</p></div>`; } });
  }
}

function topBody(items, kind, periodLabel, total, L = {}) {
  if (!items?.length) return '<div class="panel"><p class="empty">Nothing played in this period.</p></div>';
  const [first, ...restAll] = items;
  const rest = topState.all ? restAll : restAll.slice(0, 24);
  const noun = { artists: 'artist', tracks: 'song', albums: 'album' }[kind];
  const unit = first.unit === 'min' ? 'minutes' : 'plays';
  return `<div class="grid">
    <section class="panel panel--flush c-12"><div class="lead">
      ${kind === 'artists' ? sleeve(first.name, first.name, { img: first.image, size: 150, round: true, kind: 'artist' }) : kind === 'albums' ? sleeve(first.name, first.artist, { img: first.image, size: 150, kind: 'album' }) : trackSleeve({ name: first.name, artist: first.artist, album: first.album }, { img: first.image, size: 150 })}
      <div><span class="lead__n">Top ${noun} · ${esc(periodLabel)}</span><h2>${L.rank?.(first, kind) ? `<a href="${L.rank(first, kind)}" style="text-decoration:none">${esc(first.name)}</a>` : esc(first.name)}</h2><p>${first.artist ? `${esc(first.artist)}${first.plays != null ? ' · ' : ''}` : ''}${first.plays != null ? `${num(first.plays)} ${unit}` : ''}</p></div>
      ${total && first.plays ? `<div class="lead__share"><b>${((first.plays / total) * 100).toFixed(1)}%</b><span>of your ${num(total)} plays in this period</span></div>` : ''}
    </div></section>
    ${rest.length ? `<section class="panel c-12">${rankList(rest, { kind, start: 1, max: first.plays || undefined, link: L.rank })}
      ${!topState.all && restAll.length > rest.length ? `<div class="more"><button type="button" class="btn btn--line btn--sm" data-more>Show all ${restAll.length + 1}</button></div>` : ''}</section>` : ''}
  </div>`;
}

/* ---------- Timeline ---------- */
function needArchive(ctx, what) {
  const copy = {
    timeline: ['Your timeline needs your full history', 'Import it once and Sleeve lays out every month you have listened, finds your eras, and sums up each year.'],
    insights: ['Insights need your full history', 'Import it once and Sleeve looks for obsessions, comebacks, streaks, late nights and more.'],
    clock: ['Your listening clock needs your full history', 'Import it once and Sleeve maps when you listen, hour by hour, across the week.'],
  }[what];
  $('#tab').innerHTML = `${banner(ctx)}<div class="grid">
    <div class="c-12 subhead" style="margin-top:0"><div><h2>${copy[0]}</h2><p class="muted" style="margin-top:6px">${copy[1]} <a href="${hrefFor('demo', what)}">See it on the demo profile</a>.</p></div></div>
    ${importCTA(ctx)}
  </div>`;
  bindCommon(ctx);
}

function timelineTab(ctx) {
  const { A } = ctx;
  if (!A) return needArchive(ctx, 'timeline');
  let sel = overviewPick >= 0 && overviewPick < A.months.length ? overviewPick : A.months.length - 1;
  overviewPick = -1;
  while (sel > 0 && !A.months[sel].n) sel--;
  $('#tab').innerHTML = `${banner(ctx)}
    <section class="panel">
      <div class="panel__head"><h2>Month by month</h2><span class="label">${monthYear(A.from)} to ${monthYear(A.to)} · pick a month</span></div>
      <div id="tl">${timeline(A, { height: 240, selected: sel })}</div>
      <div id="month"></div>
    </section>
    ${A.eras.length ? `<div class="subhead"><div><h2>Your eras</h2><p class="muted">Stretches of at least two months when one artist led your listening.</p></div></div>
    <div class="eras">${A.eras.map((e) => {
      const total = A.months.slice(e.start, e.end + 1).reduce((s, m) => s + m.n, 0);
      return `<a class="era" data-artist="${esc(e.artist)}" href="${ctx.L.artist(e.artist)}" style="--era:var(--c${e.color})"><span class="label">${monthYear(e.from)} to ${monthYear(e.to)} · ${e.months} months</span><h3>The ${esc(e.artist)} era</h3><p>${num(e.plays)} of your ${num(total)} plays in that stretch.</p></a>`;
    }).join('')}</div>` : ''}
    <div class="subhead"><div><h2>Year by year</h2></div></div>
    <div class="years">${[...A.years].reverse().map((y) => `
      <a class="year" href="${ctx.L.year(y.y)}">
        <div class="year__y"><h3>${y.y}</h3><span class="mono faint" style="font-size:12.5px">${num(y.n)} plays</span></div>
        <dl>
          <div><dt>Top artist</dt><dd>${esc(y.topArtist)}</dd></div>
          <div><dt>Top song</dt><dd>${esc(y.topTrack?.[0] || '')}</dd></div>
          <div><dt>New artists</dt><dd>${num(y.newArtists)}</dd></div>
        </dl>
      </a>`).join('')}</div>`;
  const pick = (i) => {
    sel = i;
    $$('.tl__bar').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.i) === i)));
    $('#month').innerHTML = monthHTML(A, i, ctx.L);
    hydrate($('#month'));
  };
  bindTimeline($('#tl'), A, pick);
  pick(sel);
  if (ctx.source !== 'spotify') nameEras(ctx);
}

function monthHTML(A, i, L = {}) {
  const d = monthDetail(A, i);
  if (!d.month.n) return `<p class="empty">No plays in ${longMonth(d.month.start)}.</p>`;
  return `<div class="month" style="border-top:1px solid var(--line);padding-top:20px">
    <div><div class="panel__head" style="margin-bottom:10px"><h3 style="font:500 22px/1.1 var(--f-display);letter-spacing:-.03em">${longMonth(d.month.start)}</h3><span class="label">${num(d.month.n)} plays</span></div>${rankList(d.artists, { size: 32, link: L.rank })}</div>
    <div><div class="panel__head" style="margin-bottom:10px"><span class="label" style="margin-top:8px">Top songs that month</span></div>${rankList(d.tracks, { kind: 'tracks', size: 32, link: L.rank })}</div>
  </div>`;
}

/* ---------- Insights ---------- */
function insightsTab(ctx) {
  const { A } = ctx;
  if (!A) return needArchive(ctx, 'insights');
  $('#tab').innerHTML = `${banner(ctx)}
    <div class="subhead" style="margin-top:0"><div><h2>${A.insights.length} things we noticed</h2><p class="muted">Worked out from ${num(A.plays)} plays, counting ${A.minMs ? 'songs played for 30 seconds or more' : 'every play, however short'}. <a href="${hrefFor(ctx.pid, 'data')}">Change this</a>.</p></div></div>
    ${askPanel(A)}
    ${mainstreamPanel()}
    ${milestonesPanel(A, ctx.L)}
    <div class="insights" style="margin-top:16px">${A.insights.map((x, i) => insightCard(x, i === 0)).join('')}</div>`;
  bindAsk(ctx);
  bindMainstream(A, ctx.L);
}

/* ---------- Clock ---------- */
function clock(ctx) {
  const { A } = ctx;
  if (!A) return needArchive(ctx, 'clock');
  const byHour = new Array(24).fill(0);
  A.heat.forEach((r) => r.forEach((v, h) => { byHour[h] += v; }));
  const peak = byHour.indexOf(Math.max(...byHour));
  let bestD = 0, bestH = 0, bestV = -1;
  A.heat.forEach((r, d) => r.forEach((v, h) => { if (v > bestV) { bestV = v; bestD = d; bestH = h; } }));
  const days = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];
  const hl = (h) => (h === 0 ? '12 am' : h < 12 ? `${h} am` : h === 12 ? '12 pm' : `${h - 12} pm`);
  $('#tab').innerHTML = `${banner(ctx)}
    <div class="grid">
      <section class="panel c-12">
        <div class="panel__head"><h2>Your week, hour by hour</h2>${heatLegend()}</div>
        <p class="muted" style="font-size:15px">Your single busiest slot is <b>${days[bestD]} at ${hl(bestH)}</b>. Times are in your current time zone.</p>
        ${heatmap(A)}
      </section>
      <section class="panel c-7"><div class="panel__head"><h2>Time of day</h2><span class="label">Peak ${hl(peak)}</span></div>${hoursChart(A)}</section>
      <section class="panel c-5"><div class="panel__head"><h2>Day of the week</h2></div>${daysChart(A)}</section>
    </div>`;
}

/* ---------- Data ---------- */
function data(ctx) {
  const { pid, source, p, archive, name } = ctx;
  const src = SOURCES[source];
  const ex = archive.export, lv = archive.live;
  const rows = [];
  if (src) {
    rows.push(`<div class="source-row">
      <span class="source-row__icon">${source === 'spotify' ? icon.spotify : LABEL[source][0]}</span>
      <div><h3>${src.label}${p.simulated ? ' <span class="chip chip--warn">Simulated</span>' : ''}</h3>${source === 'spotify' ? '<p>Signed in with your own Spotify app. Live now playing, last 50 plays and top lists.</p>' : healthLine(health(p.recent, p.hidden), `#/connect/${source}/2`)}</div>
      <div class="source-row__act">${p.user.url ? `<a class="btn btn--line btn--sm" href="${esc(p.user.url)}" target="_blank" rel="noopener">Open profile ${icon.out}</a>` : ''}</div>
    </div>`);
  }
  if (src?.importAll) {
    rows.push(`<div class="source-row">
      <span class="source-row__icon">${icon.refresh}</span>
      <div><h3>Imported history</h3><p>${lv ? `${num(lv.rows.length)} plays, ${monthYear(lv.from)} to ${monthYear(lv.to)}. Last synced ${ago(lv.synced)}.` : `Not imported yet. Import your whole ${src.label} history to unlock the timeline, insights and clock.`}</p></div>
      <div class="source-row__act">${lv ? `<button type="button" class="btn btn--line btn--sm" data-sync>Fetch new plays</button><button type="button" class="btn btn--line btn--sm" data-remove="live">Remove</button>` : '<button type="button" class="btn btn--ink btn--sm" data-sync>Import</button>'}</div>
    </div>`);
  }
  if (source === 'spotify' && lv) {
    rows.push(`<div class="source-row"><span class="source-row__icon">${icon.refresh}</span><div><h3>Saved plays</h3><p>${num(lv.rows.length)} plays kept from Spotify's recent list since ${monthYear(lv.from)}.</p></div><div class="source-row__act"><button type="button" class="btn btn--line btn--sm" data-remove="live">Remove</button></div></div>`);
  }
  rows.push(`<div class="source-row">
    <span class="source-row__icon">${icon.upload}</span>
    <div><h3>${ex?.kind === 'listenbrainz' ? 'ListenBrainz export' : 'Spotify export'}</h3><p>${ex ? `${ex.sample ? 'Sample data. ' : ''}${{ listenbrainz: 'ListenBrainz export file', basic: 'Spotify account data, about one year' }[ex.kind] || 'Extended streaming history'}: ${num(ex.rows.length)} plays, ${monthYear(ex.from)} to ${monthYear(ex.to)}.${ex.kind === 'basic' ? ' For every play since you joined, request the extended version.' : ''}` : 'Not added. It has exact listening time and skips for every play since you made your account.'}</p></div>
    <div class="source-row__act">${ex && !ex.sample ? '<button type="button" class="btn btn--line btn--sm" data-remove="export">Remove</button>' : ''}<a class="btn btn--line btn--sm" href="#/connect/file">${ex ? 'Replace' : 'How to get it'}</a></div>
  </div>`);

  $('#tab').innerHTML = `${banner(ctx)}
    <div class="grid">
      <section class="panel c-12"><div class="panel__head"><h2>Where your data comes from</h2>${archive.export && archive.live ? '<span class="label">Export is used up to its last day, then live plays</span>' : ''}</div><div>${rows.join('')}</div>${ctx.source !== 'demo' ? dropzone({ title: 'Drop a Spotify export', sub: 'Adds it to this profile. Read on your device, never uploaded.' }) : ''}
        <div class="importing" data-importing hidden><div class="panel__head"><span data-import-text class="muted">Starting…</span><button type="button" class="link link--quiet" data-import-stop>Cancel</button></div><div class="bar"><i data-import-bar></i></div></div>
      </section>
      <section class="panel c-6">
        <div class="panel__head"><h2>What counts as a play</h2></div>
        <div class="seg" role="radiogroup" aria-label="What counts as a play"><button type="button" role="radio" data-min="0" aria-checked="${state.minMs === 0}">Any length</button><button type="button" role="radio" data-min="30000" aria-checked="${state.minMs === 30000}">30 seconds or more</button></div>
        <p class="muted" style="font-size:14.5px">Spotify counts a stream once you've listened for 30 seconds, and that's Sleeve's default. This only changes plays where the listening time is known, which means your Spotify export. Last.fm and ListenBrainz only log songs you mostly finished.</p>
        ${ctx.A?.short ? `<p class="faint" style="font-size:14px">${num(ctx.A.short)} plays are shorter than 30 seconds.</p>` : ''}
      </section>
      <section class="panel c-6">
        <div class="panel__head"><h2>Stored in this browser</h2></div>
        <p class="muted" style="font-size:14.5px">Sleeve has no accounts and no server. Everything above lives in this browser only, and nothing leaves your device except the requests to ${source === 'spotify' ? 'Spotify' : src ? src.label : 'nobody'}.</p>
        <div class="flow__actions" id="danger">
          ${ctx.source !== 'demo' ? '<button type="button" class="btn btn--line btn--sm" data-forget>Remove this profile</button>' : ''}
          <button type="button" class="btn btn--line btn--sm" data-wipe>Clear everything</button>
        </div>
      </section>
    </div>`;

  bindDrops($('#tab'), handleFiles);
  $$('[data-min]').forEach((b) => b.addEventListener('click', () => { setMinMs(Number(b.dataset.min)); toast(Number(b.dataset.min) ? 'Counting plays of 30 seconds or more.' : 'Counting every play.'); rerender(); }));
  $$('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
    const a = await getArchive(pid);
    a[b.dataset.remove] = null;
    await setArchive(pid, a);
    toast('Removed.');
    rerender();
  }));
  $('[data-sync]')?.addEventListener('click', async (e) => {
    const box = $('[data-importing]'), text = $('[data-import-text]'), bar = $('[data-import-bar]');
    const ctrl = new AbortController();
    onLeave(() => ctrl.abort());
    $('[data-import-stop]').onclick = () => ctrl.abort();
    box.hidden = false;
    e.currentTarget.setAttribute('aria-disabled', 'true');
    try {
      const n = await importHistory(pid, source, name, { signal: ctrl.signal, onProgress: (d, t) => { text.textContent = t ? `Read ${num(d)} of ${num(t)} plays` : `Read ${num(d)} plays`; bar.style.width = `${t ? Math.min(100, (d / t) * 100) : 30}%`; } });
      toast(n ? `Added ${num(n)} plays.` : "You're up to date.");
      rerender();
    } catch (err) {
      box.hidden = true;
      if (err.name !== 'AbortError') toast(err.message, 'bad');
    }
  });
  confirmButton($('[data-forget]'), 'Remove this profile? Tap again', async () => {
    await clearArchive(pid);
    profiles.forget(pid);
    if (source === 'spotify') spotify.disconnect();
    toast('Profile removed from this browser.');
    go('#/');
  });
  confirmButton($('[data-wipe]'), 'Clear everything? Tap again', async () => {
    await idb.clear();
    ['liner.profiles', 'liner.sp.tok', 'liner.sp.watch', 'liner.sp.client', 'liner.lfmkey', 'liner.minMs'].forEach((k) => store.set(k, null));
    toast('Everything Sleeve stored in this browser is gone.');
    setTimeout(() => location.assign(location.pathname), 600);
  });
}

// Two-step buttons instead of confirm() dialogs.
function confirmButton(btn, prompt, action) {
  if (!btn) return;
  const original = btn.textContent;
  let armed = false, t = 0;
  btn.addEventListener('click', () => {
    if (armed) { clearTimeout(t); action(); return; }
    armed = true;
    btn.textContent = prompt;
    btn.style.color = 'var(--bad)';
    t = setTimeout(() => { armed = false; btn.textContent = original; btn.style.color = ''; }, 4000);
  });
}

/* ---------- Artist, song and year pages ---------- */
function detail(ctx) {
  const { A, tab, args } = ctx;
  if (!A) return needArchive(ctx, 'timeline');
  let html;
  if (tab === 'artist') html = artistPage(ctx, args[0] || '');
  else if (tab === 'song') html = songPage(ctx, args[0] || '', args[1] || '');
  else html = yearPage(ctx, Number(args[0]) || A.years[A.years.length - 1].y);
  $('#tab').innerHTML = `${banner(ctx)}${html}`;
  if (tab === 'year') {
    bindYear(ctx);
    if (ctx.source !== 'spotify') {
      $('.recap')?.insertAdjacentHTML('afterend', yearNotes());
      bindYearNotes(ctx, ctx.yearCard?.y);
    }
  }
}

/* ---------- The header takes the colour of your top artist ---------- */
async function paintHeader({ A, p }) {
  const head = $('#phead');
  if (!head) return;
  const lead = A?.artists[0]?.name || p.recent?.[0]?.artist;
  const albums = A ? A.albums.slice(0, 4) : [];
  if (albums.length) $('#phead-covers').innerHTML = albums.map((al) => sleeve(al.album, al.artist, { size: 118, kind: 'album' })).join('');
  const firstAlbum = albums[0];
  const url = firstAlbum ? await art('album', firstAlbum.album, firstAlbum.artist) : lead ? await art('artist', lead) : '';
  const pal = await palette(url);
  if (pal && document.body.contains(head)) paint(head, pal);
}
