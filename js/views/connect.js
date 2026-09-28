import { $, $$, esc, avatar, sleeve, num, monthYear, clock, debounce, icon, eq, copy, toast } from '../ui.js';
import { SOURCES, view, onLeave, go, hrefFor, pidFor, profiles } from '../core.js';
import { health, healthLine, dropzone, bindDrops } from '../components.js';
import { handleFiles } from '../actions.js';
import * as spotify from '../sources/spotify.js';

const LFM_APPS = 'https://www.last.fm/settings/applications';
const LB_SERVICES = 'https://listenbrainz.org/settings/music-services/details/';
const SPOTIFY_PRIVACY = 'https://www.spotify.com/account/privacy/';
const ext = (href, text, cls = '') => `<a href="${href}" target="_blank" rel="noopener"${cls ? ` class="${cls}"` : ''}>${text}</a>`;

/* =========================================================
   Username lookup, used on the home page and in setup
   ========================================================= */
const PREFIX = { lastfm: 'last.fm/user/', listenbrainz: 'listenbrainz.org/user/' };
function cleanUsername(v) {
  const m = v.match(/(?:last\.fm\/(?:[a-z]{2}\/)?user|listenbrainz\.org\/user)\/([^/?#\s]+)/i);
  if (m) { try { return decodeURIComponent(m[1]); } catch { return m[1]; } }
  return v.trim().replace(/^@/, '');
}

export function mountLookup(root, { source = 'lastfm', id, cta = 'Continue', initial = '', onConfirm }) {
  const src = SOURCES[source];
  const hint = source === 'lastfm'
    ? 'No password needed. Last.fm profiles are public, so your username is enough. Pasting your profile link works too.'
    : 'No password or key needed. ListenBrainz is open, so your username is enough.';
  root.innerHTML = `
    <form class="lookup" novalidate>
      <label class="sr" for="${id}">Your ${src.label} username</label>
      <div class="lookup__field">
        <span class="lookup__prefix">${PREFIX[source]}</span>
        <input class="lookup__input" id="${id}" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="your username" maxlength="120" value="${esc(initial)}">
        <button class="btn btn--ink" type="submit" aria-disabled="true">${cta} ${icon.arrow}</button>
      </div>
      <div class="lookup__out" aria-live="polite"></div>
    </form>`;
  const form = $('form', root), input = $('input', root), btn = $('button', root), out = $('.lookup__out', root);
  const idle = `<p class="lookup__hint">${hint}</p>`;
  let ctrl = null, seq = 0, result = null, queried = '', wantSubmit = false, busy = false;
  // aria-disabled rather than disabled, so pressing Enter still submits during a lookup.
  const ready = (ok) => btn.setAttribute('aria-disabled', String(!ok));
  const confirm = () => { if (result && !result.hidden) onConfirm(result); };

  async function run(name) {
    ctrl?.abort();
    result = null; queried = name; ready(false);
    if (!name) { out.innerHTML = idle; busy = false; return; }
    if (!src.USERNAME_RE.test(name)) { busy = false; wantSubmit = false; out.innerHTML = `<p class="lookup__msg">${src.usernameRule}</p>`; return; }
    const my = ++seq;
    ctrl = new AbortController();
    busy = true;
    out.innerHTML = '<div class="skel"><i style="width:48px;height:48px;border-radius:50%"></i><span style="flex:1;display:grid;gap:8px"><i style="width:40%;height:12px"></i><i style="width:72%;height:12px"></i></span></div>';
    try {
      const res = await src.lookup(name, ctrl.signal);
      if (my !== seq) return;
      result = res;
      out.innerHTML = whoCard(res, source);
      ready(!res.hidden);
      if (wantSubmit) confirm();
    } catch (e) {
      if (e.name === 'AbortError' || my !== seq) return;
      out.innerHTML = e.code === 'notfound'
        ? `<p class="lookup__msg lookup__msg--bad">There's no ${src.label} user called <b>${esc(name)}</b>. Check the spelling, or <a href="#/connect/${source}">set up an account</a>.</p>`
        : `<p class="lookup__msg lookup__msg--bad">${esc(e.message || 'Something went wrong. Try again.')}</p>`;
    } finally {
      if (my === seq) { busy = false; wantSubmit = false; }
    }
  }
  const later = debounce(run, 360);
  onLeave(() => ctrl?.abort());

  input.addEventListener('input', () => {
    const name = cleanUsername(input.value);
    if (/(last\.fm|listenbrainz\.org)\//i.test(input.value)) input.value = name;
    wantSubmit = false;
    if (name === queried && (result || busy)) return;
    ready(false);
    later(name);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = cleanUsername(input.value);
    if (result && name === queried) return confirm();
    wantSubmit = true;
    if (name !== queried || !busy) run(name);
  });
  if (initial) run(cleanUsername(initial)); else out.innerHTML = idle;
  return input;
}

function whoCard({ user, latest, hidden, simulated }, source) {
  const since = user.since ? ` · since ${monthYear(user.since)}` : '';
  return `<div class="who">
    ${avatar(user.name, user.image, 48)}
    <div class="who__body">
      <div class="who__name">${esc(user.name)}${simulated ? ' <span class="chip chip--warn">Simulated</span>' : ''}</div>
      <div class="who__meta">${num(user.playcount)} plays${since}</div>
      ${healthLine(health(latest, hidden), `#/connect/${source}/2`)}
    </div>
  </div>`;
}

/* =========================================================
   Setup flows
   ========================================================= */
export function renderConnect(source, step) {
  if (source === 'file') return fileFlow();
  if (source === 'spotify') return spotifyFlow();
  if (source === 'listenbrainz') return lbFlow(step || 1);
  return lfmFlow(step || 1);
}

function shell({ back = '#/', label, n, cur, body }) {
  view().innerHTML = `
    <div class="wrap"><div class="flow fade-in">
      <div class="flow__top"><a href="${back}">${icon.back} Back</a><span class="label">${esc(label)}</span></div>
      ${n ? `<div class="steps" style="--n:${n}" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i class="${i + 1 < cur ? 'done' : i + 1 === cur ? 'cur' : ''}"></i>`).join('')}</div>` : ''}
      ${body}
    </div></div>`;
}

/* ---------- Last.fm ---------- */
const lfmState = { user: null };

function lfmFlow(step) {
  if (step >= 4 && !lfmState.user) step = 3;
  const label = `Connect with Last.fm · Step ${step} of 4`;
  const back = step > 1 ? `#/connect/lastfm/${step - 1}` : '#/';
  if (step === 1) {
    shell({ back, label, n: 4, cur: 1, body: `
      <h1>Make a free Last.fm account</h1>
      <p class="flow__lede">Last.fm keeps a log of songs you play on Spotify, across your devices. Sleeve reads that log to build your stats. A new account starts recording from now on; it won't contain your older Spotify plays.</p>
      <div class="flow__actions">
        ${ext('https://www.last.fm/join', `Open Last.fm sign-up ${icon.out}`, 'btn btn--ink btn--lg')}
        <a class="btn btn--line btn--lg" href="#/connect/lastfm/3">I already have an account</a>
      </div>
      <div class="flow__actions" id="next" hidden><a class="btn btn--accent btn--lg" href="#/connect/lastfm/2">I've made my account ${icon.arrow}</a></div>
      <p class="flow__note">Sign-up opens in a new tab. Come back to this tab when you're done.</p>` });
    const reveal = () => { const n = $('#next'); if (n?.hidden) { n.hidden = false; $('a', n).focus(); } };
    $('.flow__actions a[target]').addEventListener('click', () => setTimeout(reveal, 700));
    const onVis = () => { if (!document.hidden) reveal(); };
    document.addEventListener('visibilitychange', onVis);
    onLeave(() => document.removeEventListener('visibilitychange', onVis));
    return;
  }
  if (step === 2) {
    shell({ back, label, n: 4, cur: 2, body: `
      <h1>Connect Spotify to Last.fm</h1>
      <p class="flow__lede">On Last.fm's Applications page, find <b>Spotify Scrobbling</b> and press <b>Connect</b>. Spotify will ask you to approve it.</p>
      <div class="mock" role="img" aria-label="Last.fm's Applications page, with the Connect button next to Spotify Scrobbling highlighted">
        <div class="mock__bar">last.fm/settings/applications</div>
        <div class="mock__body">
          <div class="mock__tabs"><span>Profile</span><span>Privacy</span><b>Applications</b></div>
          <div class="mock__row">${icon.spotify}<span class="mock__name">Spotify Scrobbling<small>Scrobble what you play on Spotify</small></span><span class="mock__btn">Connect</span></div>
          <div class="mock__row mock__row--dim"><span class="ph"></span><span class="mock__name">Other applications<small>You can ignore these</small></span><span class="mock__btn">Connect</span></div>
        </div>
      </div>
      <div class="flow__actions">
        ${ext(LFM_APPS, `Open the Applications page ${icon.out}`, 'btn btn--ink btn--lg')}
        <a class="btn btn--line btn--lg" href="#/connect/lastfm/3">It's connected ${icon.arrow}</a>
      </div>
      <p class="flow__note">If the button already says <b>Disconnect</b>, you're all set.</p>` });
    return;
  }
  if (step === 3) {
    shell({ back, label, n: 4, cur: 3, body: `
      <h1>What's your Last.fm username?</h1>
      <p class="flow__lede">It's in the top corner of Last.fm and at the end of your profile link.</p>
      <div id="lk"></div>` });
    const input = mountLookup($('#lk'), {
      source: 'lastfm', id: 'setup-user', cta: 'Continue',
      initial: lfmState.user?.user.name || '',
      onConfirm: (res) => { lfmState.user = res; go('#/connect/lastfm/4'); },
    });
    input.focus();
    return;
  }
  detectStep('lastfm', lfmState.user.user.name, { back, label, n: 4, cur: 4 });
}

/* ---------- ListenBrainz ---------- */
const lbState = { user: null };
function lbFlow(step) {
  const label = `Connect with ListenBrainz · Step ${step} of 3`;
  const back = step > 1 ? `#/connect/listenbrainz/${step - 1}` : '#/';
  if (step === 1) {
    shell({ back, label, n: 3, cur: 1, body: `
      <h1>Make a free ListenBrainz account</h1>
      <p class="flow__lede">ListenBrainz is an open, non-profit alternative to Last.fm run by MetaBrainz. It can log new Spotify plays, and Sleeve can read them without an API key. A new account won't contain your older Spotify plays.</p>
      <div class="flow__actions">
        ${ext('https://listenbrainz.org/login/', `Open ListenBrainz ${icon.out}`, 'btn btn--ink btn--lg')}
        <a class="btn btn--line btn--lg" href="#/connect/listenbrainz/3">I already use it</a>
      </div>
      <div class="flow__actions" id="next" hidden><a class="btn btn--accent btn--lg" href="#/connect/listenbrainz/2">I've signed up ${icon.arrow}</a></div>
      <p class="flow__note">You'll sign in with a MetaBrainz account, which is free.</p>` });
    $('.flow__actions a[target]').addEventListener('click', () => setTimeout(() => { $('#next').hidden = false; }, 700));
    return;
  }
  if (step === 2) {
    shell({ back, label, n: 3, cur: 2, body: `
      <h1>Connect Spotify to ListenBrainz</h1>
      <p class="flow__lede">In ListenBrainz settings, open <b>Connect services</b>, find Spotify and choose <b>Record listening history</b>. Then approve it on Spotify.</p>
      <div class="flow__actions">
        ${ext(LB_SERVICES, `Open Connect services ${icon.out}`, 'btn btn--ink btn--lg')}
        <a class="btn btn--line btn--lg" href="#/connect/listenbrainz/3">It's connected ${icon.arrow}</a>
      </div>
      <p class="flow__note">ListenBrainz checks Spotify every few minutes, so new plays show up a little later than on Last.fm.</p>` });
    return;
  }
  shell({ back, label, n: 3, cur: 3, body: `
    <h1>What's your ListenBrainz username?</h1>
    <p class="flow__lede">It's your MetaBrainz username, shown at the top of ListenBrainz.</p>
    <div id="lk"></div>` });
  mountLookup($('#lk'), {
    source: 'listenbrainz', id: 'setup-lb', cta: 'Open my stats',
    initial: lbState.user?.user.name || '',
    onConfirm: (res) => { lbState.user = res; go(hrefFor(pidFor('listenbrainz', res.user.name))); },
  }).focus();
}

/* ---------- Live detection ("play a song now") ---------- */
function detectStep(source, name, chrome) {
  const src = SOURCES[source];
  const simulated = source === 'lastfm' && !src.isLive();
  shell({ ...chrome, body: `
    <div class="listen" id="listen">
      <div class="disc" aria-hidden="true"><span class="disc__hole"></span></div>
      <h2>Play any song on Spotify now</h2>
      <p class="listen__hint" id="hint">Any device works: your phone, a laptop or a speaker. We'll spot it the moment ${src.label} does.</p>
      <p class="listen__meta">${eq} Listening for <b>${esc(name)}</b> · <span id="elapsed">0:00</span></p>
    </div>
    <div id="trouble" hidden></div>
    <div class="flow__actions" style="justify-content:center;gap:24px">
      <a class="link link--quiet" href="#/connect/${source}/3">Use a different username</a>
      <a class="link link--quiet" href="${hrefFor(pidFor(source, name))}">Skip this step</a>
    </div>` });

  const started = Date.now();
  const ctrl = new AbortController();
  let stopped = false, timer = 0, errors = 0;
  const tick = setInterval(() => {
    const s = (Date.now() - started) / 1000;
    $('#elapsed').textContent = clock(s);
    if (s >= 20 && s < 21.2) $('#hint').textContent = source === 'listenbrainz'
      ? 'ListenBrainz can take a few minutes to record a new Spotify play. Keep listening.'
      : 'Last.fm may take a little while to record your play. Keep listening.';
    if (s >= (source === 'listenbrainz' ? 120 : 45)) showTrouble(source, name);
  }, 1000);
  const stop = () => { stopped = true; clearInterval(tick); clearTimeout(timer); ctrl.abort(); };
  onLeave(stop);

  const poll = async () => {
    if (stopped) return;
    try {
      const tracks = await src.recent(name, 3, ctrl.signal);
      errors = 0;
      const hit = tracks.find((t) => t.nowPlaying || t.t >= started - 15000);
      if (hit && !stopped && (!simulated || Date.now() - started > 5000)) { stop(); return detected(source, name, hit); }
    } catch (e) {
      if (e.name === 'AbortError') return;
      if (e.code === 'hidden') $('#hint').innerHTML = 'Your listening is hidden. Turn off "Hide recent listening" in <a href="https://www.last.fm/settings/privacy" target="_blank" rel="noopener">Last.fm privacy settings</a> and we\'ll keep checking.';
      else if (++errors >= 3) $('#hint').textContent = `We're having trouble reaching ${src.label}. Still trying…`;
    }
    timer = setTimeout(poll, document.hidden ? 8000 : 3000);
  };
  poll();
}

function showTrouble(source, name) {
  const box = $('#trouble');
  if (!box || !box.hidden) return;
  box.hidden = false;
  box.innerHTML = `<div class="trouble">
    <h3>Not showing up? Check these</h3>
    <ol>
      <li><b>The song is really playing</b>, not paused, and it's music rather than a podcast.</li>
      <li><b>Private session is off</b> in Spotify. Private listening is never shared.</li>
      <li><b>Spotify is connected.</b> ${source === 'lastfm' ? `On ${ext(LFM_APPS, 'Last.fm Applications')}, Spotify Scrobbling should say Disconnect. If it says Connect, press it.` : `Check the Spotify connection in ${ext(LB_SERVICES, 'ListenBrainz Connect services')}.`}</li>
      <li><b>The username is right.</b> We're listening for <b>${esc(name)}</b>. <a href="#/connect/${source}/3">Change it</a></li>
    </ol>
  </div>`;
}

function detected(source, name, t) {
  $$('.steps i').forEach((i) => { i.className = 'done'; });
  $('.flow__top .label').textContent = 'Connected';
  const pid = pidFor(source, name);
  $('#listen').outerHTML = `<div class="done">
    ${sleeve(t.album || t.name, t.artist, { img: t.image, size: 200 })}
    <span class="chip chip--good"><span class="dot dot--live"></span>${t.nowPlaying ? 'Heard it live' : 'Found it'}</span>
    <h2>You're connected.</h2>
    <p>${t.nowPlaying ? "You're listening to" : 'You just played'} <b>${esc(t.name)}</b> by <b>${esc(t.artist)}</b>. From now on, every song you play shows up in Sleeve by itself.</p>
    <div class="flow__actions" style="justify-content:center"><a class="btn btn--ink btn--lg" href="${hrefFor(pid)}" id="open">Open my stats ${icon.arrow}</a></div>
  </div>`;
  $('#trouble').hidden = true;
  $('.flow > .flow__actions:last-child')?.remove();
  $('#open').focus();
}

/* ---------- Spotify export ---------- */
export const requestSteps = `
  <ol class="steplist">
    <li><span class="n">1</span><div><b>Open Spotify's privacy page</b><p>${ext(SPOTIFY_PRIVACY, 'spotify.com/account/privacy')}, then sign in.</p></div></li>
    <li><span class="n">2</span><div><b>Request Account data and Extended streaming history</b><p>Account data includes roughly the last year of plays. Extended history covers the life of your account, with more detail. You can add either file when it arrives.</p></div></li>
    <li><span class="n">3</span><div><b>Confirm the request by email</b><p>Spotify sends a confirmation link first, then prepares the files. Extended history can take around 30 days.</p></div></li>
    <li><span class="n">4</span><div><b>Drop the ZIP into Sleeve</b><p>No need to unzip it. It's read right here on your device.</p></div></li>
  </ol>`;

function fileFlow() {
  shell({ label: 'Spotify export', body: `
    <h1>Add your Spotify listening history</h1>
    <p class="flow__lede">Spotify's Account Data includes roughly the last year of plays. Extended Streaming History covers your account's lifetime with details such as listening time, skips, shuffle and devices.</p>
    ${dropzone({ big: true, title: 'Drop your Spotify ZIP here', sub: 'or click to choose it. It never leaves your device.' })}
    <div class="panel">
      <div class="panel__head"><h2>Don't have it yet?</h2><span class="label">Takes 2 minutes</span></div>
      ${requestSteps}
    </div>
    <p class="flow__note">Waiting for Spotify? ${'<a href="#/connect/lastfm">Last.fm</a>'} can start recording new plays now. A newly created log won't contain your older Spotify plays.</p>` });
  bindDrops(view(), handleFiles);
}

/* ---------- Spotify direct ---------- */
function spotifyFlow() {
  const onLocalhost = location.hostname === 'localhost';
  const altUrl = `${location.protocol}//127.0.0.1${location.port ? `:${location.port}` : ''}${location.pathname}#/connect/spotify`;
  const connected = spotify.isConnected();
  shell({ label: 'Spotify direct · Advanced', body: `
    <h1>Connect Spotify directly</h1>
    <p class="flow__lede">For enthusiasts. You make your own free Spotify developer app, and Sleeve signs in through it. You get what's playing with live progress, your last 50 plays, Spotify's own top lists, and skip tracking while Sleeve is open.</p>
    ${connected ? `<div class="banner"><span>${icon.check} Spotify is connected in this browser.</span><a class="link" href="#/spotify">Open my stats ${icon.arrow}</a></div>` : ''}
    ${onLocalhost ? `<div class="banner banner--warn"><span>Spotify only accepts <code>127.0.0.1</code> for apps running on your own computer, not <code>localhost</code>.</span><a class="link" href="${altUrl}">Switch to 127.0.0.1</a></div>` : ''}
    <p class="flow__note">You'll need <b>Spotify Premium</b>, which Spotify requires for developer apps. It takes about 5 minutes.</p>
    <ol class="steplist">
      <li><span class="n">1</span><div><b>Open the Spotify developer dashboard</b><p>${ext('https://developer.spotify.com/dashboard', 'developer.spotify.com/dashboard')}. Log in with your normal Spotify account and accept the terms if asked.</p></div></li>
      <li><span class="n">2</span><div><b>Create an app</b><p>Press <b>Create app</b>. The name and description can be anything, like "My Sleeve".</p></div></li>
      <li><span class="n">3</span><div><b>Add this redirect address</b><p>Paste it into <b>Redirect URIs</b> exactly as shown, tick <b>Web API</b>, and save.</p>
        <div class="copyline"><code id="redir">${esc(spotify.redirectUri())}</code><button type="button" class="btn btn--line btn--sm" id="copy-redir">Copy</button></div></div></li>
      <li><span class="n">4</span><div><b>Paste your Client ID</b><p>Open the app's <b>Settings</b> and copy the Client ID.</p>
        <form id="sp-form" class="copyline" novalidate>
          <label class="sr" for="sp-client">Client ID</label>
          <input class="input input--mono" id="sp-client" placeholder="32 letters and numbers" autocomplete="off" spellcheck="false" style="flex:1;min-width:220px" value="${esc(spotify.clientId())}">
          <button class="btn btn--ink" type="submit">Connect Spotify ${icon.arrow}</button>
        </form></div></li>
    </ol>
    <div class="trouble">
      <h3>If Spotify says something went wrong</h3>
      <ol>
        <li><b>"INVALID_CLIENT: Invalid redirect URI"</b> means the address in step 3 doesn't match exactly. Copy it again.</li>
        <li><b>"User not registered"</b> means your account isn't on the app's allowlist. In your app, open <b>User Management</b> and add the email you use for Spotify.</li>
        <li>Spotify changes its developer rules often. If this route stops working, your export and Last.fm still will.</li>
      </ol>
    </div>
    ${connected ? '<div class="flow__actions"><button type="button" class="btn btn--line" id="sp-off">Disconnect Spotify</button></div>' : ''}
    <p class="flow__note">Your sign-in is kept in this browser only. You can also remove access any time at ${ext('https://www.spotify.com/account/apps/', 'spotify.com/account/apps')}.</p>` });

  $('#copy-redir').addEventListener('click', (e) => copy(spotify.redirectUri(), e.currentTarget));
  $('#sp-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#sp-client').value.trim();
    if (!/^[a-f0-9]{32}$/i.test(v)) { toast("That isn't a Client ID. It's 32 letters and numbers, in your app's Settings.", 'bad'); return; }
    spotify.begin(v);
  });
  $('#sp-off')?.addEventListener('click', () => { spotify.disconnect(); profiles.forget('spotify'); toast('Spotify is disconnected.'); go('#/connect/spotify'); });
}
