# Sleeve data handling

Updated October 10, 2026. This describes the code in this repository; a host must disclose any additional analytics, logging or policies it enables.

## Your listening record

Sleeve does not create a user account. Listening imports, merged records, exclusions, recommendations, ratings, profile-picture overrides and preferences are saved in this browser's local storage and IndexedDB. Spotify history ZIPs are read locally and are not uploaded. A Last.fm username retrieves public profile and listening data from Last.fm; visits and requests still reach the relevant providers and the site's host.

Artist details, audience counts, catalogue suggestions, artwork and optional sound audits send the relevant music names or recording identifiers to their data sources. Sources currently include Last.fm, MusicBrainz, CritiqueBrainz, AcousticBrainz, iTunes, and Sleeve's Deezer artwork proxy. Album of the Year and Rate Your Music links open those sites; their ratings are not scraped or imported. Google Fonts is requested for the interface. Source providers receive ordinary network metadata associated with their requests.

## AI writing

AI writing is enabled by default and can be disabled in **Settings → AI writing** before connecting a profile or opening a history file. It runs automatically during preparation when available. Sleeve sends a compact derived summary containing measured findings, favorite music and sometimes a display name to its server, then to OpenRouter and the selected model provider. Raw listening history is not sent. Public routes request provider data collection be denied; this is a routing policy, not a promise of zero provider retention.

Generated responses are cached on the server for seven days under hashed request identities. The browser also caches generated results. Server diagnostics include task/model/status/timing and do not intentionally include summary bodies or response text. Hosting infrastructure may record ordinary access metadata according to the hosting account's configuration. NVIDIA developer inference is restricted to local preview fallback. Personal OpenRouter authorization is not currently implemented.

## Removing data

Remove a profile or use **Settings → Clear everything** to delete this browser's stored copies. Export any shelf backup you wish to keep first. Removing local records does not erase earlier seven-day server-cache entries or data retained by external services. There is no server-side account identifier that lets the current code locate and erase every cached response for a person. A production host must provide an appropriate contact/reporting route and describe its own handling of requests.

## Rights and portability

The code's MIT license does not grant rights to music, artwork, provider databases or model outputs supplied under separate terms. Recommendation shelf JSON can be exported and imported. Keep the original Spotify export as your portable source record.
