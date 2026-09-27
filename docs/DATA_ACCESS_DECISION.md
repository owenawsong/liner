# Listening data: launch decision and partnership check

Updated 2026-09-27. Sleeve is a working name.

## Decision

Do not present a public one-click Spotify login until Sleeve has an approved production integration. A new Spotify-only listener can start logging future plays through Last.fm or ListenBrainz today. An existing account with history opens immediately. A Spotify Account Data or Extended Streaming History file adds past plays whenever Spotify sends it. File import remains optional.

These are different jobs: live logging grows a record; Spotify's file fills in the past. A new Last.fm or ListenBrainz account does not create historical plays. The demo can show the completed product while the new user's record grows, but must remain labeled as example data.

## Access routes

| Route | Publicly usable now? | First-day past history? | Main constraint |
| --- | --- | --- | --- |
| Existing Last.fm or ListenBrainz username | Yes | Yes, if the account already logged plays | A new account starts empty. |
| New Last.fm or ListenBrainz connection to Spotify | Yes, through that service's setup | No lifetime history | Another account and Spotify authorization; plays arrive after connection. |
| Spotify Account Data ZIP | Yes | About the past year, once delivered | The listener must request and wait for the file. |
| Spotify Extended Streaming History ZIP | Yes | Lifetime history, once delivered | Preparation can take around 30 days. |
| Sleeve's own Spotify OAuth app | Five allowlisted users in development mode | No lifetime history | Public access requires Spotify approval. |
| ListenBrainz third-party connect-services flow | Only after MetaBrainz approves Sleeve for the scope | No confirmed historical backfill | MetaBrainz account, OAuth token, backend and approved scope. |

Spotify's documented extended-access criteria include an established organization, a launched service, and at least 250,000 monthly active users. We can ask Spotify about partnership, but cannot promise an exception.

## MetaBrainz route: what is confirmed

The user signs into or creates a MetaBrainz account first. Sleeve would obtain a MetaBrainz OAuth token containing `listenbrainz:connect-services`, call ListenBrainz from a backend, redirect the user through ListenBrainz's confirmation page and Spotify authorization, and receive a callback. ListenBrainz keeps the Spotify tokens. Its callback does not identify the ListenBrainz username; Sleeve needs the user identity from MetaBrainz OAuth or a user token. MetaBrainz grants the connect-services scope only to approved applications. We cannot put this button into the public site before approval.

The current public route needs no partnership: send the listener through ListenBrainz's own account and Spotify-connection pages, then read their public listens by username. It is already implemented in Sleeve, with the extra steps visible.

ListenBrainz says connected Spotify plays may arrive minutes later. Its precomputed statistics update daily, so Sleeve should compute early views from raw listens rather than waiting for those statistics. ListenBrainz currently posts a service notice that some statistics and weekly playlists are unstable; this needs checking again before launch.

## Questions for MetaBrainz

1. How should a small, free listening-history product apply for `listenbrainz:connect-services`? What are the review criteria and expected timing?
2. Does the approved flow support a newly created MetaBrainz account, and can we get the account identity back without asking for the username manually?
3. When a person connects Spotify, how many previous plays (if any) does ListenBrainz import? When should the first new play become available through the public API?
4. Can Sleeve calculate and show a user's insights from their ListenBrainz raw listens at public scale? Are there rate, attribution, consent, or commercial-support requirements?
5. Does MetaBrainz offer any other approved route that reduces signup steps while keeping users' Spotify authorization with ListenBrainz?

## Draft request — do not send without user authorization

To: support@metabrainz.org

Subject: ListenBrainz Spotify connection for a free listening-history app

Hello MetaBrainz team,

We're building a free web app that helps listeners explore their music history. It can already read a user's public ListenBrainz listens by username and calculate its own timeline and insights. We want new Spotify listeners to start recording through ListenBrainz without presenting the connection as our own Spotify API access.

Your third-party connect-services documentation describes an approved `listenbrainz:connect-services` scope and a redirect through ListenBrainz's Spotify authorization. Could you tell us how to apply for that scope, what you require from an application, and whether a newly created MetaBrainz account can complete the flow? We would also like to know whether any previous Spotify plays are imported at connection time, how the app should obtain the user's ListenBrainz identity after the callback, and what API-use expectations apply for a public free app.

We can share a working preview and a more detailed data-flow diagram if useful. Thanks for considering it.

## Before public launch

- Test the public ListenBrainz setup with a genuinely new account and record every screen, redirect, verification step, and time to first play. Browser inspection stopped at account creation; no account was created during this review.
- Test the same path with an existing ListenBrainz user and with a Spotify export. Check empty, one-play, and full-history states on desktop and phone.
- Seek MetaBrainz approval before building the third-party OAuth route into production. If approved, implement state validation, token handling, callback identity, reconnect, and deletion paths in Cloudflare Functions.
- Keep direct Spotify OAuth labeled as an advanced, personal developer-app route while Spotify's public access rules remain as documented.

## Sources

- [Spotify quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)
- [Spotify recently played API](https://developer.spotify.com/documentation/web-api/reference/get-recently-played)
- [Spotify data package contents](https://support.spotify.com/us/article/understanding-your-data/)
- [ListenBrainz third-party service connection](https://listenbrainz.readthedocs.io/en/latest/users/connect-music-services.html)
- [ListenBrainz data update intervals](https://listenbrainz.readthedocs.io/en/latest/general/data-update-intervals.html)
- [MetaBrainz contact page](https://metabrainz.org/contact)
