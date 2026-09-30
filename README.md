# Sleeve

The complete record of your listening. Sleeve turns music history into timelines, eras, listening patterns, detailed artist and song pages, and a year in review for any year. Every feature is free. There are no Sleeve accounts.

## Run locally

The frontend is plain HTML, CSS, and ES modules. On Windows, put `NVIDIA_API_KEY` and `OPENROUTER_API_KEY` in `%USERPROFILE%\.sleeve\dev\.dev.vars` and run:

```powershell
.\scripts\dev.ps1
```

Open `http://127.0.0.1:5178`. The script stages only public assets outside the repository, then starts Cloudflare Pages Functions. To use another port, pass `-Port 5180`.

Do not serve the project root with `python -m http.server` or `wrangler pages dev .` if it contains a local `.dev.vars`: those commands can expose that file on localhost. The service worker registers on HTTPS deployments; local HTTP development loads fresh assets on each visit.

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

- Overview, Discover, Top 100 with plays or minutes and date filters, Timeline, Evolution, Deep dive charts, Insights, Clock, and Data tabs. Timeline month details now include active days, first-heard artists, a prior-month and year-ago comparison, and previous/next controls.
- Discover combines Last.fm artist similarities and album popularity with your listening history. It lets you follow any seed artist, rotate through longer-tail seeds, and find deeper cuts using listener counts checked against spelling variants. It filters artists and albums you already heard, checks album identities against MusicBrainz, and treats the sparse MusicBrainz community scores as secondary context, showing a score only when at least 20 people rated it. Saves and optional high ratings influence later picks; hiding or marking an item as known removes it. Export or import your personal shelf as JSON. Recommendations and ratings stay in this browser.
- Evolution compares equal 30-, 90-, or 365-day periods, showing rising artists, new discoveries, older favorites and a taste-shift index. Prepared Discover suggestions appear automatically alongside the comparison.
- Deep dive charts show 24 months of activity, artist breadth, discovery share, top-artist concentration, and artist-tag style trends by year with visible coverage. Last.fm imports save page checkpoints and resume after an interrupted setup.
- Automatic eras, year pages with a shareable image, and detailed artist and song pages. Artist pages trace first play, first repeat month, peak month, and recent listening.
- Search, genres, listening anniversaries, and compare
- The mainstream score waits for a fixed set of leading-artist audience checks and requires at least five matches covering 70% of their plays. The score stays still while deeper artists are checked separately.
- First setup prepares artist data, a saved recommendation board and a bundle of personal writing before the profile opens, with real stage progress and an early-preview option. Automatic findings include discoveries that stayed across months and older favorites to revisit. Large histories use a background calculation worker.
- Insights opens with a listening report and direct paths to questions, audience reach, and recorded findings. Optional AI liner notes, evolution explanations, era names, year writing, roasts, and question commentary follow the exact statistics. Common questions about artists, dates, years, skips, and late nights are calculated directly from the saved history, then AI can add a short note from the same evidence. Exact answers continue to work with AI off or unavailable. Writing appears automatically where relevant and uses cached results.
- Themes, local profile management, play-count rules, and an installable PWA with an offline app shell
- Local profile-picture overrides; Last.fm photos and authorized Spotify photos appear when available. Mood and musical key are not inferred from listening logs, which do not contain reliable audio features.

## Architecture

- `js/app.js` routes pages and handles app boot; `js/theme.js` shares theme controls with Settings.
- `js/core.js` owns profiles, IndexedDB archives, and merged analysis; `js/analysis.js` finds timelines, eras, and insights.
- `js/export.js` reads Spotify and ListenBrainz exports locally; `js/actions.js` updates archives.
- `js/sources/*` contains Last.fm, ListenBrainz, Spotify, and demo adapters.
- `js/preparation.js`, `js/dossier.js` and `js/recommendations.js` prepare and validate the personal report and saved discovery board.
- `js/meta.js` batches artwork through `functions/api/art.js` and enriches music metadata.
- `js/views/*` contains the landing page, onboarding, settings, connections, profiles, and detail pages.
- `styles.css` holds the app layout and theme tokens; `sleeve.css` adds the Sleeve visual language.
- `functions/api/ai.js` sends brief derived facts to fixed OpenRouter free models with provider data collection denied: Gemma 4 26B for automatic notes and short tasks, Qwen3.8 27B for questions and year writing. NVIDIA DiffusionGemma is available only for local development fallback; the developer endpoint is never used for public traffic. Results are cached, versioned, coalesced when identical requests overlap, and per-visitor requests are limited on a best-effort basis. The `ai-budget` Durable Object enforces a shared OpenRouter request budget once bound to the Pages project. Provider keys stay in Cloudflare secrets or `.dev.vars`, not frontend code.
- `sw.js` caches the app shell for offline use on HTTPS.

The existing `liner.*` browser storage keys, `LINER_CONFIG`, and `liner` Cloudflare/GitHub project identifiers remain in place so existing visitors keep their saved data and the current deployment continues to work.
