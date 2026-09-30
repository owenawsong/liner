// AI panels: liner notes and roast, "ask your stats", era names, year write-ups.
import { $, $$, esc, monthYear, num } from '../ui.js';
import { onLeave } from '../core.js';
import { topIn } from '../analysis.js';
import { write, facts, reveal, loadingLines, paragraphs } from '../ai.js';
import { store } from '../ui.js';
import { DEMO_NOTES, DEMO_ROAST } from '../sources/demo.js';
import { answerQuestion } from '../questions.js';
import { recordEvidence } from '../dossier.js';
const aiOff = () => store.get('liner.ai') === 'off';

const TITLES = { notes: 'Your liner notes', roast: 'Your taste, roasted' };
const fallbackNote = (A) => {
  const first = A.years[0], latest = A.years.at(-1);
  if (!first || !latest) return `Your record contains ${num(A.plays)} plays. More listening will reveal its changes over time.`;
  if (first.y === latest.y) return `${first.topArtist} leads your ${first.y} record with ${num(first.topArtistN)} plays. Your timeline shows how that year unfolded month by month.`;
  return `${first.topArtist} led your ${first.y} listening with ${num(first.topArtistN)} plays. ${latest.topArtist} leads ${latest.y} with ${num(latest.topArtistN)}. Explore the years below to see what changed between them.`;
};

export function notesPanel(A, isDemo = false) {
  if (aiOff()) return '';
  const basis = A ? [
    [num(A.plays), 'plays'],
    [num(A.artists.length), 'artists'],
    [String(A.eras.length), A.eras.length === 1 ? 'era' : 'eras'],
    [String(A.insights.length), 'things Sleeve noticed'],
  ].map(([v, l]) => `<span><b>${v}</b>${l}</span>`).join('') : '';
  return `<section class="panel c-12 ai" id="ai-notes">
    <div class="panel__head">
      <div class="ai__head"><span class="label">${isDemo ? 'Example writing' : 'Written for you'}</span><h2 class="ai__title">Your liner notes</h2></div>
      <div class="seg" role="radiogroup" aria-label="Style"><button type="button" role="radio" data-mode="notes" aria-checked="true">Liner notes</button><button type="button" role="radio" data-mode="roast" aria-checked="false">Roast me</button></div>
    </div>
    <div class="ai__wrap">
      <div class="ai__body" aria-live="polite">${isDemo ? `<p class="ai__text">${esc(DEMO_NOTES)}</p>` : loadingLines}</div>
      ${basis ? `<aside class="ai__basis"><span class="label">Based on</span>${basis}</aside>` : ''}
    </div>
    <div class="ai__foot">${isDemo ? '' : '<button type="button" class="link link--quiet" data-again hidden>Write another take</button>'}<span class="faint">${isDemo ? 'Example text for this demo profile.' : 'Written by AI from a short summary of your stats. Your raw plays are not sent.'}</span></div>
  </section>`;
}

export function bindNotes(ctx) {
  const root = $('#ai-notes');
  if (!root) return;
  let mode = 'notes';
  let alive = true, request = 0;
  onLeave(() => { alive = false; });
  const body = $('.ai__body', root);
  const demo = ctx.source === 'demo';
  const f = facts(ctx.A, { ...ctx.p, topArtists: ctx.topArtists }, { detailed: true });
  const example = () => {
    $('.ai__title', root).textContent = TITLES[mode];
    body.innerHTML = `<p class="ai__text">${esc(mode === 'notes' ? DEMO_NOTES : DEMO_ROAST)}</p>`;
  };
  const run = async (fresh = false) => {
    if (!fresh && mode === 'notes') {
      const text=ctx.prepared?.dossier?.notes;
      if(text){body.innerHTML=`<p class="ai__text">${esc(text)}</p>`;$('[data-again]',root)?.removeAttribute('hidden');return;}
      if(!demo){body.innerHTML=`<p class="ai__text">${esc(fallbackNote(ctx.A))}</p><p class="faint">${ctx.prepared ? 'Calculated from your saved record.' : 'Preparing a closer read of your listening…'}</p>`;return;}
    }
    if (demo) return example();
    const mine = ++request;
    body.innerHTML = loadingLines;
    $('[data-again]', root).hidden = true;
    $('.ai__title', root).textContent = TITLES[mode];
    try {
      const text = await write(mode, f, { fresh, signal: ctx.signal });
      if (!alive || mine !== request) return;
      const lines = paragraphs(text);
      body.innerHTML = lines.map(() => '<p class="ai__text"></p>').join('');
      $$('.ai__text', body).forEach((p, i) => reveal(p, lines[i]));
      $('[data-again]', root).hidden = false;
    } catch (e) {
      if (!alive || mine !== request || e.name === 'AbortError') return;
      body.innerHTML = `<p class="ai__text">${esc(fallbackNote(ctx.A))}</p><p class="faint" style="font-size:13px;margin-top:12px">Calculated from your record. Extra writing is unavailable right now. <button type="button" class="link" data-retry>Try again</button></p>`;
      $('[data-retry]', body).addEventListener('click', () => run(true));
    }
  };
  $$('[data-mode]', root).forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    $$('[data-mode]', root).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    demo ? example() : run();
  }));
  $('[data-again]', root)?.addEventListener('click', () => run(true));
  run();
}

export function listeningRead(ctx,limit=6) {
  const evidence=(ctx.prepared?.evidence||recordEvidence(ctx.A)).slice(0,limit);
  const observations=store.get('liner.ai')==='off'?{}:ctx.prepared?.dossier?.observations||{};
  // Keep a writer's shorter restatement from repeating the counts just above it.
  const words=text=>new Set(String(text||'').toLowerCase().match(/[a-zÀ-ÿ]{4,}/g)||[]);
  const addsContext=(text,entry)=>{const base=words(`${entry.title} ${entry.detail} ${entry.basis}`),written=words(text);const extra=[...written].filter(w=>!base.has(w));return extra.length>=2&&extra.length/Math.max(1,written.size)>=.2;};
  const visibleObservations=Object.fromEntries(evidence.filter(entry=>observations[entry.id]&&addsContext(observations[entry.id],entry)).map(entry=>[entry.id,observations[entry.id]]));
  const destination=(entry)=>entry.target?.kind==='artist'?ctx.L.artist(entry.target.name):entry.target?.kind==='year'?ctx.L.year(entry.target.year):entry.target?.kind==='song'?ctx.L.song(entry.target.name,entry.target.artist):'';
  return `<section class="record-read c-12"><div class="record-read__head"><span class="label">ALREADY IN YOUR RECORD</span><h2>${limit<=2?'Worth a closer look':'A few things worth opening'}</h2><p>Prepared from your listening, with the evidence one click away.</p></div><div class="record-read__entries">${evidence.map(entry=>`<article><span class="label">${esc(entry.label)}</span><h3>${destination(entry)?`<a href="${destination(entry)}">${esc(entry.title)} ↗</a>`:esc(entry.title)}</h3><p>${esc(entry.detail)}</p>${entry.comparison?`<div class="record-read__comparison" aria-label="Artist plays across two recorded 90-day periods">${[['Before',entry.comparison.before],['Latest',entry.comparison.now]].map(([label,n])=>`<div><span>${label}</span><i><b style="width:${Math.max(n?2:0,n/Math.max(1,entry.comparison.before,entry.comparison.now)*100)}%"></b></i><strong>${num(n)}</strong></div>`).join('')}</div>`:''}${visibleObservations[entry.id]?`<p class="record-read__note">${esc(visibleObservations[entry.id])}<small>Written from this evidence</small></p>`:''}<small>${esc(entry.basis)}</small></article>`).join('')}</div></section>`;
}

/* ---------- Ask ---------- */
export function askPanel(A) {
  const y = A.years.length > 1 ? A.years[A.years.length - 2].y : A.years[0].y;
  const who = A.artists[Math.min(3, A.artists.length - 1)]?.name;
  const chips = [
    who && `When did I get into ${who}?`,
    `What was my summer ${y} like?`,
    'How has my taste changed over the years?',
    A.skipRate != null ? 'Which artist do I skip the most?' : 'What do I listen to late at night?',
  ].filter(Boolean);
  return `<section class="panel ask" id="ask"><div class="panel__head"><div><span class="label">SOMETHING ELSE ON YOUR MIND?</span><h2>Ask your record</h2></div></div><p class="muted">Explore an artist, a month, your discoveries or listening hours.</p>
    <form class="ask__form" novalidate>
      <label class="sr" for="ask-q">Ask about your listening</label>
      <input id="ask-q" class="ask__input" placeholder="Try an artist, month, year, skips or late nights…" maxlength="200" autocomplete="off">
      <button class="btn btn--ink" type="submit">Ask</button>
    </form>
    <div class="ask__chips">${chips.map((c) => `<button type="button" class="chip chip--line" data-q="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <div class="ask__out" aria-live="polite"></div>
  </section>`;
}

export function bindAsk(ctx) {
  const root = $('#ask');
  if (!root) return;
  const input = $('#ask-q', root), out = $('.ask__out', root);
  let request = 0, pending;
  onLeave(() => pending?.abort());
  const extraIsGrounded = (text, evidence) => {
    const numbers = (s) => s.match(/\b\d[\d,]*(?:\.\d+)?%?/g) || [];
    const allowed = new Set(numbers(evidence));
    return numbers(text).every((value) => allowed.has(value));
  };
  const ask = async (q) => {
    if (!q.trim()) return;
    pending?.abort();
    pending = new AbortController();
    const mine = ++request;
    input.value = q;
    const answer = answerQuestion(ctx.A, q);
    if (!answer) {
      out.innerHTML = `<div class="ask__q">${esc(q)}</div><p class="ask__help">I can calculate artist and song histories, months and years, discoveries, skips from Spotify history, and listening hours. Try one of the examples above.</p>`;
      return;
    }
    const href = answer.target?.kind === 'artist' ? ctx.L.artist(answer.target.name) : answer.target?.kind === 'year' ? ctx.L.year(answer.target.year) : answer.target?.kind === 'song' ? ctx.L.song(answer.target.name, answer.target.artist) : '';
    out.innerHTML = `<div class="ask__q">${esc(q)}</div><div class="ask__answer"><span class="label">FROM YOUR RECORD</span><h3>${esc(answer.title)}</h3><p>${esc(answer.detail)}</p>${answer.stats.length ? `<dl>${answer.stats.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>` : ''}${href ? `<a class="link" href="${href}">Explore the evidence ↗</a>` : ''}<small>${esc(answer.basis)}</small></div>${!aiOff() && ctx.source !== 'demo' ? '<div class="ask__aside" aria-live="polite"><span class="label">A little more context</span><span class="faint">Writing from the evidence above…</span></div>' : ''}`;
    if (aiOff() || ctx.source === 'demo' || !$('.ask__aside', out)) return;
    try {
      const prepared=(ctx.prepared?.evidence||[]).find(x=>x.question===q);
      const text = prepared && ctx.prepared?.dossier?.observations?.[prepared.id] || await write('ask', answer.facts, { question: q, signal: pending.signal });
      if (mine !== request || !root.isConnected) return;
      const aside = $('.ask__aside', out);
      if (!aside) return;
      if (!extraIsGrounded(text, answer.facts)) { aside.remove(); return; }
      aside.innerHTML = '<span class="label">A little more context</span><p class="ai__text"></p>';
      reveal($('.ai__text', aside), text);
    } catch (e) {
      if (mine !== request || !root.isConnected) return;
      $('.ask__aside', out)?.remove();
    }
  };
  $('form', root).addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });
  $$('[data-q]', root).forEach((b) => b.addEventListener('click', () => ask(b.dataset.q)));
}

/* ---------- Era names ---------- */
export async function nameEras(ctx) {
  if (aiOff()) return;
  const { A } = ctx;
  if (!A?.eras.length) return;
  const lines = A.eras.map((e) => {
    const songs = topIn(A, 'tracks', e.from, e.to + 1, 12).filter((t) => t.artist === e.artist).slice(0, 3).map((t) => t.name);
    const others = topIn(A, 'artists', e.from, e.to + 1, 4).filter((a) => a.name !== e.artist).map((a) => a.name);
    return `${e.artist}, ${monthYear(e.from)} to ${monthYear(e.to)}, ${num(e.plays)} plays. Their songs then: ${songs.join(', ')}. Also playing: ${others.join(', ')}.`;
  }).join('\n');
  try {
    if(!ctx.prepared)return;
    const text = ctx.prepared.dossier?.eras ? JSON.stringify(ctx.prepared.dossier.eras) : await write('eras', lines, { signal: ctx.signal });
    if (ctx.signal.aborted) return;
    const json = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
    json.forEach((x) => {
      const card = $$('.era').find((c) => c.dataset.artist === x.artist);
      if (!card || !x.title) return;
      const t = document.createElement('p');
      t.className = 'era__name';
      t.textContent = x.title;
      $('h3', card).before(t);
      if (x.line) {
        const l = document.createElement('p');
        l.className = 'era__line';
        l.textContent = x.line;
        card.append(l);
      }
    });
  } catch { /* era names are a bonus; the cards work without them */ }
}

/* ---------- Year write-up ---------- */
export function yearNotes() {
  if (aiOff()) return '';
  return `<section class="panel ai" id="ai-year" style="margin-top:16px">
    <div class="panel__head"><div class="ai__head"><span class="label">Written for you</span><h2 class="ai__title">The year, in a paragraph</h2></div></div>
    <div class="ai__body" aria-live="polite">${loadingLines}</div>
  </section>`;
}

export function bindYearNotes(ctx, y) {
  const body = $('#ai-year .ai__body');
  if (!body) return;
  const prepared=ctx.prepared?.dossier?.years?.[y];
  if(prepared){body.innerHTML=`<p class="ai__text">${esc(prepared)}</p>`;return;}
  if (ctx.source === 'demo') {
    const from = new Date(y, 0, 1).getTime(), to = new Date(y + 1, 0, 1).getTime();
    const top = topIn(ctx.A, 'artists', from, to, 2);
    const count = ctx.A.years.find((row) => row.y === y)?.n || 0;
    body.innerHTML = `<p class="ai__text">In ${y}, Mira played ${num(count)} songs. ${esc(top[0]?.name || 'A new favourite')} led the year${top[1] ? `, with ${esc(top[1].name)} close behind` : ''}. The months below show how that year changed, one song at a time.</p><p class="faint" style="font-size:13px;margin-top:16px">Example writing for this demo profile.</p>`;
    return;
  }
  const run = async (fresh = false) => {
    body.innerHTML = loadingLines;
    try {
      const text = await write('year', facts(ctx.A, ctx.p, { year: y }), { fresh, signal: ctx.signal });
      if (!body.isConnected) return;
      body.innerHTML = '<p class="ai__text"></p>';
      reveal($('.ai__text', body), text);
    } catch (e) {
      if (e.name === 'AbortError' || !body.isConnected) return;
      body.innerHTML = `<p class="ai__error">${esc(e.message)} <button type="button" class="link" data-year-retry>Try again</button></p>`;
      $('[data-year-retry]', body).addEventListener('click', () => run(true));
    }
  };
  run();
}
