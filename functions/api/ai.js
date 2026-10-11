// POST /api/ai  { task, facts, question? }
// Writes short pieces about someone's listening from a compact summary of their stats.
// Keys live in Cloudflare secrets (NVIDIA_API_KEY, OPENROUTER_API_KEY) and never reach
// the browser. Prompts are fixed here, so this can't be used as a general chatbot.
// Answers are cached, so the same request is only paid for once.
import { normalizeStructuredWriting, validStructuredWriting } from '../lib/writing-quality.js';

// Fixed OpenRouter models keep the voice testable. NVIDIA's hosted developer
// endpoint is for local evaluation only; public traffic must never use it.
const CACHE_VERSION = 'v19';
// Verified with synthetic profile/curation requests under data_collection=deny.
// Nemotron free requires a different data policy; Inkling free rejected this app.
// Gemma 31B timed out twice. Do not silently relax privacy to unlock a model.
const EDITOR = { via: 'openrouter', model: 'dots-studio/dots-3-note-preview:free', timeout: 12000 };
const QUICK = { via: 'openrouter', model: 'google/gemma-4-26b-a4b-it:free', timeout: 8000 };
const DIFFUSION = { via: 'nvidia', model: 'google/diffusiongemma-26b-a4b-it', timeout: 16000 };
const ROUTES = {
  notes: [EDITOR, QUICK], year: [EDITOR, QUICK], eras: [EDITOR, QUICK],
  roast: [EDITOR, QUICK], ask: [EDITOR, QUICK],
  profile: [{ ...EDITOR, maxTokens: 1500 }, { ...QUICK, timeout: 16000, maxTokens: 1500 }],
  curate: [{ ...EDITOR, maxTokens: 1500 }, { ...QUICK, timeout: 16000, maxTokens: 1500 }],
};
const ENDPOINT = {
  nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
};

const STYLE = `You write for Sleeve, a music stats site. Sound like a perceptive music editor speaking directly to "you": plain, specific, and a little surprising.
Use only the supplied facts. Make a concrete observation about a change, contrast, or pattern; back it with artist names and counts from those facts. Every number you mention must appear verbatim in the facts. Do not calculate new differences, percentages, or time spans. A fall to a nonzero count is not a disappearance. Do not infer personality, emotion, genre, or audio qualities from play counts. If the evidence is thin, say less.
Avoid praise, corporate wording, and stock phrases: "eclectic", "sonic journey", "tapestry", "soundtrack of your life", "vibes", "delve", "engagement", "in contrast", "the record accumulated", "during this period", "clearly", "you have always". Every sentence should add evidence or interpretation grounded in evidence. No filler closing summary. No emojis, hashtags, or markdown. Use the exact JSON schema when the task requests JSON; otherwise write plain sentences only.`;

export const TASKS = {
  profile: {
    max: 1200, json: true,
    prompt: (f) => `Prepare this listener's profile from already calculated findings. Return JSON only: {"notes":"one paragraph under 55 words","observations":[{"id":"exact evidence ID","text":"one sentence"}],"years":[{"year":"exact supplied year","text":"one sentence"}],"eras":[{"artist":"exact supplied era artist","title":"2 to 5 words","line":"under 20 words"}]}.
The note should connect two DISTINCT findings about different artists or habits. Say what actually changed or stayed: use named artists and the precise relationship, not abstract descriptions such as cyclical movement, core favorites, evolving tastes, or attention shifts. Speak to you. At most two numeric facts. Do not join unrelated counts. An artist who rose is not the artist who fell unless that same artist's facts explicitly say both. Do not imply one artist replaced another without a supplied comparison. Never infer reasons, feelings, sound, personality, or a causal relationship.
Observations are optional. Use an empty array when you would only repeat a finding's title or counts. At most two observations; each must add supplied context from ONLY that evidence ID. Do not borrow a number or artist from a different finding. Omit years and eras with thin context, using empty arrays. For year text name specific supplied monthly leaders; a few months cannot establish dominance, consistency, or lack of dominance across a whole year. Never compare incomplete and complete year totals. Era leadership can be interrupted; do not turn endpoints into continuous leadership. No closing moral or generalized conclusion. Every numeric value must occur in the specific evidence being described. Privately check these rules, then return the JSON.

Evidence:
${f}`,
  },
  curate: {
    max: 750, json: true,
    prompt: (f) => `Choose three to eight distinct supplied candidates to explore. Return a JSON OBJECT only, never an array: {"picks":[{"id":"exact supplied artist_a-style ID","reason":"one sentence under 30 words"}]}.
Only choose actual supplied IDs. If fewer than eight exist, do not invent or duplicate any. Spread choices across recent seeds, older favorites, and independent connections. These candidates have no recorded listening.
For each reason, START with the NAME of a connected seed artist and its supplied role in this listener's history, then explain why that connection makes this a useful next listen. A link to both an older favorite and a recent discovery is useful; a genre list is not. Example form: "Your recent return to SEED points here; Last.fm also links this artist to OLDER SEED, which you have kept listening to." Use that form ONLY when both those connections and roles are actually supplied for that candidate. A Last.fm connection is evidence of listener overlap, not proof two artists sound alike. Do not infer sound or mood from that connection. Mention at most one supplied tag, and only when necessary. Do not start with tags or repeat the candidate's name. No claims that a candidate is new to a genre, will replace a favorite, or is a perfect fit. No scores, probabilities, invented musical descriptions or seed artists. Avoid offers, provides, aligns, core favorites, momentum, stylistic contrast, or generic closing praise. Privately check every reason against ONLY its candidate's evidence; omit an unsupported reason.

${f}`,
  },
  notes: {
    max: 320,
    prompt: (f) => `Write one short liner-note paragraph under 65 words. Connect an earlier recorded habit with one recent change or return, naming the artists precisely. Use at most two numeric facts. If one artist fell and a different artist rose, keep those directions attached to the correct names. A return is not a new discovery. Do not assume a favorite was replaced without evidence. Describe the concrete relationship, not cyclical movement, evolving tastes, core favorites or an abstract summary. Address you. Thin facts need only one sentence. Never guess reasons, feelings, sound or personality; never restate the total or end with a moral.

Facts:
${f}`,
  },
  year: {
    max: 260,
    prompt: (f) => `Write one year-in-review paragraph (about 75 words). Choose one defining artist or shift supported by the facts and explain it with a count. Make a second, distinct observation only if the facts support it.\n\nFacts:\n${f}`,
  },
  roast: {
    max: 260,
    prompt: (f) => `Roast this listener's music taste in 4 or 5 sentences. Funny and cheeky, like a friend teasing them, never cruel, nothing about their looks or identity. Use the actual artists and numbers.\n\nFacts:\n${f}`,
  },
  eras: {
    max: 360,
    prompt: (f) => `For each era below, give it a short evocative title (2 to 5 words, not just the artist's name) and one sentence (under 20 words). Reply as JSON only: [{"artist":"...","title":"...","line":"..."}].\n\nEras and context:\n${f}`,
  },
  ask: {
    max: 160,
    prompt: (f, q) => `Sleeve already calculated the answer shown below. Add one short, useful observation about its evidence. Do not repeat the headline, invent a number or name, infer emotion, or contradict the calculation. If the evidence offers no further observation, say what the coverage limits. At most two sentences.\n\nVerified answer and evidence:\n${f}\n\nListener's question: ${q}`,
  },
};

// Per-visitor isolate protection supplements the required public shared budget.
export { STYLE };
// An account-level Cloudflare rate rule should reject abuse before this route.
const hits = new Map();
const inflight = new Map();
const cooldowns = new Map();
const PRIVATE_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin' };
const json = (body, status = 200) => Response.json(body, { status, headers: PRIVATE_HEADERS });
const MAX_BODY_BYTES = 24000; // At most 8,000 UTF-16 characters, including non-ASCII facts.
async function readBody(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) throw Object.assign(new Error('oversized'), { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { reader.cancel().catch(() => {}); throw Object.assign(new Error('oversized'), { status: 413 }); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
async function reserveOpenRouter(env, localPreview, visitor) {
  if (!env.AI_BUDGET) {
    if (localPreview && env.AI_BUDGET_REQUIRED !== '1') return;
    const error = new Error('AI budget is not configured');
    error.budget = true;
    throw error;
  }
  try {
    const stub = env.AI_BUDGET.get(env.AI_BUDGET.idFromName('openrouter-free-v1'));
    const ctrl = new AbortController(); let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { ctrl.abort(); reject(new Error('AI budget timed out')); }, 3000); });
    let response;
    try { response = await Promise.race([stub.fetch('https://budget.internal/take', { method: 'POST', signal: ctrl.signal, headers: { 'X-Sleeve-Visitor': visitor } }), timeout]); }
    finally { clearTimeout(timer); }
    if (!response.ok) {
      const error = new Error(`AI budget ${response.status}`);
      error.status = response.status;
      throw error;
    }
  } catch (error) { error.budget = true; throw error; }
}
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 12;
}

function clean(text, structured = false) {
  if(structured)return String(text||'').replace(/<think>[\s\S]*?<\/think>/gi,'').trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i,'$1').trim();
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*(here'?s a thinking process|thinking process|we need to|the user wants)[\s\S]*$/i, '')
    .replace(/\*\*|__|^#+\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .trim();
}

function groundedNumbers(text, facts) {
  const numbers = (value) => [...String(value).matchAll(/\b\d[\d,]*(?:\.\d+)?\b/g)].map((match) => match[0].replaceAll(',', ''));
  const allowed = new Set(numbers(facts));
  return numbers(text).every((value) => allowed.has(value));
}

async function call(step, env, messages, max, localPreview, structured = false, visitor) {
  const key = step.via === 'nvidia' ? env.NVIDIA_API_KEY : env.OPENROUTER_API_KEY;
  if (!key) throw new Error(`no key for ${step.via}`);
  if (step.via === 'openrouter') await reserveOpenRouter(env, localPreview, visitor);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), step.timeout);
  let attribution = {};
  if (step.via === 'openrouter' && env.SITE_URL) {
    try { const site = new URL(env.SITE_URL); if (site.protocol === 'https:' && !site.username && !site.password) attribution = { 'HTTP-Referer': site.origin }; } catch {}
  }
  try {
    const res = await fetch(ENDPOINT[step.via], {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(step.via === 'openrouter' ? { ...attribution, 'X-Title': 'Sleeve' } : {}),
      },
      body: JSON.stringify({ model: step.model, messages, max_tokens: step.maxTokens || max, temperature: structured ? 0.35 : 0.65, top_p: 0.9,
        ...(step.via === 'openrouter' ? { provider: { data_collection: 'deny' }, reasoning: { enabled: false } } : {}),
        ...(step.via === 'openrouter' && structured ? { response_format: { type: 'json_object' }, provider: { data_collection: 'deny', require_parameters: true } } : {}) }),
    });
    if (!res.ok) {
      const error = new Error(`${step.model} ${res.status}`);
      error.status = res.status;
      throw error;
    }
    const d = await res.json();
    const text = clean(d.choices?.[0]?.message?.content, structured);
    if (text.length < 20) throw new Error(`${step.model} empty`);
    return { text, model: d.model || step.model };
  } finally {
    clearTimeout(timer);
  }
}

async function sha(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost({ request, env, waitUntil }) {
  const origin = request.headers.get('Origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ error: 'Use Sleeve to request writing.' }, 403);
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return json({ error: 'Send application/json.' }, 415);
  let raw;
  try { raw = await readBody(request); } catch (error) { return json({ error: error.status === 413 ? 'That request is too big.' : 'Could not read the request.' }, error.status || 400); }
  if (raw.length > 8000) return json({ error: 'That request is too big.' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: 'Send JSON.' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return json({ error: 'Send a JSON object.' }, 400);
  const task = Object.hasOwn(TASKS, body.task) ? TASKS[body.task] : null;
  if (!task) return json({ error: 'Unknown task.' }, 400);
  if (typeof body.facts !== 'string' || !body.facts.trim() || body.facts.length > 5000) return json({ error: 'Send up to 5000 characters of facts.' }, 400);
  if (body.question != null && (typeof body.question !== 'string' || body.question.length > 300)) return json({ error: 'Send a question under 300 characters.' }, 400);
  if (body.seed != null && !(typeof body.seed === 'string' && body.seed.length <= 64 || Number.isSafeInteger(body.seed) && body.seed >= 0)) return json({ error: 'Invalid refresh value.' }, 400);
  const facts = body.facts, question = body.question || '';
  if (body.task === 'ask' && !question.trim()) return json({ error: 'Ask a question.' }, 400);

  const cacheKey = new Request(`https://liner-ai.cache/${CACHE_VERSION}/${body.task}/${await sha(`${facts}|${question}|${body.seed || ''}`)}`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, { headers: { ...PRIVATE_HEADERS, 'X-Liner-Cache': 'hit' } });

  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  if (limited(ip)) return json({ error: "You've asked a lot in the last few minutes. Try again in a bit." }, 429);

  const messages = [{ role: 'system', content: STYLE }, { role: 'user', content: task.prompt(facts, question) }];
  const key = cacheKey.url;
  let work = inflight.get(key);
  if (!work) {
    work = (async () => {
      // Compute after registering shared work, so hashing cannot break coalescing.
      // Only a day-specific digest reaches budget storage, never raw IPs or facts.
      const visitor = await sha(`sleeve-visitor|${new Date().toISOString().slice(0, 10)}|${ip}`);
      const errors = [];
      let budgetFailure = null;
      const deadline = Date.now() + 50000;
      const host = new URL(request.url).hostname;
      const localPreview = host === 'localhost' || host === '127.0.0.1';
      const routes = [...ROUTES[body.task], ...(localPreview ? [DIFFUSION] : [])];
      for (const step of routes) {
        if (budgetFailure && step.via === 'openrouter') continue;
        const remaining = deadline - Date.now();
        if (remaining < 3000) break;
        if ((cooldowns.get(step.model) || 0) > Date.now()) continue;
        const started = Date.now();
        try {
          const result = await call({ ...step, timeout: Math.min(step.timeout, remaining) }, env, messages, task.max, localPreview, task.json, visitor);
          if (!groundedNumbers(result.text, facts)) throw new Error(`${step.model} unsupported number`);
          if (task.json) {
            let structured;
            try { structured = normalizeStructuredWriting(body.task, JSON.parse(result.text)); } catch { throw new Error(`${step.model} invalid structured response`); }
            if (!validStructuredWriting(body.task,structured,facts)) throw new Error(`${step.model} unsupported structured writing`);
            result.text = JSON.stringify(structured);
          }
          console.log('ai: served', body.task, step.model, `${Date.now() - started}ms`);
          const out = JSON.stringify(result);
          waitUntil?.(cache.put(cacheKey, new Response(out, { headers: { 'Cache-Control': 'public, max-age=604800' } })).catch(() => {}));
          return { out, status: 200 };
        } catch (e) {
          errors.push(String(e.message || e));
          console.log('ai: provider failed', body.task, step.model, e.status || e.name || 'unknown', `${Date.now() - started}ms`);
          if (e.budget) { budgetFailure = e; if (!localPreview) break; else continue; }
          if (e.status === 429 || e.status >= 500) cooldowns.set(step.model, Date.now() + (e.status === 429 ? 30000 : 60000));
        }
      }
      if (budgetFailure) return { out: JSON.stringify({ error: budgetFailure.status === 429
        ? "Sleeve's writing quota is full right now. Your listening stats still work; try again later."
        : "Sleeve's writing budget is unavailable. Your listening stats still work; try again later." }), status: budgetFailure.status === 429 ? 429 : 503 };
      console.log('ai: every model failed', errors);
      const unconfigured = errors.length && errors.every((e) => e.startsWith('no key'));
      return { out: JSON.stringify({ error: unconfigured ? "AI writing isn't switched on for this site yet." : 'The writing models are busy right now. Your listening stats still work; try the note again shortly.' }), status: 503 };
    })();
    inflight.set(key, work);
    work.then(() => { if (inflight.get(key) === work) inflight.delete(key); }, () => { if (inflight.get(key) === work) inflight.delete(key); });
  }
  const result = await work;
  return new Response(result.out, { status: result.status, headers: PRIVATE_HEADERS });
}
