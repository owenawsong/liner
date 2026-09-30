import { $, $$, esc, avatar, sleeve, trackSleeve, num, monthYear, longMonth, fullDate, ago, icon, eq, toast, store, idb } from '../ui.js';
import { SOURCES, state, view, onLeave, go, rerender, hrefFor, profiles, getArchive, setArchive, clearArchive, analysisFor, setMinMs } from '../core.js';
import { topIn, monthDetail, lowerBound } from '../analysis.js';
import { health, healthLine, trackRows, rankList, statStrip, timeline, bindTimeline, heatmap, heatLegend, hoursChart, daysChart, insightCard, dropzone, bindDrops, sourceBadge } from '../components.js';
import { handleFiles, keepSpotifyPlays } from '../actions.js';
import { autoSync, startSync, cancelSync, cancelAllSync, watchSync, syncStatus } from '../sync.js';
import { linker, artistPage, songPage, yearPage, bindYear, onThisDay, mountSearch, genres, genresHTML } from './detail.js';
import { hydrate, art, cachedArtist, artistInfo } from '../meta.js';
import { palette, paint } from '../color.js';
import { mainstreamPanel, bindMainstream, milestonesPanel } from './mainstream.js';
import { notesPanel, bindNotes, askPanel, bindAsk, nameEras, yearNotes, bindYearNotes } from './aiviews.js';
import { evolutionView } from './evolution.js';
import { patternsView } from './patterns.js';
import { discoverView } from './discover.js';
import { evolution } from '../evolution.js';
import { demoRecent, DEMO_USER } from '../sources/demo.js';
import * as lastfm from '../sources/lastfm.js';
import * as spotify from '../sources/spotify.js';

const TABS = [['overview', 'Overview'], ['discover', 'Discover'], ['top', 'Charts'], ['timeline', 'Timeline'], ['evolution', 'Evolution'], ['patterns', 'Deep dive'], ['insights', 'Insights'], ['clock', 'Clock'], ['data', 'Data']];
const PRIMARY_TABS = TABS.slice(0, 4);
const MORE_TABS = TABS.slice(4);
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
    if (!fresh && (archive.export?.rows?.length || archive.live?.rows?.length)) await new Promise((resolve) => setTimeout(resolve, 0));
    if (ctrl.signal.aborted) return;
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
  const firstJob = syncStatus(pid);
  const preparingFirstRecord = source === 'lastfm' && (!A && !archive.live?.synced || firstJob?.state === 'running' && firstJob.phase === 'writing') &&
    !p.simulated && !p.hidden && p.user.playcount > 0 && store.get(`liner.setup.preview:${pid}`) !== '1';
  if (preparingFirstRecord) {
    firstRecordSetup(ctx);
    autoSync(ctx);
    return;
  }
  const current = DETAIL[tab] || tab;
  const tabLink = ([t, label]) => `<a href="${hrefFor(pid, t === 'overview' ? '' : t)}"${t === current ? ' aria-current="page"' : ''}>${label}${t === 'insights' && A ? `<small>${A.insights.length}</small>` : ''}</a>`;
  const activeMore = MORE_TABS.find(([t]) => t === current);
  view().innerHTML = `
    <div class="wrap">${header(ctx)}</div>
    <nav class="tabs" aria-label="Profile sections"><div class="wrap tabs__inner">${PRIMARY_TABS.map(tabLink).join('')}<details class="tabs__more"><summary class="${activeMore ? 'is-current' : ''}" aria-label="More profile sections">${activeMore ? activeMore[1] : 'More'} <span aria-hidden="true">⌄</span></summary><div class="tabs__menu">${MORE_TABS.map(tabLink).join('')}</div></details></div></nav>
    <div class="wrap" id="sync-banner" aria-live="polite"></div>
    <div class="wrap fade-in" id="tab"></div>`;
  ({ overview, discover: discoverTab, top, timeline: timelineTab, evolution: evolutionTab, patterns: patternsTab, insights: insightsTab, clock, data, artist: detail, song: detail, year: detail })[tab](ctx);
  const more = $('.tabs__more');
  more.addEventListener('keydown', (event) => { if (event.key === 'Escape') { more.open = false; $('summary', more).focus(); } });
  bindSyncBanner(ctx);
  autoSync(ctx);
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
    <p class="flow__lede">${nf ? 'Check the spelling, or set up a new account to start recording your plays.' : esc(e.message)}</p>
    <div class="flow__actions">${nf ? `<a class="btn btn--ink" href="#/connect/${source}">Set up ${LABEL[source]}</a>` : '<button type="button" class="btn btn--ink" id="retry">Try again</button>'}<a class="btn btn--line" href="#/">Back to start</a></div>
  </div></div>`;
  $('#retry')?.addEventListener('click', rerender);
}

/* ---------- Header ---------- */
function header({ p, A, source, pid }) {
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
    ${avatar(u.display, store.get(`liner.avatar:${pid}`) || u.image, 64)}
    <div class="phead__body"><span class="phead__catno">SLEEVE / ${catno}${A ? ` / ${new Date(A.from).getFullYear()}–${new Date(A.to).getFullYear()}` : ''}</span><h1>${esc(u.display)}</h1><div class="phead__meta">${bits.join('')}</div></div>
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
    if (!ctx.preview) parts.push(storyPanel(ctx));
    if (!ctx.preview) parts.push(notesPanel(A, source === 'demo'));
    parts.push(`<section class="panel c-12"><div class="panel__head"><h2>Month by month</h2><a class="link link--quiet" href="${hrefFor(pid, 'timeline')}">Open the timeline ${icon.arrow}</a></div>${timeline(A, { height: 140, fit: true })}</section>`);
  } else if (!ctx.preview) {
    parts.push(source === 'lastfm' && !p.user.playcount ? firstPlayCTA() : importCTA(ctx));
  }
  const topLabel = source === 'file' ? 'All time' : source === 'spotify' ? 'Last 4 weeks' : 'Last 7 days';
  parts.push(`<section class="panel c-5"><div class="panel__head"><h2>Top 10 artists</h2><span class="label" id="top-label">${topLabel}</span></div><div id="top-artists">${ctx.topArtists ? rankList(ctx.topArtists.slice(0, 10), { link: ctx.L?.rank }) : loadingRows()}</div></section>`);
  if (liveSource) parts.push(`<section class="panel c-7"><div class="panel__head"><h2>Latest 10 songs</h2><span class="label">${source === 'listenbrainz' ? 'Updates every few minutes' : 'Live'}</span></div><div id="recent">${trackRows(p.recent, 10, ctx.L?.track)}</div></section>`);
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
  $$('[data-story-month]', $('#tab')).forEach((button) => button.addEventListener('click', () => { overviewPick = Number(button.dataset.storyMonth); go(hrefFor(ctx.pid, 'timeline')); }));
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
      if (items) { el.innerHTML = rankList(items.slice(0, 10), { link: ctx.L?.rank }); hydrate(el); $('#top-label').textContent = label === 'All time' ? label : `Last ${label.toLowerCase().replace(/^last /, '')}`; }
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

function firstPlayCTA() {
  return `<section class="panel c-12"><div class="cta"><div><span class="label">Your first play</span><h2 style="margin-top:8px">Your record starts with the next song.</h2><p>Connect Spotify in Last.fm, then play something. Your Last.fm account starts empty and will grow from there. Sleeve checks for new plays while this page is open.</p></div><div class="cta__actions"><a class="btn btn--ink" href="#/connect/lastfm/2">Check Spotify connection ${icon.arrow}</a><a class="btn btn--line" href="#/demo">Explore the demo</a></div></div><p class="muted" style="margin-top:18px;font-size:14px">Want your older plays too? <a href="#/connect/file">Spotify can email you an optional history file</a>.</p></section>`;
}

function firstRecordSetup(ctx) {
  const { pid, p } = ctx;
  const writing = store.get('liner.ai') !== 'off';
  const recent = (p.recent || []).filter((track) => track.artist && track.name).slice(0, 3);
  view().innerHTML = `<div class="wrap setup-wrap"><section class="setup-record" aria-labelledby="setup-title">
    <div class="setup-record__copy"><span class="label">SLEEVE / FIRST PRESSING</span><h1 id="setup-title">Making sense of your record.</h1>
      <p class="setup-record__lead">We found <b>${num(p.user.playcount)} plays</b> for ${esc(p.user.display)}. Sleeve is reading the full history before it lays out your eras, discoveries${writing ? ', and first liner note' : ''}.</p>
      <div class="setup-record__progress" role="status" aria-live="polite"><b id="setup-phase">Finding your plays</b><span id="setup-detail">Starting the history read…</span></div>
      <div class="setup-record__bar" role="progressbar" aria-label="Reading listening history" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
      <ol class="setup-record__steps"><li data-step="reading" class="is-active"><span>01</span> Read every play</li><li data-step="saving"><span>02</span> Map the record</li>${writing ? '<li data-step="writing"><span>03</span> Write the opening note</li>' : ''}</ol>
      <div class="setup-record__actions"><button type="button" class="btn btn--line" id="setup-preview">Explore an early preview</button><button type="button" class="link" id="setup-retry" hidden>Try the history again</button></div>
      <p class="setup-record__foot">Your plays are saved in this browser. A large history can take a few minutes; if you leave, the import resumes from its saved pages when you return.</p>
    </div>
    <div class="setup-record__visual" aria-hidden="true"><span class="setup-record__eyebrow">RECENTLY ON YOUR TURNTABLE</span><div class="setup-record__sleeves">${recent.map((t, i) => `<div class="setup-record__sleeve" style="--i:${i}">${sleeve(t.album || t.name, t.artist, { img: t.image, size: 220 })}<span>${esc(t.name)} <i>— ${esc(t.artist)}</i></span></div>`).join('') || '<div class="setup-record__blank">Your first chapter is taking shape.</div>'}</div><span class="setup-record__index">${esc(p.user.name)} / YOUR WHOLE RECORD</span></div>
  </section></div>`;
  const setStep = (phase) => {
    const order = ['reading', 'saving', 'writing'];
    const current = order.indexOf(phase);
    $$('[data-step]', view()).forEach((row) => {
      const i = order.indexOf(row.dataset.step);
      row.classList.toggle('is-active', i === current);
      row.classList.toggle('is-done', i < current);
    });
  };
  const off = watchSync(pid, (job) => {
    if (!$('#setup-phase')) return;
    const phase = job?.phase === 'writing' ? 'writing' : job?.phase === 'saving' ? 'saving' : 'reading';
    const pct = job?.total ? Math.min(100, Math.round(job.done / job.total * 100)) : 0;
    const bar = $('.setup-record__bar');
    bar.setAttribute('aria-valuenow', String(phase === 'reading' ? pct : 100));
    $('i', bar).style.width = `${phase === 'reading' ? pct : 100}%`;
    setStep(phase);
    $('#setup-retry').hidden = job?.state !== 'error' && job?.state !== 'cancelled';
    if (job?.state === 'error' || job?.state === 'cancelled') {
      $('#setup-phase').textContent = 'The history read paused';
      $('#setup-detail').textContent = job.error || 'You can resume from the last saved page.';
    } else if (phase === 'writing') {
      $('#setup-phase').textContent = 'Putting the first page into words';
      $('#setup-detail').textContent = 'Your history is saved. The opening note is the last step.';
    } else if (phase === 'saving') {
      $('#setup-phase').textContent = 'Mapping your listening';
      $('#setup-detail').textContent = `${num(job.done)} plays read. Building your chapters now.`;
    } else {
      $('#setup-phase').textContent = job?.phase === 'resuming' ? 'Picking up where we left off' : 'Reading your listening history';
      $('#setup-detail').textContent = job?.total ? `${num(job.done)} of ${num(job.total)} plays read · ${pct}%` : 'Finding the size of your record…';
    }
  });
  onLeave(off);
  $('#setup-preview').addEventListener('click', () => { store.set(`liner.setup.preview:${pid}`, '1'); rerender(); });
  $('#setup-retry').addEventListener('click', () => startSync(pid, ctx.source, ctx.name, { prepare: true, profile: p }));
}

function storyPanel(ctx) {
  const { A, L } = ctx;
  const first = A.rows[0];
  const peak = A.months.reduce((best, month, i) => month.n > best.month.n ? { month, i } : best, { month: A.months[0], i: 0 });
  const latest = topIn(A, 'artists', A.to - 90 * DAY, A.to + 1, 1)[0];
  const E = evolution(A, A.to + 1);
  return `<section class="panel c-12 story"><div class="panel__head"><div><span class="label">A record in chapters</span><h2>Your story so far</h2></div><a class="link link--quiet" href="${hrefFor(ctx.pid, 'evolution')}">See what changed ${icon.arrow}</a></div>
    <div class="story__chapters">
      <article class="story__chapter"><span class="story__no">01 / THE FIRST PLAY</span>${trackSleeve(first, { size: 70 })}<h3><a href="${L.song(first.track, first.artist)}">${esc(first.track)}</a></h3><p>${esc(first.artist)} · ${fullDate(first.t)}</p><small>The earliest song in this record.</small></article>
      <article class="story__chapter"><span class="story__no">02 / THE BIGGEST MONTH</span>${sleeve(peak.month.topArtist || 'Your music', peak.month.topArtist || 'Your music', { size: 70, round: true, kind: 'artist' })}<h3><button type="button" data-story-month="${peak.i}">${monthYear(peak.month.start)}</button></h3><p>${num(peak.month.n)} plays${peak.month.topArtist ? ` · led by ${esc(peak.month.topArtist)}` : ''}</p><small>Your busiest recorded month. Open it on the timeline.</small></article>
      <article class="story__chapter"><span class="story__no">03 / THE LATEST CHAPTER</span>${sleeve(latest?.name || 'Your music', latest?.name || 'Your music', { size: 70, round: true, kind: 'artist' })}<h3>${latest ? `<a href="${L.artist(latest.name)}">${esc(latest.name)}</a>` : 'Still taking shape'}</h3><p>${latest ? `${num(latest.plays)} plays in your latest recorded 90 days` : 'No recent plays in this record'}</p><small>${E.newArtists ? `${num(E.newArtists)} artists first heard in that stretch.` : 'A chapter built from the plays you have.'}</small></article>
    </div></section>`;
}

function bindSyncBanner(ctx) {
  const el = $('#sync-banner');
  const off = watchSync(ctx.pid, (job) => {
    if (!el.isConnected) return;
    const importButton = $('[data-import]');
    if (importButton) { importButton.disabled = job?.state === 'running'; importButton.textContent = job?.state === 'running' ? 'Setting up your record…' : 'Import my history'; }
    if (!job || job.state === 'done') { el.innerHTML = ''; return; }
    if (job.state === 'cancelled') {
      el.innerHTML = '<div class="sync-note"><div><b>History setup cancelled</b><span>Your live profile still works. Resume whenever you like.</span></div><button class="btn btn--line btn--sm" type="button" data-sync-retry>Resume</button></div>';
      $('[data-sync-retry]', el).onclick = () => startSync(ctx.pid, ctx.source, ctx.name);
      return;
    }
    if (job.state === 'error') {
      el.innerHTML = `<div class="sync-note sync-note--error"><div><b>History setup paused</b><span>${esc(job.error)} Your profile still works with its live data.</span></div><button class="btn btn--line btn--sm" type="button" data-sync-retry>Try again</button></div>`;
      $('[data-sync-retry]', el).onclick = () => startSync(ctx.pid, ctx.source, ctx.name);
      return;
    }
    const pct = job.total ? Math.min(100, Math.round(job.done / job.total * 100)) : 0;
    el.innerHTML = `<div class="sync-note"><div><b>${job.phase === 'saving' ? 'Saving your listening record' : job.phase === 'resuming' ? 'Resuming your history setup' : ctx.A ? 'Updating your listening history' : 'Setting up your listening record'}</b><span>${job.phase === 'saving' ? `Putting ${num(job.done)} plays in this browser…` : job.total ? `${num(job.done)} of ${num(job.total)} plays · ${pct}%${job.phase === 'resuming' ? ' · saved from your last visit' : ''}` : 'Finding your plays…'} You can explore while this runs.</span></div><div class="sync-note__side"><div class="bar" role="progressbar" aria-label="Listening history setup" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div><button type="button" class="link link--quiet" data-sync-cancel>Cancel</button></div></div>`;
    $('[data-sync-cancel]', el).onclick = () => cancelSync(ctx.pid);
  });
  onLeave(off);
}

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
    <div class="cta"><div><span class="label">Your full history</span><h2 style="margin-top:8px">${source === 'lastfm' ? 'Setting up your record' : 'Build your timeline'}</h2>
      <p>Sleeve ${source === 'lastfm' ? 'starts reading' : 'can read'} ${count ? `all ${num(count)} of your` : 'your'} ${src.label} plays ${source === 'lastfm' ? 'automatically' : ''} in about ${estimate(src.estimateImport(count || 1000))}. You can keep exploring while it builds your eras, timeline and insights. The result is saved in this browser.${bigLB ? " With a history this big, ListenBrainz's own export is faster: in ListenBrainz settings choose Export, then drop the file below." : ''}</p></div>
      ${source === 'lastfm' ? '' : `<div class="cta__actions"><button type="button" class="btn btn--ink" data-import>Import my history ${icon.arrow}</button></div>`}</div>
    ${exportDrop}
  </section>`;
}

function bindCommon(ctx) {
  const root = $('#tab');
  bindDrops(root, handleFiles);
  $$('[data-settings]', root).forEach((b) => b.addEventListener('click', () => (location.hash = '#/settings')));
  const go_ = $('[data-import]', root);
  if (!go_) return;
  go_.addEventListener('click', () => startSync(ctx.pid, ctx.source, ctx.name));
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
  let timer = 0, running = false, lastPaint = Date.now();
  const signature = (rows) => (rows || []).slice(0, 10).map((t) => `${t.artist}|${t.name}|${t.nowPlaying ? 'now' : t.t}`).join('\n');
  let lastSignature = signature(ctx.p.recent);
  const schedule = () => { clearTimeout(timer); if (!ctx.signal.aborted && !document.hidden) timer = setTimeout(run, every); };
  const run = async () => {
    if (running || ctx.signal.aborted || document.hidden) return;
    running = true;
    try {
      const rec = ctx.source === 'demo' ? demoRecent(20) : await SOURCES[ctx.source].recent(ctx.name, 20, ctx.signal);
      if (ctx.signal.aborted) return;
      ctx.p.recent = rec;
      live.p = ctx.p;
      const nextSignature = signature(rec);
      if (nextSignature !== lastSignature || Date.now() - lastPaint > 60000) {
        lastSignature = nextSignature; lastPaint = Date.now();
        const now = $('#now'), recent = $('#recent'), pl = $('#pill');
        if (now) { now.innerHTML = nowHTML(ctx.p); hydrate(now); }
        if (recent) { recent.innerHTML = trackRows(rec, 10, ctx.L?.track); hydrate(recent); }
        if (pl) pl.innerHTML = pill(ctx.p);
      }
    } catch (e) { if (e.name === 'AbortError') return; }
    finally { running = false; schedule(); }
  };
  const visibility = () => { if (!document.hidden) { clearTimeout(timer); run(); } else clearTimeout(timer); };
  document.addEventListener('visibilitychange', visibility);
  schedule();
  onLeave(() => { clearTimeout(timer); document.removeEventListener('visibilitychange', visibility); });
}

/* ---------- Top ---------- */
const topState = { kind: 'artists', period: null, mode: null, metric: 'plays', custom: null, all: false };
let topRequest = 0;
const isoDay = (t) => new Date(t - new Date(t).getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

function top(ctx) {
  const request = ++topRequest;
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
    if (request !== topRequest || ctx.signal.aborted) return;
    const el = $('#top-body');
    if (!el) return;
    if (topState.kind === 'genres') {
      const sum = total || items.reduce((s, x) => s + (x.plays || 0), 0);
      const sample = items.slice(0, 24);
      const pending = sample.filter((a) => !cachedArtist(a.name));
      el.innerHTML = `<section class="panel"><div class="panel__head"><h2>Top genres & styles</h2><span class="label" id="top-genre-status">Checking ${sample.length} artists</span></div><p class="muted">Artist tags are weighted by your plays. The list appears when the scan is complete, so its rankings do not jump around.</p><div class="ms-progress" role="progressbar" aria-label="Checking genre tags" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"><i></i></div><div id="top-genre-list"></div></section>`;
      (async () => {
        let done = sample.length - pending.length;
        const update = () => {
          if (request !== topRequest || ctx.signal.aborted || !el.isConnected) return;
          const value = sample.length ? Math.round(done / sample.length * 100) : 100;
          $('#top-genre-status', el).textContent = `${done} of ${sample.length} artists checked`;
          const bar = $('.ms-progress', el); bar.setAttribute('aria-valuenow', String(value)); $('i', bar).style.width = `${value}%`;
        };
        update();
        for (const artist of pending) {
          if (request !== topRequest || ctx.signal.aborted) return;
          await artistInfo(artist.name);
          done++; update();
        }
        if (request !== topRequest || ctx.signal.aborted || !el.isConnected) return;
        const g = genres(sample, () => {});
        $('#top-genre-list', el).innerHTML = `<p class="faint" style="font-size:13px;margin-bottom:14px">Tags cover ${sum ? (g.covered / sum * 100).toFixed(1) : '0.0'}% of ${archive ? 'plays in this period' : 'plays represented by these artists'}.</p>${genresHTML(g, sum)}`;
      })();
      return;
    }
    el.innerHTML = topBody(items, topState.kind, periodLabel, total, ctx.L);
    $('[data-more]', el)?.addEventListener('click', () => { topState.all = true; draw(items, total); });
    hydrate(el);
  };
  const fetchKind = topState.kind === 'genres' ? 'artists' : topState.kind;
  const fail = (message) => {
    if (request !== topRequest || ctx.signal.aborted) return;
    const el = $('#top-body');
    if (!el) return;
    el.innerHTML = `<div class="panel"><p class="empty">${esc(message)}</p><button type="button" class="btn btn--line btn--sm" data-top-retry>Try again</button></div>`;
    $('[data-top-retry]', el).addEventListener('click', () => top(ctx));
  };

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
      if (request !== topRequest || ctx.signal.aborted) return;
      if (items) draw(items);
      else fail(source === 'listenbrainz' ? 'ListenBrainz has not calculated top lists for this profile yet. Try again tomorrow.' : 'No top list is available right now.');
    }).catch((e) => { if (e.name !== 'AbortError') fail(e.message || 'Could not load the top list.'); });
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
  const empty = ctx.source === 'lastfm' && !ctx.p.user.playcount;
  const preparing = ctx.source === 'lastfm' && !empty;
  const copy = (empty ? {
    timeline: ['Your timeline starts with your first song', 'Connect Spotify in Last.fm, then listen. Your months and eras will take shape as your record grows.'],
    discover: ['Discovery starts with your first song', 'Connect Spotify in Last.fm, then listen. Sleeve will use your record and your ratings to find new artists and albums.'],
    evolution: ['Your taste changes from the first song', 'Connect Spotify in Last.fm, then listen. Once you have history, Sleeve can compare your recent chapters.'],
    patterns: ['Your deeper charts start with the first song', 'Connect Spotify in Last.fm, then listen. Activity, discovery and genre charts will grow with your record.'],
    insights: ['Insights grow from your listening', 'Connect Spotify in Last.fm, then listen. Sleeve will find patterns as more plays arrive.'],
    clock: ['Your listening clock starts with your first song', 'Connect Spotify in Last.fm, then listen. Sleeve will map when you play music.'],
  } : preparing ? {
    timeline: ['Your timeline is being prepared', 'Sleeve is reading your Last.fm history in the background. You can explore while it works.'],
    discover: ['Your recommendations are being prepared', 'Sleeve is reading your Last.fm history to understand what you already know.'],
    evolution: ['Your taste evolution is being prepared', 'Sleeve is reading your Last.fm history so it can compare your recent listening with earlier periods.'],
    patterns: ['Your deeper charts are being prepared', 'Sleeve is reading your Last.fm history to build month-by-month activity and discovery charts.'],
    insights: ['Your insights are being prepared', 'Sleeve is reading your Last.fm history to find patterns across your record.'],
    clock: ['Your listening clock is being prepared', 'Sleeve is reading your Last.fm history to map when you listen.'],
  } : {
    timeline: ['Your timeline needs your full history', 'Import it once and Sleeve lays out every month you have listened, finds your eras, and sums up each year.'],
    discover: ['Discovery needs your listening history', 'Import your plays so Sleeve can find new artists and albums connected to your taste.'],
    evolution: ['Taste evolution needs your listening history', 'Sleeve compares equal periods to find discoveries, rising artists, fading favorites and comebacks.'],
    patterns: ['Deeper charts need your listening history', 'Import your plays to see month-by-month activity, discovery, breadth and genres.'],
    insights: ['Insights need your full history', 'Import it once and Sleeve looks for obsessions, comebacks, streaks, late nights and more.'],
    clock: ['Your listening clock needs your full history', 'Import it once and Sleeve maps when you listen, hour by hour, across the week.'],
  })[what];
  $('#tab').innerHTML = `${banner(ctx)}<div class="grid">
    <div class="c-12 subhead" style="margin-top:0"><div><h2>${copy[0]}</h2><p class="muted" style="margin-top:6px">${copy[1]} <a href="${hrefFor('demo', what)}">See it on the demo profile</a>.</p></div></div>
    ${empty ? firstPlayCTA() : importCTA(ctx)}
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

function evolutionTab(ctx) {
  if (!ctx.A) return needArchive(ctx, 'evolution');
  evolutionView(ctx, banner(ctx));
}

function discoverTab(ctx) {
  if (!ctx.A) return needArchive(ctx, 'discover');
  discoverView(ctx, banner(ctx));
}

function patternsTab(ctx) {
  if (!ctx.A) return needArchive(ctx, 'patterns');
  patternsView(ctx, banner(ctx));
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
      <div><h3>Imported history</h3><p>${lv ? `${num(lv.rows.length)} plays, ${monthYear(lv.from)} to ${monthYear(lv.to)}. Last synced ${ago(lv.synced)}.` : source === 'lastfm' ? 'Preparing your full Last.fm history automatically. Progress appears above.' : `Not imported yet. Import your whole ${src.label} history to unlock the timeline, insights and clock.`}</p></div>
      <div class="source-row__act">${lv ? `<button type="button" class="btn btn--line btn--sm" data-sync>Fetch new plays</button><button type="button" class="btn btn--line btn--sm" data-remove="live">Remove</button>` : source === 'lastfm' ? '' : '<button type="button" class="btn btn--ink btn--sm" data-sync>Import</button>'}</div>
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
      </section>
      <section class="panel c-6">
        <div class="panel__head"><h2>What counts as a play</h2></div>
        <div class="seg" role="radiogroup" aria-label="What counts as a play"><button type="button" role="radio" data-min="0" aria-checked="${state.minMs === 0}">Any length</button><button type="button" role="radio" data-min="30000" aria-checked="${state.minMs === 30000}">30 seconds or more</button></div>
        <p class="muted" style="font-size:14.5px">Spotify counts a stream once you've listened for 30 seconds, and that's Sleeve's default. This only changes plays where the listening time is known, which means your Spotify export. Last.fm and ListenBrainz only log songs you mostly finished.</p>
        ${ctx.A?.short ? `<p class="faint" style="font-size:14px">${num(ctx.A.short)} plays are shorter than 30 seconds.</p>` : ''}
      </section>
      <section class="panel c-6">
        <div class="panel__head"><h2>Stored in this browser</h2></div>
        <p class="muted" style="font-size:14.5px">Your listening archive stays in this browser. Sleeve requests live data from ${source === 'spotify' ? 'Spotify' : src ? src.label : 'its music sources'} and artwork or artist tags from public music services. When AI writing is on, a short summary of your stats is sent to Sleeve's writer; raw plays are not sent. You can turn AI off in Settings.</p>
        <div class="flow__actions" id="danger">
          ${ctx.source !== 'demo' ? '<button type="button" class="btn btn--line btn--sm" data-forget>Remove this profile</button>' : ''}
          <button type="button" class="btn btn--line btn--sm" data-wipe>Clear everything</button>
        </div>
      </section>
    </div>`;

  bindDrops($('#tab'), handleFiles);
  $$('[data-min]').forEach((b) => b.addEventListener('click', () => { setMinMs(Number(b.dataset.min)); toast(Number(b.dataset.min) ? 'Counting plays of 30 seconds or more.' : 'Counting every play.'); rerender(); }));
  $$('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
    const a = { ...await getArchive(pid) };
    a[b.dataset.remove] = null;
    await setArchive(pid, a);
    toast('Removed.');
    rerender();
  }));
  $('[data-sync]')?.addEventListener('click', () => startSync(pid, source, name));
  confirmButton($('[data-forget]'), 'Remove this profile? Tap again', async () => {
    await cancelSync(pid);
    await clearArchive(pid);
    profiles.forget(pid);
    if (source === 'spotify') spotify.disconnect();
    toast('Profile removed from this browser.');
    go('#/');
  });
  confirmButton($('[data-wipe]'), 'Clear everything? Tap again', async () => {
    await cancelAllSync();
    await idb.clear();
    Object.keys(localStorage).filter((k) => k.startsWith('liner.')).forEach((k) => store.set(k, null));
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
