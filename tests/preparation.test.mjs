import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={};globalThis.location={protocol:'http:',hostname:'localhost'};
const local=new Map();globalThis.localStorage={getItem:k=>local.get(k)??null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)};
const { idb }=await import('../js/ui.js');const data=new Map();
idb.get=async key=>data.get(key);idb.set=async(key,value)=>{data.set(key,structuredClone(value));return true;};idb.del=async key=>data.delete(key);
const { analyze }=await import('../js/analysis.js');
const { startPreparation,cancelPreparation,forgetPreparation,preparedProfile,watchPreparation }=await import('../js/preparation.js');
const A=analyze(Array.from({length:20},(_,i)=>({t:new Date(2025,0,i+1).getTime(),artist:'A',track:'Song',album:'Album'})));
const base={ready:async()=>{},art:async()=>'',artistInfo:async()=>null,listeners:async()=>null,getTaste:async()=>({items:{}})};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('interrupted setup reuses completed writing and metadata from its saved checkpoint',async()=>{
  let writes=0,metadata=0;
  const ctx={pid:'qa:resume',A,source:'file',p:{}};
  const job=startPreparation(ctx,{services:{...base,artistInfo:async()=>{metadata++;},write:async()=>{writes++;return JSON.stringify({notes:'A appears in this record.',observations:[],years:[],eras:[]});},buildRecommendations:async(_ctx,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true}))}});
  for(let i=0;i<15&&job.stages.notes!=='done';i++)await tick();
  assert.equal(job.stages.notes,'done');await job.saveTail;
  assert.ok(data.get('prep-work:v3:qa:resume').packet.dossier);
  await cancelPreparation(ctx.pid);
  assert.equal(await preparedProfile(ctx.pid,A),null);
  const resumed=startPreparation(ctx,{services:{...base,artistInfo:async()=>{metadata++;},write:async()=>{writes++;throw new Error('Completed writing should not repeat.');},buildRecommendations:async()=>({warning:'',aiError:''})}});
  await resumed.promise;
  assert.equal(writes,1);assert.equal(metadata,1);
  assert.ok((await preparedProfile(ctx.pid,A)).dossier);
  assert.equal(data.has('prep-work:v3:qa:resume'),false);
  await forgetPreparation(ctx.pid);
});
test('removing a running profile clears its preparation checkpoint and cannot resurrect a packet',async()=>{
  const ctx={pid:'qa:remove',A,source:'file',p:{}};
  const waitAbort=async(_value,_facts,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true}));
  const job=startPreparation(ctx,{services:{...base,write:waitAbort,buildRecommendations:async()=>({warning:'',aiError:''})}});
  for(let i=0;i<15&&job.stages.notes!=='running';i++)await tick();
  await forgetPreparation(ctx.pid);await job.promise;
  assert.equal(data.has('prepared:v2:qa:remove'),false);assert.equal(data.has('prep-work:v3:qa:remove'),false);
});

test('writing starts while metadata is pending and concurrent progress never moves backward',async()=>{
  let release;const blocked=new Promise(resolve=>release=resolve),progress=[];
  const ctx={pid:'qa:parallel',A,source:'file',p:{}};
  const unwatch=watchPreparation(ctx.pid,job=>{if(job)progress.push(job.progress);});
  const job=startPreparation(ctx,{services:{...base,art:()=>blocked,artistInfo:()=>blocked,listeners:()=>blocked,
    write:async()=>JSON.stringify({notes:'A appears in your saved record.',observations:[],years:[],eras:[]}),
    buildRecommendations:async(_ctx,{onProgress})=>{onProgress('Records checked',85);onProgress('An older callback',30);return {warning:'',aiError:''};}}});
  for(let i=0;i<30&&job.stages.notes!=='done';i++)await tick();
  assert.equal(job.stages.notes,'done');assert.equal(job.stages.metadata,'running');assert.equal(job.metadata.done,0);
  release(null);await job.promise;unwatch();
  assert.ok(progress.every((value,index)=>!index||value>=progress[index-1]));
  assert.equal(job.metadata.done,job.metadata.total);assert.equal(job.state,'done');
  await forgetPreparation(ctx.pid);
});

test('a service ignoring its abort signal cannot strand the setup screen',async()=>{
  const ctx={pid:'qa:deadline',A,source:'file',p:{}};
  const blocked=()=>new Promise(()=>{});
  const job=startPreparation(ctx,{timeoutMs:30,services:{...base,write:blocked,art:blocked,getTaste:blocked}});
  await job.promise;
  assert.equal(job.state,'done');assert.equal(job.progress,100);
  assert.equal(job.stages.notes,'unavailable');assert.equal(job.stages.recommendations,'unavailable');
  assert.ok(await preparedProfile(ctx.pid,A));
  assert.equal(job.packet.issues.notes.code,'timeout');
  await forgetPreparation(ctx.pid);
});

test('writer failure retains its cause and the recommendations remain ready',async()=>{
  const ctx={pid:'qa:unsupported',A,source:'file',p:{}};
  const job=startPreparation(ctx,{services:{...base,write:async()=>{throw Object.assign(new Error('Private provider detail'),{code:'unsupported_output'});},buildRecommendations:async()=>({warning:'',aiError:''})}});
  await job.promise;
  assert.equal(job.packet.issues.notes.code,'unsupported_output');assert.equal(job.stages.recommendations,'done');
  assert.ok(!JSON.stringify(job.packet.errors).includes('Private provider detail'));
  await forgetPreparation(ctx.pid);
});
