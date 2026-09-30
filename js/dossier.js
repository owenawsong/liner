import { answerQuestion } from './questions.js';
import { evolution } from './evolution.js';
import { hash, num } from './ui.js';

export const recordSignature = (A) => `r2:${A.plays}:${A.from}:${A.to}:${A.minMs || 0}:${hash(A.artists.map(a=>`${a.name}:${a.n}`).join('|'))}`;
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
  if(evidenceCache.has(A))return evidenceCache.get(A);
  const E = evolution(A, A.to + 1);
  const rising = E.rising[0];
  const origin = A.artists.find((a,i)=>i>=3&&a.name!==rising?.name)?.name || A.artists[0]?.name;
  const year = A.years.length > 1 ? A.years.at(-2).y : A.years[0].y;
  const questions = [
    ['origin', origin && `When did I get into ${origin}?`, 'An artist entering your life'],
    ['years', 'How has my taste changed over the years?', 'The longer view'],
    ['night', 'What do I listen to late at night?', 'After hours'],
    ['summer', `What was my summer ${year} like?`, `Summer ${year}`],
    ...(A.skipRate != null ? [['skips', 'Which artist do I skip the most?', 'What you skip']] : []),
  ];
  const entries = questions.filter(([, q]) => q).map(([id, question, label]) => ({ id, question, label, ...answerQuestion(A, question) })).filter((x) => x.title);
  if (rising) entries.unshift({ id: 'shift', label: 'Moving into your rotation', title: `${rising.name} gained ground`,
    detail: `${rising.before} plays in the previous recorded 90 days, then ${rising.plays} in the latest recorded 90 days. ${E.overlap} artists appear in both top-20 lists.`,
    stats: [['Latest 90 days', String(E.total)], ['Previous 90 days', String(E.previous)]],
    target: { kind: 'artist', name: rising.name }, basis: 'Two equal periods ending at the latest recorded play.',
    comparison:{before:rising.before,now:rising.plays},
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
  const result=entries.map((entry) => ({ ...entry, facts: entry.facts || [entry.title, entry.detail, entry.basis].join('\n') }));
  evidenceCache.set(A,result);return result;
}

export function dossierFacts(A, evidence) {
  const lines = evidence.slice(0,6).map((x) => `Evidence ID="${x.id}" (return exactly "${x.id}"):\n${x.facts.slice(0,620)}`);
  lines.push(`Other recorded findings: ${A.insights.slice(0, 4).map((x) => plain(x.title)).join('; ')}`);
  lines.push(`Year summaries: ${A.years.slice(-2).map((y) => `${y.y}: ${y.n} plays, led by ${y.topArtist} with ${y.topArtistN} plays`).join('; ')}`);
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
    if (entry && groundedText(row.text, entry.facts)) observations[id] = row.text.trim();
  }
  const years = {};
  for (const row of (Array.isArray(value.years) ? value.years : []).slice(0, 2)) {
    const year = A.years.find((y) => y.y === Number(row?.year));
    if (year && groundedText(row.text, `${year.y} ${year.n} ${year.topArtistN} ${year.topArtist}`)) years[year.y] = row.text.trim();
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
