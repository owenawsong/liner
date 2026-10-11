# AI model evaluation — 10 October 2026

## Decision

Sleeve now uses **`dots-studio/dots-3-note-preview:free`** first and **`google/gemma-4-26b-a4b-it:free`** as its fixed fallback. This applies to automatic profile preparation and discovery curation, as well as notes, questions, years, eras and the optional roast. NVIDIA's developer endpoint remains a local preview fallback. It is not used for public requests.

The primary route was selected from actual synthetic requests, rather than catalogue listings alone. Both routes preserve `provider.data_collection: "deny"`. Structured tasks request `response_format: {type: "json_object"}` with `provider.require_parameters: true`. Reasoning is explicitly disabled (`reasoning.enabled: false`): these tasks interpret already calculated evidence and do not need a hidden reasoning stage to consume their small completion budget. This is the setting used in the benchmark, not a claim about each model's maximum reasoning ability.

Browser writing and server response caches are version **v19**, with a **v21 exception for standalone year commentary** added during hosted release checks below. Preparation and discovery signatures include the browser AI version, so prepared prose and curator selections follow that signature. The per-visitor limit, shared public budget, request coalescing, timeout, model cooldown and local evidence fallback remain active. This original benchmark did not verify hosting; the subsequent [release checks](RELEASE_READINESS.md) cover the deployed binding and secret.

## Live results

At 22:38–22:41 UTC on 2026-10-10, 12 sequential generation attempts were made with the owner's OpenRouter account. Only invented artists Alpha/Beta/Gamma/Delta and invented counts were submitted. No real listening histories or credentials appear in this document or in the script's output. Requests started at least 3.3 seconds apart. Every request used the privacy-deny policy. Each request was bounded to 25 seconds and 1,800 completion tokens. All successful responses finished with `stop`, reported zero cost and used fewer than 350 completion tokens; the production structured cap is 1,500.

| Exact requested model | Task / fixture | Actual result | Elapsed |
|---|---|---|---|
| `dots-studio/dots-3-note-preview:free` | Profile / baseline | 200; matching served ID, AtlasCloud; valid JSON and numbers | 1.063 s |
| `dots-studio/dots-3-note-preview:free` | Curator / baseline | 200; matching served ID, AtlasCloud; valid IDs, but reasons too focused on tags | 0.889 s |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | Profile / baseline | 404: no endpoints matching data policy, “Free model training”; second task skipped | 0.128 s |
| `thinkingmachines/inkling:free` | Profile / baseline | 403: available only on listed agentic harnesses | 0.132 s |
| `thinkingmachines/inkling:free` | Curator / baseline | Same 403 restriction | 0.140 s |
| `google/gemma-4-26b-a4b-it:free` | Profile / baseline | 200; matching served ID, Google AI Studio; valid profile | 0.877 s |
| `google/gemma-4-26b-a4b-it:free` | Curator / baseline | 200; matching served ID, Google AI Studio; correct object inside a singleton array, rejected by old validator | 0.875 s |
| `google/gemma-4-31b-it:free` | Profile / baseline | Provider returned 504, “The operation was aborted” | 11.318 s |
| `google/gemma-4-31b-it:free` | Curator / baseline | Same 504 | 11.001 s |
| `dots-studio/dots-3-note-preview:free` | Profile / contrast, revised prompt | 200; matching served ID, AtlasCloud; correct artist directions and explicit incomplete year | 1.010 s |
| `dots-studio/dots-3-note-preview:free` | Curator / contrast, revised prompt | 200; matching served ID, AtlasCloud; six distinct supplied IDs, candidate-specific seed reasons | 1.034 s |
| `dots-studio/dots-3-note-preview:free` | Notes / contrast, revised prompt | 200; matching served ID, AtlasCloud; correct decline, rise and return | 0.828 s |

The catalogue listed all tested IDs as free. A listed model can still be unusable for this account and app. No data-policy relaxation, agentic-harness impersonation or paid-model fallback was used to work around a rejection. Gemma's responses reported OpenRouter `is_byok: true`, so those two requests also depend on this account's provider configuration; their success is not proof that every account receives the same endpoint.

After restarting the local Pages preview, one additional synthetic notes request through Sleeve's actual `/api/ai` returned HTTP 200 from `dots-studio/dots-3-note-preview:free` in 1.808 seconds including the local route. Its text kept Alpha's decline, Delta's rise and Gamma's return separate. It still quoted more counts than the prompt requested. The final full unit suite passed 95/95; these tests do not make live provider requests.

## What changed after reading the output

The old Gemma curator returned `[{"picks": [...]}]`. Sleeve now unwraps exactly one object containing `picks`. It does not merge arrays, repair IDs or manufacture missing reasons. This removes an observed formatting failure without relaxing candidate identity checks.

The baseline Dots response had a generic paragraph and inferred a whole-year conclusion from three monthly leaders. The revised prompt requires precise named relationships, treats incomplete year coverage explicitly, and tells the writer to omit observations that repeat visible statistics. The contrast response kept Alpha's decrease attached to Alpha and Delta's increase attached to Delta. It described Gamma as a return, not a discovery, and left unsupported eras empty.

The curator now leads with an actual connected seed and its recorded role. One returned reason was: “Alpha's declining share and Beta's retained discovery both point here; Last.fm links this artist to both seeds.” These connections were supplied specifically for that candidate. Another candidate linked only to Delta and did not invent an older favorite. Last.fm connections are described as listener overlap, not proof of acoustic similarity or mood.

Server validation now rejects duplicate profile observations, numbers borrowed from a different evidence ID, candidate numbers borrowed from the rest of the pool, and references to another candidate's seed connection. The browser rejects an empty or non-string successful response before caching it. Existing local dossier checks still suppress numerical restatements and unsupported year/era writing.

## Limits and next evaluation

This is a small live smoke test, not a load test or a model leaderboard. Five Dots responses succeeded; that does not establish long-term availability or public throughput. Year, era, roast and question routes share its configuration but were not separately live-tested in this batch.

Editorial quality is still imperfect: the contrast profile and note quoted more numeric facts than requested, some profile observations repeat the evidence, and a few curator reasons contain mechanical phrases such as “no other seed link supplied.” Numeric and ID checks do not verify every causal or musical claim. Do not market the writing as a factual research engine. The site computes listening findings locally; the model writes about the supplied findings and candidates, and performs no external web search in this route.

The next useful evaluation should use a larger **synthetic** set covering short histories, artist names with punctuation, returning favorites, two artists changing in opposite directions, partial years and candidate pools with sparse connections. Keep a human editorial check alongside automated structure and grounding checks. Do not spend additional requests merely to improve the small benchmark's pass rate.

## Reproduce deliberately

Run from the repository with a private `OPENROUTER_API_KEY` environment variable, or the existing private dev-vars file. An optional `SLEEVE_DEV_VARS` environment variable selects a different private file. Do not place credentials in command arguments. The script verifies listed zero-price models and caps one invocation at 12 attempts. It prints model, task, status, timing and validation results; raw synthetic outputs can be saved in a private report with `--output`.

```powershell
node scripts/ai-evaluate.mjs --models=dots-studio/dots-3-note-preview:free --tasks=profile,curate,notes --fixture=contrast --output=C:/Users/Owen/.sleeve/dev/ai-evaluation-contrast.json
```

This makes three live requests; running it is an intentional use of the account quota. Unit tests make no live provider requests.

## Own-key support

Not implemented in this change. The proposed follow-up uses OpenRouter PKCE authorization, session-scoped browser key storage, direct personal requests, and a separate browser-local queue and response cache. It must reuse the fixed prompts and evidence validators, preserve the chosen privacy policy, show actual quota and disconnect, and never silently fall back to a paid model. No personal key should pass through the shared inference route or shared server cache. See [AI_LAUNCH.md](AI_LAUNCH.md#personal-openrouter-connection--proposed-not-implemented) for the design. The site's current owner key remains server-side.

## Subsequent hosted release checks

Synthetic requests through the deployed Functions route succeeded for structured profile writing, complete-evidence curation and calculated question commentary. A repeated profile was served from cache in 109 ms. Sparse curation returned a safe fallback. See [release readiness](RELEASE_READINESS.md#hosted-ai-evaluation) for timings and scope.

The year fixture exposed a claim that selected artist counts established an annual leader. Tightening the prompt alone still returned leadership language and more counts than requested. The standalone year route now has a short-prose/numeric budget and rejects leadership clauses without a named monthly scope; its browser/server cache is v21. The hosted fixture returned 503 with ordinary statistics still available. A direct synthetic inspection found Dots quoting four counts despite the two-count prompt, which the guard rejects. This is a known availability/editorial limitation, not evidence of reliable year interpretation. Regression tests cover the observed failure and fallback to another writer. These checks do not validate every musical or causal claim.

## Official references

Catalogue and parameter availability were checked against the [OpenRouter models API](https://openrouter.ai/api/v1/models). See the official [Dots3 Note Preview free listing](https://openrouter.ai/dots-studio/dots-3-note-preview:free), [Inkling free listing](https://openrouter.ai/thinkingmachines/inkling:free), [Nemotron Ultra free listing](https://openrouter.ai/nvidia/nemotron-3-ultra-550b-a55b:free), [provider routing documentation](https://openrouter.ai/docs/guides/routing/provider-selection), and [reasoning token documentation](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens). Actual HTTP results above are the serving evidence for this account.
