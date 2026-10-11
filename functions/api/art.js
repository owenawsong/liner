// GET /api/art?q=[["artist","Frank Ocean",""],["album","Blonde","Frank Ocean"],...]
// Looks up artist photos and cover art on Deezer in one batch. Browsers can't call
// Deezer directly (no CORS), so this runs on Cloudflare. Each answer is cached for
// 30 days at the edge, so popular artists cost nothing after the first lookup.

const MAX_ITEMS = 40;
const TTL = 60 * 60 * 24 * 30;
const HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin' };

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const same = (a, b) => { const x = norm(a), y = norm(b); return !!x && x === y; };
const imageURL = (value) => {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && u.hostname.endsWith('.dzcdn.net') ? u.href : ''; }
  catch { return ''; }
};

async function deezer(path, signal) {
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) ctrl.abort();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const r = await fetch(`https://api.deezer.com${path}`, { signal: ctrl.signal, cf: { cacheTtl: TTL, cacheEverything: true } });
    if (!r.ok) throw new Error('Artwork source unavailable');
    const d = await r.json();
    if (d.error || !Array.isArray(d.data)) throw new Error('Artwork source unavailable');
    return d.data;
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
}

async function lookup([kind, name, artist], signal) {
  if (kind === 'artist') {
    const list = await deezer(`/search/artist?q=${encodeURIComponent(name)}&limit=5`, signal);
    const hit = list?.find((a) => same(a.name, name));
    return hit && !/\/artist\/\//.test(hit.picture_big) ? imageURL(hit.picture_big) : '';
  }
  if (kind === 'album') {
    const list = await deezer(`/search/album?q=${encodeURIComponent(`artist:"${artist}" album:"${name}"`)}&limit=5`, signal)
      || [];
    const hit = list.find((a) => same(a.artist?.name, artist) && same(a.title, name));
    return imageURL(hit?.cover_big);
  }
  const list = await deezer(`/search/track?q=${encodeURIComponent(`artist:"${artist}" track:"${name}"`)}&limit=5`, signal) || [];
  const hit = list.find((t) => same(t.artist?.name, artist) && same(t.title, name));
  return imageURL(hit?.album?.cover_big);
}

export async function onRequestGet({ request, waitUntil }) {
  let items;
  const raw = new URL(request.url).searchParams.get('q') || '[]';
  if (raw.length > 18000) return Response.json({ error: 'Artwork request too large.' }, { status: 413, headers: { ...HEADERS, 'Cache-Control': 'no-store' } });
  try { items = JSON.parse(raw); } catch { items = null; }
  const field = s => typeof s === 'string' && s.length <= 200 && !/\p{Cc}/u.test(s);
  if (!Array.isArray(items) || !items.length || items.length > MAX_ITEMS || !items.every((x) => Array.isArray(x) && x.length === 3 && ['artist', 'album', 'track'].includes(x[0]) && field(x[1]) && x[1].trim() && field(x[2]) && (x[0] === 'artist' || x[2].trim()))) {
    return Response.json({ error: 'Send up to 40 [kind, name, artist] items; album and track items require an artist.' }, { status: 400, headers: { ...HEADERS, 'Cache-Control': 'no-store' } });
  }
  const cache = caches.default;
  const pending = new Map(), ctrl = new AbortController(), deadline = setTimeout(() => ctrl.abort(), 9000);
  let cursor = 0;
  const results = new Array(items.length);
  async function resolve(item) {
    const key = new Request(`https://liner-art.cache/v3/${item.map((x) => encodeURIComponent(norm(x))).join('/')}`);
    const hit = await cache.match(key);
    if (hit) return hit.text();
    if (ctrl.signal.aborted) return null;
    let url;
    try { url = await lookup(item, ctrl.signal); } catch { return null; }
    waitUntil?.(cache.put(key, new Response(url, { headers: { 'Cache-Control': `public, max-age=${url ? TTL : 86400}` } })).catch(() => {}));
    return url;
  }
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++, item = items[i], key = item.map(norm).join('\u0000');
      if (!pending.has(key)) pending.set(key, resolve(item));
      results[i] = await pending.get(key);
    }
  }
  try { await Promise.all(Array.from({ length: Math.min(4, items.length) }, worker)); }
  finally { clearTimeout(deadline); }
  return Response.json({ results }, { headers: { ...HEADERS, 'Cache-Control': results.includes(null) ? 'no-store' : 'public, max-age=86400' } });
}
