// POST /api/ai  { task, facts, question? }
// Writes short pieces about someone's listening from a compact summary of their stats.
// Keys live in Cloudflare secrets (NVIDIA_API_KEY, OPENROUTER_API_KEY) and never reach
// the browser. Prompts are fixed here, so this can't be used as a general chatbot.
// Answers are cached, so the same request is only paid for once.
import { validStructuredWriting } from '../lib/writing-quality.js';

// Fixed OpenRouter models keep the voice testable. NVIDIA's hosted developer
// endpoint is for local evaluation only; public traffic must never use it.
const CACHE_VERSION = 'v17';
// Thinking models spend part of max_tokens on their private reasoning. Leave enough
// room for the short visible answer, otherwise it returns an empty message.
const EDITOR = { via: 'openrouter', model: 'qwen/qwen3.8-27b:free', timeout: 12000, maxTokens: 850 };
const QUICK = { via: 'openrouter', model: 'google/gemma-4-26b-a4b-it:free', timeout: 8000 };
const DIFFUSION = { via: 'nvidia', model: 'google/diffusiongemma-26b-a4b-it', timeout: 16000 };
const ROUTES = {
  notes: [QUICK, EDITOR], year: [EDITOR, QUICK], eras: [QUICK, EDITOR],
  roast: [QUICK, EDITOR], ask: [EDITOR, QUICK],
  profile: [{ ...EDITOR, timeout: 18000, maxTokens: 1800 }, { ...QUICK, timeout: 20000, maxTokens: 1500 }],
  curate: [{ ...EDITOR, timeout: 16000, maxTokens: 1300 }, { ...QUICK, timeout: 20000, maxTokens: 1100 }],
};
const ENDPOINT = {
  nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
};

const STYLE = `You write for Sleeve, a music stats site. Sound like a perceptive music editor speaking directly to "you": plain, specific, and a little surprising.
Use only the supplied facts. Make a concrete observation about a change, contrast, or pattern; back it with artist names and counts from those facts. Every number you mention must appear verbatim in the facts. Do not calculate new differences, percentages, or time spans. A fall to a nonzero count is not a disappearance. Do not infer personality, emotion, genre, or audio qualities from play counts. If the evidence is thin, say less.
Avoid praise, corporate wording, and stock phrases: "eclectic", "sonic journey", "tapestry", "soundtrack of your life", "vibes", "delve", "engagement", "in contrast", "the record accumulated", "during this period", "clearly", "you have always". Every sentence should add evidence or interpretation grounded in evidence. No filler closing summary. No emojis, hashtags, or markdown. Use the exact JSON schema when the task requests JSON; otherwise write plain sentences only.`;

const TASKS = {
  profile: {
    max: 1200, json: true,
    prompt: (f) => `Prepare this listener's profile before they open it. The findings are already calculated and ranked; write only the useful relationship between them. Return JSON only with this shape: {"notes":"one paragraph under 55 words connecting two DISTINCT supplied findings about DIFFERENT artists or habits","observations":[{"id":"an evidence ID","text":"one useful sentence grounded ONLY in that ID's facts"}],"years":[{"year":"exact supplied year","text":"one short observation connecting that year's supplied monthly leaders, repeat discoveries or activity pattern"}],"eras":[{"artist":"exact supplied era artist","title":"short title","line":"one factual sentence"}]}. The note must explain a supported relationship between enduring habits, returning favorites, discoveries or unusual changes. Lead with what that relationship reveals about the recorded listening, in a sentence without numbers; then give the supporting facts. Merely joining two statistics with while is insufficient. Do not make a list of rising artist counts. Mention at most two artists and at most two numeric facts in the note. Use at most four observations and at most four supplied eras. For an observation, add context supplied under that ID; if it would only repeat the visible heading or counts, omit it. Privately check each sentence for unsupported names, numbers or musical descriptions, remove repetition, and return the checked result. Every numeral must appear in the relevant supplied facts. Do not infer personality, feelings, sound or reasons why listening changed. For year writing, use the supplied month-to-month or discovery context instead of repeating the total and leading artist. First and last monthly leaders do not prove continuous leadership; use the supplied list of monthly leaders. Coverage may be partial; never compare a partial year total with a full year as a decline. Omit thin evidence.\n\nEvidence:\n${f}`,
  },
  curate: {
    max: 750, json: true,
    prompt: (f) => `Choose eight artists to explore from this supplied candidate pool. Consider recent listening, older favorites, multiple independent connections, supplied artist tags, and a mix of familiar directions and less obvious directions. The listener has not recorded these candidates. Do not invent candidates, genres or listening history. Return JSON only: {"picks":[{"id":"exact supplied candidate ID","reason":"a useful reason under 30 words using ONLY that candidate's supplied tags and connections"}]}. Explain which part of this listener's recent or older rotation points here. Do not repeat the candidate's name or just list their genres; those already appear on the card. Spread picks across different seed artists. No scores or probabilities. Avoid "sonic journey", "vibes", "perfect fit", "offers", "utilizes", "provides", or claims about mood. Choose only supported connections, and omit uncertain claims.\n\n${f}`,
  },
  notes: {
    max: 320,
    prompt: (f) => `Write one compact liner-note paragraph (at most 85 words). Find a connection between an older pattern and a recent change, or a clear reversal within the record. Open with that change. Support it with two distinct facts from different parts of the record. Explain the relationship instead of listing unrelated statistics. If the facts are thin, write one precise sentence. Do not restate total plays, conclude with filler, or guess how songs sound or how the listener felt.\n\nFacts:\n${f}`,
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
// An account-level Cloudflare rate rule should reject abuse before this route.
const hits = new Map();
const inflight = new Map();
const cooldowns = new Map();
async function reserveOpenRouter(env, localPreview) {
  if (!env.AI_BUDGET) {
    if (localPreview && env.AI_BUDGET_REQUIRED !== '1') return;
    const error = new Error('AI budget is not configured');
    error.budget = true;
    throw error;
  }
  try {
    const stub = env.AI_BUDGET.get(env.AI_BUDGET.idFromName('openrouter-free-v1'));
    const response = await stub.fetch('https://budget.internal/take', { method: 'POST' });
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

async function call(step, env, messages, max, localPreview, structured = false) {
  const key = step.via === 'nvidia' ? env.NVIDIA_API_KEY : env.OPENROUTER_API_KEY;
  if (!key) throw new Error(`no key for ${step.via}`);
  if (step.via === 'openrouter') await reserveOpenRouter(env, localPreview);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), step.timeout);
  try {
    const res = await fetch(ENDPOINT[step.via], {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(step.via === 'openrouter' ? { 'HTTP-Referer': 'https://liner-c7u.pages.dev', 'X-Title': 'Sleeve' } : {}),
      },
      body: JSON.stringify({ model: step.model, messages, max_tokens: step.maxTokens || max, temperature: structured ? 0.35 : 0.65, top_p: 0.9,
        ...(step.via === 'openrouter' ? { provider: { data_collection: 'deny' } } : {}),
        ...(step.model === EDITOR.model ? { reasoning: { effort: 'low' } } : {}) }),
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
  const raw = await request.text();
  if (raw.length > 8000) return Response.json({ error: 'That request is too big.' }, { status: 413 });
  let body;
  try { body = JSON.parse(raw); } catch { return Response.json({ error: 'Send JSON.' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return Response.json({ error: 'Send a JSON object.' }, { status: 400 });
  const task = Object.hasOwn(TASKS, body.task) ? TASKS[body.task] : null;
  if (!task) return Response.json({ error: 'Unknown task.' }, { status: 400 });
  const facts = String(body.facts || '').slice(0, 5000);
  const question = String(body.question || '').slice(0, 300);
  if (!facts) return Response.json({ error: 'No facts sent.' }, { status: 400 });
  if (body.task === 'ask' && !question.trim()) return Response.json({ error: 'Ask a question.' }, { status: 400 });

  const cacheKey = new Request(`https://liner-ai.cache/${CACHE_VERSION}/${body.task}/${await sha(`${facts}|${question}|${body.seed || ''}`)}`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, { headers: { 'Content-Type': 'application/json', 'X-Liner-Cache': 'hit' } });

  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  if (limited(ip)) return Response.json({ error: "You've asked a lot in the last few minutes. Try again in a bit." }, { status: 429 });

  const messages = [{ role: 'system', content: STYLE }, { role: 'user', content: task.prompt(facts, question) }];
  const key = cacheKey.url;
  let work = inflight.get(key);
  if (!work) {
    work = (async () => {
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
          const result = await call({ ...step, timeout: Math.min(step.timeout, remaining) }, env, messages, task.max, localPreview, task.json);
          if (!groundedNumbers(result.text, facts)) throw new Error(`${step.model} unsupported number`);
          if (task.json) {
            let structured;
            try { structured = JSON.parse(result.text); } catch { throw new Error(`${step.model} invalid structured response`); }
            if (!validStructuredWriting(body.task,structured,facts)) throw new Error(`${step.model} unsupported structured writing`);
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
  return new Response(result.out, { status: result.status, headers: { 'Content-Type': 'application/json' } });
}
