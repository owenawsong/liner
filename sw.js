// Sleeve service worker: keeps the app shell available offline.
// Live data (Last.fm, ListenBrainz, Spotify, artwork) always goes to the network.
const CACHE = 'sleeve-v3';
const SHELL = [
  './', './index.html', './styles.css', './sleeve.css', './js/color.js', './js/theme.js', './js/views/start.js', './js/views/settings.js', './config.js', './manifest.webmanifest', './assets/mark.svg',
  './js/app.js', './js/ui.js', './js/core.js', './js/components.js', './js/analysis.js', './js/export.js', './js/actions.js', './js/meta.js', './js/ai.js', './js/sync.js', './js/evolution.js', './js/patterns.js', './js/taste.js', './js/discovery.js',
  './js/questions.js', './js/dossier.js', './js/preparation.js', './js/recommendations.js', './js/analysis-worker.js',
  './js/views/home.js', './js/views/connect.js', './js/views/profile.js', './js/views/detail.js', './js/views/aiviews.js', './js/views/compare.js', './js/views/mainstream.js', './js/views/discover.js', './js/views/evolution.js', './js/views/patterns.js',
  './js/sources/demo.js', './js/sources/lastfm.js', './js/sources/listenbrainz.js', './js/sources/spotify.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Same-origin files: network first so updates show up, cache as the fallback.
// Fonts and the ZIP library: cache first.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;
  const cacheable = url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/.test(url.host);
  if (!cacheable) return;
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })));
  } else {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    })));
  }
});
