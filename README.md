# aux — Everyone gets a say.

A shared music queue for listening together, anywhere. Create a room, invite people with a link or code, and build a soundtrack across multiple music services.

Aux manages requests, votes, and queue order. The host’s selected music app handles the audio.

## What you can do

- Create a shared room and invite people without requiring them to install an app.
- Request songs, vote for favorites, and give everyone a turn.
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

Requires Node.js 22.13+, npm, and Docker or an existing Redis 7+ server.

```sh
git clone https://github.com/hitesh22rana/aux.git
cd aux
npm ci
cp .env.example .env.local
docker compose up -d redis
npm run dev -- --hostname 0.0.0.0
```

Start the queue worker in a separate terminal:

```sh
npm run worker
```

Open **http://127.0.0.1:3000**. The initial demo is silent and works without connecting a music account. Live queues require Redis; automatic playback additionally requires configuring the selected integration. Host-led handoff does not require music-service credentials in Aux.

See the [technical setup guide](docs/SETUP.md) for environment variables, adapter-specific requirements, supported link formats, persistence, and deployment limits.

## Built with

Next.js, TypeScript, Tailwind CSS, Redis Streams, SQLite, Radix Dialog, and Sonner. The web app handles rooms and requests; a separate worker coordinates supported automatic playback. Redis stores live queue state, while SQLite stores membership and encrypted integration credentials.

## Checks

```sh
npm run lint
npm run typecheck
npm run build
# Requires Redis:
npm run test:unit
# With the web app running:
npm test
```

The test suites cover queue concurrency, permissions, durable worker delivery, recovery, host-led confirmation, and desktop/mobile browser flows. External-app behavior and audio output still need testing on real devices.

## Project guides

- [Setup, integration capabilities, and deployment](docs/SETUP.md)
- [Environment template](.env.example)
- [Local Redis configuration](compose.yaml)
