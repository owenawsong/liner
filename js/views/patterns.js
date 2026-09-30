import { $, $$, esc, num, monthYear, pct } from '../ui.js';
import { onLeave } from '../core.js';
import { topIn } from '../analysis.js';
import { patterns, genreEvolution } from '../patterns.js';
import { cachedArtist, artistInfo } from '../meta.js';

const METRICS = {
  plays: { label: 'Plays', unit: 'plays', explain: 'How much you listened each month.' },
  breadth: { label: 'Artists', unit: 'artists', explain: 'Distinct artists you played each month.' },
  novelty: { label: 'Discovery', unit: '%', explain: 'Share of plays from artists you first heard that month.' },
  dominance: { label: 'Top artist share', unit: '%', explain: 'Share of the month claimed by its most-played artist.' },
};
let selectedMetric = 'plays';

export function patternsView(ctx, banner) {
  const data = patterns(ctx.A);
  const topArtists = topIn(ctx.A, 'artists', -Infinity, Infinity, 24);
  const topPlays = topArtists.reduce((sum, a) => sum + a.plays, 0);
  let selected = data.months.length - 1;
  $('#tab').innerHTML = `${banner}
    <div class="subhead" style="margin-top:0"><div><span class="label">Your record, closer up</span><h2>The shape of your listening</h2><p class="muted">Track your activity, breadth, discovery and concentration month by month. Every bar comes from a recorded play.</p></div></div>
    <div class="pat-stats">
      <div class="panel"><span class="label">Last 90 days</span><b>${num(data.recentPlays)}</b><small>recorded plays</small></div>
      <div class="panel"><span class="label">Your rotation</span><b>${num(data.recentArtists)}</b><small>artists in 90 days</small></div>
      <div class="panel"><span class="label">Discovery</span><b>${data.recentNewShare}%</b><small>recent plays from newly heard artists</small></div>
      <div class="panel"><span class="label">On days you listened</span><b>${data.playsPerActiveDay.toFixed(1)}</b><small>plays per active day, last 90 days</small></div>
    </div>
    <section class="panel pat-panel"><div class="panel__head"><div><h2>24 months, four ways</h2><p class="muted" id="pat-explain"></p></div><span class="label">Tap a month</span></div>
      <div class="seg pat-switch" role="group" aria-label="Chart measure">${Object.entries(METRICS).map(([key, m]) => `<button type="button" data-pat-metric="${key}" aria-pressed="${selectedMetric === key}">${m.label}</button>`).join('')}</div>
      <div class="pat-chart-wrap"><div class="pat-chart" id="pat-chart"></div></div>
      <div class="pat-detail" id="pat-detail" aria-live="polite"></div>
    </section>
    <div class="pat-bottom">
      <section class="panel"><div class="panel__head"><div><h2>Top genres & styles</h2><p class="muted">Artist-level tags from MusicBrainz, weighted by your plays. One artist can span more than one style; Sleeve uses its leading tag here.</p></div></div>
        <div id="pat-genre"><p class="faint">Checking tags for your most-played artists…</p><div class="ms-progress" role="progressbar" aria-label="Checking artist genres" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div></div>
      </section>
      <section class="panel pat-method"><div class="panel__head"><h2>Read the chart honestly</h2></div>
        <p>A change in plays can reflect how often you used a service, not just a change in taste. Discovery means the first play <em>in this record</em>. Missing early history makes it look higher.</p>
        <p>Genres are based on artist tags, with coverage shown alongside the list. Happiness, energy, danceability, acousticness and key need track-level audio analysis; this listening log does not contain those measures.</p>
        <a class="link" href="${ctx.L.year(data.peak?.start ? new Date(data.peak.start).getFullYear() : new Date().getFullYear())}">Explore your biggest year →</a>
      </section>
    </div>`;

  const paint = () => {
    const metric = METRICS[selectedMetric];
    const max = Math.max(1, ...data.months.map((m) => m[selectedMetric]));
    $('#pat-explain').textContent = metric.explain;
    $('#pat-chart').innerHTML = data.months.map((m, i) => `<button type="button" class="pat-col${i === selected ? ' is-selected' : ''}" data-pat-month="${i}" aria-label="${monthYear(m.start)}: ${m[selectedMetric]}${metric.unit === '%' ? '%' : ` ${metric.unit}`}" aria-pressed="${i === selected}" title="${monthYear(m.start)}: ${m[selectedMetric]}${metric.unit === '%' ? '%' : ` ${metric.unit}`}"><span class="pat-col__v">${m[selectedMetric]}${metric.unit === '%' ? '%' : ''}</span><span class="pat-col__bar" style="--h:${m[selectedMetric] ? Math.max(3, m[selectedMetric] / max * 100) : 0}%"></span><span class="pat-col__date">${new Date(m.start).toLocaleDateString('en', { month: 'short' })}${new Date(m.start).getMonth() === 0 ? `<small>${new Date(m.start).getFullYear()}</small>` : ''}</span></button>`).join('');
    const m = data.months[selected];
    $('#pat-detail').innerHTML = `<div><span class="label">${monthYear(m.start)}</span><b>${num(m.plays)} plays</b></div><div><span class="label">Artists</span><b>${num(m.breadth)}</b></div><div><span class="label">First heard</span><b>${num(m.newArtists)} artists</b></div><div><span class="label">Led by</span><b>${m.topArtist ? `<a href="${ctx.L.artist(m.topArtist)}">${esc(m.topArtist)}</a>` : 'No plays'}</b><small>${m.topArtist ? `${pct(m.topPlays / m.plays)} of plays` : ''}</small></div>`;
    $$('[data-pat-month]', $('#pat-chart')).forEach((button) => button.addEventListener('click', () => { selected = Number(button.dataset.patMonth); paint(); }));
  };
  $$('[data-pat-metric]').forEach((button) => button.addEventListener('click', () => {
    selectedMetric = button.dataset.patMetric;
    $$('[data-pat-metric]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    paint();
  }));
  paint();
  const chartWrap = $('.pat-chart-wrap');
  requestAnimationFrame(() => { if (chartWrap?.isConnected) chartWrap.scrollLeft = chartWrap.scrollWidth; });

  let alive = true;
  onLeave(() => { alive = false; });
  (async () => {
    const root = $('#pat-genre');
    const pending = topArtists.filter((a) => !cachedArtist(a.name));
    let done = topArtists.length - pending.length;
    const update = () => {
      if (!alive || !root?.isConnected) return;
      const p = root.querySelector('.ms-progress');
      if (p) { const v = topArtists.length ? Math.round(done / topArtists.length * 100) : 100; p.setAttribute('aria-valuenow', String(v)); p.querySelector('i').style.width = `${v}%`; }
      root.querySelector('p').textContent = `Checking artist tags · ${done} of ${topArtists.length}`;
    };
    update();
    for (const artist of pending) {
      if (!alive) return;
      await artistInfo(artist.name);
      done++; update();
    }
    if (!alive || !root?.isConnected) return;
    const tags = new Map(); let covered = 0;
    for (const artist of topArtists) {
      const tag = cachedArtist(artist.name)?.tags?.[0];
      if (!tag) continue;
      covered += artist.plays;
      tags.set(tag, (tags.get(tag) || 0) + artist.plays);
    }
    const genres = [...tags].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const tagByArtist = new Map(topArtists.map((artist) => [artist.name, cachedArtist(artist.name)?.tags?.[0]]).filter(([, tag]) => tag));
    const trend = genreEvolution(ctx.A, tagByArtist);
    const trendHTML = trend.genres.length && trend.years.length > 1 ? `<div class="genre-history"><div class="genre-history__head"><span class="label">HOW THOSE STYLES MOVED</span><p>Each row is one year. Pale space includes untagged artists and styles outside these four.</p></div><div class="genre-history__legend">${trend.genres.map((genre, i) => `<span><i style="background:var(--c${i})"></i>${esc(genre.name)}</span>`).join('')}</div><div class="genre-history__rows">${trend.years.map((year) => `<div class="genre-history__row"><b>${year.year}</b><div role="img" aria-label="${esc(`${year.year}: ${year.segments.map((part) => `${num(part.plays)} plays tagged ${part.name}`).join(', ')}; ${num(year.matched)} of ${num(year.plays)} plays matched artist tags`)}">${year.segments.map((part, i) => `<i style="width:${year.plays ? part.plays / year.plays * 100 : 0}%;background:var(--c${i})"></i>`).join('')}</div><small>${year.plays ? Math.round(year.matched / year.plays * 100) : 0}% tagged</small></div>`).join('')}</div></div>` : '';
    root.innerHTML = `<p class="faint">Tagged artists account for ${ctx.A.plays ? (covered / ctx.A.plays * 100).toFixed(1) : '0.0'}% of your recorded plays. Checked ${topArtists.length} leading artists (${num(topPlays)} plays).</p>
      ${genres.length ? `<ol class="pat-genres">${genres.map(([name, plays]) => `<li><span><b>${esc(name)}</b><small>${num(plays)} plays</small></span><i style="width:${Math.round(plays / genres[0][1] * 100)}%"></i></li>`).join('')}</ol>${trendHTML}` : '<p class="empty">No genre tags were available for these artists.</p>'}`;
  })();
}
