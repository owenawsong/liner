// Settings: appearance, profiles, counting, AI, advanced, and your data.
import { $, $$, esc, avatar, store, toast, idb } from '../ui.js';
import { view, profiles, hrefFor, clearArchive, state, setMinMs, rerender } from '../core.js';
import { themeButtons, setTheme } from '../theme.js';
import * as lastfm from '../sources/lastfm.js';
import * as spotify from '../sources/spotify.js';

const SOURCE = { lastfm: 'Last.fm', listenbrainz: 'ListenBrainz', spotify: 'Spotify', file: 'Spotify export' };

export const aiEnabled = () => store.get('liner.ai') !== 'off';

export function renderSettings() {
  const list = profiles.list();
  const key = store.get('liner.lfmkey') || '';
  view().innerHTML = `
    <div class="wrap settings">
      <header class="settings__head">
        <span class="catno">SLV · SETTINGS</span>
        <h1>Settings</h1>
        <p>Everything here is saved in this browser only.</p>
      </header>

      <section class="setrow">
        <div class="setrow__label"><h2>Appearance</h2><p>Pick a theme. Auto follows your device's light or dark mode.</p></div>
        <div class="themes themes--wide" role="radiogroup" aria-label="Theme" id="set-themes">${themeButtons()}</div>
      </section>

      <section class="setrow">
        <div class="setrow__label"><h2>Your profiles</h2><p>Profiles you've opened on this device.</p></div>
        <div>${list.length ? `<ul class="setlist">${list.map((p) => `<li>
          ${avatar(p.display, p.image, 36)}
          <span><b>${esc(p.display)}</b><span>${SOURCE[p.source] || ''}</span></span>
          <a class="btn btn--line btn--sm" href="${hrefFor(p.pid)}">Open</a>
          <button type="button" class="btn btn--quiet btn--sm" data-forget="${esc(p.pid)}">Remove</button>
        </li>`).join('')}</ul>` : `<p class="faint">No profiles yet. <a href="#/start">Connect your music</a>.</p>`}</div>
      </section>

      <section class="setrow">
        <div class="setrow__label"><h2>What counts as a play</h2><p>Spotify counts a stream after 30 seconds. This only changes plays where listening time is known, which means your Spotify export.</p></div>
        <div class="seg" role="radiogroup" aria-label="What counts as a play"><button type="button" role="radio" data-min="0" aria-checked="${state.minMs === 0}">Any length</button><button type="button" role="radio" data-min="30000" aria-checked="${state.minMs === 30000}">30 seconds or more</button></div>
      </section>

      <section class="setrow">
        <div class="setrow__label"><h2>AI writing</h2><p>Liner notes, roasts, era names and questions. When it's on, a short summary of your stats is sent to write them. Never your full history.</p></div>
        <label class="switch"><input type="checkbox" id="set-ai" ${aiEnabled() ? 'checked' : ''}><span></span>Show AI writing</label>
      </section>

      <section class="setrow">
        <div class="setrow__label"><h2>Connections</h2><p>Advanced. Sleeve already has a Last.fm key, so you don't need your own.</p></div>
        <div class="setstack">
          <details class="setmore">
            <summary>Use your own Last.fm API key</summary>
            <form id="set-key-form" class="copyline">
              <label class="sr" for="set-key">Last.fm API key</label>
              <input class="input input--mono" id="set-key" value="${esc(key)}" placeholder="32 letters and numbers" autocomplete="off" spellcheck="false" style="flex:1;min-width:220px">
              <button class="btn btn--ink btn--sm" type="submit">Save</button>
              ${key ? '<button class="btn btn--quiet btn--sm" type="button" id="set-key-clear">Remove</button>' : ''}
            </form>
            <p class="faint" style="font-size:13.5px;margin-top:8px">Status: ${lastfm.isLive() ? 'live' : 'simulated'}. <a href="https://www.last.fm/api/account/create" target="_blank" rel="noopener">Create a key</a>.</p>
          </details>
          <p class="faint" style="font-size:14px">Spotify direct: ${spotify.isConnected() ? 'connected. <button type="button" class="link" id="set-sp-off">Disconnect</button>' : '<a href="#/connect/spotify">not connected</a>.'}</p>
        </div>
      </section>

      <section class="setrow">
        <div class="setrow__label"><h2>Your data</h2><p>Imported histories, exports, cached artwork and settings all live in this browser. Nothing is stored on a server.</p></div>
        <div><button type="button" class="btn btn--line" id="set-wipe">Clear everything</button></div>
      </section>

      <section class="setrow">
        <div class="setrow__label"><h2>About</h2></div>
        <p class="faint" style="font-size:14px;max-width:52ch">Sleeve is free, every feature, for everyone. Live data comes from <a href="https://www.last.fm" target="_blank" rel="noopener">Last.fm</a> and <a href="https://listenbrainz.org" target="_blank" rel="noopener">ListenBrainz</a>, artwork from Deezer and iTunes, artist details from <a href="https://musicbrainz.org" target="_blank" rel="noopener">MusicBrainz</a>. Sleeve isn't affiliated with Spotify or Last.fm.</p>
      </section>
    </div>`;

  $('#set-themes').addEventListener('click', (e) => {
    const t = e.target.closest('[data-t]');
    if (!t) return;
    setTheme(t.dataset.t);
    $('#set-themes').innerHTML = themeButtons();
  });
  $$('[data-forget]').forEach((b) => b.addEventListener('click', async () => {
    await clearArchive(b.dataset.forget);
    profiles.forget(b.dataset.forget);
    toast('Profile removed from this browser.');
    rerender();
  }));
  $$('[data-min]').forEach((b) => b.addEventListener('click', () => { setMinMs(Number(b.dataset.min)); rerender(); }));
  $('#set-ai').addEventListener('change', (e) => { store.set('liner.ai', e.target.checked ? null : 'off'); toast(e.target.checked ? 'AI writing is on.' : 'AI writing is off.'); });
  $('#set-key-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#set-key').value.trim();
    if (v && !/^[a-f0-9]{32}$/i.test(v)) { toast("That isn't a Last.fm API key. Keys are 32 letters and numbers.", 'bad'); return; }
    store.set('liner.lfmkey', v || null);
    toast('Saved.');
    rerender();
  });
  $('#set-key-clear')?.addEventListener('click', () => { store.set('liner.lfmkey', null); toast('Removed.'); rerender(); });
  $('#set-sp-off')?.addEventListener('click', () => { spotify.disconnect(); profiles.forget('spotify'); toast('Spotify is disconnected.'); rerender(); });
  let armed = false;
  $('#set-wipe').addEventListener('click', async (e) => {
    if (!armed) { armed = true; e.target.textContent = 'Tap again to clear everything'; e.target.style.color = 'var(--bad)'; return; }
    await idb.clear();
    Object.keys(localStorage).filter((k) => k.startsWith('liner.')).forEach((k) => store.set(k, null));
    toast('Everything Sleeve stored in this browser is gone.');
    setTimeout(() => location.assign(location.pathname), 600);
  });
}
