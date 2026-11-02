# aux

Everyone gets a say.

A shared music queue for listening together, anywhere. Create a room, invite people with a link or code, and build a soundtrack across multiple music services.

Aux manages requests, votes, and queue order. The host’s selected music app handles the audio.

## What you can do

- Create a shared room and invite people without requiring them to install an app.
- Request songs without a per-person queue cap and vote for favorites.
- Resume available rooms from Your sessions on the home page.
- Manage pending requests and queue order with host controls.
- Choose from multiple music services, with automatic playback control where supported and explicit host-led app handoff otherwise.
- Keep accepted requests in a durable queue that survives application restarts.
- Use the responsive interface from a phone or desktop browser.

## How it works

1. **Create a room.** Give your session a name and choose a music service.
2. **Invite your people.** Share the room link, QR code, or six-character code.
3. **Build the soundtrack.** Add requests and vote for what you want to hear.
4. **Play together.** Aux coordinates the queue while the selected app plays the music.

Playback capabilities depend on the selected service. Opening a track link does not prove playback started; host-led sessions require explicit confirmation. Aux does not stream, proxy, or download audio. Cross-service song matching is not implemented.

## Run locally

Requires Node.js 26.13.0, pnpm 12.16.1, and Docker Compose v2 or an existing Redis 8.10.3 server. Use `.nvmrc` to select the project runtime and `corepack enable` with Corepack installed to select the pinned package manager. Alternatively, bootstrap it with `npm install --global pnpm@12.16.1`.

```sh
git clone https://github.com/hitesh22rana/aux.git
cd aux
pnpm install --frozen-lockfile
cp .env.example .env.local
docker compose up -d redis
pnpm dev --hostname 0.0.0.0
```

Start the queue worker in a separate terminal:

```sh
pnpm run worker
```

Open **http://127.0.0.1:3000**. Create or join a room to get started. All queues require Redis; automatic playback additionally requires configuring the selected integration. Host-led handoff does not require music-service credentials in Aux.

See the [technical setup guide](docs/SETUP.md) for environment variables, adapter-specific requirements, supported link formats, persistence, and deployment limits.

## Run the complete stack

Copy `.env.example` to `.env.local`, then run:

```sh
docker compose up --build -d
```

The `docker-compose.yaml` file runs the web app, playback worker, and a persistent queue service together. Open **http://127.0.0.1:3000**. To stop the stack while keeping data, use `docker compose down` without the volume-removal flag.

## Built with

Next.js, TypeScript, Tailwind CSS, Redis Streams, SQLite, Radix Dialog, React Hook Form, Valibot, and Sonner. The web app handles rooms and requests; a separate worker coordinates supported automatic playback. Redis stores live queue state, while SQLite stores membership and encrypted integration credentials.

## Checks

```sh
pnpm run lint
pnpm run typecheck
pnpm run build
# Requires Redis:
pnpm run test:unit
# With the web app running:
pnpm test
# Required before every push:
npx react-doctor@latest --verbose
```

The test suites cover queue concurrency, permissions, durable worker delivery, recovery, host-led confirmation, and desktop/mobile browser flows. External-app behavior and audio output still need testing on real devices.

## Project guides

- [Setup, integration capabilities, and deployment](docs/SETUP.md)
- [Dependency versions and upgrade policy](docs/DEPENDENCIES.md)
- [Architecture and contribution boundaries](docs/ARCHITECTURE.md)
- [Interface design](docs/DESIGN.md)
- [Project contribution guidance](AGENTS.md)
- [Environment template](.env.example)
- [Local Redis configuration](docker-compose.yaml)

### Appearance

Use the Sun or Moon button in the homepage or room header to switch between
Light and Dark. Aux follows your device preference by default, including changes
while open, until you choose a theme. Your choice is saved on this browser and
applies across rooms, dialogs, and notifications. Theme changes use a short
crossfade in browsers supporting View Transitions and respect reduced motion.

Hosts can remove room members from the people view. Member avatars are generated
locally and stay consistent for the same name. Sharing panels show the time left
before the room expires, and people totals include members who are Away.
