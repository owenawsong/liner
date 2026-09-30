import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.location = { protocol:'http:', hostname:'localhost' };
globalThis.window = {};
const { analyze } = await import('../js/analysis.js');
const { recordEvidence, dossierFacts, validateDossier, validateCuration, recordSignature } = await import('../js/dossier.js');
const { mapLimited, boardSignature } = await import('../js/recommendations.js');
const { rankCandidates, discoverySeeds } = await import('../js/discovery.js');
const { tasteKey } = await import('../js/taste.js');
const rows = Array.from({length:180},(_,i)=>({t:new Date(2025,0,i+1,23).getTime(),artist:i<90?'Earlier':'Recent',track:'Track',album:'Record'}));
const A = analyze(rows,{minMs:0});

test('prepared findings end at the recorded history rather than today',()=>{
  const shift=recordEvidence(A).find(x=>x.id==='shift');
  assert.match(shift.title,/Recent/);
  assert.match(shift.detail,/then 90 in the latest/);
  assert.match(shift.basis,/latest recorded play/);
});
test('prepared writing rejects invented totals and isolates each observation to its evidence',()=>{
  const evidence=recordEvidence(A),facts=dossierFacts(A,evidence);
  assert.equal(validateDossier({notes:'You recorded 9999 plays.'},A,evidence,facts),null);
  const result=validateDossier({notes:'Recent moved into the lead.',observations:[
    {id:'ID shift',text:'Recent took over the rotation.'},
    {id:'shift',text:'Recent gained 9999 plays.'},
    {id:'invented',text:'A made-up observation.'}],years:[],eras:[]},A,evidence,facts);
  assert.deepEqual(result.observations,{shift:'Recent took over the rotation.'});
});
test('curation accepts only unique candidates with numbers supplied for that artist',()=>{
  const candidates=['A','B','C'].map((name,i)=>({id:`artist_${name}`,name,evidence:`${name} linked to Earlier. Audience ${i+10}. Tags: rock.`}));
  const picks=[{id:'invented',reason:'An arbitrary choice.'},
    {id:'artist_A',reason:'Rock connected to Earlier; 10 listeners.'},
    {id:'artist_A',reason:'Duplicate.'},
    {id:'artist_B',reason:'Rock connected to Earlier; 10 listeners.'},
    {id:'artist_B',reason:'Rock connected to Earlier.'},
    {id:'artist_C',reason:'Rock connected to Earlier.'}];
  const result=validateCuration({picks},candidates);
  assert.deepEqual(result.map(x=>x.name),['A','B','C']);
  assert.equal(result[1].reason,'Rock connected to Earlier.');
  assert.equal(validateCuration({picks:picks.slice(0,4)},candidates),null);
});
test('aborting a stuck metadata worker releases setup and starts no queued work',async()=>{
  const controller=new AbortController();let started=0;
  const work=mapLimited([1,2,3],1,()=>{started++;return new Promise(()=>{});},controller.signal);
  controller.abort();
  await assert.rejects(work,{name:'AbortError'});
  assert.equal(started,1);
});
test('recommendation snapshots change for opinions and equal-sized different histories',()=>{
  const taste={items:{}};
  const baseline=boardSignature(A,taste);
  const changed={...A,artists:A.artists.map(x=>({...x,name:`Other ${x.name}`}))};
  assert.notEqual(recordSignature(A),recordSignature(changed));
  assert.notEqual(baseline,boardSignature(A,{items:{rated:{updated:123,rating:5}}}));
});
test('an AI pick cannot reintroduce a hidden or known artist',()=>{
  const pool=['Hidden','Known','Allowed'].map(name=>({name,score:1,match:.7,sources:[{name:'Seed',match:.7}]}));
  const taste={items:{[tasteKey('artist','Hidden')]:{status:'hidden'},[tasteKey('artist','Known')]:{status:'known'}}};
  const curation=pool.map((x,i)=>({name:x.name,rank:i,reason:'Curator pick.'}));
  assert.deepEqual(rankCandidates(pool,taste,'for-you',new Set(),curation).map(x=>x.name),['Allowed']);
});
test('recent listening share contributes more than a lightly played ranked artist',()=>{
  const seeds=discoverySeeds(A,{items:{}});
  assert.ok(seeds.find(x=>x.name==='Recent').weight>seeds.find(x=>x.name==='Earlier').weight);
});
test('staying discoveries need repeated listening in three months and recent activity',()=>{
  const plays=[];
  const add=(month,artist,n)=>{for(let i=0;i<n;i++)plays.push({t:new Date(2025,month,10,i).getTime(),artist,track:'Track',album:'Album'});};
  add(0,'Old favorite',30);add(6,'Stayed',3);add(7,'Stayed',3);add(8,'Stayed',3);
  add(8,'One day burst',50);add(8,'Only two months',3);add(7,'Only two months',3);
  const history=analyze(plays.sort((a,b)=>a.t-b.t),{minMs:0});
  const evidence=recordEvidence(history);
  const stayed=evidence.find(x=>x.id==='stayed');
  assert.equal(stayed.target.name,'Stayed');
  assert.match(stayed.detail,/1 of the 4 artists/);
  const revisit=evidence.find(x=>x.id==='revisit');
  assert.equal(revisit.target.name,'Old favorite');assert.match(revisit.detail,/30 lifetime plays/);
});
test('an archive containing only excluded short plays has no analysed profile',async()=>{
  const { analysisFor }=await import('../js/core.js');
  assert.equal(analysisFor('qa:short',{ver:1,export:{rows:[{t:1,artist:'A',track:'B',ms:1000}]}}),null);
});
