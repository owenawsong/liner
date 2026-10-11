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

test('visitor limits persist across requests without blocking another visitor', async () => {
  const limiter = budget();
  const visitor = 'a'.repeat(64), other = 'b'.repeat(64);
  const request = key => new Request('https://budget.internal/take', { method:'POST',headers:{'X-Sleeve-Visitor':key} });
  for(let i=0;i<12;i++) assert.equal((await limiter.fetch(request(visitor))).status,200);
  assert.equal((await limiter.fetch(request(visitor))).status,429);
  assert.equal((await limiter.fetch(request(other))).status,200);
  assert.equal((await limiter.fetch(request('raw ip or listening summary'))).status,400);
});

test('visitor daily attempts reset at UTC rollover and failed admission consumes no slot', async () => {
  const originalNow = Date.now; let now=Date.parse('2026-10-10T00:00:00Z'); Date.now=()=>now;
  try {
    const limiter=budget();
    const request=()=>new Request('https://budget.internal/take',{method:'POST',headers:{'X-Sleeve-Visitor':'c'.repeat(64)}});
    for(let i=0;i<60;i++){assert.equal((await limiter.fetch(request())).status,200);now+=601_000;}
    const denied=await limiter.fetch(request());assert.equal(denied.status,429);assert.ok(Number(denied.headers.get('Retry-After'))>0);
    now=Date.parse('2026-10-11T00:00:00Z');assert.equal((await limiter.fetch(request())).status,200);
  } finally {Date.now=originalNow;}
});

test('idle visitor counters expire without deleting a newly active daily budget', async () => {
  const data=new Map([['counter',{day:'2000-01-01',visitors:{synthetic:{count:1}}}]]);
  const limiter=new AIBudget({storage:{get:async key=>data.get(key),delete:async key=>data.delete(key)}});
  await limiter.alarm();assert.equal(data.has('counter'),false);
  data.set('counter',{day:new Date().toISOString().slice(0,10),dayCount:3});
  await limiter.alarm();assert.equal(data.get('counter').dayCount,3);
});
