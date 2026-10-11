import { $, esc, icon } from '../ui.js';
import { view, go, hrefFor, pidFor, profiles, SOURCES } from '../core.js';
import { mountLookup } from './connect.js';
import { dropzone, bindDrops } from '../components.js';
import { handleFiles } from '../actions.js';

export function renderStart(choice='') {
  if(!['','lastfm','none','file'].includes(choice))choice='lastfm';
  const active=choice||'lastfm',returning=profiles.list().filter(p=>p.pid!=='demo');
  view().innerHTML=`<div class="wrap welcome-start"><a class="welcome-start__back" href="#/">${icon.back} Sleeve</a>
    <ol class="welcome-steps" aria-label="Profile setup"><li aria-current="step"><span>01</span>Connect</li><li><span>02</span>Prepare</li><li><span>03</span>Explore</li></ol>
    <header class="welcome-start__head"><span class="label">YOUR LISTENING RECORD</span><h1>${active==='none'?'Start with your next song.':active==='file'?'Bring your Spotify history.':'Your music is already a story.'}</h1><p>${active==='none'?'A free Last.fm account can log your future plays. Explore the demo while your own record grows.':active==='file'?'Open the history ZIP Spotify sent you. The file is read on this device.':'Enter your Last.fm username to find the artists that stayed, the changes you missed, and a record to play next.'}</p></header>
    ${returning.length?`<section class="welcome-start__saved" aria-label="Saved listening records"><span class="label">CONTINUE A SAVED RECORD</span>${returning.map(p=>`<a href="${hrefFor(p.pid)}">${esc(p.display)} ${icon.arrow}</a>`).join('')}</section>`:''}
    <nav class="welcome-start__sources" aria-label="Choose your listening source">${[['lastfm','Last.fm'],['file','Spotify history ZIP'],['none','Starting fresh']].map(([id,label])=>`<a href="#/start/${id}"${active===id?' aria-current="page"':''}>${label}</a>`).join('')}</nav>
    <div class="welcome-start__grid"><section class="welcome-connect" id="start-panel"></section><aside class="welcome-expect"><span class="label">WHAT YOU WILL OPEN</span><ol><li><b>A personal overview</b><p>Your current rotation and the changes supported by your recorded plays.</p></li><li><b>Details worth following</b><p>Artist histories, genre shifts and listening habits, with links into the dates behind each finding.</p></li><li><b>A place to start listening</b><p>Recommendations connected to your record, checked against real artist catalogues.</p></li></ol><a href="#/demo">See it with the demo ↗</a></aside></div>
    <details class="welcome-advanced"><summary>Advanced connections & file help</summary><div><a href="#/connect/file">How to request a Spotify history file ↗</a><a href="#/connect/spotify">I have a Spotify developer app ↗</a><a href="#/settings">Settings ↗</a></div><p>Your original Spotify ZIP from a stats.fm import works too. Sleeve does not connect to your stats.fm account.</p></details></div>`;
  const panel=$('#start-panel');
  if(active==='lastfm') {
    panel.innerHTML=`<h2>Find your listening history</h2>${!SOURCES.lastfm.isLive()?'<p class="welcome-connect__quiet">Last.fm is not configured on this installation. <a href="#/settings">Add a read key in Settings</a>, or try the demo or a history file.</p>':''}<div id="start-lookup"></div><div class="welcome-connect__preparation"><b>One setup, then your record.</b><p>Your history imports automatically. Large accounts need more time; you can follow the play count, resume an interrupted import, or explore while it prepares.</p></div><p class="welcome-connect__quiet">Your listening record is saved in this browser. Optional AI writing uses a summary of measured findings. <a href="#/settings">Change AI writing before setup ↗</a> · <a href="#/privacy">Privacy ↗</a></p>`;
    const input=mountLookup($('#start-lookup'),{source:'lastfm',id:'start-lastfm',cta:'Prepare my profile',label:'Last.fm username',onConfirm:res=>go(hrefFor(pidFor('lastfm',res.user.name)))});
    if(choice==='lastfm' && matchMedia('(min-width:761px)').matches)input.focus({preventScroll:true});
  } else if(active==='file') {
    panel.innerHTML=`<h2>Open your Spotify ZIP</h2>${dropzone({big:true,title:'Drop your history ZIP here',sub:'Or choose the file. Raw history stays on this device.'})}<p class="welcome-connect__quiet">Use the original file from Spotify, including one you uploaded to stats.fm. <a href="#/connect/file">Need to request it? ↗</a></p><a class="link" href="#/start/lastfm">Use a Last.fm username instead ${icon.arrow}</a>`;
    bindDrops(panel,handleFiles);
  } else {
    panel.innerHTML=`<h2>Connect Spotify to a listening log</h2><p class="welcome-new__limit">A new Last.fm account records <b>future plays</b>. It cannot recover your past Spotify listening automatically.</p><ol class="welcome-new__steps"><li><span>1</span><div><b>Make a free Last.fm account</b><p>Then enable Spotify Scrobbling in Last.fm's Applications settings.</p></div></li><li><span>2</span><div><b>Play a song, then come back</b><p>Enter the same Last.fm username here. Your own record grows as new songs are logged.</p></div></li></ol><a class="btn btn--ink" href="#/connect/lastfm">Set up Last.fm ${icon.arrow}</a><a class="welcome-new__return" href="#/start/lastfm">Already connected? Enter your username ↗</a><div class="welcome-new__past"><span class="label">YOUR PAST IS OPTIONAL</span><p>A Spotify history file can add earlier listening. Request it separately; Spotify needs time to prepare it.</p><a class="link" href="#/connect/file">How to request your history ↗</a></div>`;
  }
}
