import { idb, store } from './ui.js';
import { state, rerender } from './core.js';
import { ready, art, artistInfo, listeners } from './meta.js';
import { write, AI_VERSION } from './ai.js';
import { getTaste } from './taste.js';
import { recordSignature, recordEvidence, dossierFacts, validateDossier } from './dossier.js';
import { buildRecommendations, mapLimited } from './recommendations.js';
import { isLive } from './sources/lastfm.js';

const jobs = new Map(), packets = new Map(), subscribers = new Map();
const signature = (A) => `${recordSignature(A)}:ai-${AI_VERSION}-${store.get('liner.ai') !== 'off'}:lfm-${isLive()}`;
export const preparationStatus = (pid) => jobs.get(pid) || null;
const publish = (pid) => subscribers.get(pid)?.forEach(fn=>fn(jobs.get(pid)));
export function watchPreparation(pid, fn) {
  if (!subscribers.has(pid)) subscribers.set(pid,new Set());
  subscribers.get(pid).add(fn); fn(preparationStatus(pid));
  return ()=>{ subscribers.get(pid)?.delete(fn); if(!subscribers.get(pid)?.size)subscribers.delete(pid); };
}
export async function preparedProfile(pid,A) {
  const value=packets.get(pid)||await idb.get(`prepared:v2:${pid}`);
  if(value?.signature!==signature(A)||Date.now()-value.at>(value.errors?.length?15*60e3:7*864e5))return null;
  packets.set(pid,value); return value;
}
export function startPreparation(ctx,{fresh=false}={}) {
  const {pid,A}=ctx;
  const existing=jobs.get(pid);
  if(existing?.state==='running'){
    if(existing.signature===signature(A))return existing;
    existing.cancelled=true;existing.controller.abort();
  }
  const controller=new AbortController();
  const job={state:'running',signature:signature(A),started:Date.now(),progress:0,detail:'Reading the saved listening record',stages:{metadata:'waiting',notes:'waiting',recommendations:'waiting'},controller,errors:[]};
  jobs.set(pid,job); publish(pid);
  const update=(stage,status,detail)=>{job.stages[stage]=status;if(detail)job.detail=detail;const complete=Object.values(job.stages).filter(x=>['done','unavailable','skipped'].includes(x)).length;job.progress=Math.max(job.progress,Math.round(complete/3*100));publish(pid);};
  const signal=controller.signal;
  // Optional remote services have a real deadline. Exact stats are already saved.
  const deadline=setTimeout(()=>controller.abort(),100000);
  job.promise=(async()=>{
    const saved=!fresh&&await preparedProfile(pid,A);
    if(saved){Object.keys(job.stages).forEach(s=>job.stages[s]='done');return saved;}
    await ready();
    const evidence=recordEvidence(A);
    const packet={signature:signature(A),at:Date.now(),evidence,dossier:null,errors:[]};
    update('metadata','running','Preparing the artists, artwork and audience counts');
    const tasks=[...A.artists.slice(0,30).map(a=>()=>listeners(a.name)),...A.artists.slice(0,16).map(a=>()=>artistInfo(a.name,true)),
      ...A.albums.slice(0,10).map(a=>()=>art('album',a.album,a.artist)),...A.artists.slice(0,10).map(a=>()=>art('artist',a.name,a.name))];
    let done=0;
    await mapLimited(tasks,6,async(fn)=>{await fn();if(signal.aborted)return;done++;job.progress=Math.round(done/tasks.length*25);job.detail=`Artwork and artist checks · ${done}/${tasks.length}`;publish(pid);},signal);
    update('metadata','done');
    const taste=await getTaste(pid);
    const notes=(async()=>{
      if(store.get('liner.ai')==='off'){update('notes','skipped');return;}
      update('notes','running','Reading changes across your history');
      try{
        const input=dossierFacts(A,evidence);
        const raw=await write('profile',input,{signal,fresh});
        packet.dossier=validateDossier(raw,A,evidence,input);
        if(!packet.dossier)throw new Error('The profile writing did not match its evidence.');
        update('notes','done');
      }catch(e){packet.errors.push('Extra writing is unavailable; the calculated findings are ready.');update('notes','unavailable');}
    })();
    const recommendations=(async()=>{
      update('recommendations','running');
      try{
        const board=await buildRecommendations({...ctx,taste},{signal,fresh,edition:Number(store.get(`liner.discover.edition:${pid}`)||0),onProgress:(detail,pct)=>{job.detail=detail;job.progress=Math.max(job.progress,25+Math.round(pct*.65));publish(pid);}});
        if(board.warning){packet.errors.push(board.warning);update('recommendations','unavailable');}
        else {if(board.aiError)packet.errors.push('Recommendations are ready; the extra curator writing is unavailable.');update('recommendations','done');}
      }catch(e){packet.errors.push('Recommendations could not finish. They can be rebuilt in Discover.');update('recommendations','unavailable');}
    })();
    await Promise.allSettled([notes,recommendations]);
    if(jobs.get(pid)===job){packets.set(pid,packet); await idb.set(`prepared:v2:${pid}`,packet);}
    return packet;
  })().catch(async(error)=>{
    const packet={signature:signature(A),at:Date.now(),evidence:recordEvidence(A),dossier:null,errors:[error.name==='AbortError'?'Preparation reached its time limit. Your exact listening stats are ready.':error.message]};
    Object.keys(job.stages).forEach(s=>{if(!['done','skipped','unavailable'].includes(job.stages[s]))job.stages[s]='unavailable';});
    if(jobs.get(pid)===job){packets.set(pid,packet);await idb.set(`prepared:v2:${pid}`,packet);}return packet;
  }).then(packet=>{
    job.state='done';job.progress=100;job.packet=packet;job.errors=packet.errors;job.detail='Your profile is ready';publish(pid);
    if(!job.cancelled){store.set(`liner.prepared.once:${pid}`,'1');if(state.pid===pid)rerender();}return packet;
  }).finally(()=>clearTimeout(deadline));
  return job;
}

export async function cancelPreparation(pid) {
  const job=jobs.get(pid);if(job?.state==='running'){job.cancelled=true;job.controller.abort();await job.promise;}
}
export async function cancelAllPreparation(){await Promise.all([...jobs.keys()].map(cancelPreparation));}
export async function forgetPreparation(pid) {
  await cancelPreparation(pid);
  jobs.delete(pid); packets.delete(pid);
  for(const suffix of ['prepared.once','setup.preview'])store.set(`liner.${suffix}:${pid}`,null);
  await idb.del(`prepared:v2:${pid}`);
}
