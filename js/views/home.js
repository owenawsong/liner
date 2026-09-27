import { $, $$, esc, avatar, num, icon, sleeve } from '../ui.js';
import { view, hrefFor, profiles, getArchive, analysisFor, go, pidFor, onLeave } from '../core.js';
import { timeline, bindTimeline, heatmap, dropzone, bindDrops } from '../components.js';
import { topIn, lowerBound } from '../analysis.js';
import { handleFiles } from '../actions.js';
import { mountLookup } from './connect.js';
import { overviewHTML } from './profile.js';
import { demoRecent, DEMO_USER } from '../sources/demo.js';

let homeSource = 'lastfm';
const yes = (t) => `<span class="yes">${icon.check}${t}</span>`;
const no = (t) => `<span class="no">${t}</span>`;
const DAY = 864e5;

// A real example of what the AI writes, from the demo profile.
const SAMPLE_NOTES = 'Your journey began with a heavy Lorde obsession that lasted through your first two years before you shifted into a long era defined by Phoebe Bridgers and Mitski. What stands out most is your loyalty to Frank Ocean, who has appeared in your rotation every single year since you started.';
const SAMPLE_ROAST = 'You played Nobody by Mitski 19 times in one day, and your busiest hour is 10 pm, which tells me you only schedule your emotional crises for after everyone else goes to sleep.';

export async function renderHome() {
  const archive = await getArchive('demo');
  const A = analysisFor('demo', archive);
  const returning = profiles.list();
  const week = A.rows.length - lowerBound(A.rows, Date.now() - 7 * DAY);
  const today = A.rows.length - lowerBound(A.rows, new Date().setHours(0, 0, 0, 0));
  const demoP = { source: 'demo', user: { ...DEMO_USER, playcount: A.plays }, recent: demoRecent(12), today, week };
  const insight = (id) => A.insights.find((x) => x.id === id);
  const topArtist = A.artists[0];
  const year = A.years[A.years.length - 2] || A.years[0];
  const yArtists = topIn(A, 'artists', new Date(year.y, 0, 1).getTime(), new Date(year.y + 1, 0, 1).getTime(), 3);

  view().innerHTML = `
  <section class="wrap hero"><div class="hero__grid"><div>
    <p class="hero__kicker" data-reveal><span class="dot"></span>Every feature free. No account. Nothing uploaded.</p>
    <h1 class="hero__title" data-reveal>${'The complete record of your listening.'.split(' ').map((w, i) => `<span style="--i:${i}">${w}</span>`).join(' ')}</h1>
    <p class="hero__lede" data-reveal>Liner turns your Spotify history into a timeline of your eras, a year in review for every year, and the small things you never noticed about how you listen.</p>
    <div class="hero__connect" data-reveal>
      ${returning.length ? `<div class="returning"><span>Welcome back</span>${returning.map((r) => `<a href="${hrefFor(r.pid)}">${avatar(r.display, r.image, 26)}${esc(r.display)}</a>`).join('')}</div>` : ''}
      <div class="srctabs" role="tablist" aria-label="How to connect">
        <button type="button" role="tab" data-src="lastfm" aria-selected="${homeSource === 'lastfm'}">Last.fm</button>
        <button type="button" role="tab" data-src="listenbrainz" aria-selected="${homeSource === 'listenbrainz'}">ListenBrainz</button>
        <button type="button" role="tab" data-src="file" aria-selected="${homeSource === 'file'}">Spotify export</button>
      </div>
      <div id="hero-src" role="tabpanel"></div>
      <div class="hero__alts">
        <a href="#/connect/lastfm">New to all this? Set up in a minute ${icon.arrow}</a>
        <a href="#/demo">Look around a demo profile ${icon.arrow}</a>
      </div>
    </div>
  </div>${notesCard(A)}</div></section>

  <section class="wrap section section--tight" id="start">
    <div class="steps3" data-reveal-group>
      <div class="step3" data-reveal><span class="step3__n">1</span><h3>Pick where your music lives</h3><p>Most people use <a href="#/connect/lastfm">Last.fm</a>. It connects to Spotify in about a minute and logs every song you play, on every device.</p></div>
      <div class="step3" data-reveal><span class="step3__n">2</span><h3>Type your username</h3><p>No password, no sign-up. Liner reads your public listening and has your stats ready in seconds.</p></div>
      <div class="step3" data-reveal><span class="step3__n">3</span><h3>Bring in your whole history</h3><p>Import every play with one click, or drop in your <a href="#/connect/file">Spotify export</a> for exact listening time and every skip.</p></div>
    </div>
  </section>

  <section class="wrap preview" aria-label="What a Liner profile looks like" data-reveal>
    <div class="preview__frame">
      <div class="preview__bar">${avatar('Mira', '', 22)}<b>Mira</b><span>·</span><span>Overview</span><span style="margin-left:auto" class="mono">demo</span></div>
      <div class="preview__body">${overviewHTML({ pid: 'demo', source: 'demo', p: demoP, A, preview: true, topArtists: topIn(A, 'artists', Date.now() - 7 * DAY) })}</div>
    </div>
    <a class="btn btn--ink btn--lg preview__cta" href="#/demo">Open the demo profile ${icon.arrow}</a>
  </section>

  <section class="wrap section" id="features">
    <div class="section__head" data-reveal>
      <span class="label">Everything, free</span>
      <h2>Every feature. For everyone. Free.</h2>
      <p>Other stats apps lock the good parts behind a subscription. In Liner there's nothing to unlock: every chart, every insight and every page is free.</p>
    </div>

    <div class="bento">
      <article class="bento__card bento__card--wide" data-reveal>
        <div class="bento__text"><span class="label">Timeline and eras</span><h3>Every month you've listened, on one line</h3><p>Liner finds your eras on its own: the stretches when one artist ran the show. Tap any month to see what was on.</p></div>
        <div class="bento__vis" id="f-timeline">${timeline(A, { height: 150, fit: true })}</div>
      </article>

      <article class="bento__card bento__card--ink" data-reveal>
        <div class="bento__text"><span class="label">AI liner notes</span><h3>Your taste, written up</h3></div>
        <div class="bento__quote" id="f-ai"><p data-type>${esc(SAMPLE_NOTES)}</p></div>
        <div class="seg seg--dark" role="radiogroup" aria-label="Example"><button type="button" role="radio" data-ex="notes" aria-checked="true">Liner notes</button><button type="button" role="radio" data-ex="roast" aria-checked="false">Roast me</button></div>
      </article>

      <article class="bento__card" data-reveal>
        <div class="bento__text"><span class="label">Year in review</span><h3>Wrapped, for any year you want</h3><p>Every year gets its own page and a card you can save and share.</p></div>
        <div class="minicard"><span class="mono">LINER · ${year.y}</span><b>${year.y}</b><ol>${yArtists.map((a) => `<li>${esc(a.name)}</li>`).join('')}</ol><span class="mono">${num(year.n)} plays</span></div>
      </article>

      <article class="bento__card" data-reveal>
        <div class="bento__text"><span class="label">Insights</span><h3>Things you'd never think to look up</h3></div>
        <div class="bento__stack">${['comeback', 'loop', 'streak'].map((id) => insight(id)).filter(Boolean).slice(0, 2).map((x) => `<div class="minisight"><span class="label">${esc(x.kicker)}</span><p>${x.title}</p></div>`).join('')}</div>
      </article>

      <article class="bento__card" data-reveal>
        <div class="bento__text"><span class="label">Artist pages</span><h3>Your whole history with every artist</h3><p>First play, biggest month, longest break, favourite songs.</p></div>
        <a class="miniartist" href="#/demo/artist/${encodeURIComponent(topArtist.name)}">${sleeve(topArtist.name, topArtist.name, { size: 64, round: true, kind: 'artist' })}<span><b>${esc(topArtist.name)}</b><span>${num(topArtist.n)} plays · since ${new Date(topArtist.first).getFullYear()}</span></span></a>
      </article>

      <article class="bento__card bento__card--wide" data-reveal>
        <div class="bento__text"><span class="label">Listening clock</span><h3>When the music actually happens</h3><p>Every play on your week, hour by hour.</p></div>
        <div class="bento__vis">${heatmap(A)}</div>
      </article>

      <article class="bento__card" data-reveal>
        <div class="bento__text"><span class="label">Compare</span><h3>How close is your taste to a friend's?</h3><p>A match score, what you share, and what you'd each get from the other.</p></div>
        <div class="miniring"><div class="cmp-ring" style="--p:73"><div><b>73</b><span>% match</span></div></div></div>
      </article>

      <article class="bento__card" data-reveal>
        <div class="bento__text"><span class="label">Ask your stats</span><h3>Just ask</h3></div>
        <div class="minichat"><p class="minichat__q">When did I get into Mitski?</p><p class="minichat__a">Your first Mitski play was in 2019, and she took over completely from late 2020 into 2022.</p></div>
      </article>

      <article class="bento__card" data-reveal>
        <div class="bento__text"><span class="label">Obscurity</span><h3>How mainstream are you, really?</h3><p>Scored from how many people listen to your favourite artists.</p></div>
        <div class="minims"><div class="ms__track"><i style="left:34%"></i></div><div class="ms__ends"><span>Everyone knows them</span><span>Nobody does</span></div></div>
      </article>

      <article class="bento__card bento__card--wide" data-reveal>
        <div class="bento__text"><span class="label">And the rest</span><h3>All of it, free</h3></div>
        <ul class="ticks">
          <li>Your whole history, imported in one click</li><li>Play counts for every song</li><li>Top 100 artists, songs and albums</li><li>Custom date ranges</li>
          <li>Rank by plays or minutes</li><li>Genres, from MusicBrainz</li><li>Song pages and milestones</li><li>On this day, every day</li>
          <li>Search your whole history</li><li>Exact skips from your export</li><li>Six themes, light and dark</li><li>Install it like an app</li>
        </ul>
      </article>
    </div>
  </section>

  <section class="wrap section" id="free">
    <div class="section__head" data-reveal>
      <span class="label">Free here, paid elsewhere</span>
      <h2>The things other apps charge for.</h2>
      <p>stats.fm is the most popular Spotify stats app. Here's what its free plan leaves out, next to Liner.</p>
    </div>
    <div class="compare-wrap" data-reveal>
      <table class="compare compare--vs">
        <thead><tr><th></th><th>Liner<small>Free</small></th><th>stats.fm<small>Free plan</small></th></tr></thead>
        <tbody>
          <tr><th>Import your full history</th><td>${yes('Yes')}</td><td>${no('Plus only')}</td></tr>
          <tr><th>Play counts</th><td>${yes('Yes')}</td><td>${no('Plus only')}</td></tr>
          <tr><th>Listening clock</th><td>${yes('Yes')}</td><td>${no('Plus only')}</td></tr>
          <tr><th>Custom date ranges</th><td>${yes('Yes')}</td><td>${no('Plus only')}</td></tr>
          <tr><th>Top albums</th><td>${yes('Yes')}</td><td>${no('Plus only')}</td></tr>
          <tr><th>Top artists and songs</th><td>${yes('Top 100')}</td><td>${no('Top 50')}</td></tr>
          <tr><th>Ads</th><td>${yes('None')}</td><td>${no('Yes')}</td></tr>
        </tbody>
      </table>
    </div>
    <p class="faint" style="font-size:13px;margin-top:12px">From stats.fm's own Plus page, September 2026. stats.fm is a great app; we just think these should be free.</p>
  </section>

  <section class="wrap section" id="sources">
    <div class="section__head" data-reveal>
      <span class="label">Connecting</span>
      <h2>Four ways in. Use one, or all of them.</h2>
      <p>Spotify only lets very large apps use "Log in with Spotify", so Liner reads from sources you control. Here's exactly what each one gives you.</p>
    </div>
    <div class="compare-wrap" data-reveal>
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
  </section>

  <section class="wrap section">
    <div class="privacy" data-reveal>
      <div style="display:grid;gap:18px;align-content:start">
        <span class="label" style="color:color-mix(in srgb, var(--bg) 55%, var(--ink))">Privacy</span>
        <h2>Your listening history is personal. It stays with you.</h2>
      </div>
      <ul>
        <li><b>Read on your device</b><span>Your Spotify ZIP is opened in your browser and never uploaded.</span></li>
        <li><b>No sign-up, no tracking</b><span>There are no Liner accounts and no analytics. What you connect is saved in this browser only.</span></li>
        <li><b>AI sees a summary, not your history</b><span>For liner notes, Liner sends a few lines of totals and top artists. Never your plays.</span></li>
        <li><b>Gone in one tap</b><span>Clear everything Liner has stored from the Data tab, any time.</span></li>
      </ul>
    </div>
  </section>

  <section class="wrap section" id="faq">
    <div class="section__head" data-reveal><span class="label">Questions</span><h2>Good questions.</h2></div>
    <div class="faq" data-reveal>
      <details><summary>How is all of this free?</summary><p>Liner runs almost entirely in your browser, so it costs very little to keep online. There are no accounts or servers holding your data, and the AI writing uses free models. If it ever costs more, donations will cover it. Features won't go behind a paywall.</p></details>
      <details><summary>Why isn't there a "Log in with Spotify" button?</summary><p>Since 2025, Spotify only gives that to apps with at least 250,000 monthly users. Liner uses Last.fm, ListenBrainz and your own Spotify export instead, which covers the same ground. The export actually goes further, with skips and exact listening time.</p></details>
      <details><summary>How do I get my Spotify export, and how long does it take?</summary><p>On Spotify's privacy page, tick "Extended streaming history" and request it. Spotify emails a confirmation, then your files, usually within a few days. They say it can take up to 30. <a href="#/connect/file">Step-by-step guide</a>.</p></details>
      <details><summary>Why don't my numbers match Wrapped or other sites?</summary><p>Everyone counts differently. Spotify counts a stream after 30 seconds. Last.fm logs a song once you've played half of it or four minutes. Wrapped only covers part of the year. Liner tells you its rule and lets you change it in the Data tab.</p></details>
      <details><summary>Last.fm or ListenBrainz?</summary><p>If you already use Last.fm, pick it: you may have years of history there. If you're starting fresh, both take a minute. ListenBrainz is open source and run by a non-profit.</p></details>
      <details><summary>Does it count what I play on my phone?</summary><p>Yes. Last.fm and ListenBrainz get your plays from Spotify itself, so every device counts: phone, laptop, car, speakers.</p></details>
      <details><summary>What does the AI see?</summary><p>Only a short summary Liner writes from your stats, like your top artists, your eras and a few totals. Never your full history, and never anything from Spotify's API.</p></details>
    </div>
  </section>

  <section class="wrap section">
    <div class="final" data-reveal>
      <h2>See your own in ten seconds.</h2>
      <p>Type your Last.fm username. That's the whole sign-up.</p>
      <div id="final-lookup"></div>
    </div>
  </section>`;

  mountHeroSource();
  $$('[data-src]').forEach((b) => b.addEventListener('click', () => {
    homeSource = b.dataset.src;
    $$('[data-src]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    mountHeroSource(true);
  }));
  mountLookup($('#final-lookup'), { source: 'lastfm', id: 'final-lastfm', cta: 'Show me', onConfirm: (res) => go(hrefFor(pidFor('lastfm', res.user.name))) });
  bindTimeline($('#f-timeline'), A);
  bindExamples();
  revealOnScroll();
}

function bindExamples() {
  const box = $('#f-ai p');
  $$('[data-ex]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-ex]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    typeInto(box, b.dataset.ex === 'roast' ? SAMPLE_ROAST : SAMPLE_NOTES);
  }));
}

function typeInto(el, text) {
  const words = text.split(' ');
  el.innerHTML = words.map((w, i) => `<span style="animation-delay:${i * 22}ms">${esc(w)}</span>`).join(' ');
}

// Fade sections in as they scroll into view. Anything already on screen shows at once.
function revealOnScroll() {
  const els = $$('[data-reveal]');
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.documentElement.classList.add('reveal-ready');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const group = e.target.parentElement?.hasAttribute('data-reveal-group') || e.target.parentElement?.classList.contains('bento');
      const i = group ? [...e.target.parentElement.children].indexOf(e.target) : 0;
      e.target.style.setProperty('--d', `${Math.min(i, 6) * 70}ms`);
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  els.forEach((el) => io.observe(el));
  onLeave(() => { io.disconnect(); document.documentElement.classList.remove('reveal-ready'); });
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
  return `<aside class="notes" aria-label="Example: liner notes for a demo listener" data-reveal>
    <div class="notes__head"><span class="label">Liner notes</span><span class="label">Side A</span></div>
    <h2>Mira, ${new Date(A.from).getFullYear()}–${new Date(A.to).getFullYear()}</h2>
    <dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><i></i><dd>${v}</dd></div>`).join('')}</dl>
    <div class="notes__foot"><span class="notes__covers">${covers.map((c) => sleeve(c.album, c.artist, { size: 30, kind: 'album' })).join('')}</span><a class="link link--quiet" href="#/demo">Example profile ${icon.arrow}</a></div>
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

