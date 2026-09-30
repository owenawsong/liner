import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.location={protocol:'http:',hostname:'localhost'};
globalThis.window={};
const {startingRecords,savedStartingRecords,boardSignature,recommendationOutcome}=await import('../js/recommendations.js');
const {catalogueTracks,musicalTags}=await import('../js/sources/lastfm.js');
const {tasteKey}=await import('../js/taste.js');
const {idb}=await import('../js/ui.js');

const A={to:Date.UTC(2026,0,1),from:Date.UTC(2025,0,1),plays:25,rows:[],artists:[],albums:[]};
const pool=[{name:'Near',score:3,match:.9,sources:[{name:'Current',weight:2,match:.9,recentPlays:50}]},
  {name:'Far',score:1.7,match:.35,sources:[{name:'Older',weight:1,match:.35,lifetimePlays:400}]}];
const albums=pool.map(x=>({name:`${x.name} record`,artist:x.name,group:{id:`group-${x.name}`,type:'Album'}}));
const tracks=pool.map(x=>({name:`${x.name} track`,artist:x.name,listeners:500,url:`https://www.last.fm/music/${x.name}/_/track`}));

test('current and further starting records come from real artist catalogues and different connections',()=>{
  const starts=startingRecords(pool,albums,tracks,{items:{}},A);
  assert.equal(starts.current.artist,'Near');assert.equal(starts.current.album.name,'Near record');
  assert.equal(starts.current.track.name,'Near track');assert.equal(starts.explore.artist,'Far');
  assert.notEqual(starts.current.source.name,starts.explore.source.name);assert.equal(starts.revisit,null);
});

test('a starting record needs a verified album group or an actual artist track',()=>{
  assert.equal(startingRecords(pool,albums.map(x=>({...x,group:null})),[],{items:{}},A).current,null);
  const starts=startingRecords(pool,[],tracks,{items:{}},A);
  assert.equal(starts.current.album,null);assert.equal(starts.current.track.name,'Near track');
});

test('an album pass and an already-known artist cannot be restored by a curator pick',()=>{
  const taste={items:{[tasteKey('album','Near record','Near')]:{status:'hidden'},[tasteKey('artist','Far')]:{status:'known'}}};
  const notes=pool.map((x,i)=>({name:x.name,rank:i,reason:'This pick comes from your current rotation and earlier favorites.'}));
  const starts=startingRecords(pool,albums,tracks,taste,A,notes);
  assert.equal(starts.current,null);assert.equal(starts.explore,null);
});

test('Last.fm catalogue tracks require the requested artist and safe details links',()=>{
  const parsed=catalogueTracks({toptracks:{track:[
    {name:'Wrong',artist:{name:'Someone else'},playcount:100,listeners:50,url:'https://www.last.fm/music/wrong'},
    {name:'Real',artist:{name:'NEAR'},playcount:100,listeners:50,url:'javascript:alert(1)'},
    {name:'Broken',artist:{name:'Near'},playcount:-100,listeners:50},
  ]}},'Near');
  assert.equal(parsed.length,1);assert.equal(parsed[0].name,'Real');assert.equal(parsed[0].url,'');
  assert.deepEqual(musicalTags(['female vocalists','seen live','dream pop','indie pop','favorite','2025','American']),['dream pop','indie pop']);
});

test('Overview can reuse saved starting records without new metadata or AI calls',async()=>{
  const original=idb.get,taste={items:{}},starts=startingRecords(pool,albums,tracks,taste,A);
  idb.get=async()=>({signature:boardSignature(A,taste),at:Date.now(),starts});
  try { assert.deepEqual(await savedStartingRecords('qa:starts',A,taste),starts);
    assert.equal(await savedStartingRecords('qa:starts',A,{items:{rated:{updated:100,rating:5}}}),null);
  }finally{idb.get=original;}
});

test('simultaneous listening and shelf outcomes persist without treating a click as a rating',async()=>{
  const oldGet=idb.get,oldSet=idb.set;const db=new Map();
  idb.get=async key=>structuredClone(db.get(key));
  idb.set=async(key,value)=>{await new Promise(r=>setTimeout(r,2));db.set(key,structuredClone(value));return true;};
  try {
    const start=startingRecords(pool,albums,tracks,{items:{}},A).current;
    await Promise.all([recommendationOutcome('qa:events',start,'listen'),recommendationOutcome('qa:events',start,'save')]);
    const events=db.get('disc-outcomes:v1:qa:events').entries;
    assert.deepEqual(events.map(x=>x.action),['listen','save']);assert.equal(events[0].album,'Near record');
    assert.equal(db.has('taste:qa:events'),false);
  }finally{idb.get=oldGet;idb.set=oldSet;}
});
