# Sleeve AI launch notes

Updated 2026-09-30.

## Current routing

- The public `/api/ai` route calls fixed OpenRouter free models. Gemma 4 26B writes automatic notes and short pieces quickly; Qwen3.8 27B handles questions and year summaries, with Gemma as fallback. Both routes request `provider.data_collection=deny`. The route never uses a random model selector.
- NVIDIA DiffusionGemma is a fallback only when the request is served from localhost. The NVIDIA Developer Program's hosted endpoints are for prototyping, research, development, and testing; its documentation says serving real end users requires a production license. Keep the NVIDIA route disabled on public hosts even if a key is present.
- Requests send a compact derived listening summary rather than the raw play history. The summary can contain top artist, song, and album names, era dates, and time-of-day patterns. The landing-page disclosure must match that payload.
- The Insights question box now calculates supported answers locally from the complete saved history before any model request. It sends only that answer's short evidence to the writer for optional context. Unsupported questions show examples of what Sleeve can calculate; exact answers still work with AI disabled or unavailable. The server rejects generated numeric claims absent from the supplied evidence before caching the response, and the question view checks the optional note again before showing it. Names and qualitative claims still need manual review; this guard is not a complete factual verifier.
- A versioned cache avoids repeating the same generation; concurrent identical requests in one Worker isolate are coalesced. Per-visitor limits in isolate memory are a safety net, not a global provider budget.
- `ai-budget/worker.js` is a Durable Object budget for OpenRouter free requests. It admits at most 19 attempts per rolling minute and 900 per UTC day, leaving headroom below the provider's published limits. Every attempted OpenRouter model, including a fallback, consumes one slot. Cached answers do not.

## Prepared profiles

- After the initial history import, `js/preparation.js` prepares artist metadata and artwork, then runs the profile writer and recommendation builder concurrently. One structured `profile` generation supplies the opening note, evidence-linked observations, the last two year summaries and recent era labels. A separate `curate` generation reviews a bounded shortlist of actual Last.fm candidates. These use the fixed editor first, the quick writer second, and the localhost-only NVIDIA fallback.
- Exact findings are computed locally first. Artist play shares across equal periods, discoveries with repeat listening across three months, quiet older favorites, artist origins, year changes and listening hours are available with writing disabled. The opening report shows the facts and their destinations without requiring a question. Generated observations are checked against their individual evidence IDs and numeric claims; this is a partial factual guard, not a guarantee that prose is correct.
- Recommendations use actual recent and lifetime play shares, saved opinions, multiple artist connections and supplied Last.fm artist tags. AI can adjust a candidate's weight within a cap. It cannot add names outside the pool or bypass hidden, known or previously heard artists. Albums are matched by both title and artist, including a MusicBrainz fallback for records missing Last.fm IDs. Scores require at least 20 votes.
- The prepared packet lasts seven days; recommendation boards last three. Failed optional services become eligible for another attempt on a later visit after 15 minutes. Changes to the record, AI prompt version, writing setting, Last.fm availability or shelf opinions invalidate relevant cached results. Only the first visit is gated; existing visitors retain access during refresh. An early-preview option is available. Optional preparation has a 100-second deadline, with exact statistics retained when remote services fail. Data offers a deliberate refresh; all work is cancelled before a profile is removed or storage is cleared.
- Histories with at least 12,000 rows are calculated in a module worker so setup can remain responsive. The synchronous calculation is a compatibility fallback. Calculations use the device time zone.
- The demo archive ends at the last complete day, so a reload within that day does not invalidate its prepared writing. In local live checks, both structured tasks completed through the OpenRouter Gemma fallback, but a later attempt encountered editor 429, quick-writer 502 and a localhost NVIDIA timeout. Free-provider availability remains a launch risk; exact calculations and cached recommendations remain usable when writing fails.
- AOTY and RYM appear as external opinion search links, not imported scores. AOTY's terms require written permission for automated retrieval and invite API/data partnerships. A feed needs permission, a stable identity mapping, attribution and a sample-size display before activation. Do not present a MusicBrainz score as an AOTY or RYM score.

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

- [Album of the Year terms and data partnerships](https://www.albumoftheyear.org/terms-of-use/)
