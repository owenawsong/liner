# Sleeve AI launch notes

Updated 2026-09-29.

## Current routing

- The public `/api/ai` route calls fixed OpenRouter free models. Gemma 4 26B writes automatic notes and short pieces quickly; Qwen3.8 27B handles questions and year summaries, with Gemma as fallback. Both routes request `provider.data_collection=deny`. The route never uses a random model selector.
- NVIDIA DiffusionGemma is a fallback only when the request is served from localhost. The NVIDIA Developer Program's hosted endpoints are for prototyping, research, development, and testing; its documentation says serving real end users requires a production license. Keep the NVIDIA route disabled on public hosts even if a key is present.
- Requests send a compact derived listening summary rather than the raw play history. The summary can contain top artist, song, and album names, era dates, and time-of-day patterns. The landing-page disclosure must match that payload.
- The Insights question box now calculates supported answers locally from the complete saved history before any model request. It sends only that answer's short evidence to the writer for optional context. Unsupported questions show examples of what Sleeve can calculate; exact answers still work with AI disabled or unavailable. The server rejects generated numeric claims absent from the supplied evidence before caching the response, and the question view checks the optional note again before showing it. Names and qualitative claims still need manual review; this guard is not a complete factual verifier.
- A versioned cache avoids repeating the same generation; concurrent identical requests in one Worker isolate are coalesced. Per-visitor limits in isolate memory are a safety net, not a global provider budget.
- `ai-budget/worker.js` is a Durable Object budget for OpenRouter free requests. It admits at most 19 attempts per rolling minute and 900 per UTC day, leaving headroom below the provider's published limits. Every attempted OpenRouter model, including a fallback, consumes one slot. Cached answers do not.

## Current limits and launch gates

- OpenRouter documents 20 requests per minute and up to 1,000 free-model requests per day after adding at least $10 in credits. Verify the actual account's available quota and monitor it. A provider-specific free model may still be unavailable or rate-limited.
- Deploy `ai-budget/wrangler.jsonc` as a separate Worker and bind its `AIBudget` class to the Pages project as `AI_BUDGET`. Public AI writing now fails closed when the binding is missing; localhost can still preview without it. `AI_BUDGET_REQUIRED=1` also enforces it on localhost for deployment checks. Cloudflare Pages cannot define the Durable Object inside the Pages project. Also configure a Cloudflare request rate rule to guard abuse before requests reach the Function. Isolate memory cannot enforce a global quota across Cloudflare locations.
- Measure error rate, provider 429/5xx, latency, cache hit rate, and generations by task without logging personal listening summaries. Keep the statistical views functional when writing is unavailable.
- Review a fixed evaluation set of real or consented listening summaries for invented facts, repetitive prose, and sensitive inferences. A model change or prompt change must increment the cache version and pass that set.
- Groq Qwen3.8-27B is a candidate for short interactive writing, but there is no Groq key in the local development setup and no Groq-wide shared token budget in this repo yet. Do not add it to public routing on the strength of the published 30 RPM alone; its free 8K tokens/minute and 200K tokens/day need separate admission control and a measured quality comparison.
- Verify the provider's data handling and commercial-use terms before widening the audience.
- The Nemotron 3 Ultra free endpoint was rejected by OpenRouter when data collection was denied, so it is not a public route. Recheck each fixed endpoint under the same policy before changing models.

## Audio-feature data

Listening logs alone do not carry mood, tempo, key, energy, or acousticness. Spotify restricted Audio Features access for new Web API applications. AcousticBrainz offers measured tempo and key plus classifier-based moods for recordings with MusicBrainz IDs, but it stopped collecting new data in 2022. Any sound-analysis feature should start with an exact recording match, show the measured source and coverage, distinguish measurements from classifier estimates, and omit values when coverage is weak. Do not compare a listener to an invented population average.

## Sources

- [OpenRouter free-tier limits](https://openrouter.ai/blog/tutorials/how-to-get-the-lowest-cost-llm-inference-on-openrouter/)
- [NVIDIA NIM developer and production terms](https://docs.api.nvidia.com/nim/docs/product)
- [Spotify Web API endpoint changes](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api)
- [AcousticBrainz data and project status](https://acousticbrainz.org/data)
- [Cloudflare Pages Durable Object bindings](https://developers.cloudflare.com/pages/functions/bindings/#durable-objects)
- [OpenRouter data-collection controls](https://openrouter.ai/docs/guides/get-started/sovereign-ai#data-collection-controls)
