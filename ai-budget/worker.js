// Shared quota for the OpenRouter free tier. Bind this Durable Object to the
// Pages project as AI_BUDGET; it counts attempts before they reach OpenRouter.
const MINUTE_LIMIT = 19;
const DAY_LIMIT = 900;
const VISITOR_WINDOW = 10 * 60_000;
const VISITOR_WINDOW_LIMIT = 12;
const VISITOR_DAY_LIMIT = 60;

export class AIBudget {
  constructor(state) { this.state = state; }

  async fetch(request) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/take')
      return new Response('Not found', { status: 404 });
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const visitor = request.headers.get('X-Sleeve-Visitor');
    if (visitor && !/^[a-f0-9]{64}$/.test(visitor)) return new Response('Invalid visitor', { status: 400 });
    const outcome = await this.state.storage.transaction(async (tx) => {
      const saved = await tx.get('counter') || { day, dayCount: 0, recent: [] };
      const recent = (saved.recent || []).filter((t) => now - t < 60_000);
      const dayCount = saved.day === day ? saved.dayCount : 0;
      // At most 900 admitted attempts create entries. Denied traffic creates no
      // records; daily rollover drops the previous day's pseudonymous counters.
      const visitors = saved.day === day ? (saved.visitors || {}) : {};
      const person = visitor ? visitors[visitor] || { count: 0, recent: [] } : null;
      const visitorRecent = person?.recent.filter(t => now - t < VISITOR_WINDOW) || [];
      if (person?.count >= VISITOR_DAY_LIMIT) return { allowed: false, retry: Math.ceil((Date.parse(`${day}T00:00:00Z`) + 86_400_000 - now) / 1000) };
      if (visitorRecent.length >= VISITOR_WINDOW_LIMIT) return { allowed: false, retry: Math.ceil((visitorRecent[0] + VISITOR_WINDOW - now) / 1000) };
      if (dayCount >= DAY_LIMIT) return { allowed: false, retry: Math.ceil((Date.parse(`${day}T00:00:00Z`) + 86_400_000 - now) / 1000) };
      if (recent.length >= MINUTE_LIMIT) return { allowed: false, retry: Math.ceil((recent[0] + 60_000 - now) / 1000) };
      recent.push(now);
      if (person) visitors[visitor] = { count: person.count + 1, recent: [...visitorRecent, now] };
      await tx.put('counter', { day, dayCount: dayCount + 1, recent, visitors });
      return { allowed: true, remainingDay: DAY_LIMIT - dayCount - 1 };
    });
    if (outcome.allowed && this.state.storage.setAlarm) await this.state.storage.setAlarm(Date.parse(`${day}T00:00:00Z`) + 86_400_000 + VISITOR_WINDOW);
    return Response.json(outcome, { status: outcome.allowed ? 200 : 429,
      headers: outcome.allowed ? {} : { 'Retry-After': String(Math.max(1, outcome.retry)) } });
  }

  async alarm() {
    const saved = await this.state.storage.get('counter');
    if (saved && saved.day !== new Date().toISOString().slice(0, 10)) await this.state.storage.delete('counter');
  }
}

export default { fetch() { return new Response('Not found', { status: 404 }); } };
