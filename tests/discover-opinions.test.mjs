import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.location = { protocol: 'http:', hostname: 'localhost' };
globalThis.window = {};
const { ratingsReviewsHTML, shelfImportPreview } = await import('../js/views/discover.js');
const { tasteKey } = await import('../js/taste.js');

test('community scores need valid values and enough votes, and never imply an imported AOTY score', () => {
  const group = { id: 'matched-release', rating: 4.2, votes: 20 };
  assert.match(ratingsReviewsHTML('Album', 'Artist', group), /4\.2\/5 · 20 ratings/);
  for (const rating of [null, NaN, Infinity, -1, 6]) {
    assert.doesNotMatch(ratingsReviewsHTML('Album', 'Artist', { ...group, rating }), /\/5/);
  }
  assert.doesNotMatch(ratingsReviewsHTML('Album', 'Artist', { ...group, votes: 19 }), /\/5/);
  const html = ratingsReviewsHTML('Album', 'Artist', group, 2);
  assert.match(html, /Search Album of the Year/);
  assert.match(html, /Search Rate Your Music/);
  assert.match(html, /their scores are not imported/);
  assert.match(html, /2 written reviews/);
});

test('backup preview counts unique additions and replacements without changing the existing shelf', () => {
  const existing = { kind: 'album', name: 'Album', artist: 'Artist', rating: 2 };
  const taste = { items: { [tasteKey('album', 'Album', 'Artist')]: existing } };
  const before = structuredClone(taste);
  const preview = shelfImportPreview({ format: 'sleeve-taste-v1', items: [
    { ...existing, rating: 5 }, { ...existing, rating: 4 },
    { kind: 'album', name: 'Another album', artist: 'Artist', status: 'saved' },
    { kind: 'unsupported', name: 'Discarded' },
  ] }, taste);
  assert.equal(preview.added, 1);
  assert.equal(preview.replaced, 1);
  assert.equal(preview.total, 2);
  assert.equal(preview.input.items[0].rating, 4);
  assert.deepEqual(taste, before);
  assert.throws(() => shelfImportPreview({ format: 'aoty-export', items: [] }, taste), /Sleeve shelf backup/);
});
