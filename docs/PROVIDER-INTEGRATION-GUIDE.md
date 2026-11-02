# Provider account integration guide

Research date: **3 November 2026**. This is a sourced setup and implementation guide,
not a claim that new connectors have shipped or that provider approvals were obtained.
The current app connects Spotify accounts. The other seven services use track-link
handoff. Reading public documentation does not verify live account/device playback.
Some retrieved documentation was served from recent provider-page caches; recheck
linked requirements and the relevant dashboard immediately before enrollment or launch.

See [PROVIDER-CONNECTIONS.md](PROVIDER-CONNECTIONS.md) for the proposed architecture
and [SETUP.md](SETUP.md) for commands supported by the application today.

## 1. What a connection can provide

Track these independently:

- **Catalog access:** search and verified track metadata; may use app credentials
  without connecting a listener's account.
- **Account access:** authorized library, playlists, region or profile data.
- **Playback access:** the ability to control a specific player or device.

Aux continues to own requests and queue order, and the host's music app plays audio.
Guests do not need provider login to join or request songs. Account consent must not
be presented as proof that native-app playback control is available. Provider-hosted
embedded players, stream URLs and unofficial session-cookie APIs are outside the
current product boundary. Cross-service matching also remains a separate feature.

| Service       | Official account path                                               | Registration / release gate                                                               | Fit for Aux's playback model                                                             |
| ------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Spotify       | Authorization Code + PKCE; already implemented                      | Premium for playback; allowlisting in development; separate public partner eligibility    | Remote commands to a supported active Spotify player                                     |
| Apple Music   | MusicKit authorization + signed developer token                     | Apple Developer Program, MusicKit identifier/key, consent; subscription for full playback | Web remains handoff; native Apple companion can use SystemMusicPlayer                    |
| Amazon Music  | Approved Music scopes through Login with Amazon                     | Music APIs remain closed beta; LWA registration alone is insufficient                     | Handoff; documented Web Playback queue model conflicts with Aux's requirements           |
| YouTube Music | Google OAuth for YouTube Data API features                          | Google Cloud configuration, applicable verification and quotas                            | Data/playlist access can help discovery; no native Music remote-control path established |
| TIDAL         | Official OAuth with PKCE and optional app-level catalog credentials | Developer app, permitted scopes/access tier and terms                                     | Catalog/library candidate; public Player SDK previews are not native-app remote control  |
| SoundCloud    | Official OAuth 2.1 with PKCE; app credentials for public resources  | Artist Pro needed by developer for API app registration; API terms apply                  | Catalog/library candidate; keep playback handoff                                         |
| Deezer        | Developer app and OAuth, conditional on granted access              | Deezer staff announced restrictions on new individual API access; reopening not verified  | Keep handoff pending confirmed enrollment and API entitlement                            |
| JioSaavn      | Public self-service OAuth/API route not verified                    | Obtain official integration terms through Partnerships & Business Development             | Keep handoff; do not substitute an unofficial API                                        |

## 2. Prepare once for every provider

Before filling in dashboards, collect:

1. A stable production HTTPS domain, separate development/staging origins, a public
   home page, product description, logo, support contact and domain ownership access.
2. A privacy policy describing collected data, purposes, retention, sharing and
   deletion. Add terms and an accessible Disconnect/delete-data experience.
3. The legal person or organization responsible for the app and an accurate list of
   target regions, features and requested permissions. Do not describe approval-only
   playback as an existing capability.
4. Secret storage and access controls for client secrets, signing keys and encryption
   keys. Separate credentials for environments where provider policy permits.
5. Exact callback/origin configuration per provider. Apple MusicKit authorization is
   an SDK flow, so it does not inherit Spotify's OAuth callback requirements.
6. Test account holders, subscription eligibility and physical host devices. External
   service setup, consent or partner applications must be completed by the owner;
   no account registrations or applications were submitted during this research.

The current repository has no production privacy-policy, terms or account-deletion
pages. These are concrete work items before requesting broad account-data access,
not pages this guide has implemented.

### Credential inventory

Only the Spotify and Aux variables below are currently read by application code.
All other names are **proposed configuration**, not settings that enable a connector
merely by adding them to `.env.local`. Store secrets in deployment configuration;
do not send them in chat or commit them.

| Service      | Values needed                                                                                                                                   | Current implementation                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Aux          | `AUX_TOKEN_ENCRYPTION_KEY`, Redis configuration, persistent shared SQLite directory                                                             | Implemented; web and worker share storage and encryption key           |
| Spotify      | `SPOTIFY_CLIENT_ID`, `SPOTIFY_REDIRECT_URI`                                                                                                     | Implemented; chosen PKCE flow does not require a Spotify client secret |
| Apple Music  | Proposed `APPLE_TEAM_ID`, `APPLE_MUSIC_KEY_ID`, protected MusicKit `.p8` key reference, permitted web origins                                   | Not implemented                                                        |
| Amazon Music | Proposed LWA client ID, confidential-client secret, return URL and approved Music scopes; V1 Security Profile ID or V2 stable device identifier | Not implemented; partner approval first                                |
| YouTube      | Proposed Google web client ID/secret, redirect URI; optional restricted API key for public-data requests                                        | Not implemented                                                        |
| TIDAL        | Proposed client ID, client secret for app-only catalog requests, registered redirect URI and approved read scopes                               | Not implemented                                                        |
| SoundCloud   | Proposed client ID/secret and registered redirect URI                                                                                           | Not implemented                                                        |
| Deezer       | App credentials, permitted domain/redirect and exact authorized permissions if access is granted                                                | Enrollment/API contract must be confirmed first                        |
| JioSaavn     | Whatever credentials, scopes and environments an official agreement specifies                                                                   | No public configuration contract verified                              |

Do not put private secrets behind a `NEXT_PUBLIC_` variable. Client IDs and intended
browser developer tokens are different from client secrets or private signing keys.

## 3. Spotify: usable today, public rollout requires eligibility

### Developer setup

1. Sign in to the [Spotify dashboard](https://developer.spotify.com/dashboard), create
   a Web API app and record its Client ID. Keep the app owner on Premium for
   development-mode access.
2. Register the exact local URI:
   `http://127.0.0.1:3000/api/spotify/callback`.
3. Register a separate production URI:
   `https://YOUR_DOMAIN/api/spotify/callback`. Replace the domain placeholder.
   HTTPS is required outside loopback IP addresses. `localhost` is not accepted by
   Spotify; casing, path and trailing slashes must match. Open Aux at the same origin
   as the configured callback so its host cookie is present.
4. In Users Management, allowlist the Spotify accounts that will connect as hosts.
   Current standard development-mode access is five authenticated users; grandfathered
   apps can differ. Room guests who never authorize Spotify are not additional OAuth
   users, but all activity still shares the application's API limits.
5. Configure `.env.local`, generate the Aux key once and restart web and worker:

   ```dotenv
   SPOTIFY_CLIENT_ID=YOUR_CLIENT_ID
   SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/api/spotify/callback
   AUX_TOKEN_ENCRYPTION_KEY=YOUR_64_CHARACTER_HEX_KEY
   ```

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   Keep the existing encryption key if credentials already exist. Replacing it
   without migration makes existing encrypted records unreadable.

6. Create a Spotify room, connect from the host controls, complete consent and open
   the Spotify app. Use an eligible Premium account with an active, controllable
   player; authorization alone does not create or activate a device.

### Scopes, requests and tokens

Current Aux requests `user-read-playback-state`, `user-modify-playback-state` and
`user-read-private`. It does not need library-write, playlist-write or email access
for the shared queue. Optional private-playlist/library imports would need separately
verified read scopes and consent. Do not add permissions speculatively.

The existing authorization endpoint is `https://accounts.spotify.com/authorize`;
code exchange and refresh use `https://accounts.spotify.com/api/token`. PKCE uses
S256. Aux already binds one-time state to the host cookie, stores credentials
server-side with authenticated encryption, and prevents two active rooms from
controlling the same Spotify account. Preserve refresh serialization, rotated
refresh tokens and the existing uncertain-command recovery behavior. [S1-S4]

### Production and current API changes

The public eligibility gate is significant. Spotify's quota page currently accepts
new partner applications from organizations, listing a launched service, qualifying
markets, commercial viability and **at least 250k monthly active users**. Approval
is not automatic. Decide whether Aux is a private allowlisted deployment or needs a
provider-approved public rollout before promising unrestricted connections. [S1]

The 2026 migration guide limits development-mode search pages to ten results and
changes several library/playlist endpoints and fields. Aux already searches with
`limit=10`; future imports must use the current endpoint contract. The same guide
notes that a July update raised Client IDs per developer to 25; do not copy its older
one-client table without that correction. Client-ID count does not remove the
five-user allowlist gate. [S5]

Rate limits and quota buckets are distinct. Handle 429 and provider retry guidance;
do not hardcode a universal requests-per-minute allowance. Before monetizing or
launching publicly, review Spotify's Developer Policy for the exact use case,
including playback and broadcasting restrictions. Remote control does not grant
additional music rights. [S1, S3]

## 4. Apple Music: catalog, authorization and native control are separate

### Enrollment and credentials

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/enroll/).
   Apple lists USD 99 per membership year, with regional pricing/taxes and possible
   fee waivers. An organization's enrollment also has legal-entity and verification
   requirements.
2. In Certificates, Identifiers & Profiles, create the MusicKit/media identifier and
   associated private key. Record Team ID and Key ID; keep the downloaded `.p8` key
   in protected server storage with a recovery/rotation procedure.
3. Generate developer JWTs server-side with ES256, the key ID and Team ID, issue time
   and expiration. Apple's documented maximum lifetime is 15,777,000 seconds; prefer
   a shorter operational lifetime. For web tokens, configure the recommended origin
   claim for the approved origins. Never expose the signing key. [A1-A2]

### Features and consent

Catalog lookup uses the developer token and a storefront, so catalog search does
not require every guest to connect an Apple account. Region, explicit-content
availability and catalog IDs must be respected.

For personal-library access, integrate official MusicKit on the Web and request
user authorization from an explicit host action. MusicKit manages the Music User
Token for web clients. Personalized requests need both the developer authorization
and the user's token, either through the SDK or the documented headers. Treat this
as Apple's authorization lifecycle, not as a standard refresh-token OAuth adapter.
Keep browser-required tokens scoped to the host and never share them with room
guests. [A2-A3]

### Native playback

MusicKit web playback plays inside a website, which is outside Aux's current audio
model. On supported Apple platforms, SystemMusicPlayer can control the Music app
from a native application. A future companion needs MusicKit authorization,
subscription checks, appropriate app configuration, device pairing and observed
playback acknowledgments. Validate foreground, background and reconnect behavior
on physical devices. This is not achieved by adding an Apple Connect button to
Next.js. The same native-control path is not established for Android. [A4-A5]

For web v1, ship catalog discovery and keep native-app handoff. Add account consent
when a personal-library feature actually needs it. Handle 401/403 and 429; the
reviewed Apple page does not publish a universal numeric request allowance. [A2]

## 5. Amazon Music: approval first, then verify model compatibility

### Partner and application requirements

1. Obtain approved Amazon Music API access through Amazon's business-development
   contact. Current V1 and V2 documentation say closed beta. A general Amazon
   developer account or a working Login with Amazon button is insufficient.
2. Once approved, register/configure the LWA Security Profile and the web return
   URL. Obtain client credentials and agree which Music scopes and API version are
   enabled for Aux. Do not presume all listed scopes are provisioned.
3. Use server-side authorization-code exchange and refresh. LWA supports PKCE;
   use S256 and mandatory state in Aux. Browser-only exchange has different refresh
   behavior, so follow the approved server-side flow. Common authorization and token
   hosts are `https://www.amazon.com/ap/oa` and
   `https://api.amazon.com/auth/o2/token`; regional token hosts are also documented.
4. Request `music::catalog` for catalog search. Add `music::library:read` only for
   personal library/playlist reads and `music::profile:read` only if needed. The
   general LWA `profile` scope is not a substitute for Music entitlements. [M1-M3]

### Keep versions separate

| Contract              | V1                                                          | V2 preview                                                  |
| --------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| API base              | `https://api.music.amazon.dev/v1`                           | `https://api.music.amazon.com/v2`                           |
| Authorization         | OAuth bearer                                                | OAuth bearer                                                |
| Additional identifier | `x-api-key`: enabled LWA Security Profile ID, not client ID | `X-Amzn-Device-Id`: stable device identifier                |
| Response shape        | Usually `data` envelope                                     | Resource at top level                                       |
| Release guidance      | V2 docs say existing production partners should continue V1 | Closed beta / preview; agree access and version with Amazon |

Scopes, limits and compatibility must be validated against the chosen version.
Refresh before `expires_in`; handle rejected/revoked credentials and 429 backoff.
Do not copy one version's headers into the other. [M1-M3]

### Important playback conflict

The documented Web Playback API is a playback client integration. Its rules say
Amazon must control the playback queue, and require reporting playback start/stop
and other lifecycle events. It is not evidence of a generic remote-control API for
an already-running native Amazon Music app. This conflicts with simply feeding
Aux's queue through an interchangeable Spotify-like adapter. [M4]

Therefore, maintain handoff. After approval, explicitly ask Amazon whether an
approved native-app control path meets Aux's queue/audio model. Catalog and library
integration can be considered independently. Do not implement Amazon's embedded
queue as a workaround or claim approval alone solves playback.

## 6. YouTube Music: Google account access, YouTube data integration

### Project and OAuth setup

1. Create a Google Cloud project and enable YouTube Data API v3.
2. Configure Google Auth Platform branding, audience, support contact, domains and
   data access. Add test users while the application is in Testing.
3. Create an OAuth client of type Web application. Register exact development and
   production redirect URIs for the connector route we eventually implement.
   Google permits localhost development callbacks; this differs from Spotify.
4. Keep the web client secret server-side. For public search/metadata without private
   account data, an appropriately restricted API key may suffice; that key does not
   authorize a user's private playlists.
5. For a read-only account feature, start with
   `https://www.googleapis.com/auth/youtube.readonly`. Do not request upload, deletion
   or broad account-management access for a playlist picker. Use the documented
   authorization-code flow, server-side token exchange, verified state and offline
   access when refresh is needed. Preserve an existing refresh token when the
   provider does not return another one. Authorization uses
   `https://accounts.google.com/o/oauth2/v2/auth`; code exchange/refresh use
   `https://oauth2.googleapis.com/token`. [Y1]

### Testing, verification and quota

External OAuth applications in Testing receive refresh tokens that expire in seven
days when requesting YouTube scopes. Basic identity-only exceptions do not apply
here. Moving publishing status is separate from verification; check the chosen
scopes' classification and applicable exceptions. [Y2-Y3]

For verification, prepare a public functional home page, domain ownership, a linked
privacy policy explaining Google-data handling, accurate consent branding, scope
justifications and a demonstration video when requested. A separate independent
security assessment should not be asserted for every OAuth app; requirements
specifically depend on requested scopes and Google's review. [Y3]

The reviewed quota page currently lists 100 `search.list` calls/day, 100
`videos.insert` calls/day, and 10,000 units/day for other methods, with separate
buckets and one unit per search call. This differs from older guides describing
100 units per search from one shared allocation. Confirm the actual project's
quotas in Cloud Console before capacity planning, and recheck the official table
rather than hardcoding either historical or current example values. Extra pages
consume quota too. Quota extensions have a separate compliance/audit process. [Y4]

### What this does not provide

The documented API supplies YouTube resources and permitted account/playlist data.
It does not establish a remote-control endpoint for the native YouTube Music app.
Do not claim it returns every YouTube Music library construct or behaves like the
Music app's private APIs. Validate the actual supported playlists and media before
advertising import completeness. Keep playback handoff; no hidden IFrame player,
audio-only extraction or unofficial browser-cookie connector. [Y1, Y5]

A disconnect feature must revoke authorization where supported and delete relevant
stored provider data under YouTube's policy. The policy includes a 30-calendar-day
outer limit for the applicable revocation-related deletion cases; implement prompt
cleanup rather than using that ceiling as a default retention period. [Y5]

## 7. TIDAL: official catalog and account-access candidate

1. Create a TIDAL account and sign into its developer dashboard; accept the platform
   guidelines. Register an app with accurate product details. TIDAL recommends
   separate development and production applications.
2. Obtain Client ID and Client Secret. Client Credentials can access app-level
   catalog data, with secrets kept on the server; this grant does not represent a
   user. Use JSON:API contracts and the applicable country code.
3. Register the connector redirect URI. For user-owned resources, implement
   Authorization Code + S256 PKCE and verify state. Official endpoints are
   `https://login.tidal.com/authorize` and
   `https://auth.tidal.com/v1/oauth2/token`.
4. Enable only the scopes required by the specific library/playlist endpoints in
   the current API reference and dashboard. The reviewed general auth guide does
   not enumerate a complete read-scope list, so this guide does not invent one.
   Endpoint access tier and issued scope grants must both be checked.
5. Implement refresh using returned lifetimes or the official Auth SDK. Do not
   treat an example `expires_in` as a guaranteed fixed lifetime. [T1-T3]

The public SDK overview authorizes previews through its unmodified Player module;
that is not a native-app remote-control interface and does not meet Aux's current
playback model. Terms and embeds can have distinct playback allowances; none should
be generalized into a promise of automatic native-app playback. Catalog search and
permitted private-library features remain useful independent candidates. [T3]

TIDAL's published Developer Terms specify non-commercial offerings under that
standard agreement. Confirm a suitable agreement before planning a monetized
connector; self-service registration is not evidence of unrestricted commercial
permission. [T5]

## 8. SoundCloud: viable official auth, with registration and refresh details

1. The developer registering an API application needs **Artist Pro**, according to
   SoundCloud's current registration guide. This is a developer-enrollment
   requirement, not a requirement that every Aux guest purchases Artist Pro.
2. Register through the documented API CLI or the Your Apps browser page. Provide
   accurate app name, description, website and redirect URI; retain Client ID and
   Client Secret securely. Review the CLI before executing any downloaded code. No
   registration command was executed during this research. [C1]
3. The guide specifies OAuth 2.1 with PKCE. Use the server-side authorization-code
   exchange and state validation at `https://secure.soundcloud.com/authorize` and
   `https://secure.soundcloud.com/oauth/token`. Current clients are confidential;
   PKCE does not eliminate the client secret here as it does in Aux's chosen
   Spotify flow.
4. Public resources can use app credentials; private data needs user authorization.
   SoundCloud's documented API authorization header is `Authorization: OAuth TOKEN`.
   Do not blindly reuse a Bearer-only request builder for every provider.
5. Access tokens last approximately an hour. Refresh tokens are single-use: lock
   refresh per grant and atomically store the replacement credentials. For
   Disconnect, the guide specifies `POST /disconnect`, not `/sign-out`, which can
   also end the user's SoundCloud browser session. [C2]

Current typical limits include roughly 100 general requests/minute/application and
3,000 search requests/hour, with separate, stricter endpoint limits. App-only token
issuance is separately constrained: the guide lists 50/12 hours/app and 30/hour/IP.
Reuse and refresh tokens rather than repeatedly requesting new ones. Read the
actual rate-limit headers; grants and higher-access limits can differ. [C2-C3]

Keep native playback handoff. The existence of SoundCloud stream endpoints does
not establish native-app remote control. Check the API's commercial-use conditions
for the intended Aux model; monetized integrations are not universally permitted.
The terms also require prompt deletion of relevant personal data after disconnect,
with a seven-day outer limit. Do not retain a copied private library indefinitely
in the name of queue durability. [C4]

## 9. Deezer: enrollment must be resolved before implementation

The public getting-started guide still describes creating an application through
My Apps and configuring its domain/redirect. However, in a 19 October 2025 reply on
Deezer's own community, its Community Manager stated that creation of new API
access for private individuals had been disabled. The authenticated app and OAuth
pages were login-gated in this research; no subsequent reopening was verified. This
is more specific than claiming the entire API is permanently shut down. [D1-D3]

Required next steps:

1. Confirm with Deezer whether Aux can obtain approved application credentials and
   whether existing versus new applications have different access.
2. Obtain the current authorized OAuth contract, permitted redirect/domain settings,
   exact read permissions, expiry/revocation behavior and production-use terms.
3. Validate catalog and private-library access with the granted application before
   publishing a Connect control. Do not promise native-app control from historical
   embedded-player SDK examples.

Keep link handoff while access is unresolved. Do not copy App IDs from other apps
or build against an old OAuth tutorial as evidence of present-day eligibility.

## 10. JioSaavn: use the official partnership route

This research did not verify a public, self-service JioSaavn OAuth or developer API
contract. Third-party packages called a JioSaavn API do not establish official
support or authorization. That finding does not prove a private partner API cannot
exist.

The official contact page has a **Partnerships & Business Development** category,
including "I'd like to partner or integrate with Saavn." Use it to request the
available integration program, credentials, permitted metadata/library access,
playback targets, regional rights, quotas, commercial terms and test environment.
Until JioSaavn supplies an approved contract, credentials and scope names remain
unknown and the supported Aux path stays track-link handoff. No request was sent
on the user's behalf. [J1]

## 11. Engineering work required in Aux

### Preserve the current boundaries

The room's host alone authorizes a playback connection. Keep provider metadata
private to that host; guests see a capability/readiness snapshot, never credentials
or private library contents. Retain server-side permission checks even if controls
are hidden. Bind a connection to the host and room, not to a submitted name.

The existing Spotify callback is `/api/spotify/callback`; it is the only provider
OAuth callback implemented. Proposed routes such as
`/api/connections/{provider}/start`, `/api/connections/{provider}/callback` and
`/api/connections/{provider}/disconnect` need to be designed
and implemented before registering their exact URLs. Do not register a placeholder
callback and expect this repository to handle it. Apple needs an SDK-aware
interface rather than a forced OAuth callback abstraction.

Retain room-scoped connections in the first release. Reuse across rooms needs a
stable Aux identity, recovery/deletion and room-specific authorization leases. Do
not silently promote a room cookie into a permanent account. A browser or account
can own several grants; only one active room should control a given provider
account/player at a time where provider behavior requires that exclusivity.

### Build small capability-specific adapters

- Keep separate catalog, authorization, private-library and playback interfaces.
  Retain the existing PlaybackControl port and handoff confirmation flow.
- Normalize metadata while preserving provider ID, market/storefront and provenance.
  Treat unavailable, private, explicit-content or region-restricted items explicitly.
- Validate provider responses with Valibot, including absent/deprecated fields and
  unexpected errors. Do not pass raw provider JSON into client state.
- Serialize refresh and persist rotations atomically. Cache public metadata by
  provider/query/market; isolate private data by owner and authorization scope.
- Use request timeouts, bounded response handling, provider-aware backoff and
  circuit breaking. Distinguish denied consent, expired grant, unsupported scope,
  account eligibility, inactive device, quota exhaustion and temporary outages.
- Persist dispatch intent before external playback effects. Observe actual playback
  and reconcile uncertain outcomes; do not blindly retry a start/skip request.
  An API accepting a command or a browser opening a link is not proof of audio.
- Revoke room dispatch on disconnect. Keep accepted Aux requests under the queue
  contract while separately enforcing provider data deletion: stop private imports,
  purge credentials/caches and redact provider-derived private fields as required.
  Do not silently change a provider's retention rules to preserve a private cache.

### Connection security and release work

Use one-time expiring state, PKCE where supported, exact allowlisted callback URLs,
host-session binding, CSRF protection and account confirmation on replacement.
Encrypt persisted grants with versioned authenticated envelopes bound to owner and
provider; provide key rotation and backup procedures. Keep secrets out of URLs,
logs, analytics and client bundles. Apple browser authorization tokens are handled
under MusicKit's documented model, with signing keys remaining server-side.

Add account-level abuse controls, a trusted-proxy/HTTPS deployment configuration,
minimal-scope consent, safe disconnect, credential deletion, retention jobs and
provider-specific compliance pages. Treat sensitive scope verification, quota
increases, commercial permission and native-companion approval as separate gates.

## 12. Suggested implementation order and acceptance

1. **Spotify readiness and Connections UI:** verify the existing dashboard,
   callback, grants and physical-device behavior. Expose honest account and player
   readiness, reconnection and disconnect states. Confirm the intended rollout fits
   Spotify's access mode before investing in public onboarding.
2. **Apple catalog:** configure the developer program/key and storefront-aware
   discovery. Keep native-app handoff. Add optional account authorization only when
   the library feature is part of the slice.
3. **TIDAL and SoundCloud catalog/library proofs:** these have documented official
   auth paths. Validate scope and terms eligibility first; implement the more useful
   connector before generalizing shared code around both.
4. **YouTube read-only playlist feature:** define supported resources, configure
   consent, build quota-aware imports and satisfy verification/retention requirements.
   It must not be advertised as complete native YouTube Music account control.
5. **Partner applications in parallel:** Amazon Music approval, Deezer enrollment
   confirmation and JioSaavn partnership information. Set implementation dates only
   after the capabilities and grants are confirmed.
6. **Apple native companion, if prioritized:** separately prove SystemMusicPlayer,
   subscription checks, secure pairing, command acknowledgment, background behavior
   and reconnect reconciliation on supported physical devices.

For each connector, verify:

- Successful authorization, denied consent, expired/replayed state, wrong host room,
  account replacement and callback mismatch.
- Least scopes, partial grants, expired/revoked credentials, token rotation and
  simultaneous refreshes across web and worker instances.
- Wrong-region/private/unavailable tracks, safe pagination, malformed responses,
  429 handling and provider outages.
- Guest isolation, cross-room access, account/player conflicts and disconnect during
  in-flight requests or dispatch. No secrets in responses or logs.
- Actual native-app playback where claimed. Simulated providers and an OAuth success
  page are insufficient evidence.
- Applicable terms, attribution, privacy, revocation and deletion behavior.

Run relevant integration checks and React Doctor before shipping code. Browser
automation remains opt-in under the user's current preference; actual provider
consent and playback still require explicit manual acceptance with eligible accounts.

## Source register

Sources below are official developer documentation except the explicitly identified
Deezer staff announcement on the provider's own community. No unofficial wrappers
were used as authority for supported account access or playback.

- S1: [Spotify quota modes and partner eligibility](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)
- S2: [Spotify PKCE authorization](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow)
- S3: [Spotify playback requirements and policy notes](https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback)
- S4: [Spotify redirect requirements](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri)
- S5: [Spotify 2026 migration guide and subsequent corrections](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)
- A1: [Apple Developer Program enrollment and pricing](https://developer.apple.com/programs/enroll/)
- A2: [Apple developer token generation](https://developer.apple.com/documentation/applemusicapi/generating-developer-tokens)
- A3: [Apple Music user authorization](https://developer.apple.com/documentation/applemusicapi/user-authentication-for-musickit)
- A4: [MusicKit platform overview](https://developer.apple.com/musickit/)
- A5: [SystemMusicPlayer native control](https://developer.apple.com/documentation/musickit/systemmusicplayer)
- M1: [Amazon Music authentication and Music scopes](https://developer.amazon.com/docs/music/API_web_LWA.html)
- M2: [Login with Amazon authorization-code grant](https://developer.amazon.com/docs/login-with-amazon/authorization-code-grant.html)
- M3: [Amazon Music V2 preview and V1 compatibility](https://developer.amazon.com/docs/music/API_web_overview_v2.html)
- M4: [Amazon Web Playback queue and event requirements](https://developer.amazon.com/docs/music/API_playback_overview.html)
- Y1: [YouTube web-server OAuth and scopes](https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps)
- Y2: [Google refresh-token lifecycle and testing restrictions](https://developers.google.com/identity/protocols/oauth2)
- Y3: [Google sensitive-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
- Y4: [YouTube quota calculator and current buckets](https://developers.google.com/youtube/v3/determine_quota_cost)
- Y5: [YouTube developer policies and data deletion](https://developers.google.com/youtube/terms/developer-policies)
- T1: [TIDAL application registration](https://developer.tidal.com/documentation/api-sdk/api-sdk-manage-apps)
- T2: [TIDAL authorization, token exchange and refresh](https://developer.tidal.com/documentation/api-sdk/api-sdk-authorization)
- T3: [TIDAL API and Player SDK overview](https://developer.tidal.com/documentation/api-sdk/api-sdk-overview)
- T4: [TIDAL endpoint contracts, access tiers and scopes](https://tidal-music.github.io/tidal-api-reference/)
- T5: [TIDAL Developer Terms](https://developer.tidal.com/documentation/guidelines/guidelines-developer-terms)
- C1: [SoundCloud registration and Artist Pro requirement](https://developers.soundcloud.com/docs/api/register-app)
- C2: [SoundCloud authorization, refresh and disconnect](https://developers.soundcloud.com/docs/api/guide)
- C3: [SoundCloud current rate limits](https://developers.soundcloud.com/docs/api/rate-limits.html)
- C4: [SoundCloud API terms, retention and commercial use](https://developers.soundcloud.com/docs/api/terms-of-use)
- D1: [Deezer public getting-started guide](https://developers.deezer.com/guidelines/getting_started)
- D2: [Deezer Community Manager's access restriction announcement](https://en.deezercommunity.com/features-feedback-44/api-auth-impossible-80857)
- D3: [Deezer authenticated app management](https://developers.deezer.com/myapps)
- J1: [JioSaavn official partnership/integration contact](https://www.jiosaavn.com/corporate/contact)
