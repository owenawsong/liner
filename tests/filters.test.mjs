import test from 'node:test';
import assert from 'node:assert/strict';
const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
globalThis.location={protocol:'http:',hostname:'localhost'};globalThis.window={};
const { filterHistory,setExclusion,getExclusions,exclusionsSignature }=await import('../js/filters.js');
const rows=[{t:1,artist:'Sleep Artist',track:'Night',album:'Rest'},{t:2,artist:'Other Artist',track:'Night',album:'Rest'},{t:3,artist:'Sleep Artist',track:'Day',album:'Awake'}];
test('a song exclusion is scoped to its artist and preserves the archive',()=>{
  const result=filterHistory(rows,[{kind:'track',artist:'sleep artist',name:'NIGHT'}]);
  assert.deepEqual(result.rows,[rows[1],rows[2]]);assert.equal(result.excluded,1);assert.equal(rows.length,3);
});
test('album and artist rules overlap without counting an excluded play twice',()=>{
  const result=filterHistory(rows,[{kind:'artist',name:'Sleep Artist',artist:''},{kind:'album',artist:'Sleep Artist',name:'Rest'}]);
  assert.deepEqual(result.rows,[rows[1]]);assert.equal(result.excluded,2);
});
test('rules are reversible and isolated between profiles',()=>{
  const item={kind:'artist',name:'Sleep Artist',artist:''};setExclusion('a',item);assert.equal(getExclusions('b').length,0);
  setExclusion('a',item,false);assert.deepEqual(getExclusions('a'),[]);
});
test('changing an exclusion recalculates stats without changing the saved rows',async()=>{
  const { analysisFor }=await import('../js/core.js');const archive={ver:1,export:{rows}};
  const initial=analysisFor('cache:filters',archive);assert.equal(initial.plays,3);
  setExclusion('cache:filters',{kind:'artist',name:'Sleep Artist',artist:''});const changed=analysisFor('cache:filters',archive);
  assert.equal(changed.plays,1);assert.notEqual(initial.filterSignature,changed.filterSignature);assert.equal(archive.export.rows.length,3);
  setExclusion('cache:filters',{kind:'artist',name:'Sleep Artist',artist:''},false);assert.equal(analysisFor('cache:filters',archive).plays,3);
});
test('rule ordering does not invalidate an unchanged analytical record',()=>{
  const rules=[{kind:'artist',name:'A',artist:''},{kind:'track',name:'Song',artist:'B'}];assert.equal(exclusionsSignature(rules),exclusionsSignature([...rules].reverse()));
});
