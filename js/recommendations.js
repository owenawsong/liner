import { idb, store } from './ui.js';
import { discoverySeeds, candidatePool, rankCandidates, albumsFor, connectionFor, connectionReason, usefulCuration, revisitRecord } from './discovery.js';
import { listeners, cachedListeners, releaseGroupForAlbum, art } from './meta.js';
import { recordSignature, validateCuration } from './dossier.js';
import { write, AI_VERSION, writingFailure } from './ai.js';
import { normalize } from './taste.js';
import * as lastfm from './sources/lastfm.js';

const memory = new Map();
const inflight = new Map();
const outcomeWrites = new Map();
export const feedbackVersion = (taste) => Math.max(0, ...Object.values(taste.items).map((x) => x.updated || 0));
export const RECOMMENDATION_VERSION = 'records-v5';
export const boardSignature = (A, taste, edition = 0) => `${RECOMMENDATION_VERSION}:${recordSignature(A)}:${feedbackVersion(taste)}:${edition}:${AI_VERSION}:${store.get('liner.ai') !== 'off'}:${lastfm.isLive()}`;
const check = (signal) => { if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); };

function awaitSignal(promise,signal) {
  if(!signal)return promise;
  check(signal);
  return new Promise((resolve,reject)=>{
    const abort=()=>{signal.removeEventListener('abort',abort);reject(new DOMException('Cancelled','AbortError'));};
    signal.addEventListener('abort',abort,{once:true});
    Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
}

export async function mapLimited(items, count, fn, signal) {
  let cursor = 0;
  const results = new Array(items.length);
  await Promise.all(Array.from({length: Math.min(count, items.length)}, async () => {
    while (cursor < items.length) {
      check(signal);
      const i = cursor++;
      try { results[i] = await awaitSignal(fn(items[i], i),signal); } catch (e) { check(signal); results[i] = null; }
    }
  }));
  return results;
}

export async function savedRecommendations(pid, A, taste, edition = 0) {
  const signature = boardSignature(A, taste, edition), key = `board:v2:${pid}`;
  const value = memory.get(pid) || await idb.get(key);
  if (value?.signature !== signature || Date.now() - value.at > (value.aiError ? 15*60e3 : 3 * 864e5)) return null;
  memory.set(pid, value);
  return value;
}
export async function forgetRecommendations(pid) { memory.delete(pid); await outcomeWrites.get(pid)?.catch(()=>{}); await idb.delMany([`board:v2:${pid}`,`disc-outcomes:v1:${pid}`]); }

export async function savedStartingRecords(pid,A,taste,edition=0) {
  const board=await savedRecommendations(pid,A,taste,edition);
  return board?.starts || null;
}

export function startingRecords(pool,albums,catalogue,taste,A,curation=[]) {
  const notes = new Map(curation.map(note=>[normalize(note.name),note.reason]));
  const entry=(x,lane)=>{
    const album=albums.find(a=>{
      const own=taste.items[`album:${normalize(a.artist)}|${normalize(a.name)}`];
      return a.group?.id && ['Album','EP'].includes(a.group.type) && normalize(a.artist)===normalize(x.name)
        && own?.status!=='hidden' && own?.status!=='known' && !own?.rating;
    }) || null;
    // A passed album must not immediately reappear as a track-only card for the
    // same artist. A different verified album is still a useful alternative.
    if(!album && albums.some(a=>a.group?.id && ['Album','EP'].includes(a.group.type) && normalize(a.artist)===normalize(x.name)))return null;
    const track=catalogue.find(t=>normalize(t.artist)===normalize(x.name)) || null;
    if (!album && !track) return null;
    const editorial=notes.get(normalize(x.name)) || '';
    return {lane,artist:x.name,album,track,source:connectionFor(x),
      reason:usefulCuration(editorial,x)?editorial:connectionReason(x),audience:x.audience || 0};
  };
  // Notes can arrive after the catalogue. Keep the records in place while their
  // explanations finish rather than swapping artwork under the listener.
  const near=rankCandidates(pool,taste,'for-you').map(x=>entry(x,'current')).filter(Boolean);
  const current=near.find(x=>x.album)||near[0]||null;
  const remaining=pool.filter(x=>normalize(x.name)!==normalize(current?.artist));
  const currentSource=normalize(current?.source?.name);
  const further=rankCandidates(remaining,taste,'explore');
  const order=[...further.filter(x=>normalize(connectionFor(x)?.name)!==currentSource),
    ...further.filter(x=>normalize(connectionFor(x)?.name)===currentSource)];
  const far=order.map(x=>entry(x,'explore')).filter(Boolean);
  const explore=far.find(x=>x.album)||far[0]||null;
  return {current,explore,revisit:revisitRecord(A,taste)};
}

export async function recommendationOutcome(pid,start,action) {
  if (!start || !['listen','save','pass','known','undo'].includes(action)) return;
  const write=(outcomeWrites.get(pid)||Promise.resolve()).catch(()=>{}).then(async()=>{
    const key=`disc-outcomes:v1:${pid}`, data=await idb.get(key)||{entries:[]};
    data.entries.push({at:Date.now(),action,lane:start.lane,artist:start.artist,
      album:start.album?.name || '',track:start.track?.name || '',source:start.source?.name || ''});
    data.entries=data.entries.slice(-120);
    await idb.set(key,data);
  });
  outcomeWrites.set(pid,write);await write;
}

export async function buildRecommendations({pid, A, taste, source, p}, {edition = 0, signal, onProgress = () => {}, onPreview = () => {}, fresh = false} = {}) {
  const signature = boardSignature(A, taste, edition);
  if (!fresh) {
    const cached = await savedRecommendations(pid, A, taste, edition);
    if (cached) { onProgress('Ready from your saved record', 100); return cached; }
  }
  const runKey=`${pid}:${signature}`;
  const existing=inflight.get(runKey);
  if(existing){
    if(existing.preview)onPreview(existing.preview);
    existing.previews.add(onPreview);
    try{return await awaitSignal(existing.promise,signal);}finally{existing.previews.delete(onPreview);}
  }
  const shared={promise:null,preview:null,previews:new Set([onPreview])};
  inflight.set(runKey,shared);
  const run = (async () => {
    check(signal);
    const seeds = discoverySeeds(A, taste, edition);
    if (!lastfm.isLive()) return {signature, at:Date.now(), seeds, pool:[], albums:[], catalogue:[], starts:{current:null,explore:null,revisit:revisitRecord(A,taste)}, curation:[], warning:'Artist connections need a Last.fm API key in Settings.'};
    onProgress('Following your recent listening and long-term favorites', 5);
    const pool = await candidatePool(A, seeds, signal, (done, total) => onProgress(`Artist connections · ${done}/${total}`, 5 + Math.round(done / total * 25)));
    if (!pool.length) return {signature,at:Date.now(),seeds,pool,albums:[],catalogue:[],starts:{current:null,explore:null,revisit:revisitRecord(A,taste)},curation:[],warning:'No unheard artists matched this record yet.'};
    const shortlist = [...pool].sort((a,b)=>b.score-a.score).slice(0, 30);
    let checked = 0;
    await mapLimited(shortlist, 4, async (x) => {
      x.audience = await listeners(x.name);
      checked++; onProgress(`Audience checks · ${checked}/${shortlist.length}`, 30 + Math.round(checked / shortlist.length * 20));
    }, signal);
    const contextual = rankCandidates(pool, taste).slice(0, 16);
    const contexts = await mapLimited(contextual, 3, async (x) => {
      const key = `disc-context:v2:${normalize(x.name)}`;
      const saved = await idb.get(key);
      if (saved && Date.now() - saved.at < 14 * 864e5) return saved.value;
      const value = await lastfm.artistContext(x.name, signal);
      await idb.set(key, {at:Date.now(),value});
      return value;
    }, signal);
    check(signal);
    contextual.forEach((x,i)=> { x.tags = lastfm.musicalTags(contexts[i]?.tags || []); const original=pool.find(y=>y.name===x.name); if(original) original.tags=x.tags; });
    const candidates = contextual.map((x,i) => ({id:`artist_${String.fromCharCode(97+i)}`,name:x.name,
      evidence:`${x.name}. Connections: ${x.sources.slice(0,2).map(s=>`${s.name} (${s.recentPlays || 0} recent plays; ${s.lifetimePlays || 0} lifetime plays; ${s.why.join(', ')})`).join('; ')}. Last.fm audience: ${cachedListeners(x.name) || 'unknown'}. Artist tags: ${(x.tags||[]).slice(0,3).join(', ') || 'not available'}.`}));
    const writing = store.get('liner.ai') !== 'off';
    let aiError = '', aiIssue = null, writingPending = writing && candidates.length >= 3;
    const curate = writing && candidates.length >= 3 ? (async () => {
      try {
        const history = `Recent means latest 90 days ending at the last recorded play. Seeds: ${seeds.slice(0,6).map(s=>`${s.name}: ${s.recentPlays || 0} recent plays; ${[...s.why].join(', ')}`).join('; ')}.`;
        let input = `${history}\nCandidates (all absent from this listening history):`;
        for (const candidate of candidates) {
          const line=`\n${candidate.id}: ${candidate.evidence}`;
          if(input.length+line.length>4900)break;
          input+=line;
        }
        const output = await write('curate', input, {signal});
        const result = validateCuration(output, candidates)?.filter(note=>usefulCuration(note.reason,contextual.find(x=>x.name===note.name)||{}));
        if (!result?.length) throw Object.assign(new Error('The curator returned no specific, supported listening reasons.'),{code:'unsupported_output'});
        return result;
      } catch(e) { aiError=e.message; aiIssue=writingFailure(e); return []; }
      finally { writingPending=false; }
    })() : Promise.resolve([]);
    onProgress('Choosing starting albums and checking their identities', 56);
    const ranked=rankCandidates(pool,taste), outward=rankCandidates(pool,taste,'explore');
    const playableCandidates=[...ranked.slice(0,4),...outward.slice(0,4)].filter((x,i,a)=>a.findIndex(y=>y.name===x.name)===i);
    const tracksTask=mapLimited(playableCandidates,3,async x=>{
      const key=`disc-tracks:v1:${normalize(x.name)}`, saved=await idb.get(key);
      if(saved && Date.now()-saved.at<14*864e5)return saved.value;
      const value=await lastfm.topTracks(x.name,signal,5);check(signal);await idb.set(key,{at:Date.now(),value});return value;
    },signal).catch(()=>[]);
    const rawAlbums = await albumsFor(playableCandidates, A, taste, signal);
    const groups = await mapLimited(rawAlbums, 3, (x)=>releaseGroupForAlbum(x), signal);
    const albums = rawAlbums.map((x,i)=>({...x,group:groups[i],reviews:null})).filter(x=>x.group && ['Album','EP'].includes(x.group.type));
    const catalogue=(await tracksTask).filter(Boolean).map(tracks=>tracks[0]).filter(Boolean);
    check(signal);
    const seedsData=seeds.map(s=>({...s,why:[...s.why]}));
    const provisional={signature,at:Date.now(),seeds:seedsData,pool,albums,catalogue,
      starts:startingRecords(pool,albums,catalogue,taste,A),curation:[],aiError,aiIssue,warning:'',writingPending};
    shared.preview=provisional;
    for(const preview of shared.previews)preview(provisional);
    const available=Object.values(provisional.starts).some(Boolean)?'Your records are ready.':'Your artist connections are ready.';
    onProgress(provisional.writingPending ? `${available} Finishing their listening notes…` : `${available} Preparing the artwork…`, 85);
    const selected = rankCandidates(pool,taste,'for-you');
    await mapLimited([...selected.slice(0,6).map(x=>['artist',x.name,x.name]),...albums.slice(0,4).map(x=>['album',x.name,x.artist])],4,([kind,name,artist])=>art(kind,name,artist),signal);
    const curation = await curate;
    check(signal);
    const starts=startingRecords(pool,albums,catalogue,taste,A,curation);
    const board = {signature,at:Date.now(),seeds:seedsData,pool,albums,catalogue,starts,curation,aiError,aiIssue,warning:'',writingPending:false};
    memory.set(pid,board);
    await idb.set(`board:v2:${pid}`,board);
    onProgress('Recommendations ready',100);
    return board;
  })();
  shared.promise=run;
  try { return await run; } finally { inflight.delete(runKey); }
}
