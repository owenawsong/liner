import test from 'node:test';
import assert from 'node:assert/strict';
import {selectRecording,parseAudio,summarizeAudio,runAudioAudit,newAudioAudit,audioTrackKey,fetchAudioBatch} from '../js/audio-coverage.js';
const id='cb541900-31df-4a34-9734-50319d0bccc6',other='ab541900-31df-4a34-9734-50319d0bccc6';
const track={track:'Song',artist:'Artist',album:'Album'};
const recording=(extra={})=>({id,title:'Song',score:100,'artist-credit':[{name:'Artist',artist:{name:'Artist'}}],releases:[{title:'Album'}],...extra});

test('recording identity requires exact title, full artist credit and source album',()=>{
  assert.equal(selectRecording(track,{recordings:[recording()]}).status,'matched');
  for(const candidate of [recording({title:'Song extended'}),recording({'artist-credit':[{name:'Other Artist'}]}),recording({releases:[{title:'Album deluxe'}]})])assert.equal(selectRecording(track,{recordings:[candidate]}).status,'unmatched');
  assert.equal(selectRecording(track,{recordings:[recording({'artist-credit':[{name:'Artist',joinphrase:' feat. '},{name:'Guest'}]})]}).status,'unmatched');
});

test('ambiguous recordings and unsupported alternate versions are excluded',()=>{
  assert.equal(selectRecording(track,{recordings:[recording(),recording({id:other})]}).status,'ambiguous');
  assert.equal(selectRecording(track,{recordings:[recording({disambiguation:'live recording'})]}).status,'unmatched');
  assert.equal(selectRecording(track,{recordings:[recording({disambiguation:'remix'})]}).status,'unmatched');
  const live={...track,track:'Song (live)'};
  assert.equal(selectRecording(live,{recordings:[recording({title:'Song (live)',disambiguation:'live'})]}).status,'matched');
});

test('audio values are bounded and classifiers stay separate from audio measurements',()=>{
  const result=parseAudio({rhythm:{bpm:125},tonal:{key_key:'C#',key_scale:'minor',key_strength:.8}}, {highlevel:{mood_happy:{all:{happy:.7}},danceability:{all:{danceable:.9}}}},id);
  assert.equal(result.bpm,125);assert.equal(result.key,'C# minor');assert.equal(result.estimates.happy.probability,.7);assert.equal(result.estimates.danceable.probability,.9);
  const bad=parseAudio({rhythm:{bpm:'125'},tonal:{key_key:'H',key_scale:'minor',key_strength:1.2}},{highlevel:{mood_happy:{all:{happy:4}}}},id);
  assert.equal(bad.bpm,null);assert.equal(bad.key,null);assert.deepEqual(bad.estimates,{});
  assert.equal(parseAudio({rhythm:{bpm:600},tonal:{key_key:'A',key_scale:'major',key_strength:.3}},null,id).bpm,null);
});

test('a mismatched submission identifier does not supply sound features',()=>{
  const result=parseAudio({rhythm:{bpm:125},metadata:{tags:{musicbrainz_recordingid:[other]}}},null,id);
  assert.equal(result.bpm,null);assert.match(result.provenance.rejected,/differs/);
});

test('coverage denominator includes every counted play, not only matched songs or selected tracks',()=>{
  const rows=Array.from({length:100},(_,i)=>({...track,t:Date.UTC(2025,0,i+2,12),album:i<20?'Album':'Different version album'}));
  const A={rows,plays:100},audit={tracks:[track],items:{one:{track,identity:{status:'matched',mbid:id},sound:{status:'available',audio:parseAudio({rhythm:{bpm:120}},null,id)}}}};
  const summary=summarizeAudio(A,audit);
  assert.equal(summary.coveredPlays,20);assert.equal(summary.playCoverage,.2);assert.equal(summary.ready,false);assert.equal(summary.years[0].total,100);
});

test('BPM trends require actual BPM coverage, not unrelated key-only coverage',()=>{
  const tempo={...track,track:'Tempo'},keyOnly={...track,track:'Key only'},rows=[];
  for(let i=0;i<1000;i++)rows.push({...((i<30)?tempo:keyOnly),t:Date.UTC(2025,0,1)});
  const audit={tracks:[tempo,keyOnly],items:{tempo:{track:tempo,identity:{status:'matched',mbid:id},sound:{status:'available',audio:{bpm:120,key:null}}},key:{track:keyOnly,identity:{status:'matched',mbid:other},sound:{status:'available',audio:{bpm:null,key:'A major'}}}}};
  const summary=summarizeAudio({rows,plays:1000},audit);
  assert.equal(summary.years[0].bpmCoverage,.03);assert.equal(summary.years[0].ready,false);
});

test('cancelled audits save progress and resume without repeating completed identity lookups',async()=>{
  const A={rows:[{...track,t:1},{...track,track:'Second',t:2}],plays:2},audit=newAudioAudit(A),controller=new AbortController();let lookups=0,saves=0;
  const lookup=async()=>{lookups++;return {status:'matched',mbid:id};};
  await runAudioAudit(A,audit,{signal:controller.signal,lookup,checkpoint:async()=>{saves++;},onProgress:()=>controller.abort()});
  assert.equal(audit.state,'paused');assert.equal(lookups,1);assert.ok(saves>=2);
  await runAudioAudit(A,audit,{lookup,audioLookup:async ids=>Object.fromEntries(ids.map(x=>[x,{status:'missing'}]))});
  assert.equal(audit.state,'done');assert.equal(lookups,2);assert.equal(Object.keys(audit.items).length,2);
});

test('source failures remain errors and are retried, rather than becoming missing coverage',async()=>{
  const A={rows:[{...track,t:1}],plays:1},audit=newAudioAudit(A);
  await runAudioAudit(A,audit,{lookup:async()=>{throw new Error('HTTP 503');}});
  assert.equal(audit.items[audioTrackKey(track)].identity.status,'error');assert.equal(audit.summary.unmatched,0);
  await runAudioAudit(A,audit,{lookup:async()=>({status:'matched',mbid:id}),audioLookup:async()=>{throw new Error('network unavailable');}});
  assert.equal(audit.items[audioTrackKey(track)].sound.status,'error');assert.equal(audit.summary.audioTracks,0);
});

test('AcousticBrainz missing entries are distinct from failed high-level requests',async()=>{
  const fetcher=async url=>url.includes('/low-level?')?{ok:true,json:async()=>({[id]:{'0':{rhythm:{bpm:120}}}})}:{ok:false,status:503,headers:{get:()=>null}};
  const result=await fetchAudioBatch([id,other],{fetcher});
  assert.equal(result[id].status,'available');assert.equal(result[id].audio.bpm,120);assert.equal(result[id].highStatus,'error');assert.equal(result[other].status,'missing');
});

test('a demo source load finishing after profile deletion cannot refill saved audit data',async()=>{
  globalThis.window={};globalThis.location={protocol:'http:',hostname:'localhost'};
  const {idb}=await import('../js/ui.js');const {bindAudioPanel,forgetAudioAudit}=await import('../js/views/audio.js');const {analyze}=await import('../js/analysis.js');
  const before={get:idb.get,set:idb.set,del:idb.del,fetch:globalThis.fetch,document:globalThis.document};let resolveFetch,writes=0,deletes=0;
  idb.get=async()=>undefined;idb.set=async()=>{writes++;return true;};idb.del=async()=>{deletes++;};
  globalThis.document={getElementById:()=>({isConnected:false})};globalThis.fetch=()=>new Promise(resolve=>{resolveFetch=resolve;});
  try{
    const binding=bindAudioPanel({pid:'demo',A:analyze([{...track,t:1}],{minMs:0})});
    while(!resolveFetch)await new Promise(resolve=>setImmediate(resolve));
    await forgetAudioAudit('demo');
    resolveFetch({ok:true,json:async()=>({version:'audio-v1',state:'done',completedAt:1,items:{}})});
    await binding;assert.equal(writes,0);assert.equal(deletes,1);
  }finally{idb.get=before.get;idb.set=before.set;idb.del=before.del;globalThis.fetch=before.fetch;globalThis.document=before.document;}
});
