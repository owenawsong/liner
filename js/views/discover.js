import { $, $$, esc, sleeve, num, compact, toast, store } from '../ui.js';
import { onLeave } from '../core.js';
import { hydrate, listeners, releaseGroupForAlbum, critiqueCount } from '../meta.js';
import { discoverySeeds, candidatePool, rankCandidates, albumsFor } from '../discovery.js';
import { getTaste, setTasteItem, tasteKey, tasteExport, importTaste, normalize } from '../taste.js';
import * as lastfm from '../sources/lastfm.js';

const modes = [['for-you', 'For you'], ['explore', 'Further out'], ['deep', 'Deep cuts']];
const spotifySearch = (name, artist) => `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${name}`)}`;
const lastfmArtist = (name) => `https://www.last.fm/music/${encodeURIComponent(name)}`;
const lastfmAlbum = (name, artist) => `${lastfmArtist(artist)}/${encodeURIComponent(name)}`;

export function discoverView(ctx, banner) {
  const root = $('#tab');
  root.innerHTML = `${banner}
    <div class="disc-head"><div><span class="label">Beyond your record</span><h2>Find your next favorite</h2><p>Suggestions built from your listening and the records you rate. Every reason points to a real connection.</p></div><button type="button" class="btn btn--line btn--sm" data-refresh>Rebuild picks</button></div>
    <div class="disc-seeds" id="disc-seeds"></div>
    <section class="panel disc-section"><div class="panel__head"><div><span class="label">01 / NEW ARTISTS</span><h2>Out from your rotation</h2></div><span class="label" id="disc-count"></span></div>
      <div class="disc-toolbar"><div class="seg" role="group" aria-label="Discovery distance">${modes.map(([id, label]) => `<button type="button" data-disc-mode="${id}" aria-pressed="${id === 'for-you'}"${id === 'deep' ? ' disabled title="Checking artist audiences"' : ''}>${label}</button>`).join('')}</div><p id="disc-mode-copy" class="faint"></p></div>
      <div id="disc-status" class="disc-status" role="status" aria-live="polite">Reading your listening record…</div><div class="ms-progress" role="progressbar" aria-label="Finding recommendations" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"><i></i></div>
      <div id="disc-artists" class="disc-artists"></div>
    </section>
    <section class="panel disc-section"><div class="panel__head"><div><span class="label">02 / A RECORD TO START WITH</span><h2>Albums worth opening</h2></div><span class="label">Album IDs checked against MusicBrainz</span></div>
      <p class="muted">These are popular starting points from recommended artists. Sleeve checks the release type before calling something an album.</p><div id="disc-album-status" class="disc-status" role="status" aria-live="polite">Finding artists first…</div><div id="disc-albums" class="disc-albums"></div>
    </section>
    <div class="disc-lower"><section class="panel disc-section"><div class="panel__head"><div><span class="label">03 / YOUR TASTE, IN YOUR WORDS</span><h2>Rate records you know</h2></div></div><p class="muted">Listening a lot does not automatically mean you loved it. Rate your own albums to teach Discover what you actually thought.</p><label class="sr" for="disc-album-search">Find an album in your history</label><input id="disc-album-search" class="input" type="search" placeholder="Search your listened albums…" autocomplete="off"><div id="disc-listened"></div></section>
      <section class="panel disc-section"><div class="panel__head"><div><span class="label">04 / YOUR SHELF</span><h2>Saved & rated</h2></div><span class="label" id="disc-shelf-count"></span></div><div id="disc-shelf"></div><div class="disc-backup"><p>Your ratings and saves stay in this browser. Keep a copy to move them to another device.</p><div><button class="btn btn--line btn--sm" type="button" data-disc-export>Export ratings</button><label class="btn btn--line btn--sm" for="disc-import">Import ratings</label><input id="disc-import" type="file" accept=".json,application/json" hidden></div></div></section></div>
    <p class="disc-method">Artist connections and album popularity come from Last.fm. Album identities and available community scores come from MusicBrainz. Community ratings show their vote count; they do not override your own ratings. Sleeve does not pull ratings from Album of the Year or Rate Your Music.</p>`;

  let alive = true, taste, pool = [], albums = [], mode = 'for-you', selectedSeed = '', runCtrl;
  const editionKey = `liner.discover.edition:${ctx.pid}`;
  const lookup = new Map();
  onLeave(() => { alive = false; runCtrl?.abort(); });
  const remember = (item) => { lookup.set(tasteKey(item.kind, item.name, item.artist), item); return item; };
  const feedback = (item) => taste?.items[tasteKey(item.kind, item.name, item.artist)] || {};
  const marker = (item) => {
    const f = feedback(item);
    return f.status === 'saved' ? '<span class="disc-mark">Saved to your shelf</span>' : '';
  };
  const controls = (item, compact = false) => {
    const key = esc(tasteKey(item.kind, item.name, item.artist)), f = feedback(item);
    return `<div class="disc-controls" data-key="${key}"><div class="disc-actions">
      <button type="button" data-judge="saved" aria-pressed="${f.status === 'saved'}">${f.status === 'saved' ? '✓ Saved' : '＋ Save'}</button>
      <button type="button" data-judge="known" aria-pressed="${f.status === 'known'}">${f.status === 'known' ? '✓ Know it' : 'Know it'}</button>
      <button type="button" data-judge="hidden" aria-pressed="${f.status === 'hidden'}">${f.status === 'hidden' ? '↶ Restore' : 'Hide'}</button></div>
      <div class="disc-stars" role="group" aria-label="Your rating for ${esc(item.name)}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-rate="${n}" aria-label="Rate ${n} out of 5" aria-pressed="${f.rating === n}">${f.rating >= n ? '★' : '☆'}</button>`).join('')}<small>${f.rating ? `${f.rating}/5 · yours` : 'Rate it'}</small></div>
      ${compact ? '' : `<details class="disc-note"><summary>${f.note ? 'Edit your note' : 'Add a note'}</summary><form data-disc-note="${key}"><label class="sr" for="note-${encodeURIComponent(key)}">Your note about ${esc(item.name)}</label><textarea id="note-${encodeURIComponent(key)}" name="note" maxlength="800" rows="3" placeholder="What stood out to you?">${esc(f.note || '')}</textarea><button type="submit" class="btn btn--line btn--sm">Save note</button></form></details>`}</div>`;
  };
  const reason = (x) => x.sources.slice(0, 2).map((s) => s.name).join(' + ');
  const status = (message, pct) => {
    if (!alive) return;
    $('#disc-status', root).textContent = message;
    if (pct != null) { const bar = $('.ms-progress', root); bar.setAttribute('aria-valuenow', String(pct)); $('i', bar).style.width = `${pct}%`; }
  };
  const paintArtists = () => {
    if (!alive || !taste) return;
    const scope = selectedSeed ? pool.filter((x) => x.sources.some((s) => s.name === selectedSeed)) : pool;
    const picks = rankCandidates(scope, taste, mode);
    $('#disc-count', root).textContent = `${picks.length} picks`;
    $('#disc-mode-copy', root).textContent = selectedSeed ? `Following your ${selectedSeed} side. ${picks.length} artists to explore.` : mode === 'deep' ? 'Lower Last.fm audiences, while staying connected to your taste.'
      : mode === 'explore' ? 'A little further from the artists you already play.' : 'The strongest connections across your recent and long-term favorites.';
    $('#disc-artists', root).innerHTML = picks.length ? picks.map((x, i) => {
      const item = remember({ kind: 'artist', name: x.name, artist: '', mbid: x.mbid });
      return `<article class="disc-artist"><div class="disc-artist__top"><span class="disc-no">${String(i + 1).padStart(2, '0')}</span>${sleeve(x.name, x.name, { size: 68, round: true, kind: 'artist' })}<div><h3>${esc(x.name)}</h3><span>${x.audience ? `${compact(x.audience)} Last.fm listeners` : 'New to your record'}</span></div></div>
        ${marker(item)}<p class="disc-why">Connected to <b>${esc(reason(x))}</b>${x.sources.length > 2 ? ` and ${x.sources.length - 2} more of your artists` : ''} through Last.fm similarity.</p>
        <a class="link" href="${lastfmArtist(x.name)}" target="_blank" rel="noopener">Explore this artist ↗</a>${controls(item)}</article>`;
    }).join('') : '<p class="empty">No unheard artists matched this view. Try another distance or rebuild your picks.</p>';
    hydrate($('#disc-artists', root));
  };
  const paintAlbums = () => {
    if (!alive || !taste) return;
    const visible = albums.filter((x) => {
      const own = feedback({ kind: 'album', name: x.name, artist: x.artist });
      const artistOwn = taste.items[tasteKey('artist', x.artist)];
      return own.status !== 'hidden' && own.status !== 'known' && !own.rating && artistOwn?.status !== 'hidden' && artistOwn?.status !== 'known' && !artistOwn?.rating;
    });
    $('#disc-albums', root).innerHTML = visible.length ? visible.map((x) => {
      const item = remember({ kind: 'album', name: x.name, artist: x.artist, mbid: x.group.id });
      const g = x.group, critics = x.reviews ? `<a href="https://critiquebrainz.org/release-group/${g.id}" target="_blank" rel="noopener">${num(x.reviews)} written reviews ↗</a>` : '';
      const community = g.votes ? `<span>MusicBrainz ${g.rating?.toFixed(1)}/5 · ${num(g.votes)} ratings</span>` : '<span>No MusicBrainz rating yet</span>';
      return `<article class="disc-album">${sleeve(x.name, x.artist, { size: 136, kind: 'album' })}<div class="disc-album__body"><span class="label">${esc(g.type)}${g.date ? ` · ${esc(g.date.slice(0, 4))}` : ''}</span><h3>${esc(x.name)}</h3><p class="disc-album__artist">${esc(x.artist)}</p>${marker(item)}<p class="disc-why">A popular Last.fm album by an artist connected to <b>${esc(x.reason.join(' + '))}</b>.</p><div class="disc-community">${community}${critics}</div><div class="disc-links"><a class="link" href="${esc(x.url || lastfmAlbum(x.name, x.artist))}" target="_blank" rel="noopener">Album details ↗</a><a class="link" href="${spotifySearch(x.name, x.artist)}" target="_blank" rel="noopener">Find on Spotify ↗</a></div>${controls(item)}</div></article>`;
    }).join('') : '<p class="empty">No new albums passed the identity check yet. Try rebuilding after more listening or rating a few records.</p>';
    hydrate($('#disc-albums', root));
  };
  const paintShelf = () => {
    if (!alive || !taste) return;
    const all = Object.values(taste.items).filter((x) => x.status || x.rating || x.note).sort((a, b) => b.updated - a.updated);
    $('#disc-shelf-count', root).textContent = `${all.length} ${all.length === 1 ? 'entry' : 'entries'}`;
    const row = (x) => { remember(x); return `<div class="disc-shelf-row">${sleeve(x.name, x.artist || x.name, { size: 44, round: x.kind === 'artist', kind: x.kind })}<div><b>${esc(x.name)}</b><small>${esc(x.artist || 'Artist')}${x.rating ? ` · your ${x.rating}/5` : ''}${x.status ? ` · ${x.status}` : ''}</small>${x.note ? `<p>${esc(x.note)}</p>` : ''}</div>${controls(x)}</div>`; };
    $('#disc-shelf', root).innerHTML = all.length ? `${all.filter((x) => x.status !== 'hidden').slice(0, 20).map(row).join('')}${all.some((x) => x.status === 'hidden') ? `<details class="disc-hidden"><summary>${all.filter((x) => x.status === 'hidden').length} hidden items</summary>${all.filter((x) => x.status === 'hidden').map(row).join('')}</details>` : ''}` : '<p class="empty">Save an artist, rate a record, or add a note. Your shelf will grow here.</p>';
    hydrate($('#disc-shelf', root));
  };
  const paintListened = () => {
    if (!alive || !taste) return;
    const q = normalize($('#disc-album-search', root).value);
    const matches = ctx.A.albums.filter((a) => !q || normalize(`${a.artist} ${a.album}`).includes(q)).slice(0, 8);
    $('#disc-listened', root).innerHTML = matches.length ? matches.map((a) => {
      const item = remember({ kind: 'album', name: a.album, artist: a.artist });
      return `<div class="disc-listened-row">${sleeve(a.album, a.artist, { size: 44, kind: 'album' })}<div><b>${esc(a.album)}</b><small>${esc(a.artist)} · ${num(a.n)} plays</small></div>${controls(item, true)}</div>`;
    }).join('') : '<p class="empty">No album in this record matches that search.</p>';
    hydrate($('#disc-listened', root));
  };
  const repaint = () => { paintArtists(); paintAlbums(); paintShelf(); paintListened(); };

  root.addEventListener('click', async (event) => {
    const modeButton = event.target.closest('[data-disc-mode]');
    if (modeButton) { mode = modeButton.dataset.discMode; $$('[data-disc-mode]', root).forEach((b) => b.setAttribute('aria-pressed', String(b === modeButton))); paintArtists(); return; }
    const seedButton = event.target.closest('[data-disc-seed]');
    if (seedButton) {
      selectedSeed = seedButton.dataset.discSeed;
      $$('[data-disc-seed]', root).forEach((b) => b.setAttribute('aria-pressed', String(b === seedButton)));
      paintArtists(); return;
    }
    if (event.target.closest('[data-refresh]')) {
      store.set(editionKey, String(Number(store.get(editionKey) || 0) + 1));
      selectedSeed = ''; mode = 'for-you';
      $$('[data-disc-mode]', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.discMode === mode)));
      build(); return;
    }
    if (event.target.closest('[data-disc-export]')) {
      if (!taste) return;
      const blob = new Blob([JSON.stringify(tasteExport(taste), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `sleeve-ratings-${ctx.pid.replace(/[^a-z0-9-]+/gi, '-')}.json`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    const control = event.target.closest('[data-judge], [data-rate]');
    if (!control || !taste) return;
    const key = control.closest('[data-key]')?.dataset.key, item = lookup.get(key);
    if (!item) return;
    control.disabled = true;
    const old = taste.items[key] || {};
    const patch = control.dataset.judge ? { status: old.status === control.dataset.judge ? '' : control.dataset.judge }
      : { rating: old.rating === Number(control.dataset.rate) ? null : Number(control.dataset.rate) };
    try { await setTasteItem(ctx.pid, item, patch); repaint(); }
    catch (e) { toast(e.message, 'bad'); control.disabled = false; }
  });
  root.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-disc-note]');
    if (!form || !taste) return;
    event.preventDefault();
    const item = lookup.get(form.dataset.discNote);
    if (!item) return;
    const button = $('button', form); button.disabled = true;
    try { await setTasteItem(ctx.pid, item, { note: $('textarea', form).value.trim() }); repaint(); toast('Note saved.'); }
    catch (e) { toast(e.message, 'bad'); button.disabled = false; }
  });
  $('#disc-album-search', root).addEventListener('input', paintListened);
  $('#disc-import', root).addEventListener('change', async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 2e6) throw new Error('That ratings file is too large.');
      const count = await importTaste(ctx.pid, JSON.parse(await file.text()));
      if (alive) { repaint(); toast(`Imported ${num(count)} ratings and saves.`); }
    } catch (e) { toast(e instanceof SyntaxError ? 'That file is not valid JSON.' : e.message, 'bad'); }
    event.target.value = '';
  });

  async function build() {
    runCtrl?.abort(); runCtrl = new AbortController();
    const signal = runCtrl.signal;
    pool = []; albums = [];
    $('#disc-artists', root).innerHTML = '';
    $('#disc-albums', root).innerHTML = '';
    const deepButton = $('[data-disc-mode="deep"]', root);
    deepButton.disabled = true;
    deepButton.innerHTML = 'Deep cuts <small>checking…</small>';
    const seeds = discoverySeeds(ctx.A, taste, Number(store.get(editionKey) || 0));
    $('#disc-seeds', root).innerHTML = `<span class="label">Starting from your record</span><button type="button" data-disc-seed="" aria-pressed="true">All connections</button>${seeds.map((s) => `<button type="button" data-disc-seed="${esc(s.name)}" aria-pressed="false">${esc(s.name)}</button>`).join('')}`;
    if (!lastfm.isLive()) {
      status('Add a Last.fm API key in Settings to find new artists.', 0);
      $('#disc-album-status', root).innerHTML = '<a class="link" href="#/settings">Open Settings →</a>';
      return;
    }
    try {
      status('Following connections from your favorite artists…', 4);
      pool = await candidatePool(ctx.A, seeds, signal, (done, total) => status(`Checking connections · ${done} of ${total} artists`, Math.round(done / total * 54)));
      if (!alive || signal.aborted) return;
      if (!pool.length) { status('Last.fm returned no new matches. Try again later or rate more artists.', 100); $('#disc-album-status', root).textContent = 'No album candidates yet.'; return; }
      paintArtists();
      status(`${pool.length} unheard artists found · checking album starting points`, 62);
      $('#disc-album-status', root).textContent = 'Checking popular records by these artists…';
      const ranked = rankCandidates(pool, taste, 'for-you');
      const rawAlbums = await albumsFor(ranked, ctx.A, taste, signal, (done, total, name) => {
        if (alive && !signal.aborted) $('#disc-album-status', root).textContent = `Finding albums · ${done} of ${total} · ${name}`;
      });
      if (!alive || signal.aborted) return;
      $('#disc-album-status', root).textContent = `Checking ${rawAlbums.length} album IDs and available ratings…`;
      const groups = await Promise.all(rawAlbums.map((x) => releaseGroupForAlbum(x)));
      if (!alive || signal.aborted) return;
      albums = rawAlbums.map((x, i) => ({ ...x, group: groups[i], reviews: null }))
        .filter((x) => x.group && ['Album', 'EP'].includes(x.group.type));
      paintAlbums();
      $('#disc-album-status', root).textContent = `${albums.length} verified albums · community scores shown when available`;
      status(`${pool.length} unheard artists found · ready to explore`, 100);
      Promise.all(albums.map((x) => critiqueCount(x.group.id))).then((counts) => {
        if (!alive || signal.aborted) return;
        albums.forEach((x, i) => { x.reviews = counts[i]; }); paintAlbums();
      });
      const top = [...pool].sort((a, b) => b.score - a.score).slice(0, 60);
      for (let i = 0; i < top.length; i++) {
        if (!alive || signal.aborted) return;
        const x = top[i];
        if (x.audience === undefined) await listeners(x.name);
        if (alive && !signal.aborted) deepButton.innerHTML = `Deep cuts <small>${i + 1}/${top.length}</small>`;
      }
      if (!alive || signal.aborted) return;
      deepButton.disabled = false;
      deepButton.textContent = 'Deep cuts';
    } catch (e) {
      if (!alive || signal.aborted || e.name === 'AbortError') return;
      status(`Discovery paused: ${e.message}`, 0);
      $('#disc-album-status', root).textContent = 'Your ratings and saved items still work. Rebuild picks to retry.';
    }
  }

  (async () => {
    taste = await getTaste(ctx.pid);
    if (!alive) return;
    paintShelf(); paintListened();
    build();
  })();
}
