# Repository Guidelines

## Structure and architecture

Aux is a Next.js App Router application with a separate playback worker. It manages a shared queue; external music apps play the audio.

- `src/app/`: pages, layouts, and API route handlers.
- `src/components/`: client UI, dialogs, search, and handoff controls.
- `src/lib/orchestrator.ts`: membership checks and room actions.
- `src/lib/live-queue.ts`: Redis queue state and atomic stream events.
- `src/lib/queue-worker.ts` and `src/worker.ts`: dispatch, leases, and recovery.
- `src/lib/providers.ts` and `src/lib/playback/`: link validation and provider adapters.
- `src/lib/database.ts` and `src/lib/spotify-storage.ts`: SQLite persistence and encrypted credentials.
- `tests/integration/`: Vitest integration tests; `tests/rooms.spec.ts`: Playwright browser tests.
- `public/`: static assets. `docs/SETUP.md`: environment and integration setup.

## Development commands

Use the Node.js version in `.nvmrc` and npm version in `package.json`.

```sh
npm ci
# Only when .env.local does not already exist:
cp .env.example .env.local
docker compose up -d redis
npm run dev
# In another terminal:
npm run worker
```

The app runs at `http://127.0.0.1:3000`. Configure `.env.local` using `docs/SETUP.md`. For the complete container stack, use `docker compose up --build -d`.

## Validation

- `npm run lint`: ESLint.
- `npm run typecheck`: Next.js route types and TypeScript checks.
- `npm run test:unit`: integration tests requiring Redis. Tests isolate SQLite and Redis keys and mock provider APIs. Override the Redis test connection with `AUX_TEST_REDIS_URL`.
- `npm run build`: production build.
- `npm test`: browser tests against a running app on port 3000. Use system Chromium or install it with `npx playwright install chromium`.
- `npm run format`: Prettier.

Run checks relevant to the change. Queue or playback changes need integration tests; UI flows need browser checks. For container changes, validate Compose and verify web/worker startup. Mocked provider tests do not establish real-device playback support.

## Implementation conventions

Use strict TypeScript, `@/` imports for `src/`, existing Tailwind styles, and existing Radix components. Follow Prettier formatting. Validate API input with Zod and enforce host/member permissions on the server. Keep credentials and storage modules server-only.

Keep queue mutations and their events atomic and durable before acknowledging requests. Preserve request deduplication, leases, and recovery. Reconcile uncertain playback commands before retrying. Manual handoff must keep the selected request queued until explicit host confirmation.

The web app and worker must share the SQLite directory, encryption key, Redis connection, and queue namespace. Preserve persistent volumes. Never commit credentials, local databases, or build artifacts.

Pin dependency upgrades with the lockfile. See `docs/DEPENDENCIES.md` before changing the TypeScript compiler/API compatibility setup or npm install-script approvals.
