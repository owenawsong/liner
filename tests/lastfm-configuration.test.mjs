import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = { LINER_CONFIG: { lastfmApiKey: '' } };
const source = await import('../js/sources/lastfm.js');

test('an unconfigured live source never substitutes invented user listening', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('should not request'); };
  try {
    for (const run of [() => source.lookup('synthetic'), () => source.profile('synthetic'), () => source.recent('synthetic', 10), () => source.top('synthetic', 'overall', 'artists')]) {
      await assert.rejects(run(), error => error.code === 'nokey' && /not configured/.test(error.message));
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});
test('optional catalogue enrichment can remain empty without a configured source', async () => {
  assert.deepEqual(await source.similar('synthetic'), []);
  assert.deepEqual(await source.artistContext('synthetic'), { tags: [] });
});
