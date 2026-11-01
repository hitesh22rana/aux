# Working on Aux

## Product

Aux is a shared music queue for listening together in any setting. Keep public descriptions generic, focused on collaboration across multiple music services. Service names and implementation details belong in integration controls and technical documentation.

Aux coordinates requests and playback. It must not stream, proxy, download, or decode audio. The selected music app handles the sound. Never present a link being opened as proof that playback started.

## Architecture

- `src/app/`: Next.js App Router pages, metadata, and HTTP route handlers.
- `src/components/`: accessible, responsive client interfaces.
- `src/lib/providers.ts`: supported services, capabilities, and safe link parsing.
- `src/lib/orchestrator.ts`: membership checks, host permissions, and room actions.
- `src/lib/live-queue.ts`: Redis queue snapshots, optimistic version checks, and atomic stream events.
- `src/lib/queue-worker.ts` and `src/worker.ts`: background playback scheduling, consumer groups, leases, and recovery.
- `src/lib/database.ts` and `src/lib/spotify-storage.ts`: shared SQLite membership and encrypted credentials.
- `tests/integration/`: real Redis and isolated SQLite tests with mocked provider APIs.
- `tests/rooms.spec.ts`: host/member flows and mobile browser checks.
- `docs/SETUP.md`: detailed setup, capabilities, and deployment limits.

Live requests must be durable before they are acknowledged. Keep queue-state mutations and their stream events atomic. Use request IDs to deduplicate submissions. Do not replace durable queue behavior with process-local memory.

Keep dispatch intent persistent before contacting a provider. Reconcile uncertain commands with observed playback; never blindly replay them. Host-led handoff requires explicit host confirmation before dequeuing a selection. Preserve permission checks on the server, including queue limits, room locks, and ended-room handling.

The web app and worker share the same SQLite path, encryption key, Redis URL, and queue namespace. Multiple machines require a shared database adapter; a shared local path alone is insufficient.

## Runtime and dependencies

Use the Node.js and npm versions declared in `.nvmrc` and `package.json`. Use npm and commit `package-lock.json` whenever dependencies change. Install current stable releases, check peer compatibility, and pin reviewed versions. Do not use prereleases or bypass peer checks to force an upgrade.

TypeScript 7 supplies the `tsc` command. The `typescript` module aliases the official TypeScript 6 compatibility package for tools that require its JavaScript compiler API. Preserve this supported split until those tools support the new API.

Only explicitly reviewed native dependency install scripts should be allowed in `package.json`. Keep approvals pinned to the installed versions and review them when upgrading.

Before changing framework-specific behavior, read the relevant installed documentation in `node_modules/next/dist/docs/`. `agentRules: false` in `next.config.ts` intentionally keeps this file project-owned and prevents framework-generated boilerplate from replacing it.

## Development

```sh
npm ci
cp .env.example .env.local
docker compose up -d redis
npm run dev -- --hostname 0.0.0.0
```

Start `npm run worker` in another terminal when exercising automatic playback. Run the complete container stack with `docker compose up --build -d`. The authoritative Compose file is `docker-compose.yaml`.

Do not delete existing Redis or SQLite volumes to make a check pass. Keep persistence enabled and preserve stored data during upgrades. Use a separate Redis database/namespace and temporary SQLite directory for integration tests.

## Validation

Run checks appropriate to the change:

```sh
npm run lint
npm run typecheck
npm run test:unit
npm run build
# With the web app running:
npm test
```

Integration tests require Redis. Browser tests use system Chromium when available, or Playwright's installed browser. When changing container files, validate Compose, build the image, and check web/worker startup against the configured Redis version. Report the difference between mocked-provider tests and real service/device verification.

## Code and writing conventions

Use TypeScript, explicit domain types, Zod validation at HTTP boundaries, and server-only imports for credentials and storage. Keep provider-specific behavior behind adapters and capability checks. Use existing Radix dialogs, Sonner notifications, Tailwind utilities, and shared design styles before adding libraries.

Maintain keyboard focus, accessible labels, mobile input sizes, safe-area handling, visible error states, and reduced-motion support. Gate hover effects by input capability. Avoid unnecessary animation and do not imply playback progress in manual handoff mode.

Use plain language. Do not use the Unicode U+2014 character in source, documentation, configuration, or other project files. Use commas, parentheses, colons, or ordinary hyphens instead. `npm run check:text` enforces this rule for repository files.

## Secrets and Git

Never commit `.env.local`, tokens, private keys, SQLite databases, Redis dumps, build outputs, or browser artifacts. `.env.example` contains placeholders only. Do not log credentials, dump process environments, or include secrets in URLs.

Keep changes focused and preserve unrelated user edits. Follow the user's branch and publication instructions. Direct pushes to `main` are authorized in this project; verify the intended remote and run relevant checks before pushing. Do not change repository visibility or create pull requests unless requested.
