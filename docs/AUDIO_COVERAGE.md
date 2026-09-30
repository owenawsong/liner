# Sound coverage pilot — September 30, 2026

## What was actually checked

The requested audit was the top 100 tracks in Sleeve's generated demo. The demo contains **71 distinct song + credited artist + album identities**, so all 71 were attempted. No additional songs were invented to fill the quota.

The completed audit is saved in [audio-pilot.json](audio-pilot.json). It includes each queried source identity, match status, verified recording MBID, available source values, provenance, and timestamps. One checkpointed retry of failed identity requests was run.

| Result | Count |
| --- | ---: |
| Available track identities audited | 71 |
| Strict, unique MusicBrainz recording matches | 47 |
| Ambiguous identities rejected | 13 |
| No qualifying identity match | 9 |
| MusicBrainz requests still unavailable (HTTP 503) | 2 |
| Matched recordings with usable tempo and key | 19 |
| Matched recordings absent from AcousticBrainz low-level results | 28 |
| Covered counted plays | 13,083 |
| All counted demo plays | 55,365 |
| Play coverage | 23.63% |

This is sufficient to display **the covered listening's** analyzed tempo and keys. It does not support claims about every song or population averages. Recent years have weaker coverage and are omitted from tempo trends when they fail the per-year gate.

## Identity policy

1. Query MusicBrainz recording search using the song title, artist and source album, where present.
2. Require search score ≥ 95 and exact normalized title.
3. Require the **complete credited artist string**, including collaborations and join phrases, to match the source artist.
4. Require an exact source album title among the recording's releases if the source includes an album.
5. Reject live, remix, instrumental, acoustic, demo, alternate or similar versions unless the source explicitly specifies that version.
6. Deduplicate identical MBIDs. Accept only one remaining recording; multiple candidates are ambiguous.

This deliberately sacrifices match rate rather than transferring another recording's analysis. Even verified catalogue identity cannot guarantee a crowdsourced submission was labeled correctly. If an AcousticBrainz submission explicitly names a different recording MBID, its features are rejected.

## Data and presentation

- AcousticBrainz bulk requests contain at most 25 recording IDs. The audit retrieves low-level tempo and tonal key descriptors, then high-level classifier output separately.
- Tempo is an automatic beat-rate estimate. Key is an automatic tonal estimate, shown only with analyzer strength ≥ 0.5. Neither is a human-reviewed truth; tempo octave errors and different submissions are possible.
- Happy, acoustic, electronic and danceable outputs are **classifier probabilities**, not Spotify features or facts about the listener's emotional state. They remain in a separate optional explanation; they are not used as measured listening statistics or compared with an invented average.
- Overall charts need at least 10 sound-covered songs and coverage of 10% of all counted plays, with a minimum of 100 covered plays.
- A tempo year needs at least 30 tempo-covered plays and 20% tempo coverage in that year. Absent years are not interpolated.
- Coverage includes all currently counted plays in its denominator. An album match applies only to that album identity, not every same-titled song. Listening exclusions are respected when coverage is recomputed.
- The displayed demo snapshot contains synthetic listening, with genuinely retrieved recording identities and AcousticBrainz analyses. Real user audits are optional and use their own source identities.

## Operation

Deep dive or Data → Sound data starts an optional audit. It never blocks first-profile preparation. MusicBrainz lookups use the existing shared ≥ 1.1-second polite queue; each network request has a 12-second timeout. Progress is checkpointed after each identity and sound batch. Pausing or leaving the current section stops new requests; resuming reuses completed lookups and retries errors.

`node scripts/audio-pilot.mjs` reproduces or resumes the saved demo audit. Existing successful lookups are reused. The public demo snapshot is explicitly staged as `/audio-pilot.json`.

`forgetAudioAudit(pid)` aborts tracked jobs, waits for pending writes, then deletes the profile's saved audit. `cancelAllAudioAudits()` aborts all jobs and waits for pending writes before a full storage wipe. Forgotten jobs cannot refill deleted storage.

Only song, artist and album query strings are sent to MusicBrainz. Audio files and the raw listening history are not uploaded.

## Primary sources

- [MusicBrainz recording identity](https://musicbrainz.org/doc/Recording): studio, remix and live recordings are distinct audio entities.
- [AcousticBrainz API](https://acousticbrainz.readthedocs.io/api.html): bulk schema, omitted absent records, individual descriptors and rate limiting.
- [AcousticBrainz project](https://acousticbrainz.org/): collection ended in 2022; historical data and API remain available, with data licensed CC0.
