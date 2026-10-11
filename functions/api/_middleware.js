const routes = new Map([['/api/ai', 'POST'], ['/api/art', 'GET']]);
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin' };

// Keep missing API routes and unsupported methods out of the SPA fallback.
export async function onRequest({ request, next }) {
  const path = new URL(request.url).pathname.replace(/\/$/, '');
  const method = routes.get(path);
  if (!method) return Response.json({ error: 'Unknown API route.' }, { status: 404, headers });
  if (request.method !== method) return Response.json({ error: 'Method not allowed.' }, { status: 405, headers: { ...headers, Allow: method } });
  return next();
}
