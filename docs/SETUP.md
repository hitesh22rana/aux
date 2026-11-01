# Technical setup and playback integrations

[Back to the project overview](../README.md)

Aux owns the room and music queue. The host’s chosen music app plays the audio. Members need only a browser; their requests never stream through Aux.

Built with Next.js App Router, TypeScript, Tailwind CSS 4, Redis Streams, SQLite, Radix Dialog, and Sonner. Interface work follows [Emil Kowalski’s design engineering guidance](https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md).

## Start locally

Requires Node.js 22.13+ and Docker (or an existing Redis 7+ server). SQLite uses a native module.

```sh
npm ci
docker compose up -d redis
# If .env.local does not exist yet:
cp .env.example .env.local
```

Set these values in `.env.local`:

| Variable                   | Value                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `REDIS_URL`                | `redis://127.0.0.1:6379` for the included Compose service                               |
| `SPOTIFY_CLIENT_ID`        | Your Spotify developer app’s Client ID                                                  |
| `SPOTIFY_REDIRECT_URI`     | `http://127.0.0.1:3000/api/spotify/callback`                                            |
| `AUX_TOKEN_ENCRYPTION_KEY` | 64 hexadecimal characters from 32 random bytes                                          |
| `AUX_DATA_DIR`             | Optional absolute persistent SQLite directory; web and worker must share it             |
| `AUX_QUEUE_NAMESPACE`      | Optional Redis key namespace; defaults to `aux`; web and worker must use the same value |

Generate an encryption key locally (never commit it):

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

A fresh clone contains no credentials. Copy `.env.example` to `.env.local`, generate an encryption key, and configure the automatic adapter if you plan to use it. Preserve the encryption key once accounts are connected.

Run the web app and worker in separate terminals from this project directory:

```sh
npm run dev -- --hostname 0.0.0.0
```

```sh
npm run worker
```

Open **http://127.0.0.1:3000**. Use that hostname for OAuth; Spotify does not accept `localhost` callback URIs. Production and phone-accessible callbacks need an HTTPS hostname with an exact matching redirect URI.

## Supported music services

| Service       | Playback in this Next.js build                                    | What members submit                                                          |
| ------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Spotify       | Automatic remote control; account connection and Premium required | Connected catalog search or a Spotify track link                             |
| Apple Music   | Host-led handoff                                                  | Full Apple Music song link, including album links with a song `i=` parameter |
| Amazon Music  | Host-led handoff                                                  | Full Amazon Music track link or album share link with `trackAsin=`           |
| YouTube Music | Host-led handoff                                                  | YouTube Music / YouTube watch link or `youtu.be` video link                  |
| TIDAL         | Host-led handoff                                                  | Full track link                                                              |
| Deezer        | Host-led handoff                                                  | Full track link                                                              |
| JioSaavn      | Host-led handoff                                                  | Full song link                                                               |
| SoundCloud    | Host-led handoff                                                  | Full public track link                                                       |

### Host-led flow (all seven additional services)

1. Create a live room and choose the host’s service. No music-service credentials are stored or required by Aux for handoff rooms. Redis is still required for the durable queue.
2. Members use their music app (or the service search link in Aux), copy a **full song link**, and enter its title and optional artist. These labels are user-provided, not verified catalog metadata. Aux validates the service and URL structure without fetching the submitted URL.
3. The host selects **Select next request**. This reserves the request for ten minutes and leaves it in the queue. Other requests remain editable; the selected one cannot be removed or promoted during the reservation.
4. The host follows **Open in [service]**. The operating system may open the native app or its website. Sign-in, a subscription, region availability, or a further tap to play may be needed. Opening a URL does not prove a song started.
5. After starting the song, the host returns and chooses **I started this song**. Aux then dequeues that exact request and shows **Host confirmed**, without claiming observed playback progress. Retrying the confirmation cannot advance the queue twice.
6. The host selects the next request when ready or marks the current song finished. Canceling a selection leaves its request queued. Aux cannot automatically advance, pause, or stop these external apps.

Each room uses one service. A link from another service is rejected with a clear message; automatic cross-service song matching is not implemented. Short-link redirectors, playlists, and albums without a specific track are rejected. Links are canonicalized to remove tracking parameters; only approved HTTPS music hosts and track URL shapes are accepted.

### Why automatic control differs by service

Apple’s [SystemMusicPlayer](https://developer.apple.com/documentation/musickit/systemmusicplayer) can control the native Music app from an Apple-platform companion, while [MusicKit Web](https://developer.apple.com/musickit/) plays within a website. The latter would change the agreed native-app orchestration model. Amazon’s [Web APIs](https://developer.amazon.com/docs/music/API_web_overview.html) are documented as closed beta with access restricted to approved developers. Google’s [YouTube Data API](https://developers.google.com/youtube/v3/getting-started) supplies resource/search operations; it does not implement native YouTube Music playback control in this app. TIDAL, Deezer, JioSaavn, and SoundCloud currently have link handoff adapters here, not automatic native-app integrations. Provider capabilities in the UI describe this build, not a claim that a provider could never support a future integration.

## Connect Spotify

1. Create an app in the [Spotify developer dashboard](https://developer.spotify.com/dashboard). Register the exact redirect URI above and enable Web API use.
2. Add your Client ID to `.env.local`, then restart the web app and worker. PKCE requires no Spotify client secret.
3. Create an Aux room with demo playback unchecked, then select **Connect Spotify**. Only the host authorizes an account.
4. Open Spotify on the host’s phone, select that phone as the active player, and start a song. Use the host device or connect it to your preferred audio output.
5. Invite members. Search by song and artist or paste a Spotify track URL. Requests are saved in **Aux’s queue**, where they can be voted on, removed, or moved to next.
6. The host selects **Start / resume Aux** to hand playback control to the worker. It plays a single selected track URI at a time. Host skip selects the next Aux request rather than using Spotify’s native queue.

A Spotify account can host one connected Aux room at a time, so separate workers cannot compete for the same player. Spotify Premium and API access are required for host playback control. In development mode, Spotify’s current documentation limits authenticated users to 5 allowlisted accounts and requires the app owner to have Premium. Members do not individually authenticate with Spotify. Wider distribution requires Spotify’s applicable approval and access process; remote control does not remove provider policies or commercial-use restrictions.

## Queue ownership and durability

**Redis is the source of truth for live queue order, requests, votes, active dispatch, and playback snapshots.** SQLite stores room membership and encrypted Spotify credentials. Demo rooms retain the original SQLite/browser simulation and do not require Spotify or Redis.

- An optimistic-version Lua operation saves each queue mutation and appends its wake-up event to a Redis Stream in one atomic execution.
- A separate Node worker uses `XREADGROUP`, acknowledges completed events with `XACK`, and recovers abandoned deliveries with `XAUTOCLAIM`. Acknowledged event payloads are deleted; the durable queue snapshot remains. The stream is an outbox, not a permanent audit log.
- A durable Redis sorted set schedules playback checks independently of incoming requests or browser activity. The worker checks automatic Spotify rooms roughly every four seconds; handoff rooms never trigger Spotify or other playback APIs; slow provider calls and room count can increase that interval.
- Per-room renewable Redis leases prevent two workers dispatching simultaneously. Request IDs deduplicate repeated submissions; compare-and-set queue updates protect concurrent requests and edits.
- The dispatch intent is persisted **before** the provider command. After a restart, the worker checks Spotify’s observed playback before deciding whether that command completed. It does not automatically resend uncertain commands. The host can inspect Spotify and explicitly recover.
- Tokens use server-side AES-256-GCM encryption with room-bound authenticated data. Session cookies are HTTP-only; OAuth uses PKCE, expiring one-time state, and host-session binding. Tokens never reach the member browser. Web and worker share the same database and encryption key.

The included Redis service enables **AOF with `appendfsync always`**, a persistent Docker volume, and `noeviction`. Streams alone do not guarantee disk durability. This local, single-node configuration does not provide protection against host/disk loss or a production failover guarantee. Use appropriate managed persistence, backups, TLS/ACLs, and replication for deployment. All queue keys use one Redis hash slot so queue-state and outbox updates remain atomic.

Queue delivery is at-least-once internally. Spotify offers no external idempotency key for playback commands, so this integration does **not** claim exactly-once external effects. The explicit uncertain state prevents blind replay.

## Playback behavior and limits

- **No audio is streamed, proxied, downloaded, or decoded by Aux.** The adapter uses Spotify search, track lookup, playback state, and single-track start/pause/resume endpoints. It does not call Spotify’s native queue endpoint.
- Pending requests can be removed or reordered in Aux. A Spotify request is briefly locked while being dispatched. A handoff request is locked while selected and is consumed only on host confirmation.
- Votes express preference; they do not automatically reorder the queue. Each person may have up to three pending requests. In handoff rooms, confirmation—not opening the link—consumes the queued request. Rooms fit 12 members and expire after 24 hours.
- The worker advances when observed playback indicates a track finished near its expected end. Spotify has no completion webhook in this flow: polling is approximate, transitions may have gaps, and pausing near a song’s end is inherently ambiguous. Mid-song manual changes pause Aux automation instead of overriding the host. Use the host controls to continue.
- If Redis is unavailable, live operations fail rather than accepting requests into temporary memory. If the worker is offline, already accepted requests remain saved and the UI reports its status. Keep the worker supervised in deployment.
- Ending or disconnecting stops future Aux dispatches; it does not clear Spotify’s existing context or necessarily stop an in-flight/current song. Leaving the browser view does not end the room.
- **Eight services are selectable.** Spotify uses the automatic adapter; the other seven use the explicitly labelled host-led handoff adapter. Cross-service song matching is not implemented. The demo catalog uses illustrative metadata and original SVG covers.
- SQLite metadata/credentials still require shared persistent disk. Multiple workers are coordinated through Redis, but deploying web and worker on separate machines requires migrating that SQLite adapter to a shared database. This is not a serverless-only deployment.

## Verification

```sh
npm run lint
npm run typecheck
npm run build
# Requires a local Redis service; mocks only the Spotify network boundary:
npm run test:unit
# With the app running on port 3000:
npm test
```

The integration suite uses a unique Redis namespace on logical database 15 (`AUX_TEST_REDIS_URL` can override it) and an isolated temporary SQLite database. It covers concurrent queue requests, request deduplication, roles, reorder/removal, worker dispatch and recovery, manual interruptions, OAuth replay, encrypted storage, and the actual Spotify HTTP request shape. Playwright covers host/member and mobile flows. Browser emulation cannot verify physical-phone Bluetooth, safe areas, or background OS behavior.

Real Spotify authentication and external-app playback still need verification with a configured developer app and Premium account. External-app handoff behavior, sign-in, and track availability also need testing on actual host phones; mocked provider tests do not establish live provider access.

## Source map

- `src/lib/live-queue.ts`, `redis.ts` — durable queue, atomic updates, stream outbox.
- `src/lib/queue-worker.ts`, `src/worker.ts` — consumer groups, leases, recovery, and playback scheduling.
- `src/lib/playback/spotify.ts` — provider adapter, token refresh, normalized catalog data.
- `src/lib/spotify-storage.ts` — encrypted tokens and one-time OAuth state.
- `src/lib/orchestrator.ts` — queue authorization and provider-independent room actions.
- `src/app/api/rooms/[code]/spotify/`, `src/app/api/spotify/callback/` — connection, search, request, recovery, and OAuth routes.
- `src/components/spotify-*.tsx` — automatic Spotify connection and search.
- `src/lib/providers.ts` — eight-service capability registry, service search links, and safe song-link parser.
- `src/lib/handoff.ts`, `src/app/api/rooms/[code]/handoff/` — durable selection, cancellation, host confirmation, and manual completion.
- `src/components/handoff-panel.tsx`, `linked-track-request.tsx` — host-led playback and multi-service link requests.
- `compose.yaml`, `.env.example` — local infrastructure and environment setup.

## References and assets

[Spotify PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow) · [Playback API](https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback) · [Redirect requirements](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri) · [Quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes) · [Redis Streams](https://redis.io/docs/latest/develop/use-cases/streaming/nodejs/)

The landscape is from [Unsplash’s image CDN](https://images.unsplash.com/photo-1500534623283-312aade485b7). Demo album illustrations are original SVG placeholders. Live album art links back to Spotify. Service names do not imply affiliation.
