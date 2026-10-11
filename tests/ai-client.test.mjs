import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={};globalThis.location={protocol:'http:',hostname:'localhost'};
const { idb }=await import('../js/ui.js');
const { write,AI_VERSION,writingFailure,facts }=await import('../js/ai.js');
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

test('writer failures preserve safe codes and retry timing without persisting private diagnostics',async()=>{
  globalThis.fetch=async()=>Response.json({error:'Writing quota is full.',code:'rate_limited',retryAfter:7200},{status:429});
  let issue;
  try{await write('notes','Client quota fixture');}catch(error){issue=writingFailure(error);}
  assert.equal(issue.code,'rate_limited');assert.equal(issue.retryAfter,7200);
  assert.ok(!issue.message.includes('provider token'));
  assert.equal(writingFailure(Object.assign(new Error('Private response body'),{code:'unsupported_output'})).code,'unsupported_output');
});

test('year input contains only the requested year, not whole-archive habits',async()=>{
  const {analyze}=await import('../js/analysis.js');
  const A=analyze([{t:new Date(2024,0,4,23).getTime(),artist:'Earlier',track:'Old'},...Array.from({length:20},(_,i)=>({t:new Date(2025,0,i+1,8).getTime(),artist:'Recent',track:'New'}))],{minMs:0});
  const input=facts(A,{user:{display:'Synthetic'}},{year:2025});
  assert.match(input,/Year: 2025/);assert.match(input,/Recent/);
  assert.ok(!input.includes('Earlier'));assert.ok(!input.includes('Busiest hour'));
});
