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
| Last.fm | A username | Recent plays, top lists, and optional full-history import. A newly created account starts logging future plays; it has no earlier Spotify history. |
| ListenBrainz | A username | Open live listening data and optional history import. A newly created account starts logging future plays. Large histories can take time, so its export file is also accepted. |
| Spotify Account Data or Extended Streaming History | The ZIP Spotify emails you | Account Data covers about a year; Extended History covers the life of the account and includes skips and devices. The ZIP is opened in the browser and is never uploaded. |
| Direct Spotify, advanced | Your own Spotify developer app and Client ID | Now playing, recent plays, Spotify top lists, and skip tracking while Sleeve is open. Uses browser PKCE and is not a public one-click Spotify login. |

The `#/start` page helps visitors pick a route. `#/demo` shows the full experience without setup. When an archive and a live source overlap, the archive is used through its final day and newer live plays follow it.

The public access strategy, MetaBrainz approval requirements, and a draft partnership request are in [docs/DATA_ACCESS_DECISION.md](docs/DATA_ACCESS_DECISION.md).

## Explore

- Overview, Top 100 with plays or minutes and date filters, Timeline, Insights, Clock, and Data tabs
- Automatic eras, year pages with a shareable image, and detailed artist and song pages
- Search, genres, listening anniversaries, and compare
- Optional AI liner notes, roasts, era names, year writing, and questions. Turning AI off in Settings leaves the listening analysis available.
- Themes, local profile management, play-count rules, and an installable PWA with an offline app shell

## Architecture

- `js/app.js` routes pages and handles app boot; `js/theme.js` shares theme controls with Settings.
- `js/core.js` owns profiles, IndexedDB archives, and merged analysis; `js/analysis.js` finds timelines, eras, and insights.
- `js/export.js` reads Spotify and ListenBrainz exports locally; `js/actions.js` updates archives.
- `js/sources/*` contains Last.fm, ListenBrainz, Spotify, and demo adapters.
- `js/meta.js` batches artwork through `functions/api/art.js` and enriches music metadata.
- `js/views/*` contains the landing page, onboarding, settings, connections, profiles, and detail pages.
- `styles.css` holds the app layout and theme tokens; `sleeve.css` adds the Sleeve visual language.
- `functions/api/ai.js` sends brief derived facts to server-side model providers. The provider keys stay in Cloudflare secrets or `.dev.vars`, not frontend code.
- `sw.js` caches the app shell for offline use on HTTPS.

The existing `liner.*` browser storage keys, `LINER_CONFIG`, and `liner` Cloudflare/GitHub project identifiers remain in place so existing visitors keep their saved data and the current deployment continues to work.
