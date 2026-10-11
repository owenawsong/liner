// Explicit listening preferences. Plays and skips never become ratings here.
import { idb } from './ui.js';

const cache = new Map();
const writes = new Map();
const generations = new Map();
export const tasteKey = (kind, name, artist = '') => `${kind}:${normalize(artist)}|${normalize(name)}`;
export const normalize = (name) => String(name || '').replace(/\$/g, 's').replace(/[+&]/g, ' and ').toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export async function getTaste(pid) {
  if (!cache.has(pid)) {
    const generation = generations.get(pid) || 0;
    await (writes.get(pid) || Promise.resolve()).catch(() => {});
    const saved = await idb.get(`taste:${pid}`);
    if (generation !== (generations.get(pid) || 0)) return getTaste(pid);
    cache.set(pid, saved?.version === 1 && saved.items && typeof saved.items === 'object'
      ? saved : { version: 1, items: {} });
  }
  return cache.get(pid);
}

function persist(pid, taste, generation = generations.get(pid) || 0) {
  const snapshot = structuredClone(taste);
  const pending = (writes.get(pid) || Promise.resolve()).catch(() => {}).then(async () => {
    if (generation !== (generations.get(pid) || 0)) return;
    if (!await idb.set(`taste:${pid}`, snapshot)) throw new Error('Could not save your ratings in this browser. Check available storage.');
  });
  writes.set(pid, pending);
  return pending;
}

export async function setTasteItem(pid, item, patch) {
  const generation = generations.get(pid) || 0;
  const taste = await getTaste(pid);
  if (generation !== (generations.get(pid) || 0)) throw new Error('This saved shelf was removed. Open the profile again before rating.');
  const key = tasteKey(item.kind, item.name, item.artist);
  const old = taste.items[key] || {};
  const next = { ...old, kind: item.kind, name: item.name, artist: item.artist || '',
    mbid: item.mbid || old.mbid || '', ...patch, updated: Date.now() };
  if (next.rating != null) next.rating = Math.max(1, Math.min(5, Number(next.rating) || 1));
  if (next.note != null) next.note = String(next.note).slice(0, 800);
  taste.items[key] = next;
  await persist(pid, taste, generation);
  return next;
}

export function tasteExport(taste) {
  return { format: 'sleeve-taste-v1', exported: new Date().toISOString(),
    items: Object.values(taste.items).filter((x) => x.status || x.rating || x.note) };
}

export async function importTaste(pid, input) {
  if (input?.format !== 'sleeve-taste-v1' || !Array.isArray(input.items) || input.items.length > 10000)
    throw new Error('This is not a Sleeve ratings file.');
  const generation = generations.get(pid) || 0;
  const taste = await getTaste(pid);
  if (generation !== (generations.get(pid) || 0)) throw new Error('This saved shelf was removed. Open the profile again before importing.');
  let added = 0;
  for (const row of input.items) {
    if (!['album', 'artist'].includes(row?.kind) || typeof row.name !== 'string' || !row.name.trim()) continue;
    const name = row.name.trim().slice(0, 200), artist = String(row.artist || '').trim().slice(0, 200);
    const key = tasteKey(row.kind, name, artist);
    if (!key || !['', 'saved', 'known', 'hidden'].includes(row.status || '')) continue;
    const rating = row.rating == null ? null : Number(row.rating);
    taste.items[key] = { kind: row.kind, name, artist, mbid: String(row.mbid || '').slice(0, 40),
      status: row.status || '', rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : null,
      note: String(row.note || '').slice(0, 800), updated: Date.now() };
    added++;
  }
  await persist(pid, taste, generation);
  return added;
}

export async function clearTaste(pid) {
  generations.set(pid, (generations.get(pid) || 0) + 1);
  cache.delete(pid);
  const removal = (writes.get(pid) || Promise.resolve()).catch(() => {}).then(() => idb.del(`taste:${pid}`));
  writes.set(pid, removal);
  await removal;
  if (writes.get(pid) === removal) writes.delete(pid);
}
