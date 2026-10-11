import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.location={protocol:'http:',hostname:'localhost'};
globalThis.window={};
const { releaseGroupForAlbum, clearMetadata }=await import('../js/meta.js');
const { idb }=await import('../js/ui.js');
const savedFetch=globalThis.fetch;
test('album lookup without a Last.fm ID requires both title and artist before a score',async()=>{
  const urls=[];
  globalThis.fetch=async(url)=>{
    urls.push(url);
    return Response.json(url.includes('query=')?{'release-groups':[
      {id:'wrong',score:100,title:'Shared Title','artist-credit':[{artist:{name:'Different Artist'}}]},
      {id:'right',score:100,title:'Shared Title','artist-credit':[{artist:{name:'Correct Artist'}}]}]}:
      {id:'right',title:'Shared Title','primary-type':'Album','artist-credit':[{artist:{name:'Correct Artist'}}],rating:{value:4.2,'votes-count':50}});
  };
  try{
    const album=await releaseGroupForAlbum({name:'Shared Title',artist:'Correct Artist'});
    assert.equal(album.id,'right');assert.equal(album.rating,4.2);assert.equal(urls.length,2);
    assert.ok(!urls[1].includes('/wrong'));
  }finally{globalThis.fetch=savedFetch;}
});
test('an existing album ID does not bypass the artist identity check',async()=>{
  globalThis.fetch=async(url)=>Response.json(url.includes('/release/')?
    {'release-group':{id:'group'}}:
    {id:'group',title:'Same Album','primary-type':'Album','artist-credit':[{artist:{name:'Wrong Artist'}}],rating:{value:5,'votes-count':500}});
  try{assert.equal(await releaseGroupForAlbum({mbid:'11111111-1111-1111-1111-111111111111',name:'Same Album',artist:'Expected Artist'}),null);}
  finally{globalThis.fetch=savedFetch;}
});
test('a lookup still finishing after a wipe cannot refill metadata storage',async()=>{
  const originalSet=idb.set;let writes=0;
  idb.set=async()=>{writes++;return true;};
  globalThis.fetch=async(url)=>Response.json(url.includes('/release/')?
    {'release-group':{id:'late'}}:
    {id:'late',title:'Late Album','primary-type':'Album','artist-credit':[{artist:{name:'Late Artist'}}]});
  try{
    const pending=releaseGroupForAlbum({mbid:'22222222-2222-2222-2222-222222222222',name:'Late Album',artist:'Late Artist'});
    clearMetadata();await pending;
    assert.equal(writes,0);
  }finally{idb.set=originalSet;globalThis.fetch=savedFetch;}
});
