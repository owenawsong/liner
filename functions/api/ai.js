// POST /api/ai  { task, facts, question? }
// Writes short pieces about someone's listening from a compact summary of their stats.
// Keys live in Cloudflare secrets (NVIDIA_API_KEY, OPENROUTER_API_KEY) and never reach
// the browser. Prompts are fixed here, so this can't be used as a general chatbot.
// Answers are cached, so the same request is only paid for once.

const ROUTE = [
  { via: 'nvidia', model: 'google/diffusiongemma-26b-a4b-it', timeout: 20000 },
  { via: 'openrouter', model: 'google/gemma-4-31b-it:free', timeout: 25000 },
  { via: 'openrouter', model: 'nvidia/nemotron-3-super-120b-a12b:free', timeout: 30000 },
  { via: 'openrouter', model: 'openrouter/free', timeout: 30000 },
  { via: 'nvidia', model: 'z-ai/glm-5.3-flash', timeout: 90000, maxTokens: 1024 },
];
const ENDPOINT = {
  nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
};

const STYLE = `You write for Sleeve, a music stats site. Voice: a sharp, warm friend who knows music, talking straight to the listener as "you".
Rules: Be specific. Name real artists, songs, years and numbers from the facts. Never invent facts that aren't given.
No clichés ("eclectic", "sonic journey", "tapestry", "soundtrack of your life", "vibes", "delve"). No emojis. No hashtags. No markdown, headings or lists. Plain sentences only.`;

const TASKS = {
  notes: {
    max: 320,
    prompt: (f) => `Write the liner notes for this listener: two short paragraphs (about 110 words total) about who they are as a listener, how their taste moved over time, and one thing that stands out.\n\nFacts:\n${f}`,
  },
  year: {
    max: 260,
    prompt: (f) => `Write a short year-in-review for this listener's year (about 80 words, one paragraph). Say what defined the year and what changed.\n\nFacts:\n${f}`,
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
      body: JSON.stringify({ model: step.model, messages, max_tokens: step.maxTokens || max, temperature: 0.8, top_p: 0.95 }),
    });
    if (!res.ok) throw new Error(`${step.model} ${res.status}`);
    const d = await res.json();
    const text = clean(d.choices?.[0]?.message?.content);
    if (text.length < 20) throw new Error(`${step.model} empty`);
    return text;
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
  for (const step of ROUTE) {
    try {
      const text = await call(step, env, messages, task.max);
      const out = JSON.stringify({ text, model: step.model });
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
