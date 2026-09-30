import { $, esc, icon } from '../ui.js';
import { view, go, hrefFor, pidFor, profiles } from '../core.js';
import { mountLookup } from './connect.js';
import { dropzone, bindDrops } from '../components.js';
import { handleFiles } from '../actions.js';

export function renderStart(choice='') {
  if(!['','lastfm','none','file'].includes(choice))choice='lastfm';
  const active=choice||'lastfm',returning=profiles.list().filter(p=>p.pid!=='demo');
  view().innerHTML=`<div class="wrap welcome-start"><a class="welcome-start__back" href="#/">${icon.back} Sleeve</a>
    <ol class="welcome-steps" aria-label="Profile setup"><li aria-current="step"><span>01</span>Bring your listening</li><li><span>02</span>Prepare your record</li><li><span>03</span>Explore</li></ol>
    <header class="welcome-start__head"><span class="label">LET'S OPEN YOUR RECORD</span><h1>${active==='none'?'Start with your next song.':active==='file'?'Bring your Spotify history.':'Your Last.fm username is enough.'}</h1><p>${active==='none'?'Set up a free listening log for future Spotify plays. You can try the full demo while your own history grows.':active==='file'?'Open the history ZIP Spotify sent you. Sleeve reads the file on this device.':'Sleeve will read your history, prepare your personal findings, and open a record you can explore. No Sleeve sign-up or password.'}</p></header>
    <div class="welcome-start__grid"><section class="welcome-connect" id="start-panel"></section><aside class="welcome-expect"><span class="label">WHAT HAPPENS NEXT</span><ol><li><b>Your plays come together</b><p>Existing history imports automatically. Larger accounts take longer; progress and resume status stay visible.</p></li><li><b>Your record gets prepared</b><p>Artwork, measured findings and starting records load together. Optional AI notes add context when available.</p></li><li><b>You open your own music</b><p>Your listening record is saved in this browser. You can open early and return later.</p></li></ol><a href="#/demo">Look around the demo first ↗</a></aside></div>
    ${returning.length?`<section class="welcome-start__saved"><span class="label">ALREADY ON THIS DEVICE</span>${returning.map(p=>`<a href="${hrefFor(p.pid)}">${esc(p.display)} ${icon.arrow}</a>`).join('')}</section>`:''}
    <details class="welcome-advanced"><summary>Other ways in</summary><div><a href="#/start/file">I have my Spotify history ZIP ↗</a><a href="#/connect/file">How to request a Spotify history file ↗</a><a href="#/connect/spotify">I have a Spotify developer app ↗</a><a href="#/settings">Settings ↗</a></div><p>Your original Spotify ZIP from a stats.fm import works too. Sleeve does not connect to a stats.fm account.</p></details></div>`;
  const panel=$('#start-panel');
  if(active==='lastfm') {
    panel.innerHTML=`<h2>Last.fm username</h2><div id="start-lookup"></div><div class="welcome-connect__alternate"><span>New to Last.fm?</span><a href="#/start/none">Start tracking future plays ${icon.arrow}</a></div><p class="welcome-connect__quiet">Have a Spotify history file already? <a href="#/start/file">Open it instead ↗</a></p>`;
    const input=mountLookup($('#start-lookup'),{source:'lastfm',id:'start-lastfm',cta:'Prepare my record',onConfirm:res=>go(hrefFor(pidFor('lastfm',res.user.name)))});
    if(choice==='lastfm' && matchMedia('(min-width:761px)').matches)input.focus({preventScroll:true});
  } else if(active==='file') {
    panel.innerHTML=`<h2>Open your Spotify ZIP</h2>${dropzone({big:true,title:'Drop your history ZIP here',sub:'Or choose the file. Raw history stays on this device.'})}<p class="welcome-connect__quiet">Use the original file from Spotify, including one you uploaded to stats.fm. <a href="#/connect/file">Need to request it? ↗</a></p><a class="link" href="#/start/lastfm">Use a Last.fm username instead ${icon.arrow}</a>`;
    bindDrops(panel,handleFiles);
  } else {
    panel.innerHTML=`<h2>Connect Spotify to a listening log</h2><p class="welcome-new__limit">A new Last.fm account records <b>future plays</b>. It cannot recover your past Spotify listening automatically.</p><ol class="welcome-new__steps"><li><span>1</span><div><b>Make a free Last.fm account</b><p>Then enable Spotify Scrobbling in Last.fm's Applications settings.</p></div></li><li><span>2</span><div><b>Play a song, then come back</b><p>Enter the same Last.fm username here. Your own record grows as new songs are logged.</p></div></li></ol><a class="btn btn--ink" href="#/connect/lastfm">Set up Last.fm ${icon.arrow}</a><a class="welcome-new__return" href="#/start/lastfm">Already connected? Enter your username ↗</a><div class="welcome-new__past"><span class="label">YOUR PAST IS OPTIONAL</span><p>A Spotify history file can add earlier listening. Request it separately; Spotify needs time to prepare it.</p><a class="link" href="#/connect/file">How to request your history ↗</a></div>`;
  }
}
