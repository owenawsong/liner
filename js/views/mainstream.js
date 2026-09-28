// "How mainstream is your taste?" from Last.fm listener counts, plus play milestones.
import { $, esc, num, compact, fullDate, sleeve, trackSleeve } from '../ui.js';
import { onLeave } from '../core.js';
import { listeners, cachedListeners, hydrate } from '../meta.js';

// 0 = everyone listens to them (about 20M Last.fm listeners), 100 = almost nobody (under 3k).
const obscurity = (n) => Math.min(1, Math.max(0, (Math.log10(20e6) - Math.log10(Math.max(1, n))) / (Math.log10(20e6) - Math.log10(3000))));

export function mainstreamPanel() {
  return `<section class="panel" id="mainstream" style="margin-top:16px">
    <div class="panel__head"><h2>How mainstream is your taste?</h2><span class="label" id="ms-status">Checking artist audiences…</span></div>
    <div id="ms-body"><div class="ai__loading"><i></i><i></i></div></div>
  </section>`;
}

export function bindMainstream(A, L) {
  const scoreArtists = A.artists.slice(0, 40);
  const artists = A.artists.filter((a) => a.n >= 5).slice(0, 150);
  let alive = true, finished = false;
  onLeave(() => { alive = false; });
  const paint = () => {
    const known = artists.map((a) => ({ a, n: cachedListeners(a.name) })).filter((x) => x.n);
    const scored = scoreArtists.map((a) => ({ a, n: cachedListeners(a.name) })).filter((x) => x.n);
    const checked = artists.filter((a) => cachedListeners(a.name) !== undefined).length;
    const el = $('#ms-body');
    if (!el || !alive) return;
    $('#ms-status').textContent = finished ? `${known.length} of ${artists.length} listener counts available` : `Checked ${checked} of ${artists.length} artists`;
    if (scored.length < Math.min(5, scoreArtists.length)) {
      el.innerHTML = `<p class="muted">${finished ? 'Last.fm did not return enough exact artist counts to score this record right now.' : 'Checking exact artist names on Last.fm. Your score and deeper cuts will appear here.'}</p>`;
      return;
    }
    const w = scored.reduce((s, x) => s + x.a.n, 0);
    const score = Math.round((scored.reduce((s, x) => s + x.a.n * obscurity(x.n), 0) / w) * 100);
    const sorted = [...known].sort((x, y) => x.n - y.n);
    const label = score >= 70 ? 'Deep cuts' : score >= 50 ? 'Off the beaten path' : score >= 30 ? 'A healthy mix' : score >= 15 ? 'Mostly mainstream' : 'Chart regular';
    const row = (x) => `<a class="ms-artist" href="${L.artist(x.a.name)}">${sleeve(x.a.name, x.a.name, { size: 36, round: true, kind: 'artist' })}<span><b>${esc(x.a.name)}</b><span>${num(x.a.n)} plays here · ${compact(x.n)} Last.fm listeners</span></span></a>`;
    el.innerHTML = `
      <div class="ms">
        <div class="ms__score"><b>${score}</b><span>out of 100 obscurity</span><p>${label}</p></div>
        <div class="ms__meter"><div class="ms__track"><i style="left:${score}%"></i></div><div class="ms__ends"><span>Everyone knows them</span><span>Almost nobody does</span></div></div>
      </div>
      <p class="faint" style="font-size:13px;margin:2px 0 16px">Score weights your top 40 artists by plays. Deep cuts search up to 150 artists you played at least five times. Exact Last.fm artist names; listener totals are global, not monthly.</p>
      <div class="grid" style="margin-top:8px">
        <div class="c-6"><span class="label">Your deeper cuts${!finished && checked < artists.length ? ' · still checking' : ''}</span>${sorted.slice(0, 5).map(row).join('')}</div>
        <div class="c-6"><span class="label">Your most mainstream</span>${sorted.slice(-3).reverse().map(row).join('')}</div>
      </div>`;
    hydrate(el);
  };
  paint();
  (async () => {
    for (let i = 0; i < artists.length; i++) {
      if (!alive) return;
      const a = artists[i];
      if (cachedListeners(a.name) === undefined) await listeners(a.name);
      if (i < 8 || i % 10 === 9) paint();
    }
    finished = true;
    paint();
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
