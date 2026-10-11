import { $, $$, esc, avatar, num, icon, sleeve } from '../ui.js';
import { view, hrefFor, profiles, getArchive, prepareAnalysis, onLeave } from '../core.js';
import { hydrate } from '../meta.js';
import { evolution } from '../evolution.js';
import { revisitRecord } from '../discovery.js';

const month = t => new Date(t).toLocaleDateString('en',{month:'short',year:'numeric'});
const journey = `<ol class="welcome-journey"><li><span>01</span><div><b>Bring your listening</b><p>A Last.fm username is enough. Your Spotify history file is an optional alternative.</p></div></li><li><span>02</span><div><b>Let Sleeve prepare it</b><p>History, artwork and personal findings come together. You can follow the progress.</p></div></li><li><span>03</span><div><b>Follow what interests you</b><p>Open your record, explore a change, or choose something to play next.</p></div></li></ol>`;

export async function renderHome() {
  const route=location.hash,ctrl=new AbortController();
  onLeave(()=>ctrl.abort());
  view().innerHTML=`<div class="wrap welcome-loading"><span class="label">SLEEVE</span><h1>Your music, over time.</h1><p>Opening a preview of the listening record…</p><a class="btn btn--ink" href="#/start">Get started ${icon.arrow}</a></div>`;
  const archive=await getArchive('demo');
  const A=await prepareAnalysis('demo',archive,ctrl.signal);
  if(ctrl.signal.aborted || location.hash!==route)return;
  if(!A){view().innerHTML=`<div class="wrap welcome-loading"><h1>Start with your own listening.</h1><p>The demo is empty under this device's current counting settings. Your own record can still be connected.</p><a class="btn btn--ink" href="#/start">Get started ${icon.arrow}</a><a class="link" href="#/settings">Review counting settings ↗</a></div>`;return;}
  const E=evolution(A,A.to+1),rise=E.rising[0];
  const heroArtist=rise?.name || A.artists[0].name;
  const heroAlbum=A.albums.find(x=>x.artist===heroArtist) || A.albums[0];
  const returned=revisitRecord(A,{items:{}});
  const enduring=A.artists.map(a=>{
    const years=new Map();a.times.forEach(t=>{const y=new Date(t).getFullYear();years.set(y,(years.get(y)||0)+1);});
    return {...a,supported:[...years].filter(([,n])=>n>=10).map(([y])=>y)};
  }).find(a=>a.supported.length>=3 && a.last>=A.to-180*864e5) || {...A.artists[0],supported:[]};
  const returning=profiles.list().filter(p=>p.pid!=='demo');
  const years=A.years.slice(-6),peak=Math.max(1,...years.map(y=>y.n));
  const chapters=[
    {id:'change',title:'What changed',body:`<div class="welcome-proof__art">${sleeve(heroAlbum.album,heroAlbum.artist,{size:216,kind:'album'})}</div><div class="welcome-proof__copy"><span class="label">A CHANGE IN THE ROTATION</span><h3>${esc(heroArtist)} moved into the foreground.</h3><p>Compare equal periods so a busier month cannot explain the whole change.</p>${rise?`<div class="welcome-comparison"><div><span>Previous 90 days</span><b>${num(rise.before)}</b><small>${(rise.priorShare*100).toFixed(1)}% of plays</small></div><span aria-hidden="true">→</span><div><span>Latest 90 days</span><b>${num(rise.plays)}</b><small>${(rise.share*100).toFixed(1)}% of plays</small></div></div>`:''}<a class="link" href="#/demo/evolution">Explore the change ${icon.arrow}</a></div>`},
    {id:'stayed',title:'What stayed',body:`<div class="welcome-proof__art">${sleeve(enduring.name,enduring.name,{size:216,kind:'artist'})}</div><div class="welcome-proof__copy"><span class="label">AN ENDURING FAVORITE</span><h3>${esc(enduring.name)}, across ${enduring.supported.length} recorded years.</h3><p>At least ten plays in each of those years, and still heard in the latest 180 days.</p><div class="welcome-yearmarks">${enduring.supported.map(y=>`<span>${y}</span>`).join('')}</div><div class="welcome-proof__total"><b>${num(enduring.n)}</b><span>recorded plays overall</span></div><a class="link" href="#/demo/artist/${encodeURIComponent(enduring.name)}">Open the artist's history ${icon.arrow}</a></div>`},
    {id:'revisit',title:'What to revisit',body:returned?`<div class="welcome-proof__art">${sleeve(returned.album.name,returned.artist,{size:216,kind:'album'})}</div><div class="welcome-proof__copy"><span class="label">LEFT OUT OF THE LATEST ROTATION</span><h3>${esc(returned.album.name)}<small>${esc(returned.artist)}</small></h3><p>${esc(returned.reason)}</p><div class="welcome-proof__total"><b>${num(returned.album.plays)}</b><span>plays from this record</span></div><a class="link" href="#/demo/discover">See what to play next ${icon.arrow}</a></div>`:`<div class="welcome-proof__copy"><span class="label">WHAT TO PLAY NEXT</span><h3>Follow a connection from your current rotation.</h3><p>Discover checks real artist catalogues, matches albums, and offers a concrete starting track.</p><a class="link" href="#/demo/discover">Open Discover ${icon.arrow}</a></div>`},
  ];

  view().innerHTML=`<div class="welcome">
    <section class="welcome-hero"><div class="wrap"><div class="welcome-hero__mast"><span>YOUR LISTENING HAS A HISTORY</span><span>NO SLEEVE ACCOUNT · FREE TO TRY</span></div>
      <div class="welcome-hero__grid"><div class="welcome-hero__copy"><h1>Your music,<br><em>over time.</em></h1><p>See what took over, what stayed, and what to play next—from your actual listening history.</p><div class="welcome-hero__actions"><a class="btn" href="#/start">Get started ${icon.arrow}</a><a href="#/demo">Try the demo ↗</a></div><span class="welcome-hero__note">Last.fm history or a Spotify file. No Sleeve sign-up.</span>
      ${returning.length?`<div class="welcome-return"><span>YOUR SAVED RECORDS</span>${returning.map(p=>`<a href="${hrefFor(p.pid)}">${avatar(p.display,p.image,24)}${esc(p.display)} ${icon.arrow}</a>`).join('')}</div>`:''}</div>
      <a class="welcome-record" href="#/demo/evolution" aria-label="Explore ${esc(heroArtist)}'s rise in the synthetic demo history"><div class="welcome-record__label"><span>DEMO RECORD</span><span>MIRA / SYNTHETIC HISTORY</span></div><div class="welcome-record__cover">${sleeve(heroAlbum.album,heroAlbum.artist,{size:360,kind:'album'})}</div><div class="welcome-record__caption"><div><b>${esc(heroArtist)}</b><span>${esc(heroAlbum.album)}</span></div>${rise?`<div><b>${num(rise.before)} → ${num(rise.plays)}</b><span>plays / equal 90-day periods</span></div>`:''}</div></a></div>
      <div class="welcome-hero__footer"><span>YOUR PAST IS WORTH A CLOSER LOOK.</span><a href="#/" data-scroll="features">See what opens up ↓</a></div>
    </div></section>

    <section class="wrap welcome-product" id="features"><header class="welcome-section-head"><span class="label">A LOOK INSIDE</span><h2>Start with a finding.<br>Follow it into your music.</h2><p>This is Mira's synthetic listening history. The artists and records are real; the plays are generated for the demo.</p></header><div class="welcome-chapters" role="tablist" aria-label="Explore the demo findings">${chapters.map((c,i)=>`<button id="welcome-tab-${c.id}" role="tab" aria-selected="${i===0}" aria-controls="welcome-proof" tabindex="${i===0?'0':'-1'}" data-chapter="${i}"><span>0${i+1}</span>${c.title}</button>`).join('')}</div><div id="welcome-proof" class="welcome-proof" role="tabpanel" aria-labelledby="welcome-tab-change">${chapters[0].body}</div>
      <div class="welcome-recordline"><div><b>${num(A.plays)}</b><span>counted demo plays</span><small>${month(A.from)} — ${month(A.to)}</small></div><div class="welcome-recordline__years" aria-label="Annual demo play counts">${years.map(y=>`<a href="#/demo/year/${y.y}" title="${y.y}: ${num(y.n)} plays"><i style="height:${Math.max(8,y.n/peak*100)}%"></i><span>${y.y}</span></a>`).join('')}</div><a class="link" href="#/demo">Open the full demo ${icon.arrow}</a></div>
    </section>

    <section class="welcome-setup" id="sources"><div class="wrap"><header class="welcome-section-head"><span class="label">FROM FIRST VISIT TO YOUR RECORD</span><h2>One username.<br>A record to explore.</h2><p>With an existing Last.fm history, Sleeve handles the import and preparation automatically. Larger histories take longer; progress stays visible.</p></header>${journey}<div class="welcome-setup__actions"><a class="btn btn--ink" href="#/start">Get started ${icon.arrow}</a><a class="link" href="#/start/none">New to Last.fm? Start tracking future plays ↗</a></div></div></section>

    <section class="wrap welcome-depth"><div><span class="label">THERE'S MORE IN YOUR RECORD</span><h2>Keep following<br>the details.</h2><p>From the first play to the latest change. Every view starts with your own listening record.</p></div><nav aria-label="Try Sleeve features"><a href="#/demo/top"><span>01</span><b>Artists, tracks & albums</b><small>Your rankings, with your dates.</small>↗</a><a href="#/demo/timeline"><span>02</span><b>Timeline & year reviews</b><small>Monthly changes, listening eras and any year in detail.</small>↗</a><a href="#/demo/evolution"><span>03</span><b>How your taste changes</b><small>Rising artists, lasting discoveries and returning favorites.</small>↗</a><a href="#/demo/patterns"><span>04</span><b>Charts & sound</b><small>Genre history, repeat listening and verified tempo/key coverage.</small>↗</a><a href="#/demo/insights"><span>05</span><b>Findings, notes & audience</b><small>Prepared interpretations, audience reach and questions.</small>↗</a><a href="#/demo/discover"><span>06</span><b>Your next record</b><small>Recommendations connected to what you actually play.</small>↗</a><a href="#/demo/clock"><span>07</span><b>The listening clock</b><small>When music happens in your week.</small>↗</a><a href="#/compare"><span>08</span><b>Compare with a friend</b><small>Shared favorites and different directions.</small>↗</a></nav></section>

    <section class="wrap welcome-faq" id="faq"><header><span class="label">BEFORE YOU START</span><h2>A few useful details.</h2></header><div>
      <details><summary>Where does my listening history come from?</summary><p>An existing Last.fm account provides the songs it has recorded. A new account starts tracking future plays after you connect Spotify; it cannot retrieve your earlier Spotify history. An optional Spotify history ZIP can add those earlier plays. <a href="#/start">Choose your starting point ↗</a></p></details>
      <details><summary>What gets prepared before my profile opens?</summary><p>Sleeve reads your saved plays, checks artist data and artwork, and prepares personal findings and recommendations. Optional AI writing adds explanations from a short summary. You can open the record early; unavailable writing never prevents the measured statistics from working.</p></details>
      <details><summary>Does my Spotify file leave my device?</summary><p>No. The file is opened in your browser and raw history stays there. Optional AI writing sends a short derived summary through Sleeve's server to the writing provider; some summaries include a display name and favorite music. Generated responses are cached on the server for seven days. Clearing this browser removes local copies. Artwork and music metadata require catalogue lookups. Manage writing and saved data in <a href="#/settings">Settings</a>.</p></details>
      <details><summary>Can I connect Spotify directly?</summary><p>The advanced connection requires your own Spotify developer app. Public access limits mean Sleeve uses Last.fm history or your Spotify export for the main experience. Spotify login also cannot supply a lifetime history. <a href="#/connect/spotify">Open the advanced connection ↗</a></p></details>
      <details><summary>I have my original stats.fm import file. Can I use it?</summary><p>Yes, if it is the original Spotify history ZIP. Sleeve can open that same export; it does not connect to your stats.fm account. <a href="#/start/file">Open your file ↗</a></p></details>
      <details><summary>Can Sleeve show tempo and musical key?</summary><p>The optional sound check in Charts & sound looks for existing audio analysis of verified recordings. Its current AcousticBrainz dataset stopped collecting new submissions in 2022. Tempo and key appear only where it has usable data, with coverage shown. A listening log alone cannot supply those values. <a href="#/demo/patterns">See the sound check in the demo ↗</a></p></details>
      <details><summary>Is the AI always available?</summary><p>Writing providers have usage limits and may time out. Sleeve keeps exact statistics and supported fallback explanations available. A larger public launch still needs dependable writing capacity.</p></details>
    </div></section>

    <section class="welcome-end"><div class="wrap"><div><span class="label">YOUR RECORD IS NEXT</span><h2>Bring the music.<br>We'll put it in context.</h2></div><div><a class="btn btn--ink" href="#/start">Get started ${icon.arrow}</a><a class="link" href="#/demo">Try the demo first ↗</a></div></div></section>
  </div>`;
  hydrate(view());
  const tablist=$('.welcome-chapters'),proof=$('#welcome-proof');
  const select=i=>{
    const chapter=chapters[i];
    $$('[data-chapter]',tablist).forEach((button,index)=>{button.setAttribute('aria-selected',String(index===i));button.tabIndex=index===i?0:-1;});
    proof.setAttribute('aria-labelledby',`welcome-tab-${chapter.id}`);proof.innerHTML=chapter.body;hydrate(proof);
  };
  tablist.addEventListener('click',event=>{const button=event.target.closest('[data-chapter]');if(button)select(Number(button.dataset.chapter));});
  tablist.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const current=Number(event.target.closest('[data-chapter]')?.dataset.chapter || 0);
    const next=event.key==='Home'?0:event.key==='End'?chapters.length-1:(current+(event.key==='ArrowRight'?1:-1)+chapters.length)%chapters.length;
    event.preventDefault();select(next);$(`[data-chapter="${next}"]`,tablist).focus();
  });
}
