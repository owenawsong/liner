import test from 'node:test';
import assert from 'node:assert/strict';
import { AIBudget } from '../ai-budget/worker.js';

function budget() {
  const data = new Map();
  const storage = { async transaction(fn) { return fn({
    async get(key) { return data.get(key); },
    async put(key, value) { data.set(key, value); },
  }); } };
  return new AIBudget({ storage });
}

test('the shared OpenRouter budget admits 19 attempts per minute', async () => {
  const limiter = budget();
  const request = new Request('https://budget.internal/take', { method: 'POST' });
  for (let i = 0; i < 19; i++) assert.equal((await limiter.fetch(request)).status, 200);
  const denied = await limiter.fetch(request);
  assert.equal(denied.status, 429);
  assert.ok(Number(denied.headers.get('Retry-After')) > 0);
});

test('the shared budget stops at 900 attempts in a UTC day', async () => {
  const originalNow = Date.now;
  let now = Date.parse('2026-09-29T00:00:00Z');
  Date.now = () => now;
  try {
    const limiter = budget();
    const request = new Request('https://budget.internal/take', { method: 'POST' });
    for (let i = 0; i < 900; i++) {
      assert.equal((await limiter.fetch(request)).status, 200);
      now += 65_000;
    }
    assert.equal((await limiter.fetch(request)).status, 429);
    now = Date.parse('2026-09-30T00:00:00Z');
    assert.equal((await limiter.fetch(request)).status, 200);
  } finally { Date.now = originalNow; }
});
