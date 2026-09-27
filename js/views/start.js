// "Where does your music live?" The front door for anyone who isn't sure what to do.
import { $, $$, icon } from '../ui.js';
import { view, go, hrefFor, pidFor } from '../core.js';
import { mountLookup } from './connect.js';
import { dropzone, bindDrops } from '../components.js';
import { handleFiles } from '../actions.js';

const CHOICES = [
  { id: 'lastfm', no: 'A1', title: 'I use Last.fm', sub: 'Your stats are ready in seconds, with years of history if you have it.', tone: 'vermilion' },
  { id: 'listenbrainz', no: 'A2', title: 'I use ListenBrainz', sub: 'The open-source one. No key, no fuss.', tone: 'cobalt' },
  { id: 'file', no: 'A3', title: 'I have my Spotify data', sub: 'The ZIP Spotify emailed you. Every play, every skip.', tone: 'moss' },
  { id: 'none', no: 'A4', title: "I don't have any of these", sub: "Most people don't. We'll get you set up in about a minute.", tone: 'marigold' },
];

export function renderStart(choice = '') {
  view().innerHTML = `
    <div class="wrap start">
      <header class="start__head">
        <span class="catno">SLV · SETUP</span>
        <h1>Where does your music live?</h1>
        <p>Choose the source you already have. Your listening record can grow from live scrobbles, a Spotify history file, or both.</p>
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
      <h2>Here's the plan</h2>
      <ol class="plan">
        <li><span class="plan__n">1</span><div><b>Set up Last.fm now</b><p>It's free and takes about a minute. It starts logging the songs you listen to on Spotify across your devices.</p><a class="btn btn--ink" href="#/connect/lastfm">Start the one-minute setup ${icon.arrow}</a></div></li>
        <li><span class="plan__n">2</span><div><b>Ask Spotify for your full history too</b><p>It fills in everything before today, with skips and exact listening time. It arrives by email in a few days.</p><a class="btn btn--line" href="#/connect/file">How to request it</a></div></li>
        <li><span class="plan__n">3</span><div><b>While you wait</b><p>Look around a full demo profile, or compare your taste with a friend who already uses Last.fm.</p><div class="flow__actions"><a class="btn btn--line" href="#/demo">Open the demo</a><a class="btn btn--line" href="#/compare">Compare with a friend</a></div></div></li>
      </ol>`;
  }
  el.hidden = false;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
