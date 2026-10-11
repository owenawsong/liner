import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.location={protocol:'http:',hostname:'localhost'};
globalThis.window={};
const {startingRecords,savedStartingRecords,boardSignature,recommendationOutcome,buildRecommendations}=await import('../js/recommendations.js');
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
  assert.equal(startingRecords(pool,albums.map(x=>({...x,group:null})),tracks,{items:{}},A).current.track.name,'Near track');
});

test('an album pass and an already-known artist cannot be restored by a curator pick',()=>{
  const taste={items:{[tasteKey('album','Near record','Near')]:{status:'hidden'},[tasteKey('artist','Far')]:{status:'known'}}};
  const notes=pool.map((x,i)=>({name:x.name,rank:i,reason:'This pick comes from your current rotation and earlier favorites.'}));
  const starts=startingRecords(pool,albums,tracks,taste,A,notes);
  assert.equal(starts.current,null);assert.equal(starts.explore,null);
});

test('a known record can be replaced by a different verified record from the artist',()=>{
  const alternative={name:'Another Near record',artist:'Near',group:{id:'another-group',type:'EP'}};
  const taste={items:{[tasteKey('album','Near record','Near')]:{status:'known'}}};
  assert.equal(startingRecords(pool,[...albums,alternative],tracks,taste,A).current.album.name,alternative.name);
});

test('late curator notes cannot move an already playable starting record',()=>{
  const tied=pool.map(x=>({...x,score:2,match:.7}));
  const before=startingRecords(tied,albums,tracks,{items:{}},A);
  const after=startingRecords(tied,albums,tracks,{items:{}},A,[{name:'Far',rank:0,reason:'Older has lifetime plays in your history. Last.fm also connects Far to Older.'}]);
  assert.equal(after.current.artist,before.current.artist);
  assert.equal(after.explore.artist,before.explore.artist);
});

test('verified playable picks appear before a pending writer, and survive its failure',async()=>{
  const oldGet=idb.get,oldSet=idb.set,oldFetch=globalThis.fetch,oldConfig=window.LINER_CONFIG;
  window.LINER_CONFIG={lastfmApiKey:'synthetic-test-key'};
  const db=new Map(),now=Date.now();
  const record={...A,to:now,from:now-864e5,plays:1,artists:[{name:'Preview Seed',n:1}],rows:[{t:now,artist:'Preview Seed',track:'Seed track'}]};
  const artists=['Preview One','Preview Two','Preview Three'];
  db.set('discover:v1:similar:preview seed',{at:now,value:artists.map((name,i)=>({name,match:.9-i*.2}))});
  for(const artist of artists){
    const normalized=artist.toLowerCase();
    db.set(`disc-context:v2:${normalized}`,{at:now,value:{tags:[]}});
    db.set(`discover:v1:albums:${normalized}`,{at:now,value:[]});
    db.set(`disc-tracks:v1:${normalized}`,{at:now,value:[{name:`${artist} track`,artist,listeners:10}]});
  }
  idb.get=async key=>db.get(key);idb.set=async(key,value)=>{db.set(key,value);return true;};
  let releaseWriter,previewResolve,finished=false;
  const writerResponse=new Promise(resolve=>{releaseWriter=resolve;});
  const previewReady=new Promise(resolve=>{previewResolve=resolve;});
  globalThis.fetch=async input=>{
    const url=String(input);
    if(url==='/api/ai')return writerResponse;
    if(url.startsWith('/api/art'))return new Response(JSON.stringify({results:[]}),{status:200});
    const artist=new URL(url).searchParams.get('artist');
    return new Response(JSON.stringify({results:{artistmatches:{artist:[{name:artist,listeners:100}]}}}),{status:200});
  };
  let run;
  try{
    run=buildRecommendations({pid:'qa:progressive-picks',A:record,taste:{items:{}}},{fresh:true,onPreview:previewResolve});
    run.then(()=>{finished=true;});
    const preview=await previewReady;
    assert.equal(preview.writingPending,true);
    assert.ok(preview.starts.current.track.name);
    assert.equal(finished,false);
    let joinedPreview=null;
    const joined=buildRecommendations({pid:'qa:progressive-picks',A:record,taste:{items:{}}},{fresh:true,onPreview:value=>{joinedPreview=value;}});
    await Promise.resolve();
    assert.equal(joinedPreview.starts.current.artist,preview.starts.current.artist);
    releaseWriter(new Response(JSON.stringify({error:'Provider temporarily unavailable',code:'provider_unavailable'}),{status:503}));
    const board=await run;
    assert.equal(await joined,board);
    assert.equal(board.starts.current.artist,preview.starts.current.artist);
    assert.equal(board.writingPending,false);
    assert.ok(board.aiIssue);
    assert.equal(board.curation.length,0);
    assert.ok(db.get('board:v2:qa:progressive-picks').starts.current.track);
  }finally{
    releaseWriter(new Response(JSON.stringify({error:'Stopped',code:'provider_unavailable'}),{status:503}));
    await run?.catch(()=>{});
    idb.get=oldGet;idb.set=oldSet;globalThis.fetch=oldFetch;window.LINER_CONFIG=oldConfig;
  }
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
    await recommendationOutcome('qa:events',start,'undo');
    assert.equal(db.get('disc-outcomes:v1:qa:events').entries.at(-1).action,'undo');
    assert.equal(db.has('taste:qa:events'),false);
  }finally{idb.get=oldGet;idb.set=oldSet;}
});
