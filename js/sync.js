// A listening-history import belongs to the browser tab, not to a profile view.
// People can explore Sleeve while a large Last.fm history is being prepared.
import { importHistory } from './actions.js';
import { state, rerender } from './core.js';

const jobs = new Map();
const attempted = new Set();
const listeners = new Map();

export const syncStatus = (pid) => jobs.get(pid) || null;

function publish(pid) {
  const job = jobs.get(pid);
  listeners.get(pid)?.forEach((fn) => fn(job));
}

export function watchSync(pid, fn) {
  if (!listeners.has(pid)) listeners.set(pid, new Set());
  listeners.get(pid).add(fn);
  fn(syncStatus(pid));
  return () => {
    listeners.get(pid)?.delete(fn);
    if (!listeners.get(pid)?.size) listeners.delete(pid);
  };
}

export function startSync(pid, source, name, { automatic = false } = {}) {
  const existing = jobs.get(pid);
  if (existing?.state === 'running') return existing;
  if (automatic && attempted.has(pid)) return existing;
  attempted.add(pid);
  const controller = new AbortController();
  const job = { state: 'running', automatic, done: 0, total: 0, controller, error: '', added: 0 };
  jobs.set(pid, job);
  publish(pid);
  job.promise = importHistory(pid, source, name, {
    signal: controller.signal,
    onProgress(done, total, phase) { job.done = done; job.total = total; job.phase = phase || 'reading'; publish(pid); },
  }).then(async (added) => {
    job.state = 'done'; job.added = added;
    publish(pid);
    if (state.pid === pid) rerender();
    return added;
  }).catch((error) => {
    job.state = error.name === 'AbortError' ? 'cancelled' : 'error';
    job.error = error.message || 'Could not finish reading your history.';
    publish(pid);
    return null;
  });
  return job;
}

export async function cancelSync(pid) {
  const job = syncStatus(pid);
  if (job?.state !== 'running') return;
  job.controller.abort();
  await job.promise;
}
export async function cancelAllSync() {
  await Promise.all([...jobs.keys()].map(cancelSync));
}
export async function forgetSync(pid){await cancelSync(pid);jobs.delete(pid);attempted.delete(pid);}

export function autoSync({ pid, source, name, p, archive }) {
  if (source !== 'lastfm' || p.simulated || p.hidden || !p.user.playcount) return;
  if (archive.live?.source === source && Date.now() - (archive.live.synced || 0) < 6 * 3600e3) return;
  if (attempted.has(pid)) return;
  setTimeout(() => { if (!attempted.has(pid)) startSync(pid, source, name, { automatic: true }); }, 0);
}
