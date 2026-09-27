# Liner

The complete record of your listening. Free Spotify stats built around time: a month-by-month timeline, automatic eras, a listening clock, and insights like obsessions, comebacks and streaks. No accounts, no server, nothing uploaded.

## Run it

```bash
python -m http.server 5178 --directory .
```

Open http://localhost:5178. It's plain HTML, CSS and ES modules with no build step. For direct Spotify mode, open http://127.0.0.1:5178 instead (Spotify rejects `localhost` redirect URIs).

## Data sources

| Source | Needs | Gives |
| --- | --- | --- |
| Last.fm | A free API key in Settings or `config.js` | Live now playing, recent plays, top lists, full-history import |
| ListenBrainz | Nothing | The same, fully open. Big histories import slowly (about 1,000 listens per 15 s), so its export file is also accepted |
| Spotify export | The user's ZIP | Every play with exact listening time, skips, shuffle and device |
| Spotify direct | Spotify Premium and the user's own developer app (PKCE, no server) | Now playing with progress, last 50 plays, top lists, skip tracking while open |

Without a Last.fm key, Last.fm lookups are simulated. The usernames `hiddenuser`, `staleuser`, `newuser` and `nobody` preview each connection state.

## Features

- Live now playing, recent plays and top lists from each source
- Full-history import from Last.fm or ListenBrainz, or a Spotify / ListenBrainz export file
- Timeline with automatic eras, year-by-year summaries, and a Year in review page with a shareable PNG card
- Artist and song pages: plays over time, first play, biggest month, longest break, skip rate, genres and origin
- Insights, listening clock, On this day, genre breakdown, and search across your whole history (press `/`)
- Real cover art from iTunes Search and artist details from MusicBrainz, fetched slowly and cached in the browser
- Installable as an app (manifest and service worker), with the app shell available offline

## How it fits together

- `js/app.js`: router, theme picker, settings, drop-anywhere, Spotify sign-in callback
- `js/core.js`: shared state, remembered profiles, archives in IndexedDB, cached analysis
- `js/analysis.js`: timeline, eras, listening clock and the insight detectors
- `js/export.js`: reads Spotify and ListenBrainz export files in the browser
- `js/actions.js`: adding exports and importing live histories
- `js/sources/*`: Last.fm, ListenBrainz, Spotify and the demo persona
- `js/meta.js`: cover art (iTunes) and artist genres and origin (MusicBrainz), rate-limited and cached
- `js/views/*`: home, connect flows, profile tabs, and artist, song and year pages (`detail.js`)
- `js/components.js`, `js/ui.js`: rendering helpers, generated record sleeves, formatting
- `styles.css`: tokens for six themes (Paper, Graphite, Cobalt, Midnight, Mono, Riso) plus Auto

When a profile has both an export and imported live history, the export is used up to its last day and live plays after that.
