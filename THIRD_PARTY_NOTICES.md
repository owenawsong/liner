# Third-party code and data

Sleeve's own source code is licensed under MIT. External services and materials retain their respective terms and rights.

| Component or source | Use |
| --- | --- |
| JSZip 3.10.1 | ZIP reading. Distributed under its MIT option; the public build includes the upstream license alongside the bundled script. |
| Wrangler and its dependencies | Development/build tooling only. Installed from the pinned npm lockfile; not served as public assets. Their package license files remain in the dependency installation. |
| Google Fonts: Archivo, Funnel Display, Funnel Sans, Geist Mono | Remote font styles and files. Fonts are not bundled by this build; consult their upstream authors' font licenses when self-hosting. |
| Last.fm | Public listening, catalogue, tags and artist audience data. A host must supply an API read key and follow Last.fm's terms. |
| MusicBrainz / Cover Art Archive / CritiqueBrainz | Music identity, artwork links and secondary community context. Individual databases, review content and images have their own licenses. |
| Deezer / iTunes | Artist photos and album/track artwork lookups. The code license does not license those images. |
| AcousticBrainz | Optional recording analysis with visible source and coverage; see [AUDIO_COVERAGE.md](docs/AUDIO_COVERAGE.md). |
| OpenRouter and model providers | Optional writing from derived facts. Provider and exact model terms must be reviewed by a production host. |

Sleeve is not affiliated with these services or with Spotify. Spotify direct access is an advanced personal developer-app flow; the app does not promise an unrestricted public Spotify login. Artwork is displayed for music identification, with external source/detail links where available. Do not include third-party artwork or personal listening exports in source releases.
