import { $, $$, esc, avatar, num, icon, sleeve } from '../ui.js';
import { view, hrefFor, profiles, getArchive, analysisFor, go, pidFor, onLeave } from '../core.js';
import { timeline, bindTimeline, heatmap, rankList } from '../components.js';
import { topIn } from '../analysis.js';
import { mountLookup } from './connect.js';
import { art, hydrate } from '../meta.js';
import { palette } from '../color.js';
import { DEMO_NOTES, DEMO_ROAST } from '../sources/demo.js';

const HERO_ALBUMS = [
  ['Blonde', 'Frank Ocean'], ['Melodrama', 'Lorde'], ['SOS', 'SZA'], ['Punisher', 'Phoebe Bridgers'], ['brat', 'Charli xcx'],
  ['GNX', 'Kendrick Lamar'], ["Short n' Sweet", 'Sabrina Carpenter'], ['Charm', 'Clairo'], ['The Rise and Fall of a Midwest Princess', 'Chappell Roan'],
];

export async function renderHome() {
  const routeAtStart = location.hash;
  await new Promise((resolve) => setTimeout(resolve, 0));
  const archive = await getArchive('demo');
  const A = analysisFor('demo', archive);
  if (location.hash !== routeAtStart) return;
  const returning = profiles.list();
  const topArtist = A.artists[0];
  const year = A.years[A.years.length - 2] || A.years[0];
  const yArtists = topIn(A, 'artists', new Date(year.y, 0, 1).getTime(), new Date(year.y + 1, 0, 1).getTime(), 3);
  const insight = (id) => A.insights.find((x) => x.id === id);

  const TRACKS = [
    { side: 'A', title: 'Timeline and eras', desc: 'Every month you have ever listened, on one line, with your eras found for you.', vis: `<div id="pv-timeline">${timeline(A, { height: 170, fit: true })}</div>` },
    { side: 'A', title: 'How your taste changes', desc: 'See the artists rising, the old favorites fading, and who you discovered this season.', vis: '<div class="minichat"><p class="minichat__q">Your next chapter</p><p class="minichat__a">Compare two equal 90-day stretches. Find discoveries, comebacks and the artists moving into your rotation.</p></div>' },
    { side: 'A', title: 'Your listening, four ways', desc: 'Explore 24 months of plays, artist breadth, discoveries and how much one favorite dominated.', vis: '<div class="minichat"><p class="minichat__q">More than a top list</p><p class="minichat__a">See how wide your rotation got, when it narrowed, and when new artists arrived.</p></div>' },
    { side: 'A', title: 'Year in review, any year', desc: 'Wrapped for every year you have been listening, with a card you can share.', vis: `<div class="minicard"><span class="mono">SLEEVE · ${year.y}</span><b>${year.y}</b><ol>${yArtists.map((a) => `<li>${esc(a.name)}</li>`).join('')}</ol><span class="mono">${num(year.n)} plays</span></div>` },
    { side: 'A', title: 'Every artist, every song', desc: 'First play, biggest month, longest break and your favourite songs, for everything you have played.', vis: `<a class="miniartist" href="#/demo/artist/${encodeURIComponent(topArtist.name)}">${sleeve(topArtist.name, topArtist.name, { size: 72, round: true, kind: 'artist' })}<span><b>${esc(topArtist.name)}</b><span>${num(topArtist.n)} plays · since ${new Date(topArtist.first).getFullYear()}</span></span></a>` },
    { side: 'A', title: 'The listening clock', desc: 'When the music actually happens, hour by hour across your week.', vis: heatmap(A) },
    { side: 'A', title: 'Top 100, any dates', desc: 'Artists, songs, albums and genres. By plays or by minutes, for any stretch of time.', vis: rankList(topIn(A, 'albums', -Infinity, Infinity, 5), { kind: 'albums', size: 40 }) },
    { side: 'A', title: 'Things you never noticed', desc: 'Obsessions, comebacks, streaks, late nights. Sleeve goes looking so you don\'t have to.', vis: `<div class="bento__stack">${['comeback', 'loop', 'streak'].map(insight).filter(Boolean).slice(0, 2).map((x) => `<div class="minisight"><span class="label">${esc(x.kicker)}</span><p>${x.title}</p></div>`).join('')}</div>` },
    { side: 'B', title: 'Liner notes, written for you', desc: 'A short write-up of your taste, by AI, from a summary of your stats.', vis: `<div class="pv-quote"><p>${esc(DEMO_NOTES)}</p></div>` },
    { side: 'B', title: 'Roast my taste', desc: 'The same, but mean. Affectionately.', vis: `<div class="pv-quote pv-quote--ink"><p>${esc(DEMO_ROAST)}</p></div>` },
    { side: 'B', title: 'Ask your stats anything', desc: 'When did I get into Mitski? What was last summer? Just ask.', vis: '<div class="minichat"><p class="minichat__q">When did I get into Mitski?</p><p class="minichat__a">Your first Mitski play was in 2019, and she took over completely from late 2020 into 2022.</p></div>' },
    { side: 'B', title: 'Compare with a friend', desc: 'A match score, what you share, and what you would each get from the other.', vis: '<div class="miniring"><div class="cmp-ring" style="--p:73"><div><b>73</b><span>% match</span></div></div></div>' },
    { side: 'B', title: 'How mainstream are you?', desc: 'Scored from how many people listen to your favourite artists.', vis: '<div class="minims"><div class="ms__score"><b>34</b><span>out of 100 obscurity</span><p>A healthy mix</p></div><div class="ms__track" style="margin-top:18px"><i style="left:34%"></i></div><div class="ms__ends"><span>Everyone knows them</span><span>Nobody does</span></div></div>' },
  ];
  let n = { A: 0, B: 0 };
  TRACKS.forEach((t) => { n[t.side] += 1; t.no = `${t.side}${n[t.side]}`; });

  view().innerHTML = `
  <section class="sl-hero" id="sl-hero">
    <div class="wrap sl-hero__inner">
      <div class="sl-hero__meta"><span>YOUR MUSIC, IN FULL</span><span>Every feature free · No Sleeve account · Files stay on your device</span><span>EVERY LISTEN COUNTS</span></div>
      <div class="sl-hero__grid">
        <div class="sl-hero__copy">
          <h1 class="sl-hero__title" data-reveal>${'Your whole record.'.split(' ').map((w, i) => `<span style="--i:${i}">${w}</span>`).join(' ')}</h1>
          <p class="sl-hero__lede" data-reveal>Sleeve turns your listening history into your eras, a year in review for every year, and the small things you never noticed about how you listen. Every feature is free.</p>
          <div class="sl-connect" data-reveal>
            ${returning.length ? `<div class="returning"><span>Welcome back</span>${returning.map((r) => `<a href="${hrefFor(r.pid)}">${avatar(r.display, r.image, 26)}${esc(r.display)}</a>`).join('')}</div>` : ''}
            <div class="sl-hero__actions"><a class="btn btn--ink sl-hero__cta" href="#/start">Get started ${icon.arrow}</a><a class="btn btn--line sl-hero__cta" href="#/demo">Explore the demo</a></div>
            <p class="sl-hero__none">Already use Last.fm? <a href="#/start/lastfm">Open your listening record</a></p>
          </div>
        </div>
        <div class="deck" aria-hidden="true">
          <div class="deck__disc" id="deck-disc"><span class="deck__label" id="deck-label"></span></div>
          <div class="deck__sleeve" id="deck-sleeve">${HERO_ALBUMS.map(([al, ar], i) => `<div class="deck__cover${i === 0 ? ' is-on' : ''}" data-i="${i}">${sleeve(al, ar, { size: 460, kind: 'album' })}</div>`).join('')}</div>
          <div class="deck__sticker"><span>Now pressing</span><b id="deck-title">${esc(HERO_ALBUMS[0][0])}</b><span id="deck-artist">${esc(HERO_ALBUMS[0][1])}</span></div>
        </div>
      </div>
    </div>
  </section>

    <div class="marquee" aria-hidden="true"><div class="marquee__row">${Array.from({ length: 2 }, () => ['Every feature free', 'Your eras, found for you', 'Taste evolution', 'Year in review for every year', 'AI liner notes', 'Compare with friends', 'Files stay on your device', 'No Sleeve account', 'Top 100, any dates', 'Listening clock', 'Your whole history'].map((s) => `<span>${s}</span><i>●</i>`).join('')).join('')}</div></div>

  <section class="sl-tracks" id="features">
    <div class="wrap">
      <div class="sl-tracks__head" data-reveal>
        <span class="catno">TRACKLIST</span>
        <h2>What's on the record</h2>
        <p>More ways to understand your music. Every one of them free.</p>
      </div>
      <div class="sl-tracks__grid">
        <ol class="tracklist" id="tracklist">
          ${TRACKS.map((t, i) => `${i === 0 || TRACKS[i - 1].side !== t.side ? `<li class="tracklist__side">Side ${t.side} · ${t.side === 'A' ? 'Your music' : 'Your story'}</li>` : ''}
          <li><button type="button" class="track" data-t="${i}" aria-pressed="${i === 0}">
            <span class="track__no">${t.no}</span>
            <span class="track__main"><span class="track__title">${t.title}</span><span class="track__desc"><span>${t.desc}</span></span></span>
            <span class="track__len">Free</span>
            <span class="track__bar"><i></i></span>
          </button></li>`).join('')}
        </ol>
        <div class="sl-preview" id="sl-preview"><div class="sl-preview__inner" id="sl-preview-inner"></div></div>
      </div>
    </div>
  </section>

  <section class="sl-demo">
    <div class="wrap sl-demo__inner" data-reveal>
      <div>
        <span class="catno">EXAMPLE PRESSING</span>
        <h2>Mira's record</h2>
        <p>A made-up listener with a very real-looking history. Everything you can do with your own music, you can try here first.</p>
        <a class="btn sl-btn" href="#/demo">Open Mira's profile ${icon.arrow}</a>
      </div>
      <dl class="sl-demo__stats">
        <div><dt>Plays</dt><dd>${num(A.plays)}</dd></div>
        <div><dt>Hours</dt><dd>${num(A.hours)}</dd></div>
        <div><dt>Eras</dt><dd>${A.eras.length}</dd></div>
        <div><dt>Insights</dt><dd>${A.insights.length}</dd></div>
      </dl>
      <div class="sl-demo__covers">${A.albums.slice(0, 8).map((al) => sleeve(al.album, al.artist, { size: 140, kind: 'album' })).join('')}</div>
    </div>
  </section>

  <section class="sl-price">
    <div class="wrap sl-price__inner">
      <div class="sticker" data-reveal><span>Price</span><b>$0</b><span>every feature</span></div>
      <div data-reveal>
        <span class="catno">EVERY FEATURE, EVERYONE</span>
        <h2>The good parts shouldn't cost money.</h2>
        <p>Your full listening record belongs to you. Every way to explore it is free here.</p>
        <ul class="sl-price__list">
          <li><b>Import your whole history</b><span>Included</span></li>
          <li><b>Play counts for everything</b><span>Included</span></li>
          <li><b>Listening clock</b><span>Included</span></li>
          <li><b>Custom date ranges</b><span>Included</span></li>
          <li><b>Top albums</b><span>Included</span></li>
          <li><b>Top 100</b><span>Included</span></li>
          <li><b>No ads</b><span>Included</span></li>
        </ul>
      </div>
    </div>
  </section>

  <section class="sl-ways" id="sources">
    <div class="wrap">
      <div class="sl-tracks__head" data-reveal><span class="catno">GET YOUR MUSIC IN</span><h2>Start with Last.fm. Add your past whenever you want.</h2><p>Last.fm records new Spotify plays. A Spotify data file can fill in your earlier listening.</p></div>
      <div class="ways">
        <a class="way way--vermilion" href="#/connect/lastfm" data-reveal><span class="way__no">01</span><b>Last.fm</b><span>Open your existing log or start tracking new Spotify plays.</span><em>Free Last.fm account needed</em></a>
        <a class="way way--moss" href="#/connect/file" data-reveal><span class="way__no">02 · OPTIONAL</span><b>Spotify export</b><span>Add past plays, listening time and skips whenever you want.</span><em>Spotify prepares the file by email</em></a>
      </div>
    </div>
  </section>

  <section class="sl-back" id="faq">
    <div class="wrap">
      <div class="sl-back__head"><span class="catno">LINER NOTES</span><span class="catno">YOUR MUSIC, IN FULL</span></div>
      <div class="sl-back__cols" data-reveal>
        <div>
          <h3>Privacy</h3>
          <p>Your Spotify file is opened in your browser and never uploaded. There are no Sleeve accounts and no analytics. What you connect is saved on this device only. When AI writing is on, Sleeve automatically sends a short summary of totals and top artists, never your raw plays. Turn it off or clear everything in <a href="#/settings">Settings</a>.</p>
          <h3>How is this free?</h3>
          <p>Sleeve runs almost entirely in your browser, so it costs very little to keep online, and the AI uses free models. If it ever costs more, donations will cover it. Features won't go behind a paywall.</p>
        </div>
        <div class="faq faq--small">
          <details><summary>Why no one-click Spotify login?</summary><p>Spotify limits new developer apps to five authorized users. A Spotify login also cannot provide your lifetime play history. For now, <a href="#/start/none">start a listening log</a> for future plays or add your Spotify data file for the past. If you have your own developer app, you can <a href="#/connect/spotify">connect it as an advanced option</a>.</p></details>
          <details><summary>How do I get my Spotify export?</summary><p>Tick "Extended streaming history" on Spotify's privacy page. It includes your lifetime plays, but Spotify can take up to 30 days to prepare it. <a href="#/connect/file">Step-by-step guide</a>.</p></details>
          <details><summary>Why don't my numbers match Wrapped?</summary><p>Spotify counts a stream at 30 seconds, Last.fm at half a song, and Wrapped only covers part of the year. Sleeve shows its rule and lets you change it.</p></details>
          <details><summary>What happens when I first connect Last.fm?</summary><p>A new Last.fm account begins recording future Spotify plays. Once a song appears, Sleeve can show it. Longer patterns and eras need more listening history; the optional Spotify file can add your past.</p></details>
          <details><summary>Can I use my stats.fm history?</summary><p>If you kept the original Spotify history ZIP that you uploaded to stats.fm, you can use that same file in Sleeve. Sleeve does not connect to your stats.fm account.</p></details>
          <details><summary>Why no happiness or danceability score?</summary><p>Those need analysis of each recording, which a listening history does not contain. Sleeve shows measured play patterns and artist-tag genres, with coverage, rather than guessing audio properties from names.</p></details>
          <details><summary>Does it count my phone?</summary><p>Yes. Plays come from Spotify itself, so every device counts.</p></details>
        </div>
      </div>
    </div>
  </section>

  <section class="sl-final">
    <div class="wrap sl-final__inner" data-reveal>
      <div class="sl-final__disc" aria-hidden="true"></div>
      <h2>Drop the needle.</h2>
      <p>Already track with Last.fm? Enter your username to open your record.</p>
      <div id="final-lookup"></div>
      <a class="sl-final__alt" href="#/start/none">Only use Spotify? Start here ${icon.arrow}</a>
    </div>
  </section>`;

  mountLookup($('#final-lookup'), { source: 'lastfm', id: 'final-lastfm', cta: 'Drop it', onConfirm: (res) => go(hrefFor(pidFor('lastfm', res.user.name))) });
  bindTracks(TRACKS, A);
  runDeck();
  navOverHero();
  revealOnScroll();
}

/* ---------- Hero: the record deck ---------- */
function runDeck() {
  const root = document.documentElement;
  const hero = $('#sl-hero');
  const sticker = $('.deck__sticker');
  const covers = $$('.deck__cover');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let i = 0, alive = true, timer = 0, labelTimer = 0, generation = 0;
  const show = (k, initial = false) => {
    const current = ++generation;
    covers.forEach((c) => c.classList.toggle('is-on', Number(c.dataset.i) === k));
    hydrate(covers[k]);
    clearTimeout(labelTimer);
    if (!initial) sticker.classList.add('is-changing');
    labelTimer = setTimeout(() => {
      if (!alive || current !== generation) return;
      $('#deck-title').textContent = HERO_ALBUMS[k][0];
      $('#deck-artist').textContent = HERO_ALBUMS[k][1];
      sticker.classList.remove('is-changing');
    }, initial || reduced.matches ? 0 : 350);
    art('album', ...HERO_ALBUMS[k], true).then((url) => palette(url)).then((pal) => {
      if (!alive || current !== generation || !pal) return;
      root.style.setProperty('--hero-bg', pal.bg);
      root.style.setProperty('--hero-ink', pal.ink);
      root.style.setProperty('--hero-soft', pal.soft);
      hero.classList.toggle('is-dark-ink', pal.dark);
    }).catch(() => {});
  };
  const schedule = () => {
    clearTimeout(timer);
    if (!alive || document.hidden || reduced.matches) return;
    timer = setTimeout(() => { i = (i + 1) % HERO_ALBUMS.length; show(i); schedule(); }, 6500);
  };
  const visibility = () => schedule();
  document.addEventListener('visibilitychange', visibility);
  show(0, true);
  schedule();
  onLeave(() => {
    alive = false;
    clearTimeout(timer); clearTimeout(labelTimer);
    document.removeEventListener('visibilitychange', visibility);
    ['--hero-bg', '--hero-ink', '--hero-soft'].forEach((p) => root.style.removeProperty(p));
  });
}

// The nav takes the hero's colour until you scroll past it.
function navOverHero() {
  const nav = $('#nav'), hero = $('#sl-hero');
  nav.classList.add('nav--hero');
  const io = new IntersectionObserver(([e]) => nav.classList.toggle('nav--hero', e.isIntersecting), { rootMargin: '-64px 0px 0px 0px' });
  io.observe(hero);
  onLeave(() => { io.disconnect(); nav.classList.remove('nav--hero'); });
}

/* ---------- Tracklist with a live preview ---------- */
function bindTracks(TRACKS, A) {
  const list = $('#tracklist'), pv = $('#sl-preview'), inner = $('#sl-preview-inner');
  const narrow = matchMedia('(max-width: 900px)');
  let cur = -1, auto = true, timer = 0;
  const select = (i, fromUser = false) => {
    if (fromUser) auto = false;
    if (i === cur) return;
    cur = i;
    $$('.track', list).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.t) === i)));
    inner.classList.remove('is-in'); void inner.offsetWidth;
    inner.innerHTML = `<span class="sl-preview__no">${TRACKS[i].no}</span>${TRACKS[i].vis}`;
    inner.classList.add('is-in');
    if (narrow.matches) $(`.track[data-t="${i}"]`, list).closest('li').after(pv);
    else if (pv.parentElement !== $('.sl-tracks__grid')) $('.sl-tracks__grid').append(pv);
    if ($('#pv-timeline', inner)) bindTimeline($('#pv-timeline', inner), A);
    clearTimeout(timer);
    if (auto) timer = setTimeout(() => select((cur + 1) % TRACKS.length), 5200);
  };
  list.addEventListener('click', (e) => { const b = e.target.closest('.track'); if (b) select(Number(b.dataset.t), true); });
  list.addEventListener('mouseover', (e) => { const b = e.target.closest('.track'); if (b && !narrow.matches) select(Number(b.dataset.t), true); });
  select(0);
  onLeave(() => clearTimeout(timer));
}

// Fade sections in as they scroll into view. Anything already on screen shows at once.
function revealOnScroll() {
  const els = $$('[data-reveal]');
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.documentElement.classList.add('reveal-ready');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const sibs = [...e.target.parentElement.children].filter((x) => x.hasAttribute('data-reveal'));
      e.target.style.setProperty('--d', `${Math.min(sibs.indexOf(e.target), 5) * 80}ms`);
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
  els.forEach((el) => io.observe(el));
  onLeave(() => { io.disconnect(); document.documentElement.classList.remove('reveal-ready'); });
}
