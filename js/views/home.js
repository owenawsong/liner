import { $, $$, esc, avatar, num, icon, sleeve } from '../ui.js';
import { view, hrefFor, profiles, getArchive, analysisFor } from '../core.js';
import { timeline, bindTimeline, heatmap, heatLegend, insightCard, dropzone, bindDrops } from '../components.js';
import { topIn, lowerBound } from '../analysis.js';
import { handleFiles } from '../actions.js';
import { mountLookup } from './connect.js';
import { overviewHTML } from './profile.js';
import { demoRecent, DEMO_USER } from '../sources/demo.js';
import { go, pidFor } from '../core.js';

let homeSource = 'lastfm';
const yes = (t) => `<span class="yes">${icon.check}${t}</span>`;
const no = (t) => `<span class="no">${t}</span>`;

export async function renderHome() {
  const archive = await getArchive('demo');
  const A = analysisFor('demo', archive);
  const returning = profiles.list();
  const week = A.rows.length - lowerBound(A.rows, Date.now() - 7 * 864e5);
  const today = A.rows.length - lowerBound(A.rows, new Date().setHours(0, 0, 0, 0));
  const demoP = { source: 'demo', user: { ...DEMO_USER, playcount: A.plays }, recent: demoRecent(12), today, week };
  const pick = ['obsession', 'comeback', 'loop', 'night', 'skips'];
  const showcase = pick.map((id) => A.insights.find((x) => x.id === id)).filter(Boolean);

  view().innerHTML = `
  <section class="wrap hero"><div class="hero__grid"><div>
    <h1 class="hero__title">The complete record of your listening.</h1>
    <p class="hero__lede">Liner turns your Spotify history into a timeline, your eras, and the small things you never noticed about how you listen. Every feature is free.</p>
    <div class="hero__connect">
      ${returning.length ? `<div class="returning"><span>Welcome back</span>${returning.map((r) => `<a href="${hrefFor(r.pid)}">${avatar(r.display, r.image, 26)}${esc(r.display)}</a>`).join('')}</div>` : ''}
      <div class="srctabs" role="tablist" aria-label="How to connect">
        <button type="button" role="tab" data-src="lastfm" aria-selected="${homeSource === 'lastfm'}">Last.fm</button>
        <button type="button" role="tab" data-src="listenbrainz" aria-selected="${homeSource === 'listenbrainz'}">ListenBrainz</button>
        <button type="button" role="tab" data-src="file" aria-selected="${homeSource === 'file'}">Spotify export</button>
      </div>
      <div id="hero-src" role="tabpanel"></div>
      <div class="hero__alts">
        <a href="#/connect/lastfm">New to all this? Set up in a minute ${icon.arrow}</a>
        <a href="#/demo">Explore a demo profile ${icon.arrow}</a>
        <a href="#/connect/spotify">Connect Spotify directly</a>
      </div>
    </div>
  </div>${notesCard(A)}</div></section>

  <section class="wrap preview" aria-label="What a Liner profile looks like">
    <div class="preview__frame">
      <div class="preview__bar">${avatar('Mira', '', 22)}<b>Mira</b><span>·</span><span>Overview</span><span style="margin-left:auto" class="mono">demo</span></div>
      <div class="preview__body">${overviewHTML({ pid: 'demo', source: 'demo', p: demoP, A, preview: true, topArtists: topIn(A, 'artists', Date.now() - 7 * 864e5) })}</div>
    </div>
    <a class="btn btn--ink btn--lg preview__cta" href="#/demo">Open the demo profile ${icon.arrow}</a>
  </section>

  <section class="wrap section" id="features">
    <div class="section__head">
      <span class="label">What you get</span>
      <h2>More than a top five.</h2>
      <p>Every stats site can count your plays. Liner is built around time: when you found things, how your taste moved, and what you came back to.</p>
    </div>

    <div class="feature">
      <div class="feature__text">
        <span class="label">Timeline</span>
        <h3>Every month you've listened, on one line</h3>
        <p>See the whole shape of your listening at once. Liner finds your eras automatically: the stretches when one artist ran the show. Pick any month to see what was on.</p>
      </div>
      <div class="feature__vis panel" id="f-timeline">${timeline(A, { height: 190, fit: true })}</div>
    </div>

    <div class="feature">
      <div class="feature__text">
        <span class="label">Insights</span>
        <h3>The things you'd never think to look up</h3>
        <p>The song you played 40 times in one month and then dropped. The artist you came back to after two years. Your longest streak. Liner checks for these and shows you what it finds.</p>
      </div>
      <div class="feature__vis" style="display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">${showcase.slice(0, 2).map((x, i) => insightCard(x, i === 0)).join('')}</div>
    </div>

    <div class="feature">
      <div class="feature__text">
        <span class="label">Listening clock</span>
        <h3>When the music actually happens</h3>
        <p>Every play placed on your week, hour by hour. Commutes, late nights and lazy Sundays all show up.</p>
      </div>
      <div class="feature__vis panel"><div class="panel__head"><span class="label">Plays by hour and day</span>${heatLegend()}</div>${heatmap(A)}</div>
    </div>

    <div class="feature">
      <div class="feature__text">
        <span class="label">Honest numbers</span>
        <h3>You decide what counts as a play</h3>
        <p>Spotify counts a stream after 30 seconds. Some sites count every skip, some don't say. Liner shows its rule and lets you change it, so your numbers always mean something.</p>
      </div>
      <div class="feature__vis panel honest" id="honest"></div>
    </div>
  </section>

  <section class="wrap section" id="sources">
    <div class="section__head">
      <span class="label">Connecting</span>
      <h2>Four ways in. Use one, or all of them.</h2>
      <p>Spotify only lets very large apps use "Log in with Spotify", so Liner reads from sources you control. Here is exactly what each one gives you.</p>
    </div>
    <div class="compare-wrap">
      <table class="compare">
        <thead><tr><th></th>
          <th>Last.fm<small>Most popular</small></th>
          <th>ListenBrainz<small>Open source</small></th>
          <th>Spotify export<small>Most complete</small></th>
          <th>Spotify direct<small>For enthusiasts</small></th>
        </tr></thead>
        <tbody>
          <tr><th>Setup</th><td>About a minute</td><td>About a minute</td><td>Request once, arrives in days</td><td>About five minutes</td></tr>
          <tr><th>What's playing now</th><td>${yes('Within seconds')}</td><td>${yes('Within minutes')}</td><td>${no('No')}</td><td>${yes('With progress')}</td></tr>
          <tr><th>Full history</th><td>${yes('Import in one click')}</td><td>${yes('Import in one click')}</td><td>${yes('Every play since day one')}</td><td>${no('Last 50, growing each visit')}</td></tr>
          <tr><th>Skips and listening time</th><td>${no('Only finished songs')}</td><td>${no('Only finished songs')}</td><td>${yes('Exact, every play')}</td><td>${yes('While Liner is open')}</td></tr>
          <tr><th>You'll need</th><td>A free Last.fm account</td><td>A free MetaBrainz account</td><td>Your Spotify login</td><td>Spotify Premium and a free developer app</td></tr>
          <tr><th></th><td><a class="link" href="#/connect/lastfm">Set up</a></td><td><a class="link" href="#/connect/listenbrainz">Set up</a></td><td><a class="link" href="#/connect/file">Get it</a></td><td><a class="link" href="#/connect/spotify">Set up</a></td></tr>
        </tbody>
      </table>
    </div>
    <p class="faint" style="font-size:14px;margin-top:14px">Best of both: connect Last.fm or ListenBrainz today, then add your export when it arrives. Liner uses the export up to its last day and live data after that.</p>
  </section>

  <section class="wrap section">
    <div class="privacy">
      <div style="display:grid;gap:18px;align-content:start">
        <span class="label" style="color:color-mix(in srgb, var(--bg) 55%, var(--ink))">Privacy</span>
        <h2>Your listening history is personal. It stays with you.</h2>
      </div>
      <ul>
        <li><b>Read on your device</b><span>Your Spotify ZIP is opened in your browser. It's never uploaded, because Liner has nowhere to upload it to.</span></li>
        <li><b>No sign-up, no tracking</b><span>There are no Liner accounts and no analytics. What you connect is saved in this browser only.</span></li>
        <li><b>Only your username</b><span>Live data comes from Last.fm and ListenBrainz's public APIs. Liner never asks for a password.</span></li>
        <li><b>Gone in one tap</b><span>Clear everything Liner has stored from the Data tab, any time.</span></li>
      </ul>
    </div>
  </section>

  <section class="wrap section" id="faq">
    <div class="section__head"><span class="label">Questions</span><h2>Good questions.</h2></div>
    <div class="faq">
      <details><summary>Why isn't there a "Log in with Spotify" button?</summary><p>Since 2025, Spotify only gives that to apps with at least 250,000 monthly users. New projects can't get it. Liner uses Last.fm, ListenBrainz and your own Spotify export instead, which covers the same ground. The export actually goes further, with skips and exact listening time.</p></details>
      <details><summary>How do I get my Spotify export, and how long does it take?</summary><p>On Spotify's privacy page, tick "Extended streaming history" and request it. Spotify emails a confirmation, then your files, usually within a few days. They say it can take up to 30. <a href="#/connect/file">Step-by-step guide</a>.</p></details>
      <details><summary>Why don't my numbers match Wrapped or other sites?</summary><p>Everyone counts differently. Spotify counts a stream after 30 seconds. Last.fm logs a song once you've played half of it or four minutes. Wrapped only covers part of the year. Liner tells you its rule and lets you change it in the Data tab.</p></details>
      <details><summary>Last.fm or ListenBrainz?</summary><p>If you already use Last.fm, pick it: you may have years of history there. If you're starting fresh, both take a minute. ListenBrainz is open source and run by a non-profit.</p></details>
      <details><summary>Does it count what I play on my phone?</summary><p>Yes. Last.fm and ListenBrainz get your plays from Spotify itself, so every device counts: phone, laptop, car, speakers. The export covers every device too.</p></details>
      <details><summary>Is it really free?</summary><p>Yes. Every feature, for everyone. There's no premium tier.</p></details>
    </div>
  </section>`;

  mountHeroSource();
  $$('[data-src]').forEach((b) => b.addEventListener('click', () => {
    homeSource = b.dataset.src;
    $$('[data-src]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    mountHeroSource(true);
  }));
  bindTimeline($('#f-timeline'), A);
  bindHonest(archive.export.rows);
}

// A credits sheet for the demo listener, like the liner notes on a record sleeve.
function notesCard(A) {
  const byHour = new Array(24).fill(0);
  A.heat.forEach((r) => r.forEach((v, h) => { byHour[h] += v; }));
  const peak = byHour.indexOf(Math.max(...byHour));
  const streak = A.insights.find((x) => x.id === 'streak');
  const era = A.eras[A.eras.length - 1];
  const song = A.tracks[0];
  const rows = [
    ['Plays', num(A.plays)],
    ['Hours', num(A.hours)],
    ['Artists', num(A.artists.length)],
    ['Most played', esc(song.track)],
    ['Current era', era ? esc(era.artist) : '—'],
    ['Busiest hour', peak === 0 ? '12 am' : peak < 12 ? `${peak} am` : peak === 12 ? '12 pm' : `${peak - 12} pm`],
    ['Longest streak', streak ? `${streak.stat} days` : '—'],
  ];
  const covers = A.albums.slice(0, 6);
  return `<aside class="notes" aria-label="Example: liner notes for a demo listener">
    <div class="notes__head"><span class="label">Liner notes</span><span class="label">Side A</span></div>
    <h2>Mira, ${new Date(A.from).getFullYear()}–${new Date(A.to).getFullYear()}</h2>
    <dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><i></i><dd>${v}</dd></div>`).join('')}</dl>
    <div class="notes__foot"><span class="notes__covers">${covers.map((c) => sleeve(c.album, c.artist, { size: 30 })).join('')}</span><a class="link link--quiet" href="#/demo">Example profile ${icon.arrow}</a></div>
  </aside>`;
}

function mountHeroSource(focus = false) {
  const root = $('#hero-src');
  if (homeSource === 'file') {
    root.innerHTML = `<div style="display:grid;gap:12px">${dropzone({ title: 'Drop your Spotify ZIP here', sub: "Or click to choose it. It's read on your device and never uploaded." })}<p class="lookup__hint">Don't have it yet? <a href="#/connect/file">Here's how to request it</a>. It takes two minutes, then Spotify emails it to you.</p></div>`;
    bindDrops(root, handleFiles);
    return;
  }
  const input = mountLookup(root, {
    source: homeSource, id: `home-${homeSource}`, cta: 'Continue',
    onConfirm: (res) => go(hrefFor(pidFor(homeSource, res.user.name))),
  });
  if (focus) input.focus();
}

function bindHonest(rows) {
  const el = $('#honest');
  let minMs = 30000;
  const draw = () => {
    let plays = 0, ms = 0, short = 0;
    for (const r of rows) { if (r.ms < minMs) { short++; continue; } plays++; ms += r.ms; }
    el.innerHTML = `
      <div class="panel__head"><span class="label">Example history</span>
        <div class="seg" role="radiogroup" aria-label="What counts as a play"><button type="button" role="radio" data-m="0" aria-checked="${minMs === 0}">Any length</button><button type="button" role="radio" data-m="30000" aria-checked="${minMs === 30000}">30 seconds or more</button></div></div>
      <div class="honest__nums">
        <div><b>${num(plays)}</b><span>plays</span></div>
        <div><b>${num(ms / 3.6e6)}</b><span>hours</span></div>
        <div><b>${minMs ? num(short) : '0'}</b><span>short plays left out</span></div>
      </div>
      <p class="muted" style="font-size:14.5px">${minMs ? 'Songs you skipped in the first 30 seconds are left out, the same way Spotify counts streams.' : 'Every play counts, including songs you skipped after a second or two.'}</p>`;
    $$('[data-m]', el).forEach((b) => b.addEventListener('click', () => { minMs = Number(b.dataset.m); draw(); }));
  };
  draw();
}
