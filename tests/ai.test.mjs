import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/ai.js';

const savedFetch = globalThis.fetch;
const savedCaches = globalThis.caches;
const entries = new Map();
globalThis.caches = { default: {
  async match(request) { return entries.get(request.url)?.clone() || null; },
  async put(request, response) { entries.set(request.url, response.clone()); },
} };

let visitor = 0;
function request(facts, { local = false, seed = '', task = 'notes' } = {}) {
  return new Request(`${local ? 'http://127.0.0.1:5195' : 'https://sleeve.example'}/api/ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `192.0.2.${++visitor}` },
    body: JSON.stringify({ task, facts, seed }),
  });
}
const openBudget = { idFromName: (name) => name, get: () => ({ fetch: async () => new Response('', { status: 200 }) }) };
function context(input, env = { OPENROUTER_API_KEY: 'test-or', NVIDIA_API_KEY: 'test-nv', AI_BUDGET: openBudget }) {
  return { request: input, env, waitUntil() {} };
}
function success(model) {
  return Response.json({ model, choices: [{ message: { content: 'Radiohead fell in the supplied record while SZA rose in the same period.' } }] });
}

test('rejects an invented number and tries the next writer', async () => {
  const models = [];
  globalThis.fetch = async (_url, options) => {
    const model = JSON.parse(options.body).model;
    models.push(model);
    const content = model.includes('dots-3-note')
      ? 'The artist gained 999 plays during the recorded period.'
      : 'The artist gained 23 plays during the recorded period.';
    return Response.json({ model, choices: [{ message: { content } }] });
  };
  const response = await onRequestPost(context(request('Grounding test: the artist gained 23 plays.')));
  assert.equal(response.status, 200);
  assert.equal(models.length, 2);
  assert.match((await response.json()).text, /23 plays/);
});

test('profile and curation can run together with structured outputs and one budget slot each',async()=>{
  let slots=0;const tasks=[];
  const budget={idFromName:name=>name,get:()=>({fetch:async()=>{slots++;return new Response('',{status:200});}})};
  globalThis.fetch=async(_url,options)=>{
    const payload=JSON.parse(options.body);const profile=payload.messages[1].content.includes("listener's profile");
    assert.deepEqual(payload.response_format,{type:'json_object'});
    assert.equal(payload.provider.require_parameters,true);
    assert.equal(payload.provider.data_collection,'deny');
    tasks.push(profile?'profile':'curate');
    const output=profile?{notes:'Earlier led before Recent.',observations:[{id:'shift',text:'Recent moved into the rotation.'}],years:[],eras:[]}:
      {picks:[{id:'artist_a',reason:'Connected to Earlier.'},{id:'artist_b',reason:'Connected to Recent.'},{id:'artist_c',reason:'Connected to both.'}]};
    return Response.json({model:payload.model,choices:[{message:{content:JSON.stringify(output)}}]});
  };
  const env={OPENROUTER_API_KEY:'test-or',AI_BUDGET:budget};
  const responses=await Promise.all(['profile','curate'].map(task=>onRequestPost(context(request('Earlier and Recent. Evidence ID="shift". artist_a artist_b artist_c.',{task}),env))));
  assert.equal(slots,2);assert.deepEqual(tasks.sort(),['curate','profile']);
  for(const response of responses){assert.equal(response.status,200);assert.ok(JSON.parse((await response.json()).text));}
});
test('invalid profile structure tries the next writer before caching',async()=>{
  const models=[];
  globalThis.fetch=async(_url,options)=>{
    const model=JSON.parse(options.body).model;models.push(model);
    const output=model.includes('dots-3-note')?{notes:'Recent rose.'}:{notes:'Recent rose.',observations:[{id:'shift',text:'Earlier was overtaken.'}],years:[],eras:[]};
    return Response.json({model,choices:[{message:{content:model.includes('dots-3-note')?JSON.stringify(output):'```json\n'+JSON.stringify(output)+'\n```'}}]});
  };
  const response=await onRequestPost(context(request('Structure test: Recent and Earlier, shift.',{task:'profile'})));
  assert.equal(response.status,200);assert.equal(models.length,2);assert.match((await response.json()).model,/gemma-4-26b/);
});

test('public traffic uses OpenRouter and reuses a cached answer', async () => {
  const urls = [], payloads = [];
  globalThis.fetch = async (url, options) => {
    urls.push(url);
    const payload = JSON.parse(options.body);
    payloads.push(payload);
    return success(payload.model);
  };
  const facts = 'Public test: Radiohead 90 to 10 plays; SZA 4 to 44 plays.';
  const first = await onRequestPost(context(request(facts)));
  assert.equal(first.status, 200);
  assert.match((await first.json()).model, /dots-3-note/);
  assert.equal(urls.length, 1);
  assert.ok(urls.every((url) => url.includes('openrouter.ai')));
  assert.equal(payloads[0].provider.data_collection, 'deny');
  const second = await onRequestPost(context(request(facts)));
  assert.equal(second.headers.get('X-Liner-Cache'), 'hit');
  assert.equal(urls.length, 1);
});

test('an unsupported year interpretation tries another writer before caching', async () => {
  const models=[];
  globalThis.fetch=async(_url,options)=>{
    const model=JSON.parse(options.body).model;models.push(model);
    const content=model.includes('dots-3-note')
      ? "In 2025, Alpha led with 160 plays compared to Beta's 120."
      : 'You recorded 160 plays of Alpha and 120 of Beta in 2025.';
    return Response.json({model,choices:[{message:{content}}]});
  };
  const facts='Year: 2025. Year validation test: selected artist counts Alpha 160 and Beta 120; no annual ranking.';
  const response=await onRequestPost(context(request(facts,{task:'year'})));
  assert.equal(response.status,200);assert.equal(models.length,2);
  assert.match((await response.json()).text,/You recorded/);
});

test('budget storage receives a visitor digest, never a raw address or listening facts', async () => {
  let identity;
  globalThis.fetch=async()=>success('synthetic-model');
  const budget={idFromName:name=>name,get:()=>({fetch:async(_url,options)=>{identity=options.headers['X-Sleeve-Visitor'];return new Response('',{status:200});}})};
  const facts='Visitor privacy test: Radiohead 90 to 10 plays; SZA 4 to 44 plays.';
  assert.equal((await onRequestPost(context(request(facts),{OPENROUTER_API_KEY:'test-or',AI_BUDGET:budget}))).status,200);
  assert.match(identity,/^[a-f0-9]{64}$/);
  assert.ok(!identity.includes('192.0.2.')&&!identity.includes('Radiohead'));
});

test('a shared budget denial prevents public provider calls', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return success('unused'); };
  const budget = { idFromName: (name) => name, get: () => ({ fetch: async () => new Response('', { status: 429 }) }) };
  const response = await onRequestPost(context(request('Budget denial test: 95 plays logged.'),
    { OPENROUTER_API_KEY: 'test-or', AI_BUDGET: budget, AI_BUDGET_REQUIRED: '1' }));
  assert.equal(response.status, 429);
  assert.equal(calls, 0);
});

test('public AI writing fails closed without a shared budget binding', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return success('unused'); };
  const response = await onRequestPost(context(request('Missing public budget: 57 plays logged.'),
    { OPENROUTER_API_KEY: 'test-or' }));
  assert.equal(response.status, 503);
  assert.equal(calls, 0);
});

test('the observed singleton curator envelope is normalized before caching',async()=>{
  const picks=['artist_a','artist_b','artist_c'].map(id=>({id,reason:'Connected to the supplied rotation.'}));
  globalThis.fetch=async(_url,options)=>Response.json({model:JSON.parse(options.body).model,choices:[{message:{content:JSON.stringify([{picks}])}}]});
  const response=await onRequestPost(context(request('Envelope test: artist_a artist_b artist_c',{task:'curate'})));
  assert.equal(response.status,200);
  assert.deepEqual(JSON.parse((await response.json()).text),{picks});
});

test('an unavailable editor falls back to the verified smaller writer', async () => {
  const models = [];
  globalThis.fetch = async (_url, options) => {
    const model = JSON.parse(options.body).model;
    models.push(model);
    return model.includes('dots-3-note') ? new Response('', { status: 503 }) : success(model);
  };
  const response = await onRequestPost(context(request('Fallback test: 23 plays by one artist and 17 by another.')));
  assert.equal(response.status, 200);
  assert.match((await response.json()).model, /gemma-4-26b/);
  assert.equal(models.length, 2);
});

test('public requests never fall through to the NVIDIA developer endpoint', async () => {
  const urls = [];
  globalThis.fetch = async (url) => { urls.push(url); return new Response('', { status: 503 }); };
  const response = await onRequestPost(context(request('Public failure test: 42 plays in the record.')));
  assert.equal(response.status, 503);
  assert.ok(urls.every((url) => url.includes('openrouter.ai')));
});

test('local evaluation can use the NVIDIA developer endpoint after OpenRouter fails', async () => {
  const urls = [];
  globalThis.fetch = async (url, options) => {
    urls.push(url);
    return url.includes('nvidia.com') ? success(JSON.parse(options.body).model) : new Response('', { status: 503 });
  };
  const response = await onRequestPost(context(request('Local preview: 62 plays logged.', { local: true })));
  assert.equal(response.status, 200);
  assert.match((await response.json()).model, /diffusiongemma/);
  assert.ok(urls.some((url) => url.includes('nvidia.com')));
});

test.after(() => {
  globalThis.fetch = savedFetch;
  globalThis.caches = savedCaches;
});
