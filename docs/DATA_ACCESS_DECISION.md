# Listening data: launch decision

Updated 2026-09-27. Sleeve is a working name.

## Decision

Last.fm is the one public route for recording future Spotify plays. A visitor who already uses Last.fm can open their existing history by username. A new user creates a free Last.fm account, connects Spotify there, and starts a listening record with future plays. Sleeve reads that record by username.

Spotify Account Data and Extended Streaming History files remain optional. They add earlier plays after Spotify prepares the download. The demo shows what a fuller record looks like while a new user's record grows.

Keep direct Spotify connection available as an advanced personal developer-app route, without marketing it as public one-click login. Spotify development apps have a five-user allowlist, and the Web API does not supply lifetime listening history.

## What the first visit must explain

1. Connect Spotify to Last.fm to start recording.
2. A new Last.fm account has no past Spotify plays. Sleeve can show a new play after Last.fm records it; longer insights need more listening.
3. Explore the clearly labeled demo immediately if the new record is still empty.
4. Request a Spotify data file whenever the listener wants older plays. Account Data covers about a year; Extended Streaming History covers the account's lifetime and can take around 30 days to prepare.

The file is an enhancement, not a signup requirement.

## ListenBrainz status

ListenBrainz is not part of the public onboarding, landing page, or comparison choice. Its extra MetaBrainz account and connection steps add complexity without solving the missing past-history problem. Existing ListenBrainz profiles, imports, and bookmarked links remain readable so saved user data is not broken. Do not pursue a MetaBrainz integration for launch. The earlier outreach draft was not sent.

## Verify before public launch

- Walk through Last.fm signup and Spotify connection with a genuinely new listener. Record each screen and the time until their first play appears in Sleeve.
- Check Sleeve with an empty Last.fm profile, one new play, and an established account with history.
- Import both Spotify Account Data and Extended Streaming History ZIPs and verify the dates and merged play counts.
- Check the start flow and demo on desktop and phone.

## Sources

- [Spotify quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)
- [Spotify recently played API](https://developer.spotify.com/documentation/web-api/reference/get-recently-played)
- [Spotify data package contents](https://support.spotify.com/us/article/understanding-your-data/)
