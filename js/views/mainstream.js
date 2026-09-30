// "How mainstream is your taste?" from Last.fm listener counts, plus play milestones.
import { $, esc, num, compact, fullDate, sleeve, trackSleeve } from '../ui.js';
import { onLeave } from '../core.js';
import { listeners, cachedListeners, hydrate } from '../meta.js';

// 0 = everyone listens to them (about 20M Last.fm listeners), 100 = almost nobody (under 3k).
const obscurity = (n) => Math.min(1, Math.max(0, (Math.log10(20e6) - Math.log10(Math.max(1, n))) / (Math.log10(20e6) - Math.log10(3000))));

export function obscuritySnapshot(artists, countFor) {
  const total = artists.reduce((sum, a) => sum + a.n, 0);
  const matched = artists.map((a) => ({ a, listeners: countFor(a.name) })).filter((x) => Number.isFinite(x.listeners) && x.listeners > 0);
  const covered = matched.reduce((sum, x) => sum + x.a.n, 0);
  const coverage = total ? Math.round(covered / total * 100) : 0;
  const enough = artists.length >= 5 && matched.length >= 5 && coverage >= 70;
  const score = enough ? Math.round(matched.reduce((sum, x) => sum + x.a.n * obscurity(x.listeners), 0) / covered * 100) : null;
  return { score, coverage, matched: matched.length, total: artists.length };
}

export function mainstreamPanel() {
  return `<section class="panel" id="mainstream" style="margin-top:16px">
    <div class="panel__head"><h2>How mainstream is your taste?</h2><span class="label" id="ms-status">Checking artist audiences…</span></div>
    <div class="ms-progress" role="progressbar" aria-label="Checking artist audiences" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
    <div id="ms-score" class="ms-reveal"><p class="muted">Checking your 30 most-played artists. The score appears when the full set is checked.</p></div>
    <div id="ms-deep" class="ms-reveal"><p class="faint">Then Sleeve will search deeper in your record for less-heard artists.</p></div>
  </section>`;
}

export function bindMainstream(A, L) {
  const scoreArtists = A.artists.slice(0, 30);
  const artists = A.artists.filter((a) => a.n >= 5).slice(0, 150);
  const remaining = artists.filter((a) => !scoreArtists.some((s) => s.name === a.name));
  const total = scoreArtists.length + remaining.length;
  let alive = true;
  onLeave(() => { alive = false; });
  const status = $('#ms-status'), progress = $('.ms-progress'), bar = $('.ms-progress i');
  const scoreEl = $('#ms-score'), deepEl = $('#ms-deep');
  if (!scoreArtists.length) {
    status.textContent = 'No artists to score yet';
    scoreEl.innerHTML = '<p class="muted">Add listening history to see how familiar your artists are to Last.fm listeners.</p>';
    deepEl.innerHTML = '';
    progress?.setAttribute('aria-valuenow', '100');
    return;
  }
  const update = (done, stage) => {
    if (!alive || !progress?.isConnected) return;
    status.textContent = `${stage} · ${done} of ${total} artists checked`;
    const pct = total ? Math.round(done / total * 100) : 100;
    progress.setAttribute('aria-valuenow', String(pct));
    bar.style.width = `${pct}%`;
  };
  const row = (x) => `<a class="ms-artist" href="${L.artist(x.a.name)}">${sleeve(x.a.name, x.a.name, { size: 36, round: true, kind: 'artist' })}<span><b>${esc(x.a.name)}</b><span>${num(x.a.n)} plays here · ${compact(x.n)} Last.fm listeners</span></span></a>`;
  const paintScore = () => {
    if (!alive || !scoreEl?.isConnected) return;
    const { score, coverage, matched, total: checked } = obscuritySnapshot(scoreArtists, cachedListeners);
    if (score == null) {
      scoreEl.innerHTML = `<p class="muted">${matched} of ${checked} leading artists matched Last.fm audience counts, covering ${coverage}% of their plays. Sleeve needs five matched artists and 70% coverage before showing a score.</p>`;
      return;
    }
    const label = score >= 70 ? 'Deep cuts' : score >= 50 ? 'Off the beaten path' : score >= 30 ? 'A healthy mix' : score >= 15 ? 'Mostly mainstream' : 'Chart regular';
    scoreEl.innerHTML = `
      <div class="ms">
        <div class="ms__score"><b>${score}</b><span>out of 100 obscurity</span><p>${label}</p></div>
        <div class="ms__meter"><div class="ms__track"><i style="left:${score}%"></i></div><div class="ms__ends"><span>Everyone knows them</span><span>Almost nobody does</span></div></div>
      </div>
      <p class="faint" style="font-size:13px;margin:2px 0 16px">Based on your top ${scoreArtists.length} artists, weighted by plays. ${matched} matched listener counts cover ${coverage}% of those plays. This score stays fixed while Sleeve checks deeper artists. Listener totals are global, not monthly.</p>`;
    scoreEl.classList.add('is-ready');
  };
  const paintDeep = () => {
    if (!alive || !deepEl?.isConnected) return;
    const known = artists.map((a) => ({ a, n: cachedListeners(a.name) })).filter((x) => x.n);
    const sorted = [...known].sort((x, y) => x.n - y.n);
    deepEl.innerHTML = `<p class="faint" style="font-size:13px;margin:2px 0 16px">Deep cuts searched ${artists.length} artists with at least five plays; ${known.length} had a matched listener count.</p>
      <div class="grid" style="margin-top:8px"><div class="c-6"><span class="label">Your deeper cuts</span>${sorted.slice(0, 5).map(row).join('') || '<p class="empty">No counts available.</p>'}</div>
      <div class="c-6"><span class="label">Your most mainstream</span>${sorted.slice(-3).reverse().map(row).join('') || '<p class="empty">No counts available.</p>'}</div></div>`;
    deepEl.classList.add('is-ready');
    hydrate(deepEl);
  };
  update(0, 'Building your score');
  (async () => {
    let done = 0;
    const checkGroup = async (group, workers, stage) => {
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(workers, group.length) }, async () => {
        while (alive && next < group.length) {
          const a = group[next++];
          if (cachedListeners(a.name) === undefined) await listeners(a.name);
          update(++done, stage);
        }
      }));
    };
    await checkGroup(scoreArtists, 4, 'Checking leading artists');
    if (!alive) return;
    paintScore();
    await checkGroup(remaining, 4, 'Finding deeper cuts');
    if (!alive) return;
    paintDeep();
    if (alive && status?.isConnected) status.textContent = `${total} artists checked`;
  })();
}

export function milestonesPanel(A, L) {
  if (!A.milestones?.length) return '';
  const nth = (n) => (n === 1 ? 'First play' : `${num(n)}th play`);
  return `<section class="panel" style="margin-top:16px">
    <div class="panel__head"><h2>Milestones</h2><span class="label">The song that hit each number</span></div>
    <div class="miles">${A.milestones.map(({ n, row }) => `<a class="mile" href="${L.song(row.track, row.artist)}">
      <span class="mile__n">${nth(n)}</span>
      ${trackSleeve({ name: row.track, artist: row.artist, album: row.album }, { size: 56 })}
      <b>${esc(row.track)}</b><span>${esc(row.artist)}</span><span class="faint">${fullDate(row.t)}</span>
    </a>`).join('')}</div>
  </section>`;
}
