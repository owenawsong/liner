import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/ai.js';
import { onRequestGet } from '../functions/api/art.js';
import { onRequest as apiMiddleware } from '../functions/api/_middleware.js';
import { onRequest as apiMissing } from '../functions/api/[[path]].js';
const savedFetch=globalThis.fetch,savedCaches=globalThis.caches;
const cached=new Map();
globalThis.caches={default:{match:async req=>cached.get(req.url)?.clone(),put:async(req,res)=>cached.set(req.url,res.clone())}};
test.after(()=>{globalThis.fetch=savedFetch;globalThis.caches=savedCaches;});
let visitor=0;
const budget={idFromName:x=>x,get:()=>({fetch:async()=>new Response('',{status:200})})};
const waits=[];
const ctx=request=>({request,env:{OPENROUTER_API_KEY:'test',AI_BUDGET:budget},waitUntil:promise=>waits.push(promise)});
const ai=(body,headers={})=>new Request('https://sleeve.example/api/ai',{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':`198.51.100.${++visitor}`,...headers},body:typeof body==='string'?body:JSON.stringify(body)});
const art=items=>new Request(`https://sleeve.example/api/art?q=${encodeURIComponent(JSON.stringify(items))}`);
const success=()=>Response.json({model:'test',choices:[{message:{content:'An earlier favorite stayed present when another artist returned.'}}]});
const picture='https://cdn-images.dzcdn.net/images/artist/valid/500.jpg';

test('API middleware returns JSON 404 for unknown routes instead of SPA HTML',async()=>{
  for(const path of ['/api','/api/','/api/nonexistent','/api/ai/nested']){
    const res=await apiMiddleware({request:new Request(`https://sleeve.example${path}`),next:()=>{throw new Error('Must not reach assets');}});
    assert.equal(res.status,404);assert.match(res.headers.get('Content-Type'),/application\/json/);assert.equal(res.headers.get('Cache-Control'),'no-store');assert.equal(res.headers.get('X-Content-Type-Options'),'nosniff');
  }
  assert.equal(apiMissing().status,404);
});
test('known API routes reject unsupported methods and advertise only their allowed method',async()=>{
  for(const [path,allowed] of [['/api/ai','POST'],['/api/art','GET']]){
    for(const method of ['GET','POST','PUT','DELETE','OPTIONS','HEAD'].filter(x=>x!==allowed)){
      const res=await apiMiddleware({request:new Request(`https://sleeve.example${path}`,{method}),next:()=>{throw new Error('Must not reach assets');}});
      assert.equal(res.status,405);assert.equal(res.headers.get('Allow'),allowed);assert.match(res.headers.get('Content-Type'),/application\/json/);assert.equal(res.headers.get('Cache-Control'),'no-store');assert.equal(res.headers.get('X-Content-Type-Options'),'nosniff');
    }
    const expected=new Response('handler');
    assert.equal(await apiMiddleware({request:new Request(`https://sleeve.example${path}`,{method:allowed}),next:()=>expected}),expected);
  }
});

test('AI rejects cross-site, form content, malformed fields and oversized bodies without a provider call',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;return success();};
  const cases=[
    [ai({task:'notes',facts:'Fixture'},{Origin:'https://another.example'}),403],
    [ai({task:'notes',facts:'Fixture'},{'Sec-Fetch-Site':'cross-site'}),403],
    [ai({task:'notes',facts:'Fixture'},{'Content-Type':'text/plain'}),415],
    [ai({task:'notes',facts:{text:'Fixture'}}),400],
    [ai({task:'notes',facts:'  '}),400],
    [ai({task:'notes',facts:'x'.repeat(5001)}),400],
    [ai({task:'ask',facts:'Fixture',question:[]}),400],
    [ai({task:'notes',facts:'Fixture',seed:{}}),400],
    [ai('x'.repeat(24001)),413],
  ];
  for(const [req,status] of cases){const res=await onRequestPost(ctx(req));assert.equal(res.status,status);assert.match(res.headers.get('Cache-Control'),/no-store/);assert.equal(res.headers.get('Access-Control-Allow-Origin'),null);}
  assert.equal(calls,0);
});
test('an unbounded streamed AI body is cancelled once the byte ceiling is crossed',async()=>{
  let cancelled=false;
  const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(24001));},cancel(){cancelled=true;}});
  const request=new Request('https://sleeve.example/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body,duplex:'half'});
  const res=await onRequestPost(ctx(request));assert.equal(res.status,413);assert.equal(cancelled,true);
});
test('same-origin AI and its edge-cache hits stay private to downstream caches',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;return success();};
  const body={task:'notes',facts:'Private cache header synthetic fixture'};
  const first=await onRequestPost(ctx(ai(body,{Origin:'https://sleeve.example'})));await Promise.all(waits.splice(0));
  const second=await onRequestPost(ctx(ai(body)));
  assert.equal(first.status,200);assert.equal(second.headers.get('X-Liner-Cache'),'hit');assert.equal(calls,1);
  for(const res of [first,second]){assert.equal(res.headers.get('Cache-Control'),'private, no-store');assert.equal(res.headers.get('X-Content-Type-Options'),'nosniff');}
});
test('repeated uncached requests from one visitor stop before provider quota is spent',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;return success();};
  for(let i=0;i<13;i++){
    const res=await onRequestPost(ctx(ai({task:'notes',facts:`Rate fixture ${i}`},{'CF-Connecting-IP':'203.0.113.201'})));
    assert.equal(res.status,i<12?200:429);
  }
  assert.equal(calls,12);
});
test('shared-budget outages time out and fail closed before inference',{timeout:10000},async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let started,calls=0;const taking=new Promise(resolve=>{started=resolve;});globalThis.fetch=async()=>{calls++;return success();};
  const env={OPENROUTER_API_KEY:'test',AI_BUDGET:{idFromName:x=>x,get:()=>({fetch:()=>{started();return new Promise(()=>{});}})}};
  const pending=onRequestPost({...ctx(ai({task:'notes',facts:'Budget timeout fixture'})),env});
  await taking;t.mock.timers.tick(3000);
  const res=await pending;assert.equal(res.status,503);assert.equal(calls,0);
});
test('owner attribution is absent by default and accepts only a configured HTTPS origin',async()=>{
  const headers=[];globalThis.fetch=async(_url,options)=>{headers.push(options.headers);return success();};
  for(const [i,site] of [undefined,'https://publish.example/path','http://publish.example','https://user:password@publish.example'].entries()){
    const res=await onRequestPost({...ctx(ai({task:'notes',facts:`Attribution synthetic fixture ${i}`})),env:{OPENROUTER_API_KEY:'test',AI_BUDGET:budget,SITE_URL:site}});assert.equal(res.status,200);
  }
  assert.equal(headers[0]['HTTP-Referer'],undefined);assert.equal(headers[1]['HTTP-Referer'],'https://publish.example');
  assert.equal(headers[2]['HTTP-Referer'],undefined);assert.equal(headers[3]['HTTP-Referer'],undefined);
  assert.ok(headers.every(row=>row['X-Title']==='Sleeve'));
});
test('simultaneous identical AI requests share one provider attempt and budget slot',async()=>{
  let calls=0,slots=0,release;
  const gate=new Promise(resolve=>{release=resolve;});
  globalThis.fetch=async()=>{calls++;await gate;return success();};
  const env={OPENROUTER_API_KEY:'test',AI_BUDGET:{idFromName:x=>x,get:()=>({fetch:async()=>{slots++;return new Response('',{status:200});}})}};
  const body={task:'notes',facts:'Coalescing fixture with an older and a returning favorite.'};
  const requests=[onRequestPost({...ctx(ai(body)),env}),onRequestPost({...ctx(ai(body)),env})];
  for(let i=0;i<10;i++)await new Promise(setImmediate);
  release();const responses=await Promise.all(requests);
  assert.ok(responses.every(res=>res.status===200));assert.equal(calls,1);assert.equal(slots,1);
});
test('artwork validates tuples and requires identity fields before any remote lookup',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({data:[]});};
  for(const items of [[['artist',{},'']],[['artist','A']],[['album','Record','']],[['track','Title',42]],[['artist','A\nB','']],[['artist','x'.repeat(201),'']]])assert.equal((await onRequestGet(ctx(art(items)))).status,400);
  assert.equal(calls,0);
});
test('artwork rejects prefix identities and non-CDN image URLs, and preserves Unicode artist names',async()=>{
  globalThis.fetch=async url=>Response.json({data:[{name:String(url).includes('Air')?'Airbourne':'宇多田ヒカル',picture_big:picture}]});
  assert.deepEqual((await(await onRequestGet(ctx(art([['artist','Air','']])))).json()).results,['']);
  assert.deepEqual((await(await onRequestGet(ctx(art([['artist','宇多田ヒカル','']])))).json()).results,[picture]);
  globalThis.fetch=async()=>Response.json({data:[{name:'Unsafe',picture_big:'https://evil.example/art.jpg'}]});
  assert.deepEqual((await(await onRequestGet(ctx(art([['artist','Unsafe','']])))).json()).results,['']);
});
test('album versions use distinct identities and cache keys',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({data:[{title:'Record',artist:{name:'Artist'},cover_big:picture}]});};
  const res=await onRequestGet(ctx(art([['album','Record','Artist'],['album','Record (Live)','Artist']])));await Promise.all(waits.splice(0));
  assert.deepEqual((await res.json()).results,[picture,'']);assert.equal(calls,2);
});
test('duplicate artwork requests share one search and source failures remain retryable',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;return new Response('',{status:503});};
  const items=[['artist','Retry Artist',''],['artist','Retry Artist','']];
  let res=await onRequestGet(ctx(art(items)));assert.deepEqual((await res.json()).results,[null,null]);assert.equal(calls,1);assert.equal(res.headers.get('Cache-Control'),'no-store');
  globalThis.fetch=async()=>{calls++;return Response.json({data:[{name:'Retry Artist',picture_big:picture}]});};
  res=await onRequestGet(ctx(art(items)));assert.deepEqual((await res.json()).results,[picture,picture]);assert.equal(calls,2);
});
test('a large artwork batch runs at most four source lookups simultaneously',async()=>{
  let active=0,max=0;globalThis.fetch=async()=>{active++;max=Math.max(max,active);await new Promise(setImmediate);active--;return Response.json({data:[]});};
  const res=await onRequestGet(ctx(art(Array.from({length:12},(_,i)=>['artist',`Bounded Artist ${i}`,'']))));
  assert.equal(res.status,200);assert.equal((await res.json()).results.length,12);assert.equal(max,4);
});
test('a stalled artwork source respects the batch deadline and does not launch remaining lookups',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let calls=0;globalThis.fetch=(_url,{signal})=>{calls++;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true}));};
  const pending=onRequestGet(ctx(art(Array.from({length:12},(_,i)=>['artist',`Stalled Artist ${i}`,'']))));
  for(let i=0;i<10&&calls<4;i++)await new Promise(setImmediate);
  assert.equal(calls,4);t.mock.timers.tick(9000);
  const res=await pending;assert.equal(calls,4);assert.equal(res.headers.get('Cache-Control'),'no-store');
  assert.deepEqual((await res.json()).results,new Array(12).fill(null));
});
