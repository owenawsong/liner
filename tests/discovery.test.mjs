import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.location = { protocol: 'http:', hostname: 'localhost' };
globalThis.window = {};
const { discoverySeeds } = await import('../js/discovery.js');

test('a recently saved unheard artist becomes a seed on the next rebuild', () => {
  const now = Date.now();
  const A = { to: now, rows: [{ t: now - 864e5, artist: 'Old favorite' }],
    artists: Array.from({ length: 24 }, (_, i) => ({ name: `Artist ${i}` })) };
  const taste = { items: { 'artist:|new favorite': {
    kind: 'artist', name: 'New Favorite', status: 'saved', updated: now,
  } } };
  assert.ok(discoverySeeds(A, taste).some((seed) => seed.name === 'New Favorite'));
});
