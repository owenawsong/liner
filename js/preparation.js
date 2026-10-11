import { idb, store } from './ui.js';
import { state, rerender } from './core.js';
import { ready, art, artistInfo, listeners } from './meta.js';
import { write, AI_VERSION, writingFailure } from './ai.js';
import { getTaste } from './taste.js';
import { recordSignature, recordEvidence, dossierFacts, validateDossier } from './dossier.js';
import { buildRecommendations, mapLimited, RECOMMENDATION_VERSION } from './recommendations.js';
import { isLive } from './sources/lastfm.js';

const jobs = new Map(), packets = new Map(), subscribers = new Map();
const signature = A => `${recordSignature(A)}:ai-${AI_VERSION}-${store.get('liner.ai') !== 'off'}:lfm-${isLive()}:${RECOMMENDATION_VERSION}`;
const terminal = status => ['done','unavailable','skipped'].includes(status);
export const preparationStatus = pid => jobs.get(pid) || null;
const publish = pid => subscribers.get(pid)?.forEach(fn => fn(jobs.get(pid)));
export function watchPreparation(pid, fn) {
  if (!subscribers.has(pid)) subscribers.set(pid,new Set());
  subscribers.get(pid).add(fn); fn(preparationStatus(pid));
  return () => { subscribers.get(pid)?.delete(fn); if (!subscribers.get(pid)?.size) subscribers.delete(pid); };
}
export async function preparedProfile(pid,A) {
  const value = packets.get(pid) || await idb.get(`prepared:v2:${pid}`);
  if (value?.signature !== signature(A) || Date.now()-value.at > (value.errors?.length ? 15*60e3 : 7*864e5)) return null;
  packets.set(pid,value); return value;
}

// A deadline must also release adapters that do not implement cancellation.
function abortable(work,signal) {
  if (signal.aborted) return Promise.reject(signal.reason instanceof Error?signal.reason:new DOMException('Cancelled','AbortError'));
  return new Promise((resolve,reject) => {
    const abort = () => { signal.removeEventListener('abort',abort); reject(signal.reason instanceof Error?signal.reason:new DOMException('Cancelled','AbortError')); };
    signal.addEventListener('abort',abort,{once:true});
    Promise.resolve().then(work).then(resolve,reject).finally(() => signal.removeEventListener('abort',abort));
  });
}

export function startPreparation(ctx,{fresh=false,services={},timeoutMs=120000}={}) {
  const {pid,A}=ctx, io={ready,art,artistInfo,listeners,write,getTaste,buildRecommendations,...services};
  const existing=jobs.get(pid);
  if (existing?.state==='running') {
    if (existing.signature===signature(A)) return existing;
    existing.cancelled=true; existing.controller.abort();
  }
  const controller=new AbortController(), signal=controller.signal;
  const job={state:'running',signature:signature(A),started:Date.now(),progress:0,detail:'Reading the saved listening record',
    stages:{metadata:'waiting',notes:'waiting',recommendations:'waiting'},stageDetails:{},stageProgress:{metadata:0,notes:0,recommendations:0},
    metadata:{done:0,total:0,failed:0},resumed:false,issues:{},controller,errors:[],saveTail:Promise.resolve()};
  jobs.set(pid,job); publish(pid);
  let packet;
  const journalKey=`prep-work:v3:${pid}`;
  const active=()=>!job.cancelled&&jobs.get(pid)===job;
  const checkpoint=()=>{
    if (!packet || !active()) return Promise.resolve();
    const snapshot=JSON.parse(JSON.stringify({signature:job.signature,at:Date.now(),stages:job.stages,packet}));
    job.saveTail=job.saveTail.then(()=>active()?idb.set(journalKey,snapshot):null).catch(()=>{});
    return job.saveTail;
  };
  const update=(stage,status,detail,fraction)=>{
    if(!active()||job.state!=='running'||status==='running'&&signal.aborted)return;
    job.stages[stage]=status;
    if(detail){job.detail=detail;job.stageDetails[stage]=detail;}
    if(terminal(status))job.stageProgress[stage]=1;
    else if(Number.isFinite(fraction))job.stageProgress[stage]=Math.max(job.stageProgress[stage],Math.min(1,Math.max(0,fraction)));
    const measured=job.stageProgress.metadata*25+job.stageProgress.notes*25+job.stageProgress.recommendations*50;
    job.progress=Math.max(job.progress,Math.min(99,Math.round(measured)));
    publish(pid); if(terminal(status))checkpoint();
  };
  const fail=(stage,error,message)=>{
    if(!active())return;
    const issue=writingFailure(error);job.issues[stage]=issue;packet.issues[stage]=issue;packet.errors.push(message||issue.message);
    update(stage,'unavailable',message||issue.message);
  };
  const deadline=setTimeout(()=>controller.abort(Object.assign(new Error('Preparation deadline'),{name:'TimeoutError',code:'timeout'})),Math.max(1,Math.min(120000,timeoutMs)));
  job.promise=(async()=>{
    const saved=!fresh&&await abortable(()=>preparedProfile(pid,A),signal);
    if(saved){Object.keys(job.stages).forEach(stage=>job.stages[stage]=saved.stages?.[stage]||(stage==='notes'&&!saved.dossier?'unavailable':'done'));job.issues=saved.issues||{};return saved;}
    await abortable(()=>io.ready(),signal);
    const evidence=recordEvidence(A),previous=!fresh&&await abortable(()=>idb.get(journalKey),signal);
    job.resumed=previous?.signature===job.signature&&Date.now()-previous.at<864e5;
    packet={signature:job.signature,at:Date.now(),evidence,dossier:job.resumed?previous.packet?.dossier||null:null,errors:[],issues:{}};
    if(job.resumed)job.detail='Continuing your saved preparation';

    // Writing uses calculated evidence, so it need not wait for artwork.
    const notes=(async()=>{
      if(store.get('liner.ai')==='off'){update('notes','skipped','Optional AI writing is switched off');return;}
      if(ctx.source==='demo'){update('notes','skipped','The demo includes example listening notes');return;}
      if(!evidence.length){update('notes','skipped','More recorded listening will support personal notes');return;}
      if(packet.dossier){update('notes','done','Your saved listening notes are ready');return;}
      update('notes','running','Reading changes in your saved listening history');
      try{
        const input=dossierFacts(A,evidence),raw=await abortable(()=>io.write('profile',input,{signal,fresh}),signal);
        const dossier=validateDossier(raw,A,evidence,input);
        if(!dossier)throw Object.assign(new Error('Unsupported profile writing'),{code:'unsupported_output'});
        if(!active())return;packet.dossier=dossier;update('notes','done','Your personal notes are ready');
      }catch(error){fail('notes',error);}
    })();

    const metadata=(async()=>{
      update('metadata','running','Checking artwork and artist information');
      if(job.resumed&&previous.stages?.metadata==='done'){update('metadata','done','Your saved artist checks are ready');return;}
      const findingArtists=[...new Set(evidence.slice(0,6).flatMap(entry=>entry.artists||[entry.target?.name]).filter(Boolean))];
      const tasks=[...A.artists.slice(0,30).map(a=>()=>io.listeners(a.name)),...A.artists.slice(0,24).map(a=>()=>io.artistInfo(a.name,true)),
        ...A.albums.slice(0,10).map(a=>()=>io.art('album',a.album,a.artist)),...A.artists.slice(0,10).map(a=>()=>io.art('artist',a.name,a.name)),
        ...findingArtists.filter(name=>!A.artists.slice(0,10).some(a=>a.name===name)).map(name=>()=>io.art('artist',name,name))];
      job.metadata.total=tasks.length;
      try{
        await abortable(()=>mapLimited(tasks,6,async fn=>{
          try{await fn();}catch(error){job.metadata.failed++;throw error;}
          finally{if(!signal.aborted&&active()){job.metadata.done++;update('metadata','running',`Artwork and artist checks · ${job.metadata.done}/${tasks.length}`,job.metadata.done/Math.max(1,tasks.length));}}
        },signal),signal);
        update('metadata',job.metadata.failed?'unavailable':'done',job.metadata.failed?'Some artist checks failed; missing artwork uses a Sleeve cover':'Artist checks complete; missing artwork uses a Sleeve cover');
      }catch(error){fail('metadata',error,'Some artist details could not finish. Your listening record is ready.');}
    })();

    const recommendations=(async()=>{
      update('recommendations','running','Following artists in your record');
      try{
        const taste=await abortable(()=>io.getTaste(pid),signal);
        const board=await abortable(()=>io.buildRecommendations({...ctx,taste},{signal,fresh,edition:Number(store.get(`liner.discover.edition:${pid}`)||0),
          onPreview:preview=>{if(!active()||signal.aborted)return;job.recommendationPreview=preview;update('recommendations','running','Verified starting records are ready; finishing their notes');},
          onProgress:(detail,pct)=>update('recommendations','running',detail,pct/100)}),signal);
        if(!active())return;
        if(board.warning)fail('recommendations',Object.assign(new Error('No supported recommendations'),{code:'provider_unavailable'}),board.warning);
        else {
          if(board.aiError){packet.errors.push('Recommendations are ready; extra curator writing is unavailable.');packet.issues.curation=board.aiIssue||writingFailure(null);}
          update('recommendations','done','Your starting records are ready');
        }
      }catch(error){fail('recommendations',error,'Recommendations could not finish. Discover can continue them.');}
    })();
    await Promise.allSettled([notes,metadata,recommendations]);
    return packet;
  })().catch(error=>{
    packet??={signature:job.signature,at:Date.now(),evidence:recordEvidence(A),dossier:null,errors:[],issues:{}};
    if(active()){
      packet.errors.push(error.code==='timeout'?'Optional preparation reached its time limit. Your listening record is ready.':'Optional preparation could not finish. Your saved listening record is ready.');
      Object.keys(job.stages).forEach(stage=>{if(!terminal(job.stages[stage]))update(stage,'unavailable',packet.errors.at(-1));});
    }
    return packet;
  }).then(async value=>{
    if(!active()){job.state='cancelled';return value;}
    value.at=Date.now();value.stages={...job.stages};packets.set(pid,value);await idb.set(`prepared:v2:${pid}`,value);
    if(!active())return value;
    job.state='done';job.progress=100;job.packet=value;job.errors=value.errors;job.detail='Your profile is ready';publish(pid);
    store.set(`liner.prepared.once:${pid}`,'1');if(state.pid===pid)rerender();return value;
  }).finally(async()=>{clearTimeout(deadline);await job.saveTail;if(active())await idb.del(journalKey);});
  return job;
}

export async function cancelPreparation(pid) {
  const job=jobs.get(pid);if(job?.state==='running'){job.cancelled=true;job.controller.abort();await job.promise;}
}
export async function cancelAllPreparation(){await Promise.all([...jobs.keys()].map(cancelPreparation));}
export async function forgetPreparation(pid) {
  await cancelPreparation(pid);jobs.delete(pid);packets.delete(pid);
  for(const suffix of ['prepared.once','setup.preview'])store.set(`liner.${suffix}:${pid}`,null);
  await idb.del(`prepared:v2:${pid}`);await idb.del(`prep-work:v3:${pid}`);
}
