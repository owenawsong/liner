# Sleeve release review — October 10, 2026

This review records local evidence. It does not certify a public deployment.

## Depth and navigation

The previous five-link navigation concealed Taste changes, Deep dive and Clock under “Explore more.” Prepared liner notes were also inside a closed Overview drawer. That made working features appear removed.

Core analysis now has eight direct links, with Data & settings visible separately. Small screens wrap the analysis into two rows; the navigation does not cover the content while scrolling. Liner notes appear openly on Overview and at the opening of Insights. Nonduplicative prepared finding commentary is visible in the full report and labeled as AI interpretation. Methods, secondary comparisons and optional roast requests remain progressive detail. Homepage feature links explicitly cover taste changes, recommendations, genre history, year reviews and sound coverage.

## Newer-song audio data

MusicBrainz continues collecting music metadata. The discontinued collection is AcousticBrainz, which stopped accepting new audio analyses in 2022. They serve different purposes: recording identity versus audio measurements.

### Recommended next pilot: ReccoBeats

- Its catalogue supports Spotify IDs, ISRCs and track/artist searches. Its audio-feature schema includes tempo, pitch class and mode, acousticness, danceability, energy, instrumentalness, loudness, speechiness, liveness and valence.
- Its May 25, 2026 terms permit free personal and commercial API use. It says foundational metadata originates from Spotify; applications remain responsible for applicable third-party terms. Its own service produces the analytical metrics. Do not relabel them as Spotify measurements or train models on Spotify-derived metadata without an appropriate permission basis.
- Rate limits are internally configured; no dependable public numeric quota is documented. Respect 429/Retry-After, cache approved matches, and keep external failures distinct from missing coverage.
- A two-track public catalogue spot check returned one exact-title/artist result for Billie Eilish’s “BIRDS OF A FEATHER,” ISRC `USUM72401994`, with tempo 104.978, pitch class 2 and mode 1, plus the documented feature estimates. “The Provocateur” filtered by ADÉLA returned no results. This is a spot check, not a coverage benchmark or independent accuracy verification.
- Before wiring charts: audit a fixed selection spanning older and newer years; match source ISRC/Spotify identity when available; verify title, complete artist credit and release/version identity otherwise; omit ambiguous matches; preserve provider provenance; show coverage over all counted plays for each year. ReccoBeats exposes a pitch class and mode without analyzer strength, so it cannot silently inherit the existing AcousticBrainz key-confidence rule.
- Do not merge differently defined provider estimates into one longitudinal trend. Within-provider trends can compare recent listening with the listener’s earlier covered music. A population-average comparison needs an actual licensed reference dataset. Valence describes a music estimate, not the listener’s happiness.

### Other routes

Cyanite's current API analyzes uploaded MP3 audio, with asynchronous results and mood/BPM/key outputs. Access must be arranged; knowing a track title alone does not provide the audio. Essentia can analyze lawfully supplied audio locally or on a server, but library/dependency and individual pretrained-model licenses need checking before distribution or commercial hosting. The model licensing pages differ; review each exact artifact rather than assuming one blanket license.

Sources checked:

- [MusicBrainz](https://musicbrainz.org/)
- [AcousticBrainz project status](https://acousticbrainz.org/)
- [ReccoBeats identity lookup](https://reccobeats.com/docs/apis/get-tracks)
- [ReccoBeats audio-feature schema](https://reccobeats.com/docs/apis/get-track-audio-features)
- [ReccoBeats terms](https://reccobeats.com/docs/documentation/terms-of-service)
- [ReccoBeats rate limits](https://reccobeats.com/docs/documentation/rate-limiting)
- [Cyanite API introduction](https://docs.cyanite.ai/docs/intro/)
- [Cyanite model outputs](https://docs.cyanite.ai/docs/guides/model-outputs/)
- [Essentia licensing](https://essentia.upf.edu/licensing_information.html)
- [Essentia model catalogue](https://essentia.upf.edu/models.html)

## AI evidence and remaining work

The initial preparation already builds measured findings, then runs the profile writer and recommendation builder concurrently. One structured report supplies notes, observations, year summaries and era labels. Recommendations can only curate the supplied catalogue candidates. Exact statistics continue to work when writing fails.

October 10 live local checks:

- The old `qwen/qwen3.8-27b:free` route returned 404 and was absent from the official OpenRouter model catalogue. It has been removed.
- Gemma 4 26B short notes returned HTTP 200 in about 2 seconds.
- Gemma 4 31B was listed, but profile/curation attempts received HTTP 504 after about 11–12 seconds.
- A synthetic structured profile completed through Gemma 4 26B. Synthetic curation completed only through the localhost NVIDIA fallback in the initial check. That does not demonstrate public curation availability.
- After changing the small-pool prompt and putting the quick route first, a fresh synthetic curation check returned HTTP 503: the quick and local fallback outputs failed structure validation, while the larger route timed out. Curation quality/availability remains an explicit open gate; the deterministic recommendation board still works.
- A synthetic observation implied an unsupported sequence of changes despite passing numeric validation. Numeric and structural guards do not establish semantic accuracy. A fixed quality evaluation remains necessary.

Those checks describe the initial routing revision. A later bounded synthetic evaluation selected Dots 3 Note Preview first, with Gemma 4 26B as fallback, and removed the timing-out Gemma 4 31B route. Cache version 19 invalidates earlier writing. See [AI_MODEL_EVALUATION.md](AI_MODEL_EVALUATION.md) for the actual results and semantic limitations. AI summaries compare periods ending at the last recorded play, not today's date.

Before launch, demonstrate profile, curator, year and question tasks on the public Pages Functions route, with the Durable Object budget bound and required. Check actual served models, semantic accuracy, p95 latency, provider failures, cache hits, fallback consumption and quota exhaustion. NVIDIA remains local-only. The 900-attempt daily shared budget gives a theoretical maximum of 450 two-call preparations before interactive traffic and failures; repeated fallbacks reduce that capacity.

Keep evaluation inputs synthetic or explicitly consented. Log task/model/status/timing without raw listening summaries. Show generated writing as interpretation, and calculated fallbacks as calculations. Settings and homepage now disclose the seven-day response cache and the distinction between local deletion and provider/server retention.

Official model catalogue: [OpenRouter models API](https://openrouter.ai/api/v1/models).

## Open-source and publishing gates at the initial review

The following list is historical. MIT licensing, pinned dependencies, CI, neutral configuration and the Pages build boundary were subsequently implemented. See [RELEASE_READINESS.md](RELEASE_READINESS.md) for the current evidence and remaining hosting/user-journey gates.

1. Choose an explicit source license; no LICENSE currently establishes open-source reuse rights. Add contribution and vulnerability-reporting instructions.
2. Provide a reproducible dependency/runtime setup and CI. Local statistics/demo now start without AI secrets, but Wrangler is still downloaded through npx rather than a pinned project lockfile.
3. Replace owner-specific default configuration with documented contributor configuration. Review both current tracked files and Git history for private credentials before making the repository public.
4. Clarify the deployment path: AI currently lives in Pages Functions; root wrangler.jsonc configures static Worker assets and does not establish a working public AI deployment. Use a public-asset whitelist, provider secrets outside assets, and the separately deployed AI_BUDGET binding. A successful local preview is insufficient.
5. Finish a real-user journey check: new/sparse Last.fm accounts, large/resumed import, missing artwork, failed providers, exclusions, repeat visits, mobile charts and keyboard navigation. Preserve existing histories and URLs through changes.
6. Keep unsupported community-rating feeds as attributed outbound links until approved access exists. Ratings remain secondary context, not the recommendation's main purpose.

No public deployment or partner outreach was performed during this review. The maintainer subsequently selected MIT for the release preparation.

Verification: all 89 tests pass. Browser checks at 1440px and 320px found no horizontal overflow, all nine navigation links present, and Overview liner notes outside any closed details element. The Insights prepared note is visible. These checks cover the visibility correction; they do not establish a flawless end-to-end release.

## Setup repair

The reported setup screenshot exposed an actual layout collision: a `height: 100%` input inside an auto-height wrapping flex field pushed the submit button past its wrapper and into the lookup output. The setup field now uses a single-column grid with explicit 56px input and 46px button heights. The label, action and live result occupy separate rows. Source choices and saved-record shortcuts are visible before the form; setup has a smaller heading and a compact step indicator.

Browser checks at 320px, 390px and 1366px found no horizontal overflow or button/output overlap. At 1366×768 the primary action ends at 675px, within the viewport. Valid username lookup, invalid username feedback, blank submission and clearing a loaded result were checked. Lookup edits abort and invalidate the previous request immediately, and submission cancels the pending debounce. Settings now has a smaller scoped heading and wraps long profile names. These repairs do not certify every chart or import state.

Final verification after the setup/model repair: 95 tests passed. The restarted local Pages `/api/ai` served a synthetic notes request from Dots in 1.808 seconds. Public budget enforcement and a deployed user journey remain open gates.
