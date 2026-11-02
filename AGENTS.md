# Repository Guidelines

## Structure

Aux is a Next.js shared listening queue with a separate playback worker. External music apps play the audio. Read `docs/ARCHITECTURE.md` for the dependency boundaries and `docs/SETUP.md` for integration configuration.

- `src/app/`: thin App Router routes, layouts, metadata and base styles.
- `src/features/listening-room/`: room UI, hooks, validated contracts and server services.
- `src/server/`: SQLite, Redis connection and HTTP infrastructure.
- `src/shared/`: domain-independent HTTP helpers, errors and dialog UI.
- `src/workers/playback.ts`: background process entrypoint.
- `tests/integration/`: Vitest integration and boundary checks; `tests/rooms.spec.ts`: Playwright journeys.
- `public/`: assets and licensed local fonts.

## Development

Use the Node.js version in `.nvmrc` and pnpm version in `package.json`.

```sh
pnpm install --frozen-lockfile
# Only if .env.local does not exist:
cp .env.example .env.local
docker compose up -d redis
pnpm dev
# In another terminal:
pnpm worker
```

The app runs at `http://127.0.0.1:3000`. The complete stack runs with `docker compose up --build -d`.

## Validation

- `pnpm lint`: ESLint, including import boundaries.
- `pnpm typecheck`: route generation and native TypeScript checks.
- `pnpm test:unit`: Redis/SQLite integration and client-contract tests. `AUX_TEST_REDIS_URL` overrides the isolated Redis test connection.
- `pnpm build`: production build.
- `pnpm test`: browser tests against a running app on port 3000. Use system Chromium or `pnpm exec playwright install chromium`.
- `pnpm format`: Prettier.

Run checks relevant to the change. Queue/playback changes need integration tests; UI flows need browser checks. Container changes require Compose validation, an image build, and web/worker startup checks. Mocked providers do not establish real-device playback support.

## Implementation

Keep feature logic colocated. Routes use the feature's client, contracts, or server public entrypoint. Shared code and infrastructure must not import features. Client modules must not import server implementations. Keep server-only guards. Use strict TypeScript, Zod at data boundaries, existing Tailwind utilities, and scoped CSS Modules.

Preserve atomic, durable queue acknowledgment, deduplication, leases, and uncertain-command reconciliation. Manual handoff dequeues only after host confirmation. Enforce permissions server-side.

Web and worker share SQLite storage, encryption key, Redis connection and queue namespace. Preserve volumes and never commit credentials or local databases. Pin dependency upgrades with the lockfile. Consult `docs/DEPENDENCIES.md` before changing TypeScript compatibility or pnpm build approvals.
