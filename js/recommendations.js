import { idb, store } from './ui.js';
import { discoverySeeds, candidatePool, rankCandidates, albumsFor } from './discovery.js';
import { listeners, cachedListeners, releaseGroupForAlbum, art } from './meta.js';
import { recordSignature, validateCuration } from './dossier.js';
import { write, AI_VERSION } from './ai.js';
import { normalize } from './taste.js';
import * as lastfm from './sources/lastfm.js';

const memory = new Map();
const inflight = new Map();
export const feedbackVersion = (taste) => Math.max(0, ...Object.values(taste.items).map((x) => x.updated || 0));
export const boardSignature = (A, taste, edition = 0) => `${recordSignature(A)}:${feedbackVersion(taste)}:${edition}:${AI_VERSION}:${store.get('liner.ai') !== 'off'}:${lastfm.isLive()}`;
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
export async function forgetRecommendations(pid) { memory.delete(pid); await idb.del(`board:v2:${pid}`); }

export async function buildRecommendations({pid, A, taste, source, p}, {edition = 0, signal, onProgress = () => {}, fresh = false} = {}) {
  const signature = boardSignature(A, taste, edition);
  if (!fresh) {
    const cached = await savedRecommendations(pid, A, taste, edition);
    if (cached) { onProgress('Ready from your saved record', 100); return cached; }
  }
  if (inflight.has(`${pid}:${signature}`)) return awaitSignal(inflight.get(`${pid}:${signature}`),signal);
  const run = (async () => {
    check(signal);
    const seeds = discoverySeeds(A, taste, edition);
    if (!lastfm.isLive()) return {signature, at:Date.now(), seeds, pool:[], albums:[], curation:[], warning:'Artist connections need a Last.fm API key in Settings.'};
    onProgress('Following your recent listening and long-term favorites', 5);
    const pool = await candidatePool(A, seeds, signal, (done, total) => onProgress(`Artist connections · ${done}/${total}`, 5 + Math.round(done / total * 25)));
    if (!pool.length) return {signature,at:Date.now(),seeds,pool,albums:[],curation:[],warning:'No unheard artists matched this record yet.'};
    const shortlist = [...pool].sort((a,b)=>b.score-a.score).slice(0, 30);
    let checked = 0;
    await mapLimited(shortlist, 4, async (x) => {
      x.audience = await listeners(x.name);
      checked++; onProgress(`Audience checks · ${checked}/${shortlist.length}`, 30 + Math.round(checked / shortlist.length * 20));
    }, signal);
    const contextual = rankCandidates(pool, taste).slice(0, 16);
    const contexts = await mapLimited(contextual, 3, async (x) => {
      const key = `disc-context:v1:${normalize(x.name)}`;
      const saved = await idb.get(key);
      if (saved && Date.now() - saved.at < 14 * 864e5) return saved.value;
      const value = await lastfm.artistContext(x.name, signal);
      await idb.set(key, {at:Date.now(),value});
      return value;
    }, signal);
    check(signal);
    contextual.forEach((x,i)=> { x.tags = contexts[i]?.tags || []; const original=pool.find(y=>y.name===x.name); if(original) original.tags=x.tags; });
    const candidates = contextual.map((x,i) => ({id:`artist_${String.fromCharCode(97+i)}`,name:x.name,
      evidence:`${x.name}. Artist tags: ${(x.tags||[]).join(', ') || 'not available'}. Last.fm audience: ${cachedListeners(x.name) || 'unknown'}. Connections: ${x.sources.slice(0,3).map(s=>`${s.name} (${s.why.join(', ')})`).join('; ')}.`}));
    const writing = store.get('liner.ai') !== 'off';
    let aiError = '';
    const curate = writing && candidates.length >= 3 ? (async () => {
      try {
        const history = `Recent and long-term seeds: ${seeds.slice(0,10).map(s=>`${s.name}: ${[...s.why].join(', ')}`).join('; ')}.`;
        const input = `${history}\nCandidates (all absent from this listening history):\n${candidates.map(x=>`${x.id}: ${x.evidence}`).join('\n')}`.slice(0,4900);
        const output = await write('curate', input, {signal});
        const result = validateCuration(output, candidates);
        if (!result) throw new Error('The curator returned unsupported picks.');
        return result;
      } catch(e) { aiError=e.message; return []; }
    })() : Promise.resolve([]);
    onProgress('Choosing starting albums and checking their identities', 56);
    const rawAlbums = await albumsFor(rankCandidates(pool, taste), A, taste, signal);
    const groups = await mapLimited(rawAlbums, 3, (x)=>releaseGroupForAlbum(x), signal);
    const albums = rawAlbums.map((x,i)=>({...x,group:groups[i],reviews:null})).filter(x=>x.group && ['Album','EP'].includes(x.group.type));
    onProgress(writing ? 'Finishing the recommendation notes' : 'Preparing the artwork', 85);
    const curation = await curate;
    check(signal);
    const selected = rankCandidates(pool,taste,'for-you',new Set(),curation);
    await mapLimited([...selected.slice(0,6).map(x=>['artist',x.name,x.name]),...albums.slice(0,4).map(x=>['album',x.name,x.artist])],4,([kind,name,artist])=>art(kind,name,artist),signal);
    check(signal);
    const board = {signature,at:Date.now(),seeds:seeds.map(s=>({...s,why:[...s.why]})),pool,albums,curation,aiError,warning:''};
    memory.set(pid,board);
    await idb.set(`board:v2:${pid}`,board);
    onProgress('Recommendations ready',100);
    return board;
  })();
  inflight.set(`${pid}:${signature}`,run);
  try { return await run; } finally { inflight.delete(`${pid}:${signature}`); }
}
