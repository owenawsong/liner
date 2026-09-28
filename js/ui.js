export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function hash(str) {
  let h = 2166136261;
  for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function initials(text) {
  const words = String(text || '?').replace(/^the\s+/i, '').split(/[\s\-_.,]+/).filter(Boolean);
  return (words.slice(0, 2).map((w) => [...w][0]).join('') || '?').toUpperCase();
}

/* ---------- Generated record sleeves ----------
   Flat two-colour covers with one simple shape, picked from a fixed palette,
   so a missing cover still looks like it was designed. */
const INKS = ['#E9E4D8', '#16305C', '#D2512F', '#EDB93B', '#2C6B55', '#7E3F6F', '#141414', '#5877B4', '#D9A69C', '#3A3A38', '#9DB08A', '#C8CFD6'];
const PAIRS = [[1, 0], [6, 3], [0, 2], [4, 0], [7, 11], [5, 8], [3, 6], [2, 1], [9, 10], [11, 1], [8, 6], [0, 6], [10, 4], [1, 3], [6, 2], [0, 7]];

export function sleeveSvg(key) {
  const h = hash(key);
  const [a, b] = PAIRS[h % PAIRS.length].map((i) => INKS[i]);
  const v = (h >> 5) % 7;
  const r = (n) => ((h >> (n * 3)) % 7);
  let shape;
  switch (v) {
    case 0: shape = `<circle cx="${62 + r(2) * 4}" cy="${58 - r(3) * 3}" r="${30 + r(4) * 2}" fill="${b}"/>`; break;
    case 1: shape = [0, 1, 2].map((i) => `<rect x="0" y="${24 + i * 22}" width="100" height="${6 + r(i) }" fill="${b}"/>`).join(''); break;
    case 2: shape = `<path d="M0 100 A50 50 0 0 1 100 100 Z" fill="${b}" transform="translate(0 ${-r(2) * 3})"/>`; break;
    case 3: shape = `<path d="M0 ${60 + r(2) * 4} L100 ${20 + r(3) * 4} L100 100 L0 100 Z" fill="${b}"/>`; break;
    case 4: shape = `<circle cx="50" cy="50" r="34" fill="${b}"/><circle cx="50" cy="50" r="10" fill="${a}"/><circle cx="50" cy="50" r="2" fill="${b}"/>`; break;
    case 5: shape = `<rect x="${14 + r(2) * 3}" y="${14 + r(3) * 3}" width="36" height="36" fill="${b}"/><rect x="50" y="50" width="36" height="36" fill="${b}" opacity=".45"/>`; break;
    default: shape = `<rect x="0" y="0" width="${38 + r(2) * 4}" height="100" fill="${b}"/><circle cx="${38 + r(2) * 4}" cy="${50 + r(3) * 3}" r="16" fill="${a}"/>`;
  }
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="100" height="100" fill="${a}"/>${shape}</svg>`;
}

// kind: 'artist' | 'album' | 'track'. Without a real image, the sleeve asks meta.js
// (through data-art) to find one, and shows a generated cover until then.
export function sleeve(title, artist, { img = '', size = 44, round = false, cls = '', kind } = {}) {
  const k = kind || (title === artist ? 'artist' : 'album');
  const key = `${artist}·${title}`;
  const imgTag = img ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : '';
  const ask = !img && title ? ` data-art="${esc(JSON.stringify([k, title, k === 'artist' ? '' : artist]))}"` : '';
  return `<span class="sleeve${round ? ' sleeve--round' : ''}${cls ? ` ${cls}` : ''}" style="--s:${size}px"${ask} aria-hidden="true">${sleeveSvg(key)}${imgTag}</span>`;
}
// The right sleeve for a song: its album cover when we know the album.
export const trackSleeve = (t, opts = {}) => (t.album
  ? sleeve(t.album, t.artist, { ...opts, kind: 'album' })
  : sleeve(t.name || t.track, t.artist, { ...opts, kind: 'track' }));

export function avatar(name, img, size = 56) {
  const h = hash(name);
  const bg = INKS[[1, 2, 4, 5, 6, 7][h % 6]];
  return `<span class="avatar" style="--s:${size}px;--av:${bg}" aria-hidden="true"><span>${esc(initials(name))}</span>${img ? `<img src="${esc(img)}" alt="" onerror="this.remove()">` : ''}</span>`;
}

/* ---------- Formatting ---------- */
export const num = (n) => new Intl.NumberFormat('en').format(Math.round(n || 0));
export const compact = (n) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);
export const monthYear = (ms) => new Date(ms).toLocaleDateString('en', { month: 'short', year: 'numeric' });
export const longMonth = (ms) => new Date(ms).toLocaleDateString('en', { month: 'long', year: 'numeric' });
export const fullDate = (ms) => new Date(ms).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' });
export const shortDate = (ms) => new Date(ms).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
export const pct = (x) => `${Math.round(x * 100)}%`;
export const plural = (n, w, p = `${w}s`) => `${num(n)} ${n === 1 ? w : p}`;

export function ago(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  const d = Math.floor(s / 86400);
  if (d === 1) return 'yesterday';
  if (d < 31) return `${d} days ago`;
  if (d < 365) { const m = Math.floor(d / 30.4); return `${m} month${m === 1 ? '' : 's'} ago`; }
  const y = Math.floor(d / 365);
  return `${y} year${y === 1 ? '' : 's'} ago`;
}

export function span(ms) {
  const d = Math.round(ms / 864e5);
  if (d < 60) return plural(d, 'day');
  const m = Math.round(d / 30.4);
  if (m < 24) return plural(m, 'month');
  const y = Math.floor(m / 12), rm = m % 12;
  return rm ? `${plural(y, 'year')} and ${plural(rm, 'month')}` : plural(y, 'year');
}

export function clock(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const hourLabel = (h) => (h === 0 ? '12 am' : h < 12 ? `${h} am` : h === 12 ? '12 pm' : `${h - 12} pm`);

export function debounce(fn, ms) {
  let t;
  const later = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  later.cancel = () => clearTimeout(t);
  return later;
}

export const wait = (ms, signal) => new Promise((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('aborted', 'AbortError')); }, { once: true });
});

/* ---------- Storage ---------- */
export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
  json(k, fallback = null) { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } },
  setJson(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

// Tiny IndexedDB key-value store for large data (listening archives).
let dbp;
function db() {
  dbp ??= new Promise((res, rej) => {
    const req = indexedDB.open('liner', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return dbp;
}
export const idb = {
  async get(key) {
    try {
      const d = await db();
      return await new Promise((res, rej) => { const r = d.transaction('kv').objectStore('kv').get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    } catch { return undefined; }
  },
  async set(key, val) {
    try {
      const d = await db();
      await new Promise((res, rej) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    } catch { /* storage unavailable */ }
  },
  async del(key) {
    try {
      const d = await db();
      await new Promise((res) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(key); tx.oncomplete = res; tx.onerror = res; });
    } catch { /* storage unavailable */ }
  },
  async clear() {
    try {
      const d = await db();
      await new Promise((res) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').clear(); tx.oncomplete = res; tx.onerror = res; });
    } catch { /* storage unavailable */ }
  },
};

/* ---------- Feedback ---------- */
let toastTimer;
export function toast(msg, tone = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.dataset.tone = tone;
  el.hidden = false;
  el.classList.remove('is-in'); void el.offsetWidth; el.classList.add('is-in');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3600);
}

export async function copy(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) { const o = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = o; }, 1400); }
  } catch {
    toast('Copy failed. Select the text and copy it yourself.');
  }
}

export const eq = '<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>';

export const icon = {
  arrow: '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9.5M8.5 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  out: '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3h7v7M13 3 5 11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  upload: '<svg class="i" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 13V3.5M6 7l4-4 4 4M3.5 12.5v2.5A1.5 1.5 0 0 0 5 16.5h10a1.5 1.5 0 0 0 1.5-1.5v-2.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  back: '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8H3.5M7.5 4l-4 4 4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  refresh: '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M13 3v3.5H9.5M3 13V9.5h3.5M12.6 6.5A5 5 0 0 0 3.8 5M3.4 9.5a5 5 0 0 0 8.8 1.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  spotify: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#1ED760"/><path d="M6.5 9.3c3.8-1.1 8-.8 11.2 1M7.2 12.6c3.1-.9 6.4-.6 9 .9M7.9 15.8c2.4-.6 4.9-.4 6.9.7" fill="none" stroke="#0B0B0B" stroke-width="1.7" stroke-linecap="round"/></svg>',
};
