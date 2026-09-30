// Shared quota for the OpenRouter free tier. Bind this Durable Object to the
// Pages project as AI_BUDGET; it counts attempts before they reach OpenRouter.
const MINUTE_LIMIT = 19;
const DAY_LIMIT = 900;

export class AIBudget {
  constructor(state) { this.state = state; }

  async fetch(request) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/take')
      return new Response('Not found', { status: 404 });
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const outcome = await this.state.storage.transaction(async (tx) => {
      const saved = await tx.get('counter') || { day, dayCount: 0, recent: [] };
      const recent = (saved.recent || []).filter((t) => now - t < 60_000);
      const dayCount = saved.day === day ? saved.dayCount : 0;
      if (dayCount >= DAY_LIMIT) return { allowed: false, retry: Math.ceil((Date.parse(`${day}T00:00:00Z`) + 86_400_000 - now) / 1000) };
      if (recent.length >= MINUTE_LIMIT) return { allowed: false, retry: Math.ceil((recent[0] + 60_000 - now) / 1000) };
      recent.push(now);
      await tx.put('counter', { day, dayCount: dayCount + 1, recent });
      return { allowed: true, remainingDay: DAY_LIMIT - dayCount - 1 };
    });
    return Response.json(outcome, { status: outcome.allowed ? 200 : 429,
      headers: outcome.allowed ? {} : { 'Retry-After': String(Math.max(1, outcome.retry)) } });
  }
}

export default { fetch() { return new Response('Not found', { status: 404 }); } };
