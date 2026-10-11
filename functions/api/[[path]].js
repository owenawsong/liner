// A real API catch-all ensures Pages invokes the API middleware for unknown
// paths instead of resolving them to index.html with a successful HTML status.
export function onRequest() {
  return Response.json({ error: 'Unknown API route.' }, { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin' } });
}
