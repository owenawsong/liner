import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={};globalThis.location={protocol:'http:',hostname:'localhost'};
const { idb }=await import('../js/ui.js');
const { write,AI_VERSION }=await import('../js/ai.js');
const data=new Map();idb.get=async key=>data.get(key);idb.set=async(key,value)=>{data.set(key,value);return true;};
const originalFetch=globalThis.fetch;
test.after(()=>{globalThis.fetch=originalFetch;});
test('malformed success responses do not poison the local writing cache',async()=>{
  let calls=0;
  globalThis.fetch=async()=>{calls++;return Response.json(calls===1?{model:'test'}:{text:'The older rotation stayed present as another artist returned.'});};
  await assert.rejects(write('notes','Synthetic client shape fixture'),/no usable text/);
  assert.equal(data.size,0);
  const answer=await write('notes','Synthetic client shape fixture');
  assert.match(answer,/older rotation/);assert.equal(calls,2);
  assert.ok([...data.keys()].every(key=>key.startsWith(`ai:${AI_VERSION}:`)));
  assert.equal(await write('notes','Synthetic client shape fixture'),answer);assert.equal(calls,2);
});
