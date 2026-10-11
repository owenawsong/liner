// Things that change stored data: adding an export, importing a live history.
import { toast, num, monthYear } from './ui.js';
import { readExport } from './export.js';
import { state, getArchive, setArchive, go, hrefFor, profiles, SOURCES, dedupe } from './core.js';

let importingFile = false;
export async function handleFiles(files, el) {
  if (importingFile) { toast('A file is already being added. Please wait.'); return; }
  importingFile = true;
  const label = el?.querySelector('[data-label]');
  const original = label?.textContent;
  el?.classList.add('is-busy');
  el?.setAttribute('aria-busy', 'true');
  const status = document.createElement('div');
  status.className = 'import-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.innerHTML = '<span class="import-status__dot" aria-hidden="true"></span><span>Opening your listening history…</span>';
  document.body.append(status);
  try {
    const ex = await readExport(files, (msg) => {
      if (label) label.textContent = `${msg}…`;
      status.lastElementChild.textContent = `${msg}…`;
    });
    const pid = state.pid && state.pid !== 'demo' ? state.pid : 'file';
    const a = { ...await getArchive(pid) };
    a.export = ex;
    await setArchive(pid, a);
    if (pid === 'file') profiles.remember({ pid: 'file', source: 'file', display: 'Spotify export', image: '' });
    toast(`Added ${num(ex.rows.length)} plays, ${monthYear(ex.from)} to ${monthYear(ex.to)}.`);
    go(hrefFor(pid));
  } catch (e) {
    toast(e.message, 'bad');
  } finally {
    el?.classList.remove('is-busy');
    el?.removeAttribute('aria-busy');
    if (label) label.textContent = original;
    status.remove();
    importingFile = false;
  }
}

// Pull someone's whole history from Last.fm or ListenBrainz. Only fetches new plays if we have some.
export async function importHistory(pid, sourceId, name, { onProgress, signal } = {}) {
  const src = SOURCES[sourceId];
  const before = await getArchive(pid);
  const since = before.live?.source === sourceId ? before.live.to || 0 : 0;
  const rows = await src.importAll(name, { onProgress, signal, since, pid });
  onProgress?.(rows.length, rows.length, 'saving');
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  // An export can be added while a long live import is running. Read the
  // newest archive now so saving the live rows does not erase that export.
  const a = { ...await getArchive(pid) };
  const all = a.live?.source === sourceId ? dedupe([...(a.live.rows || []), ...rows]) : rows;
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  a.live = { rows: all, source: sourceId, from: all[0]?.t, to: all[all.length - 1]?.t, synced: Date.now() };
  await setArchive(pid, a);
  if (sourceId === 'lastfm') await src.clearCheckpoint(pid);
  return rows.length;
}

// Spotify only exposes the last 50 plays, so keep every batch we see.
export async function keepSpotifyPlays(rows) {
  if (!rows?.length) return;
  const a = { ...await getArchive('spotify') };
  const all = dedupe([...(a.live?.rows || []), ...rows]);
  if (all.length === (a.live?.rows?.length || 0)) return;
  a.live = { rows: all, source: 'spotify', from: all[0]?.t, to: all[all.length - 1]?.t, synced: Date.now() };
  await setArchive('spotify', a);
}
