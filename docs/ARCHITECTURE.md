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

The root URL always opens the landing page. Room restoration requires an explicit `?room=CODE` query; a previously stored room code never redirects a home visit. The home wordmark clears the active browser view without ending the shared session. A member can reopen an active room through its invitation URL.

An explicit invitation opens the join dialog only when the API returns HTTP 401. Closed rooms return HTTP 410; invalid or expired invitations show a message on the landing page. Connectivity failures show a retry message rather than opening a form. The HTTP client retains response status in `HttpError` so navigation does not infer status from message text.

The root HTML element uses `suppressHydrationWarning` only for attributes injected by browser extensions such as LanguageTool. Hydration validation remains enabled for body content and application components.
