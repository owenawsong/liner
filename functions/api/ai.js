// POST /api/ai  { task, facts, question? }
// Writes short pieces about someone's listening from a compact summary of their stats.
// Keys live in Cloudflare secrets (NVIDIA_API_KEY, OPENROUTER_API_KEY) and never reach
// the browser. Prompts are fixed here, so this can't be used as a general chatbot.
// Answers are cached, so the same request is only paid for once.

// Use a fixed, responsive writer first. The larger Gemma route is a fallback:
// its free provider may be unavailable, and should not delay the first reveal.
// Never use a random free router, which changes the site's voice between runs.
const GEMMA = { via: 'openrouter', model: 'google/gemma-4-31b-it:free', timeout: 15000 };
const DIFFUSION = { via: 'nvidia', model: 'google/diffusiongemma-26b-a4b-it', timeout: 19000 };
const ROUTES = {
  notes: [DIFFUSION, GEMMA], year: [DIFFUSION, GEMMA], eras: [DIFFUSION, GEMMA],
  roast: [DIFFUSION, GEMMA], ask: [DIFFUSION, GEMMA],
};
const ENDPOINT = {
  nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
};

const STYLE = `You write for Sleeve, a music stats site. Sound like a perceptive music editor speaking directly to "you": plain, specific, and a little surprising.
Use only the supplied facts. Make a concrete observation about a change, contrast, or pattern; back it with artist names and counts from those facts. Do not infer personality, emotion, genre, or audio qualities from play counts. If the evidence is thin, say less.
Avoid praise, corporate wording, and stock phrases: "eclectic", "sonic journey", "tapestry", "soundtrack of your life", "vibes", "delve", "engagement", "in contrast", "the record accumulated", "during this period", "clearly", "you have always". Every sentence should add evidence or interpretation grounded in evidence. No filler closing summary. No emojis, hashtags, markdown, headings, or lists. Plain sentences only.`;

const TASKS = {
  notes: {
    max: 320,
    prompt: (f) => `Write one or two short liner-note paragraphs (at most 95 words total). Start with the most interesting supported change or contrast in this record. Name the relevant artists and a number or year. Add a second paragraph only if there is a different specific observation, not a restatement of total plays. Never guess how the songs sound or how the listener felt.\n\nFacts:\n${f}`,
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
    max: 220,
    prompt: (f, q) => `Answer the listener's question using only these facts. If the facts don't contain the answer, say so plainly and suggest where in Sleeve they could look (Timeline, Top, Insights, Clock, or an artist page). Two or three sentences.\n\nFacts:\n${f}\n\nQuestion: ${q}`,
  },
};

// Best-effort limit per visitor, per server instance.
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 25;
}

function clean(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*(here'?s a thinking process|thinking process)[\s\S]*$/i, '')
    .replace(/\*\*|__|^#+\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .trim();
}

async function call(step, env, messages, max) {
  const key = step.via === 'nvidia' ? env.NVIDIA_API_KEY : env.OPENROUTER_API_KEY;
  if (!key) throw new Error(`no key for ${step.via}`);
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
      body: JSON.stringify({ model: step.model, messages, max_tokens: step.maxTokens || max, temperature: 0.65, top_p: 0.9 }),
    });
    if (!res.ok) throw new Error(`${step.model} ${res.status}`);
    const d = await res.json();
    const text = clean(d.choices?.[0]?.message?.content);
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
  const task = TASKS[body.task];
  if (!task) return Response.json({ error: 'Unknown task.' }, { status: 400 });
  const facts = String(body.facts || '').slice(0, 5000);
  const question = String(body.question || '').slice(0, 300);
  if (!facts) return Response.json({ error: 'No facts sent.' }, { status: 400 });
  if (body.task === 'ask' && !question.trim()) return Response.json({ error: 'Ask a question.' }, { status: 400 });

  const cacheKey = new Request(`https://liner-ai.cache/${body.task}/${await sha(`${facts}|${question}|${body.seed || ''}`)}`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, { headers: { 'Content-Type': 'application/json', 'X-Liner-Cache': 'hit' } });

  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  if (limited(ip)) return Response.json({ error: "You've asked a lot in the last few minutes. Try again in a bit." }, { status: 429 });

  const messages = [{ role: 'system', content: STYLE }, { role: 'user', content: task.prompt(facts, question) }];
  const errors = [];
  const deadline = Date.now() + 44000;
  for (const step of ROUTES[body.task]) {
    const remaining = deadline - Date.now();
    if (remaining < 3000) break;
    try {
      const result = await call({ ...step, timeout: Math.min(step.timeout, remaining) }, env, messages, task.max);
      const out = JSON.stringify(result);
      waitUntil(cache.put(cacheKey, new Response(out, { headers: { 'Cache-Control': 'public, max-age=604800' } })));
      return new Response(out, { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      errors.push(String(e.message || e));
    }
  }
  console.log('ai: every model failed', errors);
  const unconfigured = errors.every((e) => e.startsWith('no key'));
  return Response.json({ error: unconfigured ? "AI writing isn't switched on for this site yet." : 'The writing models are all busy right now. Try again in a minute.' }, { status: 503 });
}
