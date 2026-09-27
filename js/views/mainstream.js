// "How mainstream is your taste?" from Last.fm listener counts, plus play milestones.
import { $, esc, num, compact, fullDate, sleeve, trackSleeve } from '../ui.js';
import { onLeave } from '../core.js';
import { listeners, cachedListeners } from '../meta.js';

// 0 = everyone listens to them (about 20M Last.fm listeners), 100 = almost nobody (under 3k).
const obscurity = (n) => Math.min(1, Math.max(0, (Math.log10(20e6) - Math.log10(Math.max(1, n))) / (Math.log10(20e6) - Math.log10(3000))));

export function mainstreamPanel() {
  return `<section class="panel" id="mainstream" style="margin-top:16px">
    <div class="panel__head"><h2>How mainstream is your taste?</h2><span class="label" id="ms-status">Checking your top artists…</span></div>
    <div id="ms-body"><div class="ai__loading"><i></i><i></i></div></div>
  </section>`;
}

export function bindMainstream(A, L) {
  const artists = A.artists.slice(0, 40);
  let alive = true;
  onLeave(() => { alive = false; });
  const paint = () => {
    const known = artists.map((a) => ({ a, n: cachedListeners(a.name) })).filter((x) => x.n);
    const el = $('#ms-body');
    if (!el || !alive) return;
    $('#ms-status').textContent = known.length < artists.length ? `Checked ${known.length} of ${artists.length} artists` : `Based on your top ${artists.length} artists`;
    if (known.length < 5) return;
    const w = known.reduce((s, x) => s + x.a.n, 0);
    const score = Math.round((known.reduce((s, x) => s + x.a.n * obscurity(x.n), 0) / w) * 100);
    const sorted = [...known].sort((x, y) => x.n - y.n);
    const label = score >= 70 ? 'Deep cuts' : score >= 50 ? 'Off the beaten path' : score >= 30 ? 'A healthy mix' : score >= 15 ? 'Mostly mainstream' : 'Chart regular';
    const row = (x) => `<a class="ms-artist" href="${L.artist(x.a.name)}">${sleeve(x.a.name, x.a.name, { size: 36, round: true, kind: 'artist' })}<span><b>${esc(x.a.name)}</b><span>${compact(x.n)} listeners on Last.fm</span></span></a>`;
    el.innerHTML = `
      <div class="ms">
        <div class="ms__score"><b>${score}</b><span>out of 100 obscurity</span><p>${label}</p></div>
        <div class="ms__meter"><div class="ms__track"><i style="left:${score}%"></i></div><div class="ms__ends"><span>Everyone knows them</span><span>Almost nobody does</span></div></div>
      </div>
      <div class="grid" style="margin-top:8px">
        <div class="c-6"><span class="label">Your most obscure</span>${sorted.slice(0, 3).map(row).join('')}</div>
        <div class="c-6"><span class="label">Your most mainstream</span>${sorted.slice(-3).reverse().map(row).join('')}</div>
      </div>`;
  };
  paint();
  (async () => {
    for (const a of artists) {
      if (!alive) return;
      if (cachedListeners(a.name) === undefined) { await listeners(a.name); paint(); }
    }
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
