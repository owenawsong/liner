// Direct Spotify mode. Each person makes their own Spotify developer app and signs in
// with the PKCE flow, so there's no server and no shared client limit.
import { store, wait } from '../ui.js';
import { SourceError } from './lastfm.js';

const AUTH = 'https://accounts.spotify.com/authorize';
const TOKEN = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';
const SCOPES = 'user-read-recently-played user-top-read user-read-currently-playing user-read-playback-state';

export const id = 'spotify';
export const label = 'Spotify';
export const periods = [
  { id: 'short_term', label: '4 weeks' }, { id: 'medium_term', label: '6 months' }, { id: 'long_term', label: 'About a year' },
];
export const isLive = () => true;

export const redirectUri = () => `${location.origin}${location.pathname}`;
export const clientId = () => store.get('liner.sp.client') || '';
export const setClientId = (v) => store.set('liner.sp.client', v || null);
export const isConnected = () => !!store.json('liner.sp.tok')?.refresh;
export const disconnect = () => { store.set('liner.sp.tok', null); store.set('liner.sp.watch', null); };

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomString = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));

export async function begin(cid) {
  setClientId(cid);
  const verifier = randomString(48);
  const state = randomString(16);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  store.setJson('liner.sp.pkce', { verifier, state });
  const q = new URLSearchParams({
    client_id: cid, response_type: 'code', redirect_uri: redirectUri(),
    code_challenge_method: 'S256', code_challenge: challenge, scope: SCOPES, state,
  });
  location.href = `${AUTH}?${q}`;
}

function saveTokens(d) {
  const prev = store.json('liner.sp.tok') || {};
  store.setJson('liner.sp.tok', { access: d.access_token, refresh: d.refresh_token || prev.refresh, exp: Date.now() + (d.expires_in || 3600) * 1000 });
}

// Runs on page load. Returns null when this isn't a Spotify redirect.
export async function handleCallback() {
  const p = new URLSearchParams(location.search);
  if (!p.has('code') && !p.has('error')) return null;
  const saved = store.json('liner.sp.pkce');
  history.replaceState(null, '', `${location.pathname}#/spotify`);
  if (p.get('error')) return { error: p.get('error') === 'access_denied' ? 'You cancelled the Spotify sign-in. Nothing was connected.' : `Spotify sign-in failed (${p.get('error')}).` };
  if (!saved || saved.state !== p.get('state')) return { error: 'That Spotify sign-in expired. Start it again from the Spotify setup page.' };
  try {
    const res = await fetch(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: p.get('code'), redirect_uri: redirectUri(), client_id: clientId(), code_verifier: saved.verifier }),
    });
    const d = await res.json();
    if (!res.ok) return { error: d.error_description ? `Spotify refused the sign-in: ${d.error_description}.` : 'Spotify refused the sign-in.' };
    saveTokens(d);
    store.set('liner.sp.pkce', null);
    return { ok: true };
  } catch {
    return { error: "Couldn't reach Spotify to finish signing in. Check your connection and try again." };
  }
}

async function refresh() {
  const tok = store.json('liner.sp.tok');
  if (!tok?.refresh) throw new SourceError('auth', 'Spotify is not connected.');
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tok.refresh, client_id: clientId() }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) { disconnect(); throw new SourceError('auth', 'Your Spotify sign-in expired. Connect again to keep going.'); }
  saveTokens(d);
}

async function api(path, signal, retried = false) {
  let tok = store.json('liner.sp.tok');
  if (!tok) throw new SourceError('auth', 'Spotify is not connected.');
  if (Date.now() > tok.exp - 60000) { await refresh(); tok = store.json('liner.sp.tok'); }
  let res;
  try { res = await fetch(API + path, { headers: { Authorization: `Bearer ${tok.access}` }, signal }); } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new SourceError('network', "Couldn't reach Spotify. Check your connection.");
  }
  if (res.status === 204) return null;
  if (res.status === 401 && !retried) { await refresh(); return api(path, signal, true); }
  if (res.status === 429) { await wait((Number(res.headers.get('Retry-After')) || 3) * 1000, signal); return api(path, signal, retried); }
  if (res.status === 403) throw new SourceError('forbidden', 'Spotify blocked this request. In your Spotify app, open User Management and add the email of your Spotify account.');
  if (!res.ok) throw new SourceError(res.status, `Spotify returned an error (${res.status}).`);
  return res.json();
}

const track = (item, t, nowPlaying = false) => ({
  name: item?.name || 'Unknown',
  artist: (item?.artists || []).map((a) => a.name).join(', '),
  album: item?.album?.name || '',
  image: item?.album?.images?.[1]?.url || item?.album?.images?.[0]?.url || '',
  nowPlaying,
  t,
  url: item?.external_urls?.spotify || '',
  id: item?.id,
  duration: item?.duration_ms,
});

export async function recent(_name, limit = 20, signal) {
  const [now, rec] = await Promise.all([
    api('/me/player/currently-playing', signal).catch(() => null),
    api(`/me/player/recently-played?limit=${Math.min(50, limit)}`, signal),
  ]);
  const out = (rec?.items || []).map((x) => track(x.track, Date.parse(x.played_at)));
  if (now?.item && now.is_playing && now.currently_playing_type === 'track') out.unshift({ ...track(now.item, Date.now(), true), progress: now.progress_ms });
  return out;
}

export async function profile(_name, signal) {
  const [me, rec] = await Promise.all([api('/me', signal), recent(null, 50, signal)]);
  const dayStart = new Date().setHours(0, 0, 0, 0);
  const weekStart = Date.now() - 7 * 864e5;
  const played = rec.filter((t) => !t.nowPlaying);
  return {
    source: id, simulated: false, hidden: false,
    user: { name: me.id, display: me.display_name || me.id, image: me.images?.[0]?.url || '', playcount: 0, since: 0, url: me.external_urls?.spotify || '' },
    recent: rec.slice(0, 21),
    today: played.filter((t) => t.t >= dayStart).length,
    week: played.filter((t) => t.t >= weekStart).length,
    capped: played.length >= 50,
    recentRows: played.map((t) => ({ t: t.t, track: t.name, artist: t.artist, album: t.album, ms: null, skipped: null, src: 'spotify' })),
  };
}

export async function top(_name, period, kind, signal) {
  if (kind === 'albums') {
    const tracks = await top(_name, period, 'tracks', signal);
    const seen = new Map();
    tracks.forEach((t) => { if (!seen.has(t.album)) seen.set(t.album, { name: t.album, artist: t.artist, plays: null, image: t.image }); });
    return [...seen.values()];
  }
  const d = await api(`/me/top/${kind}?time_range=${period}&limit=25`, signal);
  return (d?.items || []).map((x) => kind === 'artists'
    ? { name: x.name, artist: '', plays: null, image: x.images?.[1]?.url || x.images?.[0]?.url || '' }
    : { name: x.name, artist: x.artists.map((a) => a.name).join(', '), album: x.album?.name, plays: null, image: x.album?.images?.[1]?.url || '' });
}

/* ---------- Skip watcher ----------
   While Liner is open, check what's playing every few seconds. When the song
   changes, we know how long the last one actually played, so we can spot skips. */
export function watch(onChange) {
  let cur = null, timer = 0, stopped = false;
  const log = () => store.json('liner.sp.watch', []);
  const finish = (endT) => {
    if (!cur) return;
    const played = Math.min(cur.max + Math.max(0, endT - cur.seen), cur.duration || Infinity);
    const row = { t: cur.start, track: cur.name, artist: cur.artist, album: cur.album, ms: Math.round(played), skipped: cur.duration ? played < cur.duration - 12000 : null, src: 'spotify-watch' };
    const l = log(); l.push(row); store.setJson('liner.sp.watch', l.slice(-3000));
    onChange?.(row);
  };
  const tick = async () => {
    if (stopped) return;
    try {
      const now = await api('/me/player/currently-playing');
      const item = now?.currently_playing_type === 'track' ? now.item : null;
      if (!item || item.id !== cur?.id) {
        if (cur) finish(cur.playing ? Date.now() : cur.seen);
        cur = item ? { id: item.id, name: item.name, artist: item.artists.map((a) => a.name).join(', '), album: item.album?.name, duration: item.duration_ms, start: Date.now() - (now.progress_ms || 0), max: now.progress_ms || 0, seen: Date.now(), playing: now.is_playing } : null;
      } else {
        cur.max = Math.max(cur.max, now.progress_ms || 0);
        cur.seen = Date.now();
        cur.playing = now.is_playing;
      }
    } catch { /* keep trying quietly */ }
    timer = setTimeout(tick, document.hidden ? 10000 : 5000);
  };
  tick();
  return () => { stopped = true; clearTimeout(timer); };
}
export const watchLog = () => store.json('liner.sp.watch', []);
