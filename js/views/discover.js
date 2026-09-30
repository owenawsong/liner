import { $, $$, esc, sleeve, num, compact, toast, store } from '../ui.js';
import { onLeave } from '../core.js';
import { hydrate, listeners, cachedListeners, releaseGroupForAlbum, critiqueCount } from '../meta.js';
import { discoverySeeds, candidatePool, rankCandidates, albumsFor } from '../discovery.js';
import { getTaste, setTasteItem, tasteKey, tasteExport, importTaste, normalize } from '../taste.js';
import * as lastfm from '../sources/lastfm.js';

const modes = [['for-you', 'For you'], ['explore', 'Further out'], ['deep', 'Deep cuts']];
const spotifySearch = (name, artist) => `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${name}`)}`;
const spotifyArtist = (name) => `https://open.spotify.com/search/${encodeURIComponent(name)}`;
const lastfmArtist = (name) => `https://www.last.fm/music/${encodeURIComponent(name)}`;
const lastfmAlbum = (name, artist) => `${lastfmArtist(artist)}/${encodeURIComponent(name)}`;

export function discoverView(ctx, banner) {
  const root = $('#tab');
  root.innerHTML = `${banner}
    <header class="disc-head"><div><span class="label">SLEEVE / DISCOVER</span><h2>Follow the thread.</h2><p>Your listening makes the first connection. Save what interests you and the next set of picks will follow that thread. Ratings are optional.</p><button type="button" class="link" data-refresh>Find a new set of picks ↗</button></div><div class="disc-head__count"><b>${num(ctx.A.artists.length)}</b><span>artists already<br>in your record</span></div></header>
    <div class="disc-seeds" id="disc-seeds"></div>
    <section class="disc-section"><div class="disc-section__head"><div><span class="label">SIDE A / SOMEWHERE NEW</span><h2>Artists to follow</h2></div><span class="label" id="disc-count"></span></div>
      <div class="disc-toolbar"><div class="seg" role="group" aria-label="Discovery distance">${modes.map(([id, label]) => `<button type="button" data-disc-mode="${id}" aria-pressed="${id === 'for-you'}"${id === 'deep' ? ' disabled title="Checking artist audiences"' : ''}>${label}</button>`).join('')}</div><p id="disc-mode-copy" class="faint"></p></div>
      <div id="disc-status" class="disc-status" role="status" aria-live="polite">Reading your listening record…</div><div class="ms-progress" role="progressbar" aria-label="Finding recommendations" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"><i></i></div>
      <div id="disc-feature" class="disc-feature" aria-live="polite"></div>
      <div id="disc-artists" class="disc-artists"></div>
    </section>
    <section class="disc-section"><div class="disc-section__head"><div><span class="label">SIDE B / PUT ON A RECORD</span><h2>Albums to take home</h2></div><span class="label">Identity checked with MusicBrainz</span></div>
      <p class="muted">A starting record from each artist. Save one for later; a community score is only a side note when enough people have rated it.</p><div id="disc-album-status" class="disc-status" role="status" aria-live="polite">Finding artists first…</div><div id="disc-albums" class="disc-albums"></div>
    </section>
    <div class="disc-lower"><section class="disc-section"><div class="disc-section__head"><div><span class="label">KEPT FOR LATER</span><h2>Your shelf</h2></div><span class="label" id="disc-shelf-count"></span></div><div id="disc-shelf"></div><div class="disc-backup"><p>Saved artists and records influence the next recommendations. Your shelf stays in this browser; keep a copy for another device.</p><div><button class="btn btn--line btn--sm" type="button" data-disc-export>Export shelf</button><label class="btn btn--line btn--sm" for="disc-import">Import shelf</label><input id="disc-import" type="file" accept=".json,application/json" hidden></div></div></section>
      <section class="disc-section"><div class="disc-section__head"><div><span class="label">OPTIONAL / FINE-TUNE</span><h2>Records you know</h2></div></div><p class="muted">Play counts show what you heard, not what you loved. Rate an album only if you want that opinion to shape later picks.</p><label class="sr" for="disc-album-search">Find an album in your history</label><input id="disc-album-search" class="input" type="search" placeholder="Search your listened albums…" autocomplete="off"><div id="disc-listened"></div></section></div>
    <p class="disc-method">Artist connections and album popularity come from Last.fm. Album identities and available community scores come from MusicBrainz. Community ratings show their vote count; they do not override your own ratings. Sleeve does not pull ratings from Album of the Year or Rate Your Music.</p>`;

  let alive = true, taste, pool = [], albums = [], mode = 'for-you', selectedSeed = '', runCtrl;
  const editionKey = `liner.discover.edition:${ctx.pid}`;
  const lookup = new Map();
  const keepRated = new Set();
  onLeave(() => { alive = false; runCtrl?.abort(); });
  const remember = (item) => { lookup.set(tasteKey(item.kind, item.name, item.artist), item); return item; };
  const feedback = (item) => taste?.items[tasteKey(item.kind, item.name, item.artist)] || {};
  const marker = (item) => {
    const f = feedback(item);
    return f.status === 'saved' ? '<span class="disc-mark">Saved to your shelf</span>' : '';
  };
  const controls = (item, compact = false) => {
    const key = esc(tasteKey(item.kind, item.name, item.artist)), f = feedback(item);
    const stars = `<div class="disc-stars" role="group" aria-label="Your rating for ${esc(item.name)}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-rate="${n}" aria-label="Rate ${n} out of 5" aria-pressed="${f.rating === n}">${f.rating >= n ? '★' : '☆'}</button>`).join('')}<small>${f.rating ? `${f.rating}/5 · yours` : 'Your rating'}</small></div>`;
    if (compact) return `<div class="disc-controls disc-controls--compact" data-key="${key}">${stars}</div>`;
    return `<div class="disc-controls" data-key="${key}"><button type="button" data-judge="saved" class="disc-save" aria-pressed="${f.status === 'saved'}">${f.status === 'saved' ? '✓ On your shelf' : '＋ Save to shelf'}</button>
      <details class="disc-tools"><summary>${f.rating || f.note ? 'Edit your take' : 'Your take'} <span aria-hidden="true">＋</span></summary><div class="disc-tools__body">${stars}<div class="disc-actions">
      <button type="button" data-judge="known" aria-pressed="${f.status === 'known'}">${f.status === 'known' ? '✓ Already know' : 'Already know'}</button>
      <button type="button" data-judge="hidden" aria-pressed="${f.status === 'hidden'}">${f.status === 'hidden' ? '↶ Restore' : 'Not for me'}</button></div>
      <form data-disc-note="${key}"><label class="sr" for="note-${encodeURIComponent(key)}">Your note about ${esc(item.name)}</label><textarea id="note-${encodeURIComponent(key)}" name="note" maxlength="800" rows="3" placeholder="What stood out to you?">${esc(f.note || '')}</textarea><button type="submit" class="btn btn--line btn--sm">Save note</button></form></div></details></div>`;
  };
  const reason = (x) => x.sources.slice(0, 2).map((s) => s.name).join(' + ');
  const status = (message, pct) => {
    if (!alive) return;
    $('#disc-status', root).textContent = message;
    if (pct != null) { const bar = $('.ms-progress', root); bar.setAttribute('aria-valuenow', String(pct)); bar.classList.toggle('is-complete', pct === 100); $('i', bar).style.width = `${pct}%`; }
  };
  const paintArtists = () => {
    if (!alive || !taste) return;
    const scope = selectedSeed ? pool.filter((x) => x.sources.some((s) => s.name === selectedSeed)) : pool;
    const picks = rankCandidates(scope, taste, mode, keepRated);
    $('#disc-count', root).textContent = `${picks.length} picks`;
    $('#disc-mode-copy', root).textContent = selectedSeed ? `From ${selectedSeed} in your record.` : mode === 'deep' ? 'Smaller Last.fm audiences, still connected to your record.'
      : mode === 'explore' ? 'A little further from the names you know.' : 'The clearest threads from your recent and long-term favorites.';
    const lead = picks.find((x) => x.audience && x.audience <= 3000000 && x.sources.length >= 2)
      || picks.find((x) => x.audience && x.audience <= 5000000) || picks[0];
    if (lead) {
      const item = remember({ kind: 'artist', name: lead.name, artist: '', mbid: lead.mbid });
      $('#disc-feature', root).innerHTML = `<article class="disc-feature__inner"><div class="disc-feature__art">${sleeve(lead.name, lead.name, { size: 240, kind: 'artist' })}</div><div class="disc-feature__body"><span class="label">FIRST ON THE STACK / 01</span><h3>${esc(lead.name)}</h3><p>Not in your listening history. Last.fm connects this artist to <b>${esc(reason(lead))}</b>${lead.sources.length > 2 ? ` and ${lead.sources.length - 2} other artists you play` : ''}.</p><div class="disc-feature__meta">${lead.audience ? `${compact(lead.audience)} Last.fm listeners` : 'Audience still being checked'} <span>·</span> ${lead.sources.length} ${lead.sources.length === 1 ? 'connection' : 'connections'}</div><div class="disc-feature__links"><a class="link" href="${spotifyArtist(lead.name)}" target="_blank" rel="noopener">Find music ↗</a><a class="link link--quiet" href="${lastfmArtist(lead.name)}" target="_blank" rel="noopener">Artist details ↗</a></div>${controls(item)}</div></article>`;
    } else $('#disc-feature', root).innerHTML = '<p class="empty">No unheard artists matched this view. Change the distance or starting point.</p>';
    $('#disc-artists', root).innerHTML = picks.filter((x) => x !== lead).map((x, i) => {
      const item = remember({ kind: 'artist', name: x.name, artist: '', mbid: x.mbid });
      return `<article class="disc-artist"><span class="disc-no">${String(i + 2).padStart(2, '0')}</span>${sleeve(x.name, x.name, { size: 54, kind: 'artist' })}<div class="disc-artist__body"><h3>${esc(x.name)}</h3><p>From ${esc(reason(x))}${x.sources.length > 2 ? ` + ${x.sources.length - 2} more` : ''}</p></div><span class="disc-artist__audience">${x.audience ? `${compact(x.audience)} listeners` : 'New to you'}</span><a class="link link--quiet" href="${spotifyArtist(x.name)}" target="_blank" rel="noopener" aria-label="Find music by ${esc(x.name)}">Listen ↗</a>${controls(item)}</article>`;
    }).join('');
    hydrate($('#disc-feature', root)); hydrate($('#disc-artists', root));
  };
  const paintAlbums = () => {
    if (!alive || !taste) return;
    const visible = albums.filter((x) => {
      const own = feedback({ kind: 'album', name: x.name, artist: x.artist });
      const artistOwn = taste.items[tasteKey('artist', x.artist)];
      return own.status !== 'hidden' && own.status !== 'known' && (!own.rating || keepRated.has(tasteKey('album', x.name, x.artist))) && artistOwn?.status !== 'hidden' && artistOwn?.status !== 'known' && !artistOwn?.rating;
    });
    $('#disc-albums', root).innerHTML = visible.length ? visible.map((x, i) => {
      const item = remember({ kind: 'album', name: x.name, artist: x.artist, mbid: x.group.id });
      const g = x.group, critics = x.reviews ? `<a href="https://critiquebrainz.org/release-group/${g.id}" target="_blank" rel="noopener">${num(x.reviews)} written reviews ↗</a>` : '';
      const community = g.votes >= 20 ? `<b>${g.rating?.toFixed(1)}<small>/5</small></b><span>MusicBrainz · ${num(g.votes)} ratings</span>`
        : g.votes ? `<span>MusicBrainz · ${num(g.votes)} ratings<br><small>Too few for a reliable score</small></span>` : '<span>No community score yet</span>';
      return `<article class="disc-album${i === 0 ? ' disc-album--lead' : ''}"><span class="disc-album__no">${String(i + 1).padStart(2, '0')}</span>${sleeve(x.name, x.artist, { size: i === 0 ? 176 : 88, kind: 'album' })}<div class="disc-album__body"><span class="label">${esc(g.type)}${g.date ? ` / ${esc(g.date.slice(0, 4))}` : ''}</span><h3>${esc(x.name)}</h3><p class="disc-album__artist">${esc(x.artist)}</p>${marker(item)}<p class="disc-why">Start here if you follow the thread from <b>${esc(x.reason.join(' + '))}</b>.</p><div class="disc-links"><a class="link" href="${spotifySearch(x.name, x.artist)}" target="_blank" rel="noopener">Find the record ↗</a><a class="link link--quiet" href="${esc(x.url || lastfmAlbum(x.name, x.artist))}" target="_blank" rel="noopener">Details ↗</a></div>${controls(item)}</div><aside class="disc-community"><span class="label">COMMUNITY OPINION</span>${community}${critics}</aside></article>`;
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
      selectedSeed = ''; mode = 'for-you'; keepRated.clear();
      $$('[data-disc-mode]', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.discMode === mode)));
      build(); return;
    }
    if (event.target.closest('[data-disc-export]')) {
      if (!taste) return;
      const blob = new Blob([JSON.stringify(tasteExport(taste), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `sleeve-shelf-${ctx.pid.replace(/[^a-z0-9-]+/gi, '-')}.json`;
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
    try { await setTasteItem(ctx.pid, item, patch); if (control.dataset.rate) keepRated.add(key); repaint(); }
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
      if (file.size > 2e6) throw new Error('That shelf file is too large.');
      const count = await importTaste(ctx.pid, JSON.parse(await file.text()));
      if (alive) { repaint(); toast(`Imported ${num(count)} shelf entries.`); }
    } catch (e) { toast(e instanceof SyntaxError ? 'That file is not valid JSON.' : e.message, 'bad'); }
    event.target.value = '';
  });

  async function build() {
    runCtrl?.abort(); runCtrl = new AbortController();
    const signal = runCtrl.signal;
    pool = []; albums = [];
    $('#disc-feature', root).innerHTML = '<div class="disc-feature__loading"><span>01 / FIRST ON THE STACK</span><b>Tracing the artists in your record…</b></div>';
    $('#disc-artists', root).innerHTML = '';
    $('#disc-albums', root).innerHTML = '';
    const deepButton = $('[data-disc-mode="deep"]', root);
    deepButton.disabled = true;
    deepButton.innerHTML = 'Deep cuts <small>checking…</small>';
    const seeds = discoverySeeds(ctx.A, taste, Number(store.get(editionKey) || 0));
    $('#disc-seeds', root).innerHTML = `<span class="label">TRACE A CONNECTION</span><button type="button" data-disc-seed="" aria-pressed="true">All</button>${seeds.map((s) => `<button type="button" data-disc-seed="${esc(s.name)}" aria-pressed="false">${esc(s.name)}</button>`).join('')}`;
    if (!lastfm.isLive()) {
      status('Add a Last.fm API key in Settings to find new artists.', 0);
      $('#disc-album-status', root).innerHTML = '<a class="link" href="#/settings">Open Settings →</a>';
      return;
    }
    try {
      status('Following connections from your favorite artists…', 4);
      pool = await candidatePool(ctx.A, seeds, signal, (done, total) => status(`Checking connections · ${done} of ${total} artists`, Math.round(done / total * 54)));
      if (!alive || signal.aborted) return;
      if (!pool.length) { status('Last.fm returned no new matches. Try again later or save a few artists.', 100); $('#disc-album-status', root).textContent = 'No album candidates yet.'; return; }
      status(`${pool.length} unheard artists found · checking the first picks`, 57);
      const firstLook = rankCandidates(pool, taste, 'for-you').slice(0, 12);
      await Promise.all(firstLook.map((x) => listeners(x.name)));
      if (!alive || signal.aborted) return;
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
      const top = [...pool].sort((a, b) => b.score - a.score).slice(0, 36);
      for (let i = 0; i < top.length; i += 4) {
        if (!alive || signal.aborted) return;
        await Promise.allSettled(top.slice(i, i + 4).map((x) => listeners(x.name)));
        if (alive && !signal.aborted) deepButton.innerHTML = `Deep cuts <small>${Math.min(i + 4, top.length)}/${top.length}</small>`;
        if (i >= 16 && top.filter((x) => cachedListeners(x.name) > 0).length >= 20) break;
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
