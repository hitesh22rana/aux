# Provider connection plan

Status: proposed implementation plan. Only the upper-right presence-badge fix is
implemented by this change. Existing Spotify connection and playback support remain
in place; this document does not announce new provider integrations.

Reviewed against official documentation on 3 November 2026.

## Product boundary

Aux owns the shared queue. The host's chosen music app plays the audio. Connecting
an account can unlock catalog or library access without unlocking remote playback.
Do not equate successful authorization with permission to control a native app.
No embedded players, audio proxying, unofficial provider APIs, browser automation,
or extracted session cookies are part of this plan.

Only the host needs a playback account. Guests continue joining and requesting
songs without provider login. Guest library imports, if added later, require a
separate private grant and never confer room playback control. Cross-service song
matching is a separate project: track IDs, storefront availability and versions
cannot be inferred reliably from a title.

## Provider feasibility

| Provider                            | Account / catalog path                                                                                  | Playback in the host's app                                                                                                       | Recommended next step                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spotify                             | Existing OAuth authorization-code flow with PKCE, refresh, profile and catalog access                   | Existing Web API controls the active supported player; playback requires Premium                                                 | Harden the existing connector and test real accounts/devices; confirm public-access eligibility before a broad launch                               |
| Apple Music                         | Server-signed developer token for catalog; MusicKit user authorization for personal library access      | A website's MusicKit player plays within the website. SystemMusicPlayer controls the Music app from a supported native Apple app | Ship catalog discovery first; add optional MusicKit authorization only for personal-library features. Keep web handoff; plan a companion separately |
| Amazon Music                        | Login with Amazon plus explicit Amazon Music API approval                                               | Native-app remote control is not established by generic Amazon login or catalog access                                           | Keep handoff. Request partner access before scheduling an account connector or claiming automatic playback                                          |
| YouTube Music                       | Google OAuth and YouTube Data API cover YouTube data, including permitted playlist access               | The documented Data API does not establish remote control of the native YouTube Music app                                        | Keep handoff. Evaluate a clearly labelled YouTube playlist-import feature separately; do not present Google login as native music control           |
| TIDAL, Deezer, JioSaavn, SoundCloud | Review each provider's current enrollment, scopes, catalog/library APIs and terms before implementation | No automatic native-app capability is verified by this plan                                                                      | Keep supported track-link handoff; prioritize a connector only after a verified user benefit and access path exist                                  |

Spotify development mode currently allows five authenticated, allowlisted users;
these are connected account holders, not all Aux room guests. The app owner must
have Premium. Extended access is a separate partner application, and the official
page currently lists organizational and scale requirements, including 250k MAUs.
Do not assume an individual developer can remove the allowlist simply by submitting
an app. Provider policy and production access are release gates, not engineering
estimates. Do not promise a particular approval timeline or outcome.

Amazon's V1 and V2 documentation both say closed beta. Its V2 preview explicitly
advises existing production partners to continue V1. LWA alone does not grant
Amazon Music approval. Choose the approved API version with Amazon before building;
do not mix V1 and V2 hosts, authentication headers or payload contracts.

## Connection experience

1. The host chooses the room's music service. Everyone can still use its handoff
   flow if automatic control is unavailable.
2. In Room settings, the host sees a Connections section with the selected service,
   a short capability description, and a Connect action only for implemented,
   configured and approved account flows.
3. Authorization happens on the provider's trusted consent screen or official SDK.
   The callback returns to the same authorized host room. Cancel and denied-consent
   paths return safely without changing the queue.
4. Show the authorized account's safe display label and separate states for account
   connection and playback readiness: for example Connected, then Open the music
   app / Choose a device / Reconnect / Subscription needed as applicable.
5. The host can reconnect or disconnect. Disconnect prevents future dispatch and
   preserves queued requests. It does not claim to stop audio already playing.
   Unsupported or unapproved services retain Open in music app and confirmation.

An expired token, missing scope, inactive device, lost companion connection, and
provider outage are different states. Do not collapse them into Connected or
consume a request merely because a link opened or authorization succeeded.

## Scope and ownership

For the first iteration, retain room-scoped host connections and their 24-hour
lifetime. This matches today's permission model and keeps provider authorization
independent of creating an Aux account. Do not silently turn a room cookie into a
permanent personal identity or migrate existing grants into reusable profiles.

Reusable connections across rooms should be a subsequent explicit feature:
introduce a stable Aux owner identity with recovery and deletion, bind provider
grants to that owner, and grant rooms temporary access. Enforce one playback lease
per provider account/device as applicable, so two room workers cannot compete.
Ending a room revokes its lease, not an unrelated personal grant. The decision on
Aux sign-in and recovery belongs before that persistence feature is implemented.

## Engineering design

Extend the current code rather than building a universal SDK framework:

- Keep catalog search, user authorization, private-library access and playback as
  separate capabilities. Retain the existing small PlaybackControl port.
- Replace the single remote/handoff assumption incrementally with a validated
  capability snapshot: catalogSearch, personalLibrary, remotePlayback and
  companionPlayback. Derive effective capability from provider support, deployment
  approval, granted scopes, account eligibility and device availability.
- Generalize room-bound connection storage only when adding the second credential
  adapter. Retain the current Spotify schema through a tested migration or adapter;
  never duplicate or lose active grants while both readers exist.
- Store provider identity, granted scopes, expiry, status and necessary region or
  storefront metadata. Encrypt persisted secrets with authenticated binding to the
  owner/room and provider; version the envelope for key rotation.
- OAuth providers use one-time expiring state, PKCE where supported, host-session
  binding, exact registered callback URLs and explicit account confirmation when
  replacing an existing grant. Never accept arbitrary callback destinations.
- Keep refresh tokens and signing keys server-side. Apple uses MusicKit's own
  authorization model: the developer signing key stays on the server, while the
  official web SDK may need a user authorization token in the host browser. Never
  distribute that token to guests or treat it as a normal OAuth refresh token.
- Serialize refresh attempts per grant, handle rotated refresh tokens atomically,
  and map invalid grants to Reconnect. Observe Retry-After/backoff and cache public
  catalog results by provider, query and market without mixing private libraries.
- Return minimal connection metadata to the host. Guests receive only the room's
  playback capabilities, with no credentials, private library or account identity.
- Keep accepted requests, CAS updates, leases, outbox delivery and uncertain-command
  reconciliation intact. A new connector cannot bypass these invariants.
- A future native companion needs device pairing, revocable credentials, command
  IDs, acknowledgments, observed playback state and reconnect reconciliation. A
  server command alone is not proof that SystemMusicPlayer started the track.

## Delivery sequence and acceptance

1. **Spotify readiness:** verify dashboard access, callbacks, existing scopes,
   token refresh/rotation, account conflicts and real-device playback. Verify denied
   consent, inactive/restricted players, expired grants, rate limits and disconnect
   during dispatch. This is the first implementation slice, not a rewrite.
2. **Shared connection UI:** expose honest capability/readiness states for Spotify
   using the current host authorization. Keep all other providers in handoff mode.
   Refactor shared contracts only around this working connector.
3. **Apple catalog:** configure media identifier/key, signed developer tokens and
   storefront-aware search/track lookup. Keep audio in the native app via handoff.
   Add personal-library consent only when that feature is included in the slice.
4. **Apple companion proof of concept:** separately verify authorization,
   subscription, SystemMusicPlayer control and background behavior on a physical
   supported Apple device before planning broad native automation.
5. **Amazon partner gate:** seek approved Music access in parallel with the above.
   After approval, verify scopes, API version and actual playback targets in a
   small spike, then implement only the capabilities confirmed by that spike.
6. **Other providers and reusable profiles:** select by demonstrated demand and
   official access. Plan persistent identity/recovery before cross-room reuse.

Each executable slice requires Valibot boundary validation, server-side host/owner
checks, cross-room isolation and replay tests, credential-safe logs, migration and
revocation tests, and React Doctor before pushing. Real provider authentication
and playback need manual validation with actual accounts and devices. Browser
automation remains opt-in under the user's current testing preference. No new
connector is implemented or advertised until its acceptance checks pass.

## Official references

- [Spotify quota modes and partner eligibility](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)
- [Spotify Start/Resume Playback, scopes and Premium requirement](https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback)
- [Apple MusicKit, catalog and authorization](https://developer.apple.com/musickit/)
- [Apple SystemMusicPlayer](https://developer.apple.com/documentation/musickit/systemmusicplayer)
- [Amazon Music V1 overview and approval](https://developer.amazon.com/docs/music/API_web_overview.html)
- [Amazon Music V2 preview and enrollment](https://developer.amazon.com/docs/music/API_web_overview_v2.html)
- [YouTube Data API supported resources and OAuth](https://developers.google.com/youtube/v3/getting-started)
