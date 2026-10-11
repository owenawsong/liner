# Sleeve

The complete record of your listening. Sleeve turns music history into timelines, eras, listening patterns, detailed artist and song pages, and a year in review for any year. Every feature is free. There are no Sleeve accounts.

## Run locally

Use Node.js 22 or 24. The frontend is plain HTML, CSS, and ES modules. Install the pinned toolchain and verify the release:

```sh
npm ci
npm run check
npm run check:secrets:history
```

For a cross-platform preview, run `npm run preview` and open `http://127.0.0.1:5178`. On Windows, this helper creates a fresh public staging directory and supports private local writer configuration:

```powershell
.\scripts\dev.ps1
```

Open `http://127.0.0.1:5178`. To use another port, pass `-Port 5195`. Restart after source edits to rebuild the snapshot.

AI keys are optional for local statistics and demo views. Copy [.dev.vars.example](.dev.vars.example) to `%USERPROFILE%\.sleeve\dev\.dev.vars` and add your optional private `OPENROUTER_API_KEY`. An optional `NVIDIA_API_KEY` enables the development-only fallback. Never add either key to frontend code or commit that file. A separately provisioned `LASTFM_API_KEY` enables live Last.fm and is injected as **public browser configuration**; it is visible to visitors. With no read key, the demo and Spotify files still work and arbitrary usernames never receive simulated listening history.

Do not serve the project root with `python -m http.server` or `wrangler pages dev .` if it contains a local `.dev.vars`: those commands can expose that file on localhost. The service worker registers on HTTPS deployments. Local development serves a public staging snapshot; restart the preview after repository edits to rebuild that snapshot.

## Open source and hosting

Sleeve's code is licensed under [MIT](LICENSE). See [contributor instructions](CONTRIBUTING.md), [security reporting](SECURITY.md), [data handling](PRIVACY.md), and [third-party notices](THIRD_PARTY_NOTICES.md). The app's Privacy page is also available from its footer and setup.

The frontend, analysis, recommendations, AI prompts/validation and server/budget code are included in the open-source plan. Private credentials and user data are excluded. A future hosted AI allowance or paid service can be operated separately; no proprietary analyzer tier or paid plan is implemented in this release. Self-hosting remains documented.

The public build is `dist/`, created by `npm run build`. ZIP reading is bundled locally. [The deployment guide](docs/DEPLOYMENT.md) describes Cloudflare Pages Functions, the separate shared AI budget Worker, encrypted secrets, preview isolation and hosted verification. CI tests Linux/Windows, builds both server bundles, scans source/history/public output and audits dependencies. CI does not deploy.

The repository is prepared for review, not a certified public service. Account resources, provider permissions, hosted quotas/security headers and a consented live import must still be checked before enabling production AI. See [release readiness](docs/RELEASE_READINESS.md) for completed evidence and remaining gates.

## Get your data in

| Source | What you need | What it adds |
| --- | --- | --- |
| Last.fm | A username | Recent plays, top lists, and automatic full-history setup. On the first visit, Sleeve shows the read and writing progress before revealing the full profile, with an early-preview option. A newly created account starts logging future plays; it has no earlier Spotify history. |
| Spotify Account Data or Extended Streaming History | The ZIP Spotify emails you | Account Data covers about a year; Extended History covers the life of the account and includes skips and devices. The ZIP is opened in the browser and is never uploaded. |
| Direct Spotify, advanced | Your own Spotify developer app and Client ID | Now playing, recent plays, Spotify top lists, and skip tracking while Sleeve is open. Uses browser PKCE and is not a public one-click Spotify login. |

The `#/start` page directs new listeners to Last.fm and treats the Spotify data file as optional. `#/demo` shows the full experience without setup. When an archive and a live source overlap, the archive is used through its final day and newer live plays follow it. Existing ListenBrainz profiles and imports remain readable, but ListenBrainz is not part of the public setup path.

Sleeve does not connect to a stats.fm account. People who kept the original Spotify history ZIP they imported there can add that same ZIP to Sleeve.

The public data access decision is in [docs/DATA_ACCESS_DECISION.md](docs/DATA_ACCESS_DECISION.md).

## Explore

- Eight visible analytical destinations: Overview, Music, Timeline, Taste changes, Charts & sound, Insights, Discover and Clock. Data & settings is a separate visible utility link. Prepared liner notes appear openly on Overview and Insights; counting methods and supporting details expand on demand. All existing detailed artist, song and year routes remain available. Timeline month details include active days, first-heard artists, prior-month and year-ago comparisons, and previous/next controls.
- Discover combines Last.fm artist similarities and album popularity with your listening history. It lets you follow any seed artist, rotate through longer-tail seeds, and find deeper cuts using listener counts checked against spelling variants. It filters artists and albums you already heard, checks album identities against MusicBrainz, and treats the sparse MusicBrainz community scores as secondary context, showing a score only when at least 20 people rated it. Saves and optional high ratings influence later picks; hiding or marking an item as known removes it. Export or import your personal shelf as JSON. Recommendations and ratings stay in this browser.
- Evolution compares equal 30-, 90-, or 365-day periods, showing rising artists, new discoveries, older favorites and a taste-shift index. Prepared Discover suggestions appear automatically alongside the comparison.
- Deep dive charts show 24 months of activity, artist breadth, discovery share, top-artist concentration, and artist-tag style trends by year with visible coverage. Last.fm imports save page checkpoints and resume after an interrupted setup.
- Automatic eras, year pages with a shareable image, and detailed artist and song pages. Artist pages trace first play, first repeat month, peak month, and recent listening.
- Search, genres, listening anniversaries, and compare
- The mainstream score waits for a fixed set of leading-artist audience checks and requires at least five matches covering 70% of their plays. The score stays still while deeper artists are checked separately.
- Overview opens with a personal 30-day listening takeaway, three record covers, one supported change and a saved next-play suggestion. Short or sparse histories show actual recent counts instead of comparing against unobserved earlier listening. Supporting comparisons and extra observations expand on demand. Discover offers a current connection, another direction and an older record from your history, with verified albums or artist catalogue tracks. Optional saves and passes influence future picks. Ratings and reviews are optional, source-labeled drawers; Shelf backups preview additions and replacements before being applied.
- First setup prepares artist data, a saved recommendation board and a bundle of personal writing before the profile opens, with real stage progress and an early-preview option. Completed preparation stages are checkpointed for interrupted visits. Findings rank supported returns, discoveries that stayed, concentrated runs, enduring favorites and changes against your own earlier listening, choosing different artists and topics. Large histories use a background calculation worker.
- Insights opens with a listening report and direct paths to questions, audience reach, and recorded findings. Optional AI liner notes, evolution explanations, era names, year writing, roasts, and question commentary follow the exact statistics. Common questions about artists, dates, years, skips, and late nights are calculated directly from the saved history, then AI can add a short note from the same evidence. Exact answers continue to work with AI off or unavailable. Writing appears automatically where relevant and uses cached results.
- Themes, local profile management, play-count rules, reversible artist/album/song exclusions for background listening, and an installable PWA with an offline app shell. Exclusions recalculate the analytical record and its prepared writing without deleting original history.
- Local profile-picture overrides; Last.fm photos and authorized Spotify photos appear when available. Mood and musical key are not inferred from listening logs, which do not contain reliable audio features.
- Data offers an optional sound-coverage audit of up to 100 frequently played recordings. Exact MusicBrainz identities precede AcousticBrainz tempo/key analysis; charts show their coverage, and classifier mood estimates are separate. The recorded demo audit covers 19 of its 71 available identities and 23.63% of counted plays. See [the coverage report](docs/AUDIO_COVERAGE.md).

## Architecture

- `js/app.js` routes pages and handles app boot; `js/theme.js` shares theme controls with Settings.
- `js/core.js` owns profiles, IndexedDB archives, and merged analysis; `js/analysis.js` finds timelines, eras, and insights.
- `js/export.js` reads Spotify and ListenBrainz exports locally; `js/actions.js` updates archives.
- `js/sources/*` contains Last.fm, ListenBrainz, Spotify, and demo adapters.
- `js/preparation.js`, `js/dossier.js` and `js/recommendations.js` prepare and validate the personal report and saved discovery board.
- `js/meta.js` batches artwork through `functions/api/art.js` and enriches music metadata.
- `js/views/*` contains the landing page, onboarding, settings, connections, profiles, and detail pages.
- `styles.css` holds the app layout and theme tokens; `sleeve.css` adds the Sleeve visual language.
- `functions/api/ai.js` sends brief derived facts to fixed OpenRouter free models with provider data collection denied: Dots 3 Note Preview first, with Gemma 4 26B as the fallback. Structured reports request JSON formatting and pass evidence checks before caching. Model selection and its limits are recorded in [docs/AI_MODEL_EVALUATION.md](docs/AI_MODEL_EVALUATION.md). NVIDIA DiffusionGemma is available only for local development fallback; the developer endpoint is never used for public traffic. Generated responses are cached on the server for seven days, versioned, coalesced when identical requests overlap, and per-visitor requests are limited on a best-effort basis. Raw histories stay in the browser; some derived summaries include a display name. The `ai-budget` Durable Object enforces a shared OpenRouter request budget once bound to the Pages project. Provider keys stay in Cloudflare secrets or `.dev.vars`, not frontend code.
- `sw.js` caches the app shell for offline use on HTTPS.

The existing `liner.*` browser storage keys, `LINER_CONFIG`, and `liner` Cloudflare/GitHub project identifiers remain in place so existing visitors keep their saved data and the current deployment continues to work.
