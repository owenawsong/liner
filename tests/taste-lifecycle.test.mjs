import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.location = { protocol: 'http:', hostname: 'localhost' };
globalThis.window = {};
const { idb } = await import('../js/ui.js');
const { getTaste, setTasteItem, clearTaste, tasteKey } = await import('../js/taste.js');

test('removing a profile waits for an in-flight rating and leaves no saved shelf', async () => {
  const original = { get: idb.get, set: idb.set, del: idb.del }, records = new Map();
  let releaseWrite, announceWrite;
  const started = new Promise(resolve => { announceWrite = resolve; });
  const gate = new Promise(resolve => { releaseWrite = resolve; });
  idb.get = async key => records.get(key);
  idb.set = async (key, value) => { announceWrite(); await gate; records.set(key, value); return true; };
  idb.del = async key => records.delete(key);
  const pid = 'test:remove-pending-rating';
  try {
    const save = setTasteItem(pid, { kind: 'album', name: 'Record', artist: 'Artist' }, { rating: 5 });
    await started;
    const removal = clearTaste(pid);
    releaseWrite();
    await Promise.all([save, removal]);
    assert.equal(records.has(`taste:${pid}`), false);
    assert.deepEqual((await getTaste(pid)).items, {});
    await setTasteItem(pid, { kind: 'album', name: 'Another record', artist: 'Artist' }, { rating: 4 });
    assert.equal((await getTaste(pid)).items[tasteKey('album', 'Another record', 'Artist')].rating, 4);
  } finally {
    releaseWrite();
    await clearTaste(pid);
    Object.assign(idb, original);
  }
});

test('a delayed read cannot restore ratings after a profile is removed', async () => {
  const original = { get: idb.get, del: idb.del };
  let releaseRead, announceRead;
  const started = new Promise(resolve => { announceRead = resolve; });
  const gate = new Promise(resolve => { releaseRead = resolve; });
  let first = true, deleted = false;
  idb.get = async () => {
    if (first) { first = false; announceRead(); await gate; return { version: 1, items: { old: { rating: 5 } } }; }
    return undefined;
  };
  idb.del = async () => { deleted = true; };
  const pid = 'test:remove-pending-read';
  try {
    const loading = getTaste(pid);
    await started;
    await clearTaste(pid);
    releaseRead();
    assert.deepEqual((await loading).items, {});
    assert.equal(deleted, true);
  } finally {
    releaseRead();
    await clearTaste(pid);
    Object.assign(idb, original);
  }
});
