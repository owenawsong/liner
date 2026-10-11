import { answerQuestion } from './questions.js';
import { evolution } from './evolution.js';
import { hash, num } from './ui.js';
import { deeperFindings, selectFindings } from './findings.js';
export { selectFindings } from './findings.js';

const signatureCache=new WeakMap();
export function recordSignature(A) {
  const base=`r3:${A.plays}:${A.from}:${A.to}:${A.minMs||0}:${A.filterSignature||''}`;
  const cached=signatureCache.get(A);if(cached?.base===base)return cached.value;
  // Artist totals alone cannot identify different listening sequences: a return
  // or concentrated run can change while totals and archive endpoints stay fixed.
  let sequence=2166136261;
  for(const r of A.rows||[]){sequence^=hash(`${r.t}\u0000${r.artist}\u0000${r.track}\u0000${r.album||''}`);sequence=Math.imul(sequence,16777619);}
  const value=`${base}:${hash(A.artists.map(a=>`${a.name}:${a.n}`).join('|'))}:${sequence>>>0}`;
  signatureCache.set(A,{base,value});return value;
}
const plain = (s) => String(s || '').replace(/<[^>]*>/g, '');
const numbers = (s) => [...String(s).matchAll(/\b\d[\d,]*(?:\.\d+)?\b/g)].map((m) => m[0].replaceAll(',', ''));
const evidenceCache = new WeakMap();
export function groundedText(text, evidence) {
  if (typeof text !== 'string' || !text.trim() || text.length > 1400) return false;
  const allowed = new Set(numbers(evidence));
  return numbers(text).every((n) => allowed.has(n));
}

// These answers exist before any writer runs. Every generated observation must
// refer to one of these evidence IDs, which also supplies its destination.
export function recordEvidence(A) {
  if(!A?.rows?.length)return [];
  if(evidenceCache.has(A))return evidenceCache.get(A);
  const E = evolution(A, A.to + 1);
  const rising = E.rising[0];
  const origin = A.artists.find((a,i)=>i>=3&&a.name!==rising?.name)?.name || A.artists[0]?.name;
  const year = A.years.length > 1 ? A.years.at(-2).y : A.years[0]?.y;
  const questions = [
    ['origin', origin && `When did I get into ${origin}?`, 'An artist entering your life'],
    ['years', 'How has my taste changed over the years?', 'The longer view'],
    ['night', 'What do I listen to late at night?', 'After hours'],
    ['summer', `What was my summer ${year} like?`, `Summer ${year}`],
    ...(A.skipRate != null ? [['skips', 'Which artist do I skip the most?', 'What you skip']] : []),
  ];
  const entries = questions.filter(([id, q]) => q && (id!=='years'||A.years.filter(y=>y.n>=10).length>=2) && (id!=='summer'||A.rows.some(r=>{const d=new Date(r.t);return d.getFullYear()===year&&d.getMonth()>=5&&d.getMonth()<8;})) && (id!=='origin'||A.plays>=20)).map(([id, question, label]) => ({ id, question, label, ...answerQuestion(A, question) })).filter((x) => x.title && !/^No |^Not enough |^Your record needs /.test(x.title));
  if (rising && E.total>=30 && E.previous>=30 && A.to-A.from>=178*864e5) entries.unshift({ id: 'shift', label: 'Moving into your rotation', title: `${rising.name} gained ground`,
    detail: `${rising.before} plays in the previous recorded 90 days, then ${rising.plays} in the latest recorded 90 days. ${E.overlap} artists appear in both top-20 lists.`,
    stats: [['Latest 90 days', String(E.total)], ['Previous 90 days', String(E.previous)]],
    target: { kind: 'artist', name: rising.name }, basis: 'Two equal periods ending at the latest recorded play.',
    comparison:{before:rising.before,now:rising.plays},
    visual:{kind:'changes',days:90,leaders:E.rising.slice(0,3).map(a=>({name:a.name,before:a.before,now:a.plays,beforeShare:a.priorShare,nowShare:a.share})),totals:{before:E.previous,now:E.total}},
    facts:`${rising.name}: ${rising.before} plays in the previous recorded 90 days and ${rising.plays} in the latest recorded 90 days. Their play share changed from ${(rising.priorShare*100).toFixed(1)}% to ${(rising.share*100).toFixed(1)}%. Period totals: ${E.previous} then ${E.total} plays. ${E.overlap} artists in both top-20 lists. Other rising artists: ${E.rising.slice(1,3).map(x=>`${x.name}, ${x.before} then ${x.plays} plays`).join('; ')}. New artists account for ${E.newPlays} of the latest plays. This comparison ends at the last recorded play.` });
  // A discovery has to survive several months, not just a single enthusiastic day.
  const newArtists=A.artists.filter(a=>a.first>=A.to-365*864e5);
  const monthly=new Map(newArtists.map(a=>[a.name,new Map()]));
  for(const row of A.rows){const months=monthly.get(row.artist);if(!months)continue;const d=new Date(row.t),key=d.getFullYear()*12+d.getMonth();months.set(key,(months.get(key)||0)+1);}
  const stayed=newArtists.filter(a=>a.last>=A.to-90*864e5 && [...monthly.get(a.name).values()].filter(n=>n>=3).length>=3);
  if(stayed.length){const lead=stayed[0];entries.splice(2,0,{id:'stayed',label:'Discoveries that stayed',title:`${lead.name} lasted beyond the first month`,
    detail:`${stayed.length} of the ${newArtists.length} artists first recorded in the last year were played at least three times in three different months and heard again in the latest 90 days. ${lead.name} has ${lead.n} recorded plays.`,
    target:{kind:'artist',name:lead.name},basis:'A recorded discovery followed by repeated listening across months; earlier history may be missing.'});}
  if(E.dormant.length){const lead=E.dormant[0];entries.splice(stayed.length?3:2,0,{id:'revisit',label:'An older favorite to revisit',title:`${lead.name} has been out of rotation`,
    detail:`${num(lead.n)} lifetime plays, with none in your latest recorded 90 days. Last heard ${new Date(lead.last).toLocaleDateString('en',{month:'long',year:'numeric'})}.`,
    target:{kind:'artist',name:lead.name},basis:'This means absent from the saved history, not that you stopped liking them.'});}
  const families={shift:'personal-change',origin:'origin',years:'years',night:'clock',summer:'season',skips:'skips',stayed:'retention',revisit:'dormant'};
  const scores={shift:88,origin:62,years:72,night:69,summer:60,skips:78,stayed:82,revisit:77};
  const supported=entries.filter(entry=>entry.id!=='night'||Number(entry.stats?.[0]?.[1]?.replaceAll(',',''))>=10).map(entry=>({
    ...entry,family:families[entry.id]||entry.id,score:scores[entry.id]||50,
    artists:entry.target?.kind==='artist'?[entry.target.name]:entry.id==='years'?[A.years[0]?.topArtist,A.years.at(-1)?.topArtist].filter(Boolean):[],
    facts:entry.facts||[entry.title,entry.detail,entry.basis,...(entry.stats||[]).map(x=>x.join(': '))].join('\n')
  }));
  const candidates=[...supported,...deeperFindings(A)],front=selectFindings(candidates,{limit:6}),frontIds=new Set(front.map(x=>x.id));
  const result=[...front,...candidates.filter(x=>!frontIds.has(x.id)).sort((a,b)=>b.score-a.score)];
  evidenceCache.set(A,result);return result;
}

export function yearWritingFacts(A, year) {
  const rows=A.rows.filter(row=>new Date(row.t).getFullYear()===year.y),artists=new Map(),days=new Set();
  for(const row of rows){artists.set(row.artist,(artists.get(row.artist)||0)+1);days.add(new Date(row.t).toDateString());}
  const months=A.months.filter(month=>month.y===year.y&&month.n),peak=months.reduce((best,month)=>!best||month.n>best.n?month:best,null);
  const discoveries=A.artists.filter(artist=>new Date(artist.first).getFullYear()===year.y&&(artists.get(artist.name)||0)>=10).sort((a,b)=>(artists.get(b.name)||0)-(artists.get(a.name)||0)).slice(0,2);
  const date=t=>new Date(t).toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'});
  const rotation=months.length?`First active month ${new Date(months[0].start).toLocaleDateString('en',{month:'short'})}, led by ${months[0].topArtist}; last active month ${new Date(months.at(-1).start).toLocaleDateString('en',{month:'short'})}, led by ${months.at(-1).topArtist}. Monthly leaders included ${[...new Set(months.map(month=>month.topArtist))].join(', ')}. The first and last months alone do not establish continuous leadership.`:'';
  return `${year.y}: ${year.n} plays, led by ${year.topArtist} with ${year.topArtistN} plays. ${artists.size} artists across ${days.size} recorded days. Coverage ${date(rows[0]?.t)} to ${date(rows.at(-1)?.t)}; this may be a partial year. ${rotation} ${peak?`Busiest recorded month ${new Date(peak.start).toLocaleDateString('en',{month:'short'})}: ${peak.n} plays.`:''} ${discoveries.length?`First heard in this archive that year, with repeat listening: ${discoveries.map(a=>`${a.name}, ${artists.get(a.name)} plays`).join('; ')}.`:''}`;
}

// Suppress numerical paraphrases of the visible finding. This is a repetition
// filter, not a factual verifier for a genuinely new interpretation.
export function addsFindingContext(text,entry){
  const tokens=value=>String(value||'').toLocaleLowerCase('en').match(/[\p{L}\p{N}]+/gu)||[];
  const ignored=new Set('a an the this that these those is are was were has have had their your you in of on to from with and or at for by it they recorded plays play across overall'.split(' '));
  const proposed=[...new Set(tokens(text).filter(word=>!ignored.has(word)))];
  const visible=new Set(tokens(`${entry.title} ${entry.detail} ${entry.basis}`));
  return proposed.length>0&&proposed.filter(word=>visible.has(word)).length/proposed.length<.8;
}

export function dossierFacts(A, evidence) {
  const lines = selectFindings(evidence,{limit:6}).map((x) => `Evidence ID="${x.id}" (return exactly "${x.id}"):\n${x.facts.slice(0,620)}`);
  lines.push(`Other recorded findings: ${A.insights.slice(0, 4).map((x) => plain(x.title)).join('; ')}`);
  lines.push(`Year summaries: ${A.years.slice(-2).map(y=>yearWritingFacts(A,y)).join('\n')}`);
  lines.push(`Eras: ${A.eras.slice(-4).map((e) => `${e.artist}: ${e.plays} plays from ${new Date(e.from).toLocaleDateString('en', {month:'short',year:'numeric'})} to ${new Date(e.to).toLocaleDateString('en', {month:'short',year:'numeric'})}`).join('; ')}`);
  return lines.join('\n\n').slice(0, 4900);
}

export function validateDossier(raw, A, evidence, facts) {
  let value;
  try { value = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (!value || !groundedText(value.notes, facts)) return null;
  const byId = new Map(evidence.map((x) => [x.id, x]));
  const observations = {};
  for (const row of (Array.isArray(value.observations) ? value.observations : []).slice(0, 6)) {
    const id = typeof row?.id === 'string' ? row.id.replace(/^ID\s+/, '') : '';
    const entry = byId.get(id);
    if (entry && groundedText(row.text, entry.facts) && addsFindingContext(row.text,entry)) observations[id] = row.text.trim();
  }
  const years = {};
  for (const row of (Array.isArray(value.years) ? value.years : []).slice(0, 2)) {
    const year = A.years.find((y) => y.y === Number(row?.year));
    if (!year || !groundedText(row.text,yearWritingFacts(A,year))) continue;
    const continuous=/\bled\b[^.!?]*\b(?:throughout|every month|the whole year|the entire year|the year from)\b/i.test(row.text);
    if(continuous&&A.months.some(month=>month.y===year.y&&month.n&&month.topArtist!==year.topArtist))continue;
    years[year.y] = row.text.trim();
  }
  const eras = (Array.isArray(value.eras) ? value.eras : []).slice(0, 4).filter((x) => A.eras.some((e) => e.artist === x?.artist)
    && typeof x.title === 'string' && x.title.length <= 60 && groundedText(x.title, facts) && groundedText(x.line, facts));
  return { notes: value.notes.trim(), observations, years, eras };
}

export function validateCuration(raw, candidates) {
  let value;
  try { value = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (!Array.isArray(value?.picks)) return null;
  const byId = new Map(candidates.map((x) => [x.id, x]));
  const seen = new Set(), picks = [];
  for (const pick of value.picks.slice(0, 12)) {
    const candidate = byId.get(pick?.id);
    if (!candidate || seen.has(pick.id) || !groundedText(pick.reason, candidate.evidence)) continue;
    seen.add(pick.id);
    picks.push({ name: candidate.name, reason: pick.reason.trim(), rank: picks.length });
  }
  return picks.length >= 3 ? picks : null;
}
