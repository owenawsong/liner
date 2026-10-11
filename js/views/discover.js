import { $, $$, esc, sleeve, num, compact, toast, store } from '../ui.js';
import { onLeave } from '../core.js';
import { hydrate, critiqueCount } from '../meta.js';
import { discoverySeeds, rankCandidates, connectionReason, usefulCuration } from '../discovery.js';
import { buildRecommendations, startingRecords, recommendationOutcome } from '../recommendations.js';
import { getTaste, setTasteItem, tasteKey, tasteExport, importTaste, normalize } from '../taste.js';
import * as lastfm from '../sources/lastfm.js';

const modes = [['for-you', 'For you'], ['explore', 'Further out'], ['deep', 'Deep cuts']];
const spotifySearch = (name, artist) => `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${name}`)}`;
const spotifyArtist = (name) => `https://open.spotify.com/search/${encodeURIComponent(name)}`;
const lastfmArtist = (name) => `https://www.last.fm/music/${encodeURIComponent(name)}`;
const lastfmAlbum = (name, artist) => `${lastfmArtist(artist)}/${encodeURIComponent(name)}`;

export function ratingsReviewsHTML(name,artist,group=null,reviews=0) {
  const score=Number.isFinite(group?.rating)&&group.rating>=0&&group.rating<=5&&group.votes>=20;
  const matched=group?.id?`<a href="https://musicbrainz.org/release-group/${esc(group.id)}" target="_blank" rel="noopener">${score?`MusicBrainz community · ${group.rating.toFixed(1)}/5 · ${num(group.votes)} ratings`:group.votes?`MusicBrainz · ${num(group.votes)} ratings (score not shown)`:'View the MusicBrainz record'} ↗</a>`:'';
  const written=group?.id&&reviews?`<a href="https://critiquebrainz.org/release-group/${esc(group.id)}" target="_blank" rel="noopener">CritiqueBrainz · ${num(reviews)} written reviews ↗</a>`:'';
  return `<details class="disc-ratings" data-opinion-key="${esc(tasteKey('album',name,artist))}"><summary>Ratings & reviews <span aria-hidden="true">＋</span></summary><div>${matched}${written}<a href="https://www.albumoftheyear.org/search/?q=${encodeURIComponent(`${artist} ${name}`)}" target="_blank" rel="noopener">Search Album of the Year ↗</a><a href="https://rateyourmusic.com/search?searchterm=${encodeURIComponent(`${artist} ${name}`)}&searchtype=l" target="_blank" rel="noopener">Search Rate Your Music ↗</a><small>AOTY and RYM open search results on their sites; their scores are not imported. Community opinions are separate from your rating.</small></div></details>`;
}

export function shelfImportPreview(input,taste) {
  if(input?.format!=='sleeve-taste-v1'||!Array.isArray(input.items)||input.items.length>10000)throw new Error('Choose a Sleeve shelf backup (.json). AOTY and RYM exports cannot be restored here.');
  const rows=new Map();
  for(const row of input.items){
    if(!['album','artist'].includes(row?.kind)||typeof row.name!=='string'||!row.name.trim()||!['','saved','known','hidden'].includes(row.status||''))continue;
    const name=row.name.trim().slice(0,200),artist=String(row.artist||'').trim().slice(0,200),key=tasteKey(row.kind,name,artist),rating=Number(row.rating);
    rows.set(key,{kind:row.kind,name,artist,mbid:String(row.mbid||'').slice(0,40),status:row.status||'',rating:row.rating!=null&&Number.isFinite(rating)&&rating>=1&&rating<=5?rating:null,note:String(row.note||'').slice(0,800)});
  }
  if(!rows.size)throw new Error('This backup has no valid shelf entries to restore.');
  const replaced=[...rows.keys()].filter(key=>Object.prototype.hasOwnProperty.call(taste.items,key)).length;
  return {input:{format:'sleeve-taste-v1',items:[...rows.values()]},added:rows.size-replaced,replaced,total:rows.size};
}

export function discoveryIntroduction(seeds,A) {
  if(!seeds.length)return 'There are no artist starting points in this record yet. More listening or a saved favorite will give Discover something personal to follow.';
  const recent=seeds.filter(seed=>seed.recentPlays>0).slice(0,3);
  const names=(recent.length?recent:seeds.slice(0,3)).map(seed=>seed.name).join(', ');
  const sparse=(A.artists?.length || 0)<4;
  return `${recent.length?'Following your latest recorded rotation':'Following your listening history and saved favorites'}: ${names}. ${sparse?'This is an early selection from a small record; it will broaden as you listen.':'Try a close connection, another direction, or a record from your own archive.'}`;
}

export function discoverView(ctx, banner) {
  const root = $('#tab');
  root.innerHTML = `${banner}
    <header class="disc-head"><div><span class="label">DISCOVER</span><h2>What to play next</h2><p id="disc-personal-copy">Three ways into your next listen: follow your current rotation, try another direction, or return to a record you left behind.</p></div><button type="button" class="link" data-refresh>Another selection ↗</button></header>
    <div id="disc-status" class="disc-status" role="status" aria-live="polite">Reading your listening record…</div><div class="ms-progress disc-preparation is-working" role="progressbar" aria-label="Finding recommendations" aria-valuemin="0" aria-valuemax="100"><i></i></div>
    <div id="disc-feedback" class="disc-feedback" role="status" aria-live="polite" hidden></div>
    <div id="disc-starts" class="disc-starts" aria-live="polite"><div class="disc-start-placeholder"><span class="label">CHOOSING YOUR STARTING RECORDS</span><p>Checking artist catalogues and matching the albums. Your saved selection will appear here first.</p></div></div>
    <div class="disc-seeds" id="disc-seeds"></div>
    <details class="disc-section disc-artist-browser"><summary>Explore the artist connections <span class="label" id="disc-count"></span></summary>
      <div class="disc-toolbar"><div class="seg" role="group" aria-label="Discovery distance">${modes.map(([id, label]) => `<button type="button" data-disc-mode="${id}" aria-pressed="${id === 'for-you'}"${id === 'deep' ? ' disabled title="Checking artist audiences"' : ''}>${label}</button>`).join('')}</div><p id="disc-mode-copy" class="faint"></p></div>
      <div id="disc-feature" class="disc-feature" aria-live="polite"></div>
      <div id="disc-artists" class="disc-artists"></div>
    </details>
    <section class="disc-section"><div class="disc-section__head"><div><span class="label">FROM THE SAME CONNECTIONS</span><h2>More records to try</h2></div><span class="label">Album & artist matched</span></div>
      <p class="muted">More matched records from the same selection. Your own saves and passes shape future picks; community scores stay secondary.</p><div id="disc-album-status" class="disc-status" role="status" aria-live="polite">Finding artists first…</div><div id="disc-albums" class="disc-albums"></div>
    </section>
    <div class="disc-lower"><details class="disc-section disc-collection"><summary><b>Your opinions</b><span>Rate music you already know <i aria-hidden="true">＋</i></span></summary><div class="disc-collection__body"><p class="muted">Optional: your ratings help shape future picks. Listening counts never become ratings.</p><label class="sr" for="disc-album-search">Find an album in your history</label><input id="disc-album-search" class="input" type="search" placeholder="Search your listened albums…" autocomplete="off"><div id="disc-listened"></div></div></details>
      <details class="disc-section disc-collection"><summary><b>Your shelf</b><span><span id="disc-shelf-count">Loading…</span> <i aria-hidden="true">＋</i></span></summary><div class="disc-collection__body"><div id="disc-shelf"></div><div class="disc-backup"><p>Saved music and your notes stay in this browser. Export a Sleeve JSON backup to keep a copy or move it to another device.</p><div><button class="btn btn--line btn--sm" type="button" data-disc-export>Export Sleeve backup</button><label class="btn btn--line btn--sm" for="disc-import">Restore Sleeve backup</label><input id="disc-import" type="file" accept=".json,application/json" hidden></div><div id="disc-import-preview" hidden></div></div></div></details></div>
    <p class="disc-method">Connections and artist tags: Last.fm. Album identities and community scores: MusicBrainz. The optional AI curator works from this candidate data and your listening summary; your raw plays stay here. Community scores stay separate from your own opinions.</p>`;

  let alive = true, taste, pool = [], albums = [], catalogue = [], starts = {}, curation = [], mode = 'for-you', selectedSeed = '', runCtrl,showAllShelf=false,pendingImport=null,lastFeedback=null;
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
  const explanation = (x) => usefulCuration(x.editorial,x) ? x.editorial : connectionReason(x);
  const paintStarts = () => {
    if (!alive || !taste) return;
    const openOpinions=new Set($$('.disc-ratings[open]',$('#disc-starts',root)).map(x=>x.dataset.opinionKey));
    starts=startingRecords(pool,albums,catalogue,taste,ctx.A,curation);
    const labels={current:['01','FOLLOW YOUR ROTATION','A close connection'],explore:['02','TRY ANOTHER DIRECTION','A different starting point'],revisit:['03','FROM YOUR OWN ARCHIVE','Worth another listen']};
    const rows=Object.values(starts).filter(Boolean);
    $('#disc-starts',root).innerHTML=rows.length ? rows.map(x=>{
      const label=labels[x.lane], album=x.album, track=x.track;
      const item=remember(album?{kind:'album',name:album.name,artist:x.artist,mbid:album.group?.id || ''}:{kind:'artist',name:x.artist,artist:''});
      const group=album?.group;
      return `<article class="disc-start disc-start--${x.lane}"><div class="disc-start__mast"><span>${label[0]}</span><span class="label">${label[1]}</span></div>
        <div class="disc-start__cover">${sleeve(album?.name || x.artist,x.artist,{size:260,kind:album?'album':'artist'})}</div>
        <div class="disc-start__body"><span class="label">${album ? `${esc(group?.type || 'FROM YOUR HISTORY')}${group?.date?` · ${esc(group.date.slice(0,4))}`:''}` : 'START WITH A TRACK'}</span>
        <h3>${esc(album?.name || track?.name || x.artist)}</h3><p class="disc-start__artist">${esc(x.artist)}</p>
        <p class="disc-start__why">${esc(x.reason)}</p>
        ${track ? `<div class="disc-start__track"><span class="label">${x.recorded?'YOUR MOST PLAYED TRACK':album?'OR TRY THIS TRACK':'START WITH THIS TRACK'}</span><a data-start-listen="${x.lane}" href="${spotifySearch(track.name,x.artist)}" target="_blank" rel="noopener"><b>${esc(track.name)}</b><span aria-hidden="true">↗</span></a><small>${x.recorded?`${num(track.plays)} plays in your record`:track.listeners?`${compact(track.listeners)} Last.fm track listeners · artist catalogue`:'From the artist’s Last.fm catalogue'}</small></div>`:''}
        <div class="disc-start__actions"><a class="btn btn--sm" data-start-listen="${x.lane}" href="${spotifySearch(album?.name || track?.name || '',x.artist)}" target="_blank" rel="noopener">Find on Spotify ↗</a><div data-key="${esc(tasteKey(item.kind,item.name,item.artist))}"><button type="button" data-judge="saved" data-start-outcome="${x.lane}" aria-pressed="${feedback(item).status==='saved'}">${feedback(item).status==='saved'?'✓ Saved':'Save for later'}</button>${x.recorded?'':`<button type="button" data-judge="known" data-start-outcome="${x.lane}">Already heard</button>`}<button type="button" data-judge="hidden" data-start-outcome="${x.lane}">Pass</button></div></div>
        ${album?ratingsReviewsHTML(album.name,x.artist,group,album.reviews||0):''}</div></article>`;
    }).join('') : '<p class="empty">No playable starting record passed the catalogue checks for this selection. Explore the artist connections below, or save a favorite to give the next selection another starting point.</p>';
    $('#disc-starts',root).dataset.count=String(rows.length);
    $$('.disc-ratings',$('#disc-starts',root)).forEach(x=>{x.open=openOpinions.has(x.dataset.opinionKey);});
    hydrate($('#disc-starts',root));
  };
  const status = (message, pct) => {
    if (!alive) return;
    $('#disc-status', root).textContent = message;
    if (pct != null) {
      const bar = $('.ms-progress', root), complete=pct===100;
      if(complete)bar.setAttribute('aria-valuenow','100');else bar.removeAttribute('aria-valuenow');
      bar.setAttribute('aria-valuetext',message);
      bar.classList.toggle('is-complete',complete);bar.classList.toggle('is-working',!complete);
      $('i',bar).style.width=complete?'100%':'';
    }
  };
  const paintArtists = () => {
    if (!alive || !taste) return;
    const scope = selectedSeed ? pool.filter((x) => x.sources.some((s) => s.name === selectedSeed)) : pool;
    const picks = rankCandidates(scope, taste, mode, keepRated, curation);
    $('#disc-count', root).textContent = `${picks.length} picks`;
    $('#disc-mode-copy', root).textContent = selectedSeed ? `From ${selectedSeed} in your record.` : mode === 'deep' ? 'Smaller Last.fm audiences, still connected to your record.'
      : mode === 'explore' ? 'A little further from the names you know.' : 'The clearest threads from your recent and long-term favorites.';
    const lead = picks[0];
    if (lead) {
      const item = remember({ kind: 'artist', name: lead.name, artist: '', mbid: lead.mbid });
      const track=catalogue.find(t=>normalize(t.artist)===normalize(lead.name));
      $('#disc-feature', root).innerHTML = `<article class="disc-feature__inner"><div class="disc-feature__art">${sleeve(lead.name, lead.name, { size: 64, kind: 'artist' })}</div><div class="disc-feature__body"><h3>${esc(lead.name)}</h3><p>${esc(explanation(lead))}</p><div class="disc-feature__meta">${lead.audience ? `${compact(lead.audience)} Last.fm listeners` : 'Audience count unavailable'} <span>·</span> ${lead.sources.length} ${lead.sources.length === 1 ? 'connection' : 'connections'} <span>·</span> Not in your record</div><div class="disc-feature__links"><a class="link" href="${spotifySearch(track?.name||'',lead.name)}" target="_blank" rel="noopener">${track?`Start with ${esc(track.name)}`:'Find the artist'} ↗</a><a class="link link--quiet" href="${lastfmArtist(lead.name)}" target="_blank" rel="noopener">Artist details ↗</a></div>${controls(item)}</div></article>`;
    } else $('#disc-feature', root).innerHTML = '<p class="empty">No unheard artists matched this view. Change the distance or starting point.</p>';
    $('#disc-artists', root).innerHTML = picks.filter((x) => x !== lead).map((x, i) => {
      const item = remember({ kind: 'artist', name: x.name, artist: '', mbid: x.mbid });
      const track=catalogue.find(t=>normalize(t.artist)===normalize(x.name));
      return `<article class="disc-artist"><span class="disc-no">${String(i + 2).padStart(2, '0')}</span>${sleeve(x.name, x.name, { size: 54, kind: 'artist' })}<div class="disc-artist__body"><h3>${esc(x.name)}</h3><p>${esc(explanation(x))}</p>${track?`<a class="link" href="${spotifySearch(track.name,x.name)}" target="_blank" rel="noopener">Start with ${esc(track.name)} ↗</a>`:''}</div><span class="disc-artist__audience">${x.audience ? `${compact(x.audience)} listeners` : 'New to you'}</span><a class="link link--quiet" href="${spotifyArtist(x.name)}" target="_blank" rel="noopener" aria-label="Find music by ${esc(x.name)}">Listen ↗</a>${controls(item)}</article>`;
    }).join('');
    hydrate($('#disc-feature', root)); hydrate($('#disc-artists', root));
  };
  const paintAlbums = () => {
    if (!alive || !taste) return;
    const openOpinions=new Set($$('.disc-ratings[open]',$('#disc-albums',root)).map(x=>x.dataset.opinionKey));
    const opening=new Set(Object.values(starts).filter(x=>x?.album).map(x=>tasteKey('album',x.album.name,x.artist)));
    const visible = albums.filter((x) => {
      const own = feedback({ kind: 'album', name: x.name, artist: x.artist });
      const artistOwn = taste.items[tasteKey('artist', x.artist)];
      return !opening.has(tasteKey('album',x.name,x.artist)) && own.status !== 'hidden' && own.status !== 'known' && (!own.rating || keepRated.has(tasteKey('album', x.name, x.artist))) && artistOwn?.status !== 'hidden' && artistOwn?.status !== 'known' && !artistOwn?.rating;
    });
    $('#disc-albums', root).innerHTML = visible.length ? visible.map((x, i) => {
      const item = remember({ kind: 'album', name: x.name, artist: x.artist, mbid: x.group.id });
      const g = x.group;
      return `<article class="disc-album${i === 0 ? ' disc-album--lead' : ''}"><span class="disc-album__no">${String(i + 1).padStart(2, '0')}</span>${sleeve(x.name, x.artist, { size: i === 0 ? 176 : 88, kind: 'album' })}<div class="disc-album__body"><span class="label">${esc(g.type)}${g.date ? ` / ${esc(g.date.slice(0, 4))}` : ''}</span><h3>${esc(x.name)}</h3><p class="disc-album__artist">${esc(x.artist)}</p>${marker(item)}<p class="disc-why">Connected through <b>${esc(x.reason.join(' + '))}</b>.</p><div class="disc-links"><a class="link" href="${spotifySearch(x.name, x.artist)}" target="_blank" rel="noopener">Listen on Spotify ↗</a><a class="link link--quiet" href="${esc(x.url || lastfmAlbum(x.name, x.artist))}" target="_blank" rel="noopener">Details ↗</a></div>${controls(item)}</div><aside class="disc-community">${ratingsReviewsHTML(x.name,x.artist,g,x.reviews||0)}</aside></article>`;
    }).join('') : '<p class="empty">No new albums passed the identity check yet. Try rebuilding after more listening or rating a few records.</p>';
    $$('.disc-ratings',$('#disc-albums',root)).forEach(x=>{x.open=openOpinions.has(x.dataset.opinionKey);});
    hydrate($('#disc-albums', root));
  };
  const paintShelf = () => {
    if (!alive || !taste) return;
    const all = Object.values(taste.items).filter((x) => x.status || x.rating || x.note).sort((a, b) => b.updated - a.updated);
    $('#disc-shelf-count', root).textContent = `${all.length} ${all.length === 1 ? 'entry' : 'entries'}`;
    const row = (x) => { remember(x); return `<div class="disc-shelf-row">${sleeve(x.name, x.artist || x.name, { size: 44, round: x.kind === 'artist', kind: x.kind })}<div><b>${esc(x.name)}</b><small>${esc(x.artist || 'Artist')}${x.rating ? ` · your ${x.rating}/5` : ''}${x.status ? ` · ${x.status}` : ''}</small>${x.note ? `<p>${esc(x.note)}</p>` : ''}</div>${controls(x)}</div>`; };
    const visible=all.filter(x=>x.status!=='hidden');
    $('#disc-shelf', root).innerHTML = all.length ? `${visible.slice(0,showAllShelf?visible.length:20).map(row).join('')}${visible.length>20?`<button class="btn btn--line btn--sm disc-show-shelf" type="button" data-disc-show-shelf>${showAllShelf?'Show recent 20':`Show all ${num(visible.length)} shelf entries`}</button>`:''}${all.some((x) => x.status === 'hidden') ? `<details class="disc-hidden"><summary>${all.filter((x) => x.status === 'hidden').length} hidden items</summary>${all.filter((x) => x.status === 'hidden').map(row).join('')}</details>` : ''}` : '<p class="empty">Save an artist, rate a record, or add a note. Your shelf will grow here.</p>';
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
  const repaint = () => { paintStarts(); paintArtists(); paintAlbums(); paintShelf(); paintListened(); };

  root.addEventListener('click', async (event) => {
    const undo=event.target.closest('[data-disc-undo]');
    if(undo&&lastFeedback){undo.disabled=true;try{await setTasteItem(ctx.pid,lastFeedback.item,{status:lastFeedback.status});if(lastFeedback.start)await recommendationOutcome(ctx.pid,lastFeedback.start,'undo');if(!alive)return;lastFeedback=null;$('#disc-feedback',root).hidden=true;repaint();toast('Your previous choice was restored.');}catch(e){toast(e.message,'bad');undo.disabled=false;}return;}
    if(event.target.closest('[data-disc-show-shelf]')){showAllShelf=!showAllShelf;paintShelf();return;}
    if(event.target.closest('[data-disc-cancel-import]')){pendingImport=null;$('#disc-import-preview',root).hidden=true;return;}
    const applyImport=event.target.closest('[data-disc-apply-import]');
    if(applyImport&&pendingImport){applyImport.disabled=true;try{const count=await importTaste(ctx.pid,pendingImport.input);pendingImport=null;if(alive){$('#disc-import-preview',root).hidden=true;repaint();toast(`Restored ${num(count)} shelf entries.`);}}catch(e){toast(e.message,'bad');applyImport.disabled=false;}return;}
    const listen=event.target.closest('[data-start-listen]');
    if(listen) { recommendationOutcome(ctx.pid,starts[listen.dataset.startListen],'listen').catch(()=>{}); return; }
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
    try {
      const start=control.dataset.startOutcome ? starts[control.dataset.startOutcome] : null;
      await setTasteItem(ctx.pid, item, patch);
      if(start && patch.status)await recommendationOutcome(ctx.pid,start,patch.status==='saved'?'save':patch.status==='hidden'?'pass':'known');
      if(!alive)return;
      if(control.dataset.rate)keepRated.add(key);
      if(control.dataset.judge){
        lastFeedback={item,status:old.status || '',start};
        const receipt=$('#disc-feedback',root);receipt.hidden=false;
        const message=patch.status==='saved'?'Saved for later. Saved favorites help seed your next selection.':patch.status==='hidden'?item.kind==='artist'?'Passed. This artist is removed from your picks.':'Passed. This record is removed from your picks; other music by the artist can still appear.':patch.status==='known'?'Marked already heard. This item is removed from new discoveries.':'Your shelf choice was cleared.';
        receipt.innerHTML=`<span><b>${esc(item.name)}</b> — ${message}</span><button type="button" class="link" data-disc-undo>Undo</button>`;
      }
      repaint();
      if(patch.status==='hidden'||patch.status==='known')$('[data-disc-undo]',root)?.focus({preventScroll:true});
    }
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
    if(!taste){toast('Your shelf is still loading. Try again in a moment.');event.target.value='';return;}
    pendingImport=null;$('#disc-import-preview',root).hidden=true;
    try {
      if (file.size > 2e6) throw new Error('That shelf file is too large.');
      const input=JSON.parse(await file.text());if(!alive)return;
      pendingImport=shelfImportPreview(input,taste);
      const preview=$('#disc-import-preview',root);preview.hidden=false;preview.innerHTML=`<h3>Restore ${esc(file.name)}?</h3><p>${num(pendingImport.added)} new entries · ${num(pendingImport.replaced)} existing entries will be replaced with this backup’s ratings, notes and saved status.</p><div><button class="btn btn--sm" type="button" data-disc-apply-import>Apply backup</button><button class="btn btn--line btn--sm" type="button" data-disc-cancel-import>Cancel</button></div>`;
    } catch (e) { toast(e instanceof SyntaxError ? 'That file is not valid JSON.' : e.message, 'bad'); }
    event.target.value = '';
  });

  async function build() {
    runCtrl?.abort(); runCtrl = new AbortController();
    const controller = runCtrl;
    const signal = runCtrl.signal;
    if(!pool.length) $('#disc-feature', root).innerHTML = '<div class="disc-feature__loading"><span>YOUR RECOMMENDATIONS</span><b>Preparing artists and starting records…</b></div>';
    const deepButton = $('[data-disc-mode="deep"]', root);
    deepButton.disabled = true;
    deepButton.innerHTML = 'Deep cuts <small>checking…</small>';
    const seeds = discoverySeeds(ctx.A, taste, Number(store.get(editionKey) || 0));
    $('#disc-seeds', root).innerHTML = `<span class="label">BASED ON</span><button type="button" data-disc-seed="" aria-pressed="true">All</button>${seeds.map((s) => `<button type="button" data-disc-seed="${esc(s.name)}" aria-pressed="false">${esc(s.name)}</button>`).join('')}`;
    $('#disc-personal-copy',root).textContent=discoveryIntroduction(seeds,ctx.A);
    if (!lastfm.isLive()) {
      status('Add a Last.fm API key in Settings to find new artists.', 0);
      $('#disc-feature',root).innerHTML='<p class="empty">Artist recommendations need a Last.fm API key. Your listening stats and saved shelf still work.</p>';
      $('#disc-album-status', root).innerHTML = '<a class="link" href="#/settings">Open Settings →</a>';
      paintStarts();
      return;
    }
    const deadline=setTimeout(()=>controller.abort('timeout'),95000);
    try {
      const applyBoard=(board)=>{
        if(!alive||signal.aborted)return;
        pool=board.pool;albums=board.albums;catalogue=board.catalogue||[];curation=board.curation||[];
        paintStarts();paintArtists();paintAlbums();
        deepButton.disabled=!pool.some(x=>x.audience>0);
        deepButton.textContent='Deep cuts';
        deepButton.title=deepButton.disabled?'Artist audiences are unavailable for this selection.':'';
        $('#disc-album-status',root).textContent=`${albums.length} matched albums${board.writingPending?' · listening notes are still being prepared':''}`;
        status(board.writingPending?'Your checked picks are available. Listening notes are still being prepared…':'Your checked picks are available. Preparing their artwork…',85);
      };
      const board=await buildRecommendations({...ctx,taste},{signal,edition:Number(store.get(editionKey)||0),onProgress:status,onPreview:applyBoard});
      if(!alive||signal.aborted)return;
      pool=board.pool;albums=board.albums;catalogue=board.catalogue||[];curation=board.curation||[];
      if(board.warning){status(board.warning,100);paintStarts();paintArtists();paintAlbums();return;}
      paintStarts();paintArtists();paintAlbums();
      $('#disc-album-status',root).textContent=`${albums.length} matched albums · ${curation.length?'recommendation notes prepared':'ranked from your artist connections'}`;
      status(`${pool.length} artists absent from this record · selection saved ${new Date(board.at).toLocaleDateString('en',{month:'short',day:'numeric'})}${board.aiIssue?' · Using catalogue connections while writing is unavailable.':''}`,100);
      Promise.all(albums.map((x) => critiqueCount(x.group.id))).then((counts) => {
        if (!alive || signal.aborted) return;
        albums.forEach((x, i) => { x.reviews = counts[i]; }); paintAlbums();
      });
      if (!alive || signal.aborted) return;
      deepButton.disabled = !pool.some(x=>x.audience>0);
      deepButton.title=deepButton.disabled?'Artist audiences are unavailable for this selection.':'';
      deepButton.textContent = 'Deep cuts';
    } catch (e) {
      if (!alive || (signal.aborted && signal.reason!=='timeout')) return;
      status(pool.length?'Your checked records are available. The remaining preparation paused; try another selection to retry.':`Discovery paused: ${e.message}`,pool.length?100:0);
      paintStarts();
      $('#disc-album-status', root).textContent = 'Your ratings and saved items still work. Rebuild picks to retry.';
      if(!pool.length)$('#disc-feature',root).innerHTML='<p class="empty">The recommendation checks could not finish. Your listening stats are ready; use “Another selection” to try again.</p>';
    } finally {
      clearTimeout(deadline);
    }
  }

  (async () => {
    taste = await getTaste(ctx.pid);
    if (!alive) return;
    paintShelf(); paintListened();
    build();
  })();
}
