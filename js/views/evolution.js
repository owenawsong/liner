import { $, $$, esc, num, shortDate, sleeve, store } from '../ui.js';
import { onLeave, rerender, hrefFor } from '../core.js';
import { evolution } from '../evolution.js';
import { hydrate } from '../meta.js';
import { write, reveal, loadingLines } from '../ai.js';
import { savedRecommendations } from '../recommendations.js';
import { getTaste } from '../taste.js';
import { rankCandidates } from '../discovery.js';

const when = (ms) => new Date(ms).toLocaleDateString('en', { month: 'short', year: 'numeric' });
let windowDays = 90;

export function evolutionView(ctx, banner) {
  const E = evolution(ctx.A, ctx.A.to + 1, windowDays);
  const maxPlays = Math.max(1, ...E.months.map((m) => m.plays));
  const artistRow = (x, detail) => `<a class="ev-artist" href="${ctx.L.artist(x.name)}">${sleeve(x.name, x.name, { size: 42, round: true, kind: 'artist' })}<span><b>${esc(x.name)}</b><small>${detail(x)}</small></span></a>`;
  $('#tab').innerHTML = `${banner}
    <div class="subhead" style="margin-top:0"><div><span class="label">Your changing taste</span><h2>What changed in your listening?</h2><p class="muted">Two equal ${windowDays}-day periods: ${shortDate(E.priorFrom)}–${shortDate(E.from)} and ${shortDate(E.from)}–${shortDate(ctx.A.to)}. Based on plays, with no guessed mood or audio properties.</p></div><div class="seg" role="group" aria-label="Comparison window">${[30, 90, 365].map((days) => `<button type="button" data-ev-days="${days}" aria-pressed="${days === windowDays}">${days === 365 ? '1 year' : `${days} days`}</button>`).join('')}</div></div>
    <section class="panel ev-lead">
      <div class="ev-lead__score"><span class="label">Taste shift</span><b>${E.shift == null ? '—' : E.shift}</b><span>${E.shift == null ? 'Needs at least 30 plays in each period' : 'out of 100 · change in your artist mix'}</span></div>
      <div class="ev-lead__details"><h3>${E.shift == null ? 'Your comparison is still growing.' : E.shift >= 60 ? 'A different chapter.' : E.shift >= 35 ? 'Your rotation is moving.' : 'Your core is holding steady.'}</h3><p>${num(E.total)} plays in the latest ${windowDays} days, versus ${num(E.previous)} in the ${windowDays} days before. ${E.overlap} of your latest top 20 artists also appeared in the previous top 20.</p><div class="ev-mini"><span><b>${num(E.activeArtists)}</b>artists lately</span><span><b>${num(E.newArtists)}</b>new to you</span><span><b>${E.total ? Math.round(E.newPlays / E.total * 100) : 0}%</b>plays from new artists</span></div></div>
    </section>
    <section class="panel ev-chart"><div class="panel__head"><div><h2>Discovery, month by month</h2><p class="muted">Colored portions are plays from artists you first heard that month.</p></div><span class="label">Last 12 months</span></div>
      <div class="ev-chart__grid" role="img" aria-label="Monthly plays and plays by newly discovered artists">${E.months.map((m) => `<div class="ev-chart__col" title="${when(m.month)}: ${num(m.plays)} plays, ${num(m.fresh)} from new artists"><div class="ev-chart__bar" style="height:${Math.max(2, m.plays / maxPlays * 100)}%"><i style="height:${m.plays ? m.fresh / m.plays * 100 : 0}%"></i></div><small>${new Date(m.month).toLocaleDateString('en', { month: 'short' })}</small></div>`).join('')}</div>
      <div class="ev-chart__key"><i></i> Plays from artists new to you that month <span>Peak ${num(maxPlays)} plays</span></div>
    </section>
    <div class="ev-grid">
      <section class="panel"><div class="panel__head"><h2>Moving up</h2><span class="label">Bigger share than before</span></div>${E.rising.length ? E.rising.map((x) => artistRow(x, (a) => `${num(a.before)} → ${num(a.plays)} plays · +${(a.delta * 100).toFixed(1)} percentage points`)).join('') : '<p class="empty">More recent plays will reveal your rising artists.</p>'}</section>
      <section class="panel"><div class="panel__head"><h2>Moving out</h2><span class="label">Smaller share than before</span></div>${E.fading.length ? E.fading.map((x) => artistRow(x, (a) => `${num(a.before)} → ${num(a.plays)} plays · ${(a.delta * 100).toFixed(1)} percentage points`)).join('') : '<p class="empty">Your earlier rotation is still holding.</p>'}</section>
      <section class="panel"><div class="panel__head"><h2>New discoveries</h2><span class="label">First heard in the last ${windowDays} days</span></div>${E.discoveries.length ? E.discoveries.map((x) => artistRow(x, (a) => `${num(a.plays)} plays · first heard ${when(ctx.A.artists.find((y) => y.name === a.name)?.first)}`)).join('') : '<p class="empty">No newly discovered artists in this period yet.</p>'}</section>
      <section class="panel"><div class="panel__head"><h2>Old favorites to revisit</h2><span class="label">20+ lifetime plays · quiet for ${windowDays} days</span></div>${E.dormant.length ? E.dormant.map((x) => artistRow(x, (a) => `${num(a.n)} lifetime plays · last heard ${when(a.last)}`)).join('') : '<p class="empty">Your older favorites are still in rotation.</p>'}</section>
    </div>
    ${E.comebacks.length ? `<section class="panel ev-comebacks"><div class="panel__head"><h2>Back in rotation</h2><span class="label">Gone for months, then played again</span></div><div class="ev-comebacks__list">${E.comebacks.map((x) => artistRow(x, (a) => `${num(a.plays)} plays in the last ${windowDays} days`)).join('')}</div></section>` : ''}
    <section class="panel ev-next" id="ev-next"><div class="panel__head"><div><span class="label">FROM YOUR PREPARED SELECTION</span><h2>Where to go next</h2></div><a class="link" href="${hrefFor(ctx.pid,'discover')}">Open Discover ↗</a></div><div class="ev-next__out" aria-live="polite"><p class="muted">Reading your saved artist connections…</p></div></section>
    ${store.get('liner.ai') !== 'off' ? `<section class="panel ev-ai" id="ev-ai"><div class="panel__head"><div><span class="label">A closer read</span><h2>Explain this shift</h2></div></div><p class="muted">Sleeve connects these changes into a short, specific observation. Only the summary above is sent.</p><div class="ev-ai__out" aria-live="polite">${loadingLines}</div><button type="button" class="link link--quiet" data-ev-write hidden>Another take</button></section>` : ''}
    <p class="ev-method">Taste shift compares the proportion of plays for each artist across both periods. “New” means your first recorded play, so the result is only as complete as the history you've added. Mood, tempo and musical key require separate trustworthy audio metadata and are not inferred from scrobbles.</p>`;
  hydrate($('#tab'));
  $$('[data-ev-days]').forEach((button) => button.addEventListener('click', () => { windowDays = Number(button.dataset.evDays); rerender(); }));
  const nextOut = $('.ev-next__out');
  (async()=>{
    const taste=await getTaste(ctx.pid);
    const board=await savedRecommendations(ctx.pid,ctx.A,taste,Number(store.get(`liner.discover.edition:${ctx.pid}`)||0));
    if(!nextOut.isConnected)return;
    const picks=board?rankCandidates(board.pool,taste,'for-you',new Set(),board.curation).slice(0,4):[];
    nextOut.innerHTML=picks.length?`<div class="ev-next__grid">${picks.map(x=>`<a class="ev-artist" href="https://www.last.fm/music/${encodeURIComponent(x.name)}" target="_blank" rel="noopener">${sleeve(x.name,x.name,{size:42,round:true,kind:'artist'})}<span><b>${esc(x.name)}</b><small>${esc(x.editorial||`Connected to ${x.sources.slice(0,2).map(s=>s.name).join(' + ')}`)}</small></span></a>`).join('')}</div>`:'<p class="muted">Discover checks your artist connections and prepares a selection for this record. Saved picks will appear here too.</p>';
    hydrate(nextOut);
  })();
  const button = $('[data-ev-write]');
  if (!button) return;
  const out = $('.ev-ai__out');
  const ctrl = new AbortController();
  onLeave(() => ctrl.abort());
  const run = async (fresh = false) => {
    button.disabled = true;
    out.innerHTML = loadingLines;
    const list = (items) => items.slice(0, 5).map((x) => `${x.name}: ${x.before ?? 0} to ${x.plays} plays`).join('; ');
    const summary = `Latest ${windowDays} days: ${E.total} plays, ${E.activeArtists} artists. Previous ${windowDays} days: ${E.previous} plays, ${E.previousArtists} artists. Taste shift index: ${E.shift ?? 'insufficient data'}/100. ${E.overlap} of the latest top 20 artists were in the earlier top 20. Newly heard artists: ${E.newArtists}, accounting for ${E.newPlays} plays. Rising: ${list(E.rising)}. Fading: ${list(E.fading)}. Discoveries: ${E.discoveries.slice(0, 5).map((x) => `${x.name} ${x.plays} plays`).join('; ')}.`;
    try {
      const answer = ctx.source === 'demo'
        ? `Mira's rotation has shifted by ${E.shift ?? 'an unknown amount'} points. ${E.rising[0]?.name || 'A new favorite'} gained the most ground recently, while ${E.newArtists} artists are new to her record. The chart shows when those new names entered her listening.`
        : await write('ask', summary, { question: 'What is the most meaningful change in my listening across these two periods? Be specific and do not infer my mood or audio features.', fresh, signal: ctrl.signal });
      if (!out.isConnected) return;
      out.innerHTML = '<p class="ai__text"></p>';
      reveal($('.ai__text', out), answer);
      button.hidden = false;
    } catch (error) {
      if (error.name !== 'AbortError' && out.isConnected) {
        out.innerHTML = `<p class="ai__error">${esc(error.message)}</p>`;
        button.textContent = 'Try again'; button.hidden = false;
      }
    } finally { if (button.isConnected) button.disabled = false; }
  };
  button.addEventListener('click', () => run(true));
  const prepared = windowDays===90 && ctx.prepared?.dossier?.observations.shift;
  if(prepared){out.innerHTML=`<p class="ai__text">${esc(prepared)}</p>`;}else run();
}
