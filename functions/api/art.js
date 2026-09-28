// GET /api/art?q=[["artist","Frank Ocean",""],["album","Blonde","Frank Ocean"],...]
// Looks up artist photos and cover art on Deezer in one batch. Browsers can't call
// Deezer directly (no CORS), so this runs on Cloudflare. Each answer is cached for
// 30 days at the edge, so popular artists cost nothing after the first lookup.

const MAX_ITEMS = 40;
const TTL = 60 * 60 * 24 * 30;

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/\(.*?\)|\[.*?\]| - .*$/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const same = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x)); };

async function deezer(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const r = await fetch(`https://api.deezer.com${path}`, { signal: ctrl.signal, cf: { cacheTtl: TTL, cacheEverything: true } });
    if (!r.ok) return null;
    const d = await r.json();
    return d.error ? null : d.data || [];
  } finally { clearTimeout(timer); }
}

async function lookup([kind, name, artist]) {
  if (kind === 'artist') {
    const list = await deezer(`/search/artist?q=${encodeURIComponent(name)}&limit=5`);
    const hit = list?.find((a) => same(a.name, name));
    return hit && !/\/artist\/\//.test(hit.picture_big) ? hit.picture_big : '';
  }
  if (kind === 'album') {
    const list = await deezer(`/search/album?q=${encodeURIComponent(`artist:"${artist}" album:"${name}"`)}&limit=5`)
      || [];
    const hit = list.find((a) => same(a.artist?.name, artist) && same(a.title, name)) || list.find((a) => same(a.artist?.name, artist));
    return hit?.cover_big || '';
  }
  const list = await deezer(`/search/track?q=${encodeURIComponent(`artist:"${artist}" track:"${name}"`)}&limit=5`) || [];
  const hit = list.find((t) => same(t.artist?.name, artist) && same(t.title, name)) || list.find((t) => same(t.artist?.name, artist));
  return hit?.album?.cover_big || '';
}

export async function onRequestGet({ request, waitUntil }) {
  let items;
  try { items = JSON.parse(new URL(request.url).searchParams.get('q') || '[]'); } catch { items = null; }
  if (!Array.isArray(items) || !items.length || items.length > MAX_ITEMS || !items.every((x) => Array.isArray(x) && ['artist', 'album', 'track'].includes(x[0]))) {
    return Response.json({ error: 'Send up to 40 [kind, name, artist] items in ?q=' }, { status: 400 });
  }
  const cache = caches.default;
  const results = await Promise.all(items.map(async (item) => {
    const key = new Request(`https://liner-art.cache/${item.map((x) => encodeURIComponent(norm(x))).join('/')}`);
    const hit = await cache.match(key);
    if (hit) return hit.text();
    let url = '';
    try { url = await lookup(item); } catch { return ''; }
    waitUntil(cache.put(key, new Response(url, { headers: { 'Cache-Control': `public, max-age=${TTL}` } })));
    return url;
  }));
  return Response.json({ results }, { headers: { 'Cache-Control': 'public, max-age=86400' } });
}
