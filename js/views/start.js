// "Where does your music live?" The front door for anyone who isn't sure what to do.
import { $, $$, icon } from '../ui.js';
import { view, go, hrefFor, pidFor } from '../core.js';
import { mountLookup } from './connect.js';
import { dropzone, bindDrops } from '../components.js';
import { handleFiles } from '../actions.js';

const CHOICES = [
  { id: 'none', no: 'A1', title: 'I only use Spotify', sub: 'Start recording new plays. Your older plays need a separate Spotify file.', tone: 'marigold' },
  { id: 'lastfm', no: 'A2', title: 'I use Last.fm', sub: 'Open the plays you have already logged there.', tone: 'vermilion' },
  { id: 'listenbrainz', no: 'A3', title: 'I use ListenBrainz', sub: 'Open the plays you have already logged there.', tone: 'cobalt' },
  { id: 'file', no: 'A4', title: 'I have my Spotify data', sub: 'Drop the ZIP Spotify emailed you to explore your past plays.', tone: 'moss' },
];

export function renderStart(choice = '') {
  view().innerHTML = `
    <div class="wrap start">
      <header class="start__head">
        <span class="catno">SLV · SETUP</span>
        <h1>Start with what you have.</h1>
        <p>Already track your listening? Open it now. Only use Spotify? Start logging new plays, and add your past from Spotify's data file if you want.</p>
      </header>
      <div class="choices">${CHOICES.map((c) => `
        <button type="button" class="choice choice--${c.tone}" data-choice="${c.id}" aria-pressed="${choice === c.id}">
          <span class="choice__no">${c.no}</span>
          <span class="choice__title">${c.title}</span>
          <span class="choice__sub">${c.sub}</span>
          <span class="choice__disc" aria-hidden="true"></span>
        </button>`).join('')}
      </div>
      <section class="start__panel" id="start-panel" ${choice ? '' : 'hidden'}></section>
      <div class="start__other"><a href="#/demo">Explore a demo record ${icon.arrow}</a><a href="#/connect/spotify">Have a Spotify developer app? Connect directly ${icon.arrow}</a></div>
    </div>`;
  $$('[data-choice]').forEach((b) => b.addEventListener('click', () => go(`#/start/${b.dataset.choice}`)));
  if (choice) panel(choice);
}

function panel(choice) {
  const el = $('#start-panel');
  if (choice === 'lastfm' || choice === 'listenbrainz') {
    el.innerHTML = `<h2>Type your ${choice === 'lastfm' ? 'Last.fm' : 'ListenBrainz'} username</h2><div id="start-lookup"></div>`;
    mountLookup($('#start-lookup'), { source: choice, id: `start-${choice}`, cta: 'Open my stats', onConfirm: (res) => go(hrefFor(pidFor(choice, res.user.name))) }).focus();
  } else if (choice === 'file') {
    el.innerHTML = `<h2>Drop your Spotify ZIP</h2>${dropzone({ big: true, title: 'Drop your Spotify ZIP here', sub: 'Or click to choose it. It never leaves your device.' })}
      <p class="faint" style="font-size:14px">Don't have it yet? <a href="#/connect/file">Here's how to request it</a>.</p>`;
    bindDrops(el, handleFiles);
  } else {
    el.innerHTML = `
      <h2>Start your listening record</h2>
      <p class="faint" style="font-size:14px;margin:8px 0 0">A new listening log begins with your next songs. It cannot pull your past Spotify plays automatically.</p>
      <ol class="plan">
        <li><span class="plan__n">1</span><div><b>Connect Spotify to a listening log</b><p>Last.fm can record songs you play across your Spotify devices. It needs a free Last.fm account and starts tracking from now on.</p><a class="btn btn--ink" href="#/connect/lastfm">Set up Last.fm ${icon.arrow}</a><div class="flow__actions"><a class="link link--quiet" href="#/connect/listenbrainz">Use ListenBrainz instead</a></div></div></li>
        <li><span class="plan__n">2</span><div><b>See it work with your next song</b><p>Play a song after connecting. Sleeve will check for it, then your record will grow as you listen. The bigger stories need more plays.</p><a class="btn btn--line" href="#/demo">Explore a full demo now ${icon.arrow}</a></div></li>
        <li><span class="plan__n">3</span><div><b>Add your Spotify past whenever you want</b><p>Spotify can email your listening history. The lifetime export includes skips and exact listening time, but preparation can take up to 30 days.</p><a class="link" href="#/connect/file">How to request the optional file ${icon.arrow}</a></div></li>
      </ol>`;
  }
  el.hidden = false;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
