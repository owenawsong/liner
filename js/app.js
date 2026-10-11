import { $, $$, esc, avatar, store, toast } from './ui.js';
import { SOURCES, view, leave, go, pidFor, hrefFor, profiles, state } from './core.js';
import { renderHome } from './views/home.js';
import { renderConnect } from './views/connect.js';
import { renderProfile } from './views/profile.js';
import { renderCompare } from './views/compare.js';
import { renderStart } from './views/start.js';
import { renderSettings, renderPrivacy } from './views/settings.js';
import { themeButtons, setTheme } from './theme.js';
import { handleFiles } from './actions.js';
import * as lastfm from './sources/lastfm.js';
import * as spotify from './sources/spotify.js';
import { hydrate } from './meta.js';

/* ---------- Router ---------- */
let lastPid = null;
let routeSeq = 0;
async function route() {
  const seq = ++routeSeq;
  leave();
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  const [a, b, c, d] = parts;
  document.body.dataset.page = ['u', 'demo', 'file', 'spotify'].includes(a) ? 'profile' : (a || 'home');
  $('#mobile-menu').hidden = true;
  $('#menu-btn').setAttribute('aria-expanded', 'false');
  $('#menu-btn').setAttribute('aria-label', 'Open menu');
  let pid = null;
  try {
    if (!a) await renderHome();
    else if (a === 'demo' || a === 'file' || a === 'spotify') { pid = a; await renderProfile({ pid: a, source: a, tab: b, args: parts.slice(2) }); }
    else if (a === 'u' && SOURCES[b] && c) { pid = pidFor(b, c); await renderProfile({ pid, source: b, name: c, tab: d, args: parts.slice(4) }); }
    else if (a === 'start') renderStart(b || '');
    else if (a === 'settings') renderSettings();
    else if (a === 'privacy') renderPrivacy();
    else if (a === 'compare') renderCompare(b, c || '', d || '');
    else if (a === 'connect') renderConnect(b || 'lastfm', Number(c) || 1);
    else if (a === 'setup') renderConnect('lastfm', Number(b) || 1);
    else if (a === 'history') go('#/connect/file');
    else await renderHome();
  } catch (e) {
    if (seq !== routeSeq) return;
    console.error(e);
    view().innerHTML = `<div class="wrap"><div class="flow"><span class="label">Error</span><h1>Something broke on this page</h1><p class="flow__lede">${esc(e.message)}</p><div class="flow__actions"><a class="btn btn--ink" href="#/">Back to start</a></div></div></div>`;
  }
  if (seq !== routeSeq) return;
  if (state.scrollTo) {
    const target = document.getElementById(state.scrollTo);
    state.scrollTo = null;
    if (target) { target.scrollIntoView({ behavior: 'smooth' }); lastPid = pid; return; }
  }
  const tabs = $('.tabs');
  if (pid && pid === lastPid && tabs) {
    const nav = tabs.closest('.profile-nav');
    const tabHeight = nav && getComputedStyle(nav).position === 'sticky' ? nav.getBoundingClientRect().height : 0;
    // Measure the normal-flow content, not the visually stuck navigation.
    const y = Math.max(0, $('#tab').getBoundingClientRect().top + scrollY - $('#nav').getBoundingClientRect().height - tabHeight);
    if (scrollY > y) scrollTo(0, y);
  } else {
    scrollTo(0, 0);
  }
  lastPid = pid;
  updateNavUser();
  view().focus({ preventScroll: true });
}

/* ---------- Header ---------- */
function updateNavUser() {
  const el = $('#nav-user');
  const p = profiles.list()[0];
  const onProfile = /^#\/(u|demo|file|spotify)/.test(location.hash);
  el.innerHTML = p && !onProfile
    ? `<a class="nav__user" href="${hrefFor(p.pid)}">${avatar(p.display, p.image, 26)}<span>${esc(p.display)}</span></a>`
    : (onProfile ? '<a class="nav__user" href="#/settings">Settings</a>' : '<a class="btn btn--ink btn--sm" href="#/start">Get started</a>');
}

addEventListener('scroll', () => $('#nav').classList.toggle('is-stuck', scrollY > 4), { passive: true });

document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-scroll]');
  if (!a) return;
  e.preventDefault();
  const id = a.dataset.scroll;
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
  else { state.scrollTo = id; go('#/'); }
});

/* ---------- Themes ---------- */
function initThemes() {
  const pop = $('#theme-pop'), btn = $('#theme-btn');
  const draw = () => { $('#themes').innerHTML = themeButtons(); };
  const close = () => { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; btn.setAttribute('aria-expanded', String(!pop.hidden)); if (!pop.hidden) draw(); });
  document.addEventListener('click', (e) => { if (!pop.hidden && !pop.contains(e.target) && e.target !== btn) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) { close(); btn.focus(); } });
  pop.addEventListener('click', (e) => {
    const t = e.target.closest('[data-t]');
    if (!t) return;
    setTheme(t.dataset.t);
    draw();
  });
}

function initMenu() {
  const btn = $('#menu-btn'), menu = $('#mobile-menu');
  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', 'Open menu'); };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    btn.setAttribute('aria-expanded', String(!menu.hidden));
    btn.setAttribute('aria-label', menu.hidden ? 'Open menu' : 'Close menu');
  });
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target !== btn) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { close(); btn.focus(); } });
  addEventListener('resize', () => { if (innerWidth > 760 && !menu.hidden) close(); });
}

function updateStatus() {
  $('#source-status').textContent = lastfm.isLive() ? '' : 'Last.fm is not configured · Demo and file imports are available';
}

/* ---------- Drop a Spotify export anywhere ---------- */
function initDrop() {
  const veil = $('#dropveil');
  let depth = 0;
  const hasFiles = (e) => e.dataTransfer?.types?.includes('Files');
  addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; depth++; veil.hidden = false; });
  addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) veil.hidden = true; });
  addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  addEventListener('drop', (e) => {
    depth = 0; veil.hidden = true;
    if (!e.dataTransfer?.files.length) return;
    e.preventDefault();
    handleFiles(e.dataTransfer.files, null);
  });
}

/* ---------- Boot ---------- */
async function boot() {
  document.addEventListener('error', event => {
    const image = event.target;
    if (image?.tagName === 'IMG' && image.closest('.sleeve, .avatar')) image.remove();
  }, true);
  $('.skip').addEventListener('click', (event) => {
    event.preventDefault();
    view().focus({ preventScroll: true });
    view().scrollIntoView({ behavior: 'instant' });
  });
  initThemes();
  initMenu();
  initDrop();
  updateStatus();
  const cb = await spotify.handleCallback();
  if (cb?.error) { toast(cb.error, 'bad'); history.replaceState(null, '', `${location.pathname}#/connect/spotify`); }
  if (cb?.ok) toast('Spotify is connected.');
  addEventListener('hashchange', route);
  // Fill in real cover art whenever new sleeves appear.
  let pending = 0;
  new MutationObserver(() => { cancelAnimationFrame(pending); pending = requestAnimationFrame(() => hydrate(view())); }).observe(view(), { childList: true, subtree: true });
  route();
}
boot();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
}
