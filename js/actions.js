// Things that change stored data: adding an export, importing a live history.
import { toast, num, monthYear } from './ui.js';
import { readExport } from './export.js';
import { state, getArchive, setArchive, go, hrefFor, profiles, SOURCES, dedupe } from './core.js';

export async function handleFiles(files, el) {
  const label = el?.querySelector('[data-label]');
  const original = label?.textContent;
  el?.classList.add('is-busy');
  try {
    const ex = await readExport(files, (msg) => { if (label) label.textContent = `${msg}…`; });
    const pid = state.pid && state.pid !== 'demo' ? state.pid : 'file';
    const a = await getArchive(pid);
    a.export = ex;
    await setArchive(pid, a);
    if (pid === 'file') profiles.remember({ pid: 'file', source: 'file', display: 'Spotify export', image: '' });
    toast(`Added ${num(ex.rows.length)} plays, ${monthYear(ex.from)} to ${monthYear(ex.to)}.`);
    go(hrefFor(pid, 'timeline'));
  } catch (e) {
    toast(e.message, 'bad');
  } finally {
    el?.classList.remove('is-busy');
    if (label) label.textContent = original;
  }
}

// Pull someone's whole history from Last.fm or ListenBrainz. Only fetches new plays if we have some.
export async function importHistory(pid, sourceId, name, { onProgress, signal } = {}) {
  const src = SOURCES[sourceId];
  const a = await getArchive(pid);
  const since = a.live?.source === sourceId ? a.live.to || 0 : 0;
  const rows = await src.importAll(name, { onProgress, signal, since });
  const all = since ? dedupe([...(a.live.rows || []), ...rows]) : rows;
  a.live = { rows: all, source: sourceId, from: all[0]?.t, to: all[all.length - 1]?.t, synced: Date.now() };
  await setArchive(pid, a);
  return rows.length;
}

// Spotify only exposes the last 50 plays, so keep every batch we see.
export async function keepSpotifyPlays(rows) {
  if (!rows?.length) return;
  const a = await getArchive('spotify');
  const all = dedupe([...(a.live?.rows || []), ...rows]);
  if (all.length === (a.live?.rows?.length || 0)) return;
  a.live = { rows: all, source: 'spotify', from: all[0]?.t, to: all[all.length - 1]?.t, synced: Date.now() };
  await setArchive('spotify', a);
}
