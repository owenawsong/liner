// Compare two listeners' taste. Works for any two public Last.fm or ListenBrainz users.
import { $, $$, esc, sleeve, trackSleeve, num, icon, avatar, plural } from '../ui.js';
import { SOURCES, view, onLeave, go, hrefFor, pidFor } from '../core.js';
import { rankList } from '../components.js';

const PERIOD = { lastfm: 'overall', listenbrainz: 'all_time' };

export function renderCompare(source = 'lastfm', a = '', b = '') {
  if (!SOURCES[source] || source === 'spotify') source = 'lastfm';
  const ready = a && b;
  view().innerHTML = `
    <div class="wrap">
      <header class="cmp-head">
        <span class="label">Compare</span>
        <h1>How close is your taste?</h1>
        <p class="flow__lede">Put in two usernames. Sleeve compares your all-time top artists and songs, then shows what you share and what you'd each get from the other.</p>
        <form class="cmp-form" id="cmp-form" novalidate>
          <div class="seg" role="radiogroup" aria-label="Source">
            <button type="button" role="radio" data-src="lastfm" aria-checked="${source === 'lastfm'}">Last.fm</button>
            <button type="button" role="radio" data-src="listenbrainz" aria-checked="${source === 'listenbrainz'}">ListenBrainz</button>
          </div>
          <div class="cmp-inputs">
            <label class="sr" for="cmp-a">First username</label>
            <input class="input" id="cmp-a" placeholder="Your username" value="${esc(a)}" autocomplete="off" spellcheck="false">
            <span class="cmp-vs">and</span>
            <label class="sr" for="cmp-b">Second username</label>
            <input class="input" id="cmp-b" placeholder="A friend's username" value="${esc(b)}" autocomplete="off" spellcheck="false">
            <button class="btn btn--ink" type="submit">Compare ${icon.arrow}</button>
          </div>
        </form>
      </header>
      <div id="cmp-out">${ready ? loading() : ''}</div>
    </div>`;
  let src = source;
  $$('[data-src]').forEach((btn) => btn.addEventListener('click', () => {
    src = btn.dataset.src;
    $$('[data-src]').forEach((x) => x.setAttribute('aria-checked', String(x === btn)));
  }));
  $('#cmp-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const x = $('#cmp-a').value.trim(), y = $('#cmp-b').value.trim();
    if (!x || !y) { (x ? $('#cmp-b') : $('#cmp-a')).focus(); return; }
    go(`#/compare/${src}/${encodeURIComponent(x)}/${encodeURIComponent(y)}`);
  });
  if (!a) $('#cmp-a').focus(); else if (!b) $('#cmp-b').focus();
  if (ready) run(source, a, b);
}

const loading = () => '<div class="panel" style="margin-top:24px"><div class="ai__loading"><i></i><i></i><i></i><span>Reading both profiles…</span></div></div>';

async function run(source, a, b) {
  const src = SOURCES[source];
  const ctrl = new AbortController();
  onLeave(() => ctrl.abort());
  let data;
  try {
    const get = (u, kind) => src.top(u, PERIOD[source], kind, ctrl.signal, 150);
    const [aa, ba, at, bt, ai, bi] = await Promise.all([get(a, 'artists'), get(b, 'artists'), get(a, 'tracks'), get(b, 'tracks'), src.lookup(a, ctrl.signal), src.lookup(b, ctrl.signal)]);
    data = { aa: aa || [], ba: ba || [], at: at || [], bt: bt || [], ai, bi };
  } catch (e) {
    if (e.name === 'AbortError') return;
    $('#cmp-out').innerHTML = `<div class="panel" style="margin-top:24px"><p class="ai__error">${e.code === 'notfound' ? `One of those usernames doesn't exist on ${src.label}. Check the spelling.` : esc(e.message)}</p></div>`;
    return;
  }
  if (!data.aa.length || !data.ba.length) {
    $('#cmp-out').innerHTML = `<div class="panel" style="margin-top:24px"><p class="ai__error">${source === 'listenbrainz' ? "ListenBrainz hasn't calculated top lists for one of these users yet. Try again tomorrow, or use Last.fm." : 'One of these profiles has no listening yet.'}</p></div>`;
    return;
  }
  $('#cmp-out').innerHTML = results(source, a, b, data);
}

// Cosine similarity on log-scaled play counts, so one huge artist doesn't dominate.
function similarity(x, y) {
  const vx = new Map(x.map((i) => [i.name.toLowerCase(), Math.log1p(i.plays)]));
  const vy = new Map(y.map((i) => [i.name.toLowerCase(), Math.log1p(i.plays)]));
  let dot = 0, nx = 0, ny = 0;
  vx.forEach((v, k) => { nx += v * v; if (vy.has(k)) dot += v * vy.get(k); });
  vy.forEach((v) => { ny += v * v; });
  return nx && ny ? dot / Math.sqrt(nx * ny) : 0;
}

function verdict(score) {
  if (score >= 80) return ['Musical twins', 'You could swap phones and barely notice.'];
  if (score >= 60) return ['Very close', 'Put either of you on aux and the other would be happy.'];
  if (score >= 40) return ['Real common ground', 'Plenty to share, and plenty to show each other.'];
  if (score >= 20) return ['A few crossovers', 'Different lanes, with some favourites in common.'];
  return ['Different worlds', "You'd be great at introducing each other to new music."];
}

function results(source, a, b, d) {
  const score = Math.round(Math.sqrt(similarity(d.aa, d.ba)) * 100);
  const [title, line] = verdict(score);
  const bMap = new Map(d.ba.map((x) => [x.name.toLowerCase(), x]));
  const aMap = new Map(d.aa.map((x) => [x.name.toLowerCase(), x]));
  const shared = d.aa.filter((x) => bMap.has(x.name.toLowerCase()))
    .map((x) => ({ name: x.name, a: x.plays, b: bMap.get(x.name.toLowerCase()).plays }))
    .sort((x, y) => Math.min(y.a, y.b) - Math.min(x.a, x.b));
  const forA = d.ba.filter((x) => !aMap.has(x.name.toLowerCase())).slice(0, 8);
  const forB = d.aa.filter((x) => !bMap.has(x.name.toLowerCase())).slice(0, 8);
  const bSongs = new Set(d.bt.map((t) => `${t.name}|${t.artist}`.toLowerCase()));
  const songs = d.at.filter((t) => bSongs.has(`${t.name}|${t.artist}`.toLowerCase())).slice(0, 10);
  const max = Math.max(1, ...shared.slice(0, 12).flatMap((s) => [s.a, s.b]));
  const who = (info, u) => `<a class="cmp-who" href="${hrefFor(pidFor(source, u))}">${avatar(info.user.name, info.user.image, 44)}<span><b>${esc(info.user.name)}</b><span>${num(info.user.playcount)} plays</span></span></a>`;
  return `
    <section class="cmp-score panel">
      ${who(d.ai, a)}
      <div class="cmp-ring" style="--p:${score}"><div><b>${score}</b><span>% match</span></div></div>
      ${who(d.bi, b)}
      <div class="cmp-verdict"><h2>${title}</h2><p>${line} You share ${plural(shared.length, 'artist')} in your top ${Math.min(d.aa.length, d.ba.length)}.</p></div>
    </section>
    ${shared.length ? `<section class="panel" style="margin-top:16px">
      <div class="panel__head"><h2>What you share</h2><span class="label">${esc(a)} · ${esc(b)}</span></div>
      <ol class="cmp-shared">${shared.slice(0, 12).map((s) => `<li>
        <span class="cmp-bar cmp-bar--a"><i style="width:${(s.a / max) * 100}%"></i><em>${num(s.a)}</em></span>
        <span class="cmp-name">${sleeve(s.name, s.name, { size: 32, round: true, kind: 'artist' })}<b>${esc(s.name)}</b></span>
        <span class="cmp-bar"><i style="width:${(s.b / max) * 100}%"></i><em>${num(s.b)}</em></span>
      </li>`).join('')}</ol>
    </section>` : ''}
    <div class="grid" style="margin-top:16px">
      <section class="panel c-6"><div class="panel__head"><h2>For ${esc(a)}, from ${esc(b)}</h2><span class="label">Their favourites you don't play</span></div>${rankList(forA)}</section>
      <section class="panel c-6"><div class="panel__head"><h2>For ${esc(b)}, from ${esc(a)}</h2><span class="label">Your favourites they don't play</span></div>${rankList(forB)}</section>
      ${songs.length ? `<section class="panel c-12"><div class="panel__head"><h2>Songs you both love</h2></div><div class="otd">${songs.map((t) => `<div class="otd__item">${trackSleeve(t, { size: 48, img: t.image })}<span><b>${esc(t.name)}</b><span class="faint">${esc(t.artist)}</span></span></div>`).join('')}</div></section>` : ''}
    </div>`;
}
