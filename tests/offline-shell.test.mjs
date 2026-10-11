import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
function worker({ fetch = async () => new Response('ok'), hit, keys = [] } = {}) {
  const handlers = {}, puts = [], deletes = [], pending = [];
  const self = { location: { href: 'https://sleeve.example/sw.js' }, addEventListener: (name, fn) => { handlers[name] = fn; }, clients: { claim() {} } };
  const caches = { match: async () => hit?.clone(), keys: async () => keys, delete: async key => { deletes.push(key); }, open: async () => ({ put: async (request, response) => { puts.push(await response.text()); } }) };
  vm.runInNewContext(script + '\nself.shell = SHELL;', { self, location: { origin: 'https://sleeve.example' }, caches, fetch, URL, Response, Set });
  return { self, puts, deletes, async request(url) { let answer; handlers.fetch({ request: new Request(url), respondWith: promise => { answer = promise; }, waitUntil: promise => pending.push(promise) }); const response = await answer; await Promise.all(pending); return response; }, async activate() { handlers.activate({ waitUntil: promise => pending.push(promise) }); await Promise.all(pending); } };
}
test('a failed shell refresh keeps the working cached module', async () => {
  const service = worker({ fetch: async () => new Response('temporary error', { status: 503 }), hit: new Response('export const healthy = true;') });
  assert.match(await (await service.request('https://sleeve.example/js/app.js')).text(), /healthy/);
  assert.equal(service.puts.length, 0);
});
test('offline cache misses have a readable error and unrelated requests are not intercepted', async () => {
  const service = worker({ fetch: async () => { throw new Error('offline'); } });
  assert.equal((await service.request('https://sleeve.example/js/app.js')).status, 503);
  assert.equal(await service.request('https://sleeve.example/api/ai'), undefined);
  assert.equal(await service.request('https://fonts.googleapis.com.attacker.example/font'), undefined);
  assert.equal(await service.request('https://sleeve.example/private-record.json'), undefined);
});
test('activation preserves caches belonging to other applications', async () => {
  const currentCache = script.match(/const CACHE = '([^']+)'/)[1];
  const service = worker({ keys: ['sleeve-v1', currentCache, 'unrelated-project-cache'] });
  await service.activate();
  assert.deepEqual(service.deletes, ['sleeve-v1']);
});
test('all browser modules and local ZIP support are in the offline shell', () => {
  const service = worker(), shell = new Set(service.self.shell);
  const root = fileURLToPath(new URL('..', import.meta.url));
  const modules = directory => readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? modules(`${directory}/${entry.name}`) : entry.name.endsWith('.js') ? [`./${directory}/${entry.name}`] : []);
  for (const path of modules('js')) assert.ok(shell.has(path), `${path} must work offline`);
  assert.ok(shell.has('./assets/vendor/jszip.min.js'));
  for (const path of shell) if (!path.startsWith('./assets/vendor/')) assert.ok(existsSync(resolve(root, path === './audio-pilot.json' ? './docs/audio-pilot.json' : path)), `${path} must exist in its source location`);
});
