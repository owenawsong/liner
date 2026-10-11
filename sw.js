// Sleeve service worker: keeps the app shell available offline.
// Live data (Last.fm, ListenBrainz, Spotify, artwork) always goes to the network.
const CACHE = 'sleeve-v6';
const SHELL = [
  './', './index.html', './styles.css', './sleeve.css', './profile.css', './welcome.css', './journey.css', './discover.css', './analysis.css', './audio.css', './js/profile-nav.js', './js/color.js', './js/theme.js', './js/views/start.js', './js/views/settings.js', './config.js', './manifest.webmanifest', './assets/mark.svg',
  './js/app.js', './js/ui.js', './js/core.js', './js/components.js', './js/analysis.js', './js/export.js', './js/actions.js', './js/meta.js', './js/ai.js', './js/sync.js', './js/evolution.js', './js/patterns.js', './js/taste.js', './js/discovery.js',
  './js/questions.js', './js/dossier.js', './js/findings.js', './js/filters.js', './js/audio-coverage.js', './js/preparation.js', './js/recommendations.js', './js/analysis-worker.js',
  './js/views/home.js', './js/views/connect.js', './js/views/profile.js', './js/views/detail.js', './js/views/aiviews.js', './js/views/filters.js', './js/views/audio.js', './js/views/compare.js', './js/views/mainstream.js', './js/views/discover.js', './js/views/evolution.js', './js/views/patterns.js',
  './js/sources/demo.js', './js/sources/lastfm.js', './js/sources/listenbrainz.js', './js/sources/spotify.js', './js/theme-init.js', './assets/vendor/jszip.min.js', './assets/icon-192.png', './assets/icon-512.png', './assets/apple-touch-icon.png', './audio-pilot.json',
];
const SHELL_PATHS = new Set(SHELL.map(path => new URL(path, self.location.href).pathname));
const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('sleeve-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Same-origin files: network first so updates show up, cache as the fallback.
// Fonts: cache first. ZIP reading is bundled in the same-origin shell.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;
  const cacheable = url.origin === location.origin ? SHELL_PATHS.has(url.pathname) : FONT_HOSTS.has(url.hostname);
  if (!cacheable) return;
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request).then(async (res) => {
      if (!res.ok) return (await caches.match(e.request, { ignoreSearch: true })) || res;
      if (res.ok) { const copy = res.clone(); e.waitUntil(caches.open(CACHE).then((c) => c.put(e.request, copy))); }
      return res;
    }).catch(async () => (await caches.match(e.request, { ignoreSearch: true })) || new Response('This part of Sleeve is not available offline yet. Reconnect and reload.', { status: 503, headers: { 'Content-Type': 'text/plain' } })));
  } else {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); e.waitUntil(caches.open(CACHE).then((c) => c.put(e.request, copy))); }
      return res;
    })));
  }
});
