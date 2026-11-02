# Architecture and contribution boundaries

Aux uses a feature-first structure adapted to Next.js App Router. Routes compose or call features. A feature owns its UI, browser state, contracts, and application services. Shared code stays domain-independent. Infrastructure stays server-only.

## Source layout

```text
src/
  app/                              Next.js routes, layouts, base CSS and metadata
  features/listening-room/
    index.ts                        Public client entrypoint
    contracts.ts                    Public runtime schemas and domain types
    api/room-client.ts              Typed browser room requests
    components/                     Room layout, discovery, player and queue views
      dialogs/                      Individually owned create/join/invite/settings forms
    hooks/use-room-session.ts       Session restoration, polling and commands
    hooks/use-spotify-connection.ts  Connection status, account commands and polling
    model/                          Contracts, form schemas and service capabilities
    listening-room.module.css       Scoped feature styles
    server/
      index.ts                      Public server-only entrypoint
      room-service.ts               Authorization and room use cases
      room-repository.ts            SQLite membership and room persistence
      live-queue.ts                 Atomic Redis state and event outbox
      queue-keys.ts                 Domain-specific queue key names
      playback-worker.ts            Dispatch leases, scheduling and reconciliation
      playback-port.ts              Narrow playback observation/control contract
      handoff-service.ts            Durable host-led selection and confirmation
      spotify-storage.ts            Encrypted credentials and one-time OAuth state
      providers/                    Provider HTTP adapter and normalized control
  server/
    database/sqlite.ts              SQLite connection and base schema
    redis/connection.ts             Redis connection lifecycle
    http/responses.ts               HTTP errors, origin checks and session cookies
  shared/
    api/http-client.ts              Generic validated JSON transport
    lib/errors.ts                   Application error type
    ui/dialog.tsx                   Domain-independent accessible dialog
    ui/dialog.module.css            Dialog presentation
  workers/playback.ts               Background process entrypoint
```

Tests remain in `tests/`: browser journeys in `rooms.spec.ts`, and isolated Redis/SQLite integration tests plus client-contract checks in `integration/`. Public assets and licensed fonts live in `public/`.

## Import boundaries

- `app/` and `workers/` consume the feature's public client, contracts, or server entrypoint.
- Feature internals can import other internals of the same feature, shared helpers, and server infrastructure where appropriate.
- Client components, hooks, request helpers, and domain models cannot import server implementation or Node APIs.
- `shared/` and `server/` infrastructure cannot import application features or routes.
- Server modules keep `server-only` guards. The browser entrypoint never re-exports server modules.
- Tests can import internals to verify recovery, concurrency, adapter behavior, and persistence.

ESLint enforces these boundaries for production source. Keep public exports explicit, except the dedicated contracts entrypoint. Do not combine browser and server exports into one barrel.

## Design principles in practice

| Principle             | Application in Aux                                                                                                                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single responsibility | The session hook coordinates browser lifecycle; components present the room; services authorize actions; repositories persist state; adapters translate provider APIs.                                   |
| Open/closed           | Provider capabilities describe handoff versus remote control. Adding a handoff service extends its definition and link parser. A new automatic adapter must satisfy real provider access requirements.   |
| Liskov substitution   | Playback controls return a normalized snapshot and preserve the observation/control contract, including uncertain delivery and retry errors. Adapter-specific JSON stays outside the worker.             |
| Interface segregation | The worker's `PlaybackControl` exposes observation, start, and pause control. It does not require search or OAuth methods.                                                                               |
| Dependency inversion  | `processRoom` accepts a playback-control port. The current composition defaults to the Spotify control adapter. Infrastructure does not depend on the feature.                                           |
| DRY                   | Runtime room schemas supply TypeScript types and response validation. Room actions share one schema at the client/server boundary. Generic HTTP/error handling and the dialog primitive are shared.      |
| YAGNI                 | One listening-room feature, one background worker, and existing durable storage remain. There are no empty feature folders, generic repository frameworks, new global stores, or new fetching libraries. |

Before joining, the browser shows an empty welcome screen. Every new room starts with no songs or fabricated listeners. All room mutations are authorized and persisted server-side; there is no local playback simulation. Existing rooms from obsolete non-live versions must be replaced with a new room.

## Data flow and invariants

A browser request goes through Next.js route validation, the room service's authorization, and an atomic queue update. Redis persists the queue snapshot and its stream event together before acknowledgment. The worker claims events, obtains a per-room lease, persists dispatch intent, and calls the playback port. It reconciles uncertain commands against observed playback before advancing.

Host-led services use durable reservations. Opening a music link leaves its request queued. Only explicit host confirmation dequeues it. Provider search, account access, audio playback, and device behavior remain limited to the implemented capabilities.

Web and worker processes share Redis settings, queue namespace, SQLite storage, and the encryption key. This deployment uses a shared local volume; spreading processes across machines requires a suitable shared database implementation. Preserve volumes and back up stored data during upgrades.

## Adding or changing a feature

1. Put code with the feature that owns its behavior. Promote a helper to `shared/` only when it is domain-independent and has a real shared use.
2. Define and validate external data at the boundary. Infer types from the schema instead of maintaining duplicate shapes.
3. Keep routes thin and expose the smallest useful public API. Keep local search drafts, tabs and dialog state close to their UI.
4. Use existing components and dependency versions. Keep feature styling scoped; base resets, typography and tokens belong in `app/globals.css`.
5. Run lint and type checks, then the integration/browser checks relevant to the behavior. Build and test the full stack for infrastructure changes.

## Reference

The structure follows the colocation, feature boundaries, thin routes, and minimal global state recommendations in [How to Structure a Scalable React Project (2026 Guide)](https://medium.com/@kasunnadeera100/how-to-structure-a-scalable-react-project-2026-guide-d533298dff24). Aux retains Next.js routing and its current polling approach instead of adopting the article's SPA routing, state, or fetching libraries without a demonstrated need.

## React health checks

Run `npx react-doctor@latest --verbose` before every push and fix reported diagnostics. This is an ad hoc development tool, not a runtime dependency. Review diagnostics against actual behavior before making changes.

The 2026-11-02 cleanup split complex room, dialog, playback and connection components; moved connection lifecycle into a feature hook; made search loading/results query-specific; guarded malformed URL input; validated persisted room data before account binding; replaced repeated scope-array scans with a set; and parallelized independent queue/heartbeat reads. Existing queue durability, host permissions and manual-confirmation behavior remain covered by the test suites.

React Doctor 0.9.22 reported no local diagnostics after the cleanup. Its remote score service was unavailable, so no numeric score is claimed.

## Forms and validation

Valibot defines request, response, provider, persistence, and form contracts. Infer TypeScript types from these schemas. React Hook Form uses `valibotResolver` for create, join, and song-request forms. Shared field schemas enforce matching client and API constraints; server authorization and service-link checks remain mandatory.

Forms use `noValidate` to replace browser validation bubbles with inline errors connected through `aria-describedby` and `aria-invalid`. Validation starts on touch or submit, then updates as users correct the field. The first invalid field receives focus. Required labels use a red asterisk and inputs expose `aria-required`; Artist remains unmarked. Server failures preserve the draft. Successful song requests reset the form, and retries retain an idempotency key for the same submitted values.

The header has one Room settings entry, visible on desktop and mobile. Queue and room summary sections do not duplicate it.

## Home and invitation navigation

The root URL always opens the landing page. Room restoration requires an explicit `?room=CODE` query; a previously stored room code never redirects a home visit. The home wordmark clears the active browser view without ending the shared session. A member can reopen an active room through its invitation URL. Valid six-character invitation URLs render a dedicated loading state from the initial server response, without flashing the landing page. The room appears after validation; missing, closed, invalid, or failed invitations return to the home URL.

An explicit invitation opens the join dialog only when the API returns HTTP 401. Closed rooms return HTTP 410; invalid or expired invitations show a message on the landing page. Connectivity failures show a retry message rather than opening a form. The HTTP client retains response status in `HttpError` so navigation does not infer status from message text.

The root HTML element uses `suppressHydrationWarning` only for attributes injected by browser extensions such as LanguageTool. Hydration validation remains enabled for body content and application components.

## Presence and leaving

Browser membership and tab presence are separate. An HTTP-only room cookie identifies a saved browser membership. Each mounted tab creates a distinct connection ID, heartbeats every 20 seconds, and sends a best-effort page-hide beacon. Redis expires presence after 90 seconds without a heartbeat. Closing one tab preserves presence from other tabs; suspended or disconnected memberships display as Away. A brief tombstone prevents an in-flight heartbeat from reviving a closed connection. Returning from the browser back/forward cache creates a fresh connection ID.

The people view shows presence dots and saved memberships that are away, while omitting tab counts. Explicitly departed memberships are excluded from the people list and capacity checks, while their identity remains available to attribute accepted requests. Presence never grants permissions; all mutations still authorize the cookie-backed membership on the server.

`DELETE /api/rooms/:code` leaves a room and revokes that browser's room session across its tabs. For a guest it preserves the room and accepted requests. For a host it first ends the durable queue, stops future dispatch, and disconnects the integration, then revokes membership. A durable-queue failure leaves the host's membership intact. Explicit leave differs from a tab closing, a refresh, or a temporary outage; those do not automatically end a hosted room.

Desktop columns share the document scroll. A ResizeObserver records the request column's height. Its sticky offset allows normal scrolling until the form reaches the viewport bottom, then holds the column while the taller player rail finishes. Phones use normal stacked scrolling. There is no nested scroll region or scroll-event animation.

## Browser session discovery

`GET /api/rooms` returns only unexpired, non-ended rooms authorized by the request’s `aux_CODE` cookies. Names and codes alone do not authorize membership. Invalid, departed, and expired sessions are omitted; the response is private and not cached. The home session dialog loads on demand and validates the response with Valibot. Resume shares the versioned room-entry function with direct invitations, so superseded entry requests cannot reactivate an old room after navigation.

The common queue mutation path does not impose a per-person pending-song cap, for either automatic or handoff services. The 1,000-request session budget still bounds deduplication storage. Member settings omit host actions entirely; authorization remains enforced by services independently of rendering.

## Appearance

`src/shared/theme/` owns the domain-independent theme provider and accessible
icon toggle. `next-themes` applies the saved `aux-theme` preference before paint;
System is the default until an explicit Light or Dark choice. Root `data-theme` tokens in `src/app/globals.css` style
both page content and portalled dialogs. Tailwind's dark variant uses the same
attribute. Theme-dependent controls wait for the client snapshot to avoid SSR
hydration differences. Notifications follow the resolved theme. User toggles use the browser View Transition API for a 240ms color crossfade, with an immediate fallback and reduced-motion support. Keep new UI
colors semantic so both light and dark themes remain supported.

## People, avatars and moderation

Names seed a shared `MemberAvatar` wrapper around `@blobatar/react` 2.7.0.
NFKC normalization, trimming and lowercase keep each name's local SVG avatar
stable across rooms, queue attribution and refreshes. No remote avatar service
receives member names. People counts include all retained memberships, including
Away members; explicitly departed or removed members are excluded. Presence dots
communicate Active now or Away without exposing tab counts in the UI. The people
grid fits up to three compact horizontal cards in the main column and collapses
on smaller screens. Names truncate visually while preserving their full text.

A host can confirm removal from a member's card. The server checks the requesting
session, host role, room status and target membership; a host cannot remove themself
or another host. SQLite atomically marks departure and revokes all target sessions.
Presence is cleared best effort. Existing accepted requests and author attribution
remain intact. Revoked browsers return home on their next room poll. Removal revokes
a membership; this account-free application does not establish a permanent identity
ban. A fresh join is possible while the room accepts new members.

Sharing surfaces show the time remaining until the room's original 24-hour expiry,
rounded up to minutes and refreshed every 15 seconds. The display is informational;
server-side expiry remains authoritative. Notifications appear at the top.

## Input and HTTP boundaries

Mutation routes require JSON and bound the actual incoming stream to 16 KiB, even
without a Content-Length header. Valibot rejects unexpected request keys, malformed
IDs, empty identifiers, oversized names/links and control or direction-spoofing
characters in supplied text. Room codes, UUIDs, member IDs and session-token formats
are checked separately. Existing service-link allowlists canonicalize track URLs;
Aux does not fetch arbitrary user-provided URLs. User strings remain text and are
escaped by React; SQL values use parameter bindings rather than string interpolation.
Do not introduce HTML rendering of these fields or destructive HTML stripping.

Mutations enforce origin and browser cross-site metadata checks. Session cookies
remain HTTP-only and SameSite=Lax, with Secure on HTTPS. Responses add nosniff,
frame-denial and referrer-policy headers; API responses are private and not cached.
These controls are defense in depth, not proof that every possible exploit is
impossible. The deployment proxy must replace forwarded host headers, enforce HTTPS,
and apply request timeouts and abuse/rate controls before exposing the app publicly.
