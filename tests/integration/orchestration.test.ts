import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
vi.mock("server-only", () => ({}));
const directory = mkdtempSync(path.join(tmpdir(), "aux-test-"));
const namespace = `aux-test-${process.pid}`;
let store: typeof import("@/features/listening-room/server/room-repository");
let queue: typeof import("@/features/listening-room/server/live-queue");
let storage: typeof import("@/features/listening-room/server/spotify-storage");
let worker: typeof import("@/features/listening-room/server/playback-worker");
let provider: typeof import("@/features/listening-room/server/providers/spotify");
let orchestration: typeof import("@/features/listening-room/server/room-service");
let queueKeys: typeof import("@/features/listening-room/server/queue-keys").queueKeys;
let redisModule: typeof import("@/server/redis/connection");
function required<T>(value: T | undefined): T {
  expect(value).toBeDefined();
  if (value === undefined) throw new Error("Expected a test fixture value.");
  return value;
}
const one = "spotify:track:1111111111111111111111";
const two = "spotify:track:2222222222222222222222";
const three = "spotify:track:3333333333333333333333";
function raw(uri = one) {
  return {
    id: uri.split(":")[2],
    uri,
    type: "track",
    name: uri === one ? "One" : uri === two ? "Two" : "Three",
    duration_ms: 180000,
    artists: [{ name: "Artist" }],
    album: { name: "Album", images: [] },
  };
}
let player: import("@/features/listening-room/server/providers/spotify").Player;
function room() {
  const data = store.createRoom("Test session", "Host", "Spotify");
  storage.putTokens(data.room.code, {
    access: "test-only-access",
    refresh: "test-only-refresh",
    expires: Date.now() + 3600000,
    accountId: "test-account",
  });
  return data;
}
beforeAll(async () => {
  vi.stubEnv("AUX_DATA_DIR", directory);
  vi.stubEnv("AUX_TOKEN_ENCRYPTION_KEY", "42".repeat(32));
  vi.stubEnv("AUX_QUEUE_NAMESPACE", namespace);
  vi.stubEnv(
    "REDIS_URL",
    process.env.AUX_TEST_REDIS_URL || "redis://127.0.0.1:6379/15",
  );
  vi.stubEnv("SPOTIFY_CLIENT_ID", "test-client");
  vi.stubEnv(
    "SPOTIFY_REDIRECT_URI",
    "http://127.0.0.1:3000/api/spotify/callback",
  );
  ({ queueKeys } = await import("@/features/listening-room/server/queue-keys"));
  store = await import("@/features/listening-room/server/room-repository");
  queue = await import("@/features/listening-room/server/live-queue");
  storage = await import("@/features/listening-room/server/spotify-storage");
  provider = await import("@/features/listening-room/server/providers/spotify");
  worker = await import("@/features/listening-room/server/playback-worker");
  orchestration = await import("@/features/listening-room/server/room-service");
  redisModule = await import("@/server/redis/connection");
  await redisModule.redis();
});
beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  player = {
    device: { id: "host-phone", name: "Host phone", is_restricted: false },
    is_playing: true,
    progress_ms: 20000,
    item: raw(three),
  };
  vi.spyOn(provider.spotify, "player").mockImplementation(async () =>
    structuredClone(player),
  );
  vi.spyOn(provider.spotify, "track").mockImplementation(async (_code, id) =>
    provider.mapSpotifyTrack(raw(`spotify:track:${id}`))!,
  );
  vi.spyOn(provider.spotify, "play").mockImplementation(async (_code, uri) => {
    player = { ...player, item: raw(uri), is_playing: true, progress_ms: 0 };
    return null;
  });
  vi.spyOn(provider.spotify, "toggle").mockImplementation(
    async (_code, playing) => {
      player.is_playing = !playing;
      return null;
    },
  );
});
afterAll(async () => {
  const client = await redisModule.redis();
  for await (const keys of client.scanIterator({ MATCH: `${namespace}:*` }))
    if (keys.length) await client.del(keys);
  await client.close();
  const { db } = await import("@/server/database/sqlite");
  db.close();
  rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("Aux-owned durable queue", () => {
  it("atomically accepts concurrent requests, keeps votes, and enforces idempotency", async () => {
    const h = room();
    const guest = store.joinRoom(h.room.code, "Guest");
    const request = randomUUID();
    await Promise.all([
      orchestration.requestTrack(h.room.code, h.token, one, request),
      orchestration.requestTrack(h.room.code, guest.token, two, randomUUID()),
    ]);
    await orchestration.requestTrack(h.room.code, h.token, one, request);
    const state = await queue.queueState(h.room);
    expect(state.queue).toHaveLength(2);
    expect(provider.spotify.play).not.toHaveBeenCalled();
    await orchestration.liveCommand(h.room.code, guest.token, {
      type: "vote",
      itemId: required(state.queue[0]).id,
    });
    expect(required((await queue.queueState(h.room)).queue[0]).votes).toContain(
      guest.room.me,
    );
    const client = await redisModule.redis();
    expect(await client.xLen(queueKeys.events)).toBeGreaterThan(0);
  });
  it("allows Aux reorder and removal while enforcing host ownership", async () => {
    const h = room();
    const g = store.joinRoom(h.room.code, "Guest");
    await orchestration.requestTrack(h.room.code, h.token, one, randomUUID());
    await orchestration.requestTrack(h.room.code, g.token, two, randomUUID());
    let state = await queue.queueState(h.room);
    await expect(
      orchestration.liveCommand(h.room.code, g.token, {
        type: "promote",
        itemId: required(state.queue[1]).id,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await orchestration.liveCommand(h.room.code, h.token, {
      type: "promote",
      itemId: required(state.queue[1]).id,
    });
    state = await queue.queueState(h.room);
    expect(required(state.queue[0]).trackId).toBe(two);
    await orchestration.liveCommand(h.room.code, g.token, {
      type: "remove",
      itemId: required(state.queue[0]).id,
    });
    expect(
      (await queue.queueState(h.room)).queue.map((q) => q.trackId),
    ).toEqual([one]);
  });
  it("waits for the host, then plays exactly one selected URI and advances near natural completion", async () => {
    const h = room();
    await orchestration.requestTrack(h.room.code, h.token, one, randomUUID());
    await orchestration.requestTrack(h.room.code, h.token, two, randomUUID());
    await worker.processRoom(h.room.code);
    expect(provider.spotify.play).not.toHaveBeenCalled();
    await orchestration.liveCommand(h.room.code, h.token, { type: "next" });
    await worker.processRoom(h.room.code);
    expect(provider.spotify.play).toHaveBeenCalledExactlyOnceWith(
      h.room.code,
      one,
      "host-phone",
    );
    await worker.processRoom(h.room.code);
    let state = await queue.queueState(h.room);
    expect(state.active?.trackId).toBe(one);
    expect(state.queue.map((q) => q.trackId)).toEqual([two]);
    player.progress_ms = 178000;
    await worker.processRoom(h.room.code);
    player = {
      ...player,
      item: raw(three),
      progress_ms: 500,
      is_playing: true,
    };
    await worker.processRoom(h.room.code);
    expect(provider.spotify.play).toHaveBeenLastCalledWith(
      h.room.code,
      two,
      "host-phone",
    );
    await worker.processRoom(h.room.code);
    state = await queue.queueState(h.room);
    expect(state.active?.trackId).toBe(two);
    expect(state.queue).toHaveLength(0);
  });
  it("recovers a confirmed dispatch after a crash without replaying it", async () => {
    const h = room();
    await orchestration.requestTrack(h.room.code, h.token, one, randomUUID());
    await queue.changeQueue(h.room, (s) => {
      s.operation = {
        id: randomUUID(),
        kind: "start",
        item: s.queue[0],
        phase: "sending",
        at: Date.now() - 20000,
      };
    });
    player.item = raw(one);
    await worker.processRoom(h.room.code);
    expect(provider.spotify.play).not.toHaveBeenCalled();
    const state = await queue.queueState(h.room);
    expect(state.active?.trackId).toBe(one);
    expect(state.operation).toBeUndefined();
  });
  it("never blindly retries a timed-out playback command and lets the host explicitly recover", async () => {
    const h = room();
    await orchestration.requestTrack(h.room.code, h.token, one, randomUUID());
    await orchestration.liveCommand(h.room.code, h.token, { type: "next" });
    vi.mocked(provider.spotify.play).mockRejectedValueOnce(
      new provider.SpotifyError("Unknown delivery", 503, true),
    );
    await worker.processRoom(h.room.code);
    await worker.processRoom(h.room.code);
    expect(provider.spotify.play).toHaveBeenCalledTimes(1);
    expect((await queue.queueState(h.room)).operation?.phase).toBe("uncertain");
    await orchestration.recoverQueue(h.room.code, h.token);
    await worker.processRoom(h.room.code);
    expect(provider.spotify.play).toHaveBeenCalledTimes(2);
  });
  it("respects manual pauses and external track changes instead of hijacking playback", async () => {
    const h = room();
    await orchestration.requestTrack(h.room.code, h.token, one, randomUUID());
    await orchestration.liveCommand(h.room.code, h.token, { type: "next" });
    await worker.processRoom(h.room.code);
    await worker.processRoom(h.room.code);
    player.is_playing = false;
    player.progress_ms = 30000;
    await worker.processRoom(h.room.code);
    expect(provider.spotify.play).toHaveBeenCalledTimes(1);
    player.is_playing = true;
    player.item = raw(two);
    await worker.processRoom(h.room.code);
    expect((await queue.queueState(h.room)).automation).toBe(false);
    expect(provider.spotify.play).toHaveBeenCalledTimes(1);
  });
  it("keeps the queue when no device is active, and guests cannot control playback", async () => {
    const h = room();
    const guest = store.joinRoom(h.room.code, "Guest");
    await orchestration.requestTrack(
      h.room.code,
      guest.token,
      one,
      randomUUID(),
    );
    player.device = undefined;
    await worker.processRoom(h.room.code);
    expect((await queue.queueState(h.room)).queue).toHaveLength(1);
    expect(provider.spotify.play).not.toHaveBeenCalled();
    await expect(
      orchestration.liveCommand(h.room.code, guest.token, { type: "next" }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("serializes competing workers with a lease", async () => {
    const h = room();
    await orchestration.requestTrack(h.room.code, h.token, one, randomUUID());
    await orchestration.liveCommand(h.room.code, h.token, { type: "next" });
    await Promise.all([
      worker.processRoom(h.room.code),
      worker.processRoom(h.room.code),
    ]);
    expect(provider.spotify.play).toHaveBeenCalledTimes(1);
  });
  it("does not dispatch after the host ends the room", async () => {
    const h = room();
    await orchestration.requestTrack(h.room.code, h.token, one, randomUUID());
    await orchestration.liveCommand(h.room.code, h.token, { type: "end" });
    await worker.processRoom(h.room.code);
    expect(provider.spotify.play).not.toHaveBeenCalled();
    await expect(
      orchestration.requestTrack(h.room.code, h.token, two, randomUUID()),
    ).rejects.toMatchObject({ status: 410 });
  });

  it("recovers an abandoned stream delivery through XAUTOCLAIM", async () => {
    const h = room();
    await orchestration.requestTrack(h.room.code, h.token, one, randomUUID());
    const client = await redisModule.redis();
    const stream = queueKeys.events;
    try {
      await client.sendCommand([
        "XGROUP",
        "CREATE",
        stream,
        "playback-workers",
        "0",
        "MKSTREAM",
      ]);
    } catch (e) {
      if (!(e as Error).message.includes("BUSYGROUP")) throw e;
    }
    const entries = (await client.sendCommand([
      "XREADGROUP",
      "GROUP",
      "playback-workers",
      "crashed-worker",
      "COUNT",
      "1000",
      "STREAMS",
      stream,
      ">",
    ])) as [string, [string, string[]][]][];
    const target = entries
      .flatMap(([, rows]) => rows)
      .find(
        ([, fields]) => fields[fields.indexOf("room") + 1] === h.room.code,
      )!;
    expect(target).toBeDefined();
    const ids = [target[0]];
    await client.sendCommand([
      "XCLAIM",
      stream,
      "playback-workers",
      "crashed-worker",
      "0",
      ...ids,
      "IDLE",
      "60000",
    ]);
    const controller = new AbortController();
    const work = worker.runWorker(controller.signal);
    work.catch(() => {});
    try {
      await expect
        .poll(
          async () =>
            (
              (await client.sendCommand([
                "XPENDING",
                stream,
                "playback-workers",
                target[0],
                target[0],
                "1",
              ])) as unknown[]
            ).length,
          { timeout: 10000 },
        )
        .toBe(0);
    } finally {
      controller.abort();
      await work;
    }
  });
  it("advances an Aux queue when Spotify repeats the same completed track", async () => {
    const h = room();
    await orchestration.requestTrack(h.room.code, h.token, one, randomUUID());
    await orchestration.requestTrack(h.room.code, h.token, two, randomUUID());
    await orchestration.liveCommand(h.room.code, h.token, { type: "next" });
    await worker.processRoom(h.room.code);
    await worker.processRoom(h.room.code);
    player.progress_ms = 179000;
    await worker.processRoom(h.room.code);
    player.progress_ms = 100;
    await worker.processRoom(h.room.code);
    expect(provider.spotify.play).toHaveBeenLastCalledWith(
      h.room.code,
      two,
      "host-phone",
    );
  });
  it("consumes Redis Stream events and runs independently of a browser", async () => {
    const h = room();
    await orchestration.requestTrack(h.room.code, h.token, one, randomUUID());
    await orchestration.liveCommand(h.room.code, h.token, { type: "next" });
    const controller = new AbortController();
    const work = worker.runWorker(controller.signal);
    work.catch(() => {});
    try {
      await expect
        .poll(async () => (await queue.queueState(h.room)).active?.trackId, {
          timeout: 10000,
        })
        .toBe(one);
    } finally {
      controller.abort();
      await work;
    }
  });
});
describe("Spotify protocol and secret storage", () => {
  it("reports malformed redirect configuration as a setup error", () => {
    const previous = process.env.SPOTIFY_REDIRECT_URI;
    vi.stubEnv("SPOTIFY_REDIRECT_URI", "not-a-url");
    try {
      expect(() => provider.spotifyConfig()).toThrowError(
        expect.objectContaining({ status: 503 }),
      );
    } finally {
      vi.stubEnv("SPOTIFY_REDIRECT_URI", previous);
    }
  });
  it("rejects malformed request origins without an unhandled URL error", async () => {
    const { NextRequest } = await import("next/server");
    const { checkOrigin } = await import("@/server/http/responses");
    const request = new NextRequest("http://127.0.0.1:3000/api/rooms", {
      headers: { host: "127.0.0.1:3000", origin: "not-a-url" },
    });
    expect(() => checkOrigin(request)).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
  });

  it("encrypts tokens at rest and rejects a replayed OAuth state", async () => {
    const h = room();
    const { db } = await import("@/server/database/sqlite");
    const row = db
      .prepare("SELECT tokens FROM spotify_connections WHERE code=?")
      .get(h.room.code) as { tokens: string };
    expect(row.tokens).not.toContain("test-only-access");
    expect(row.tokens.split(".")).toHaveLength(3);
    expect(storage.getTokens(h.room.code)?.access).toBe("test-only-access");
    storage.putOAuth("state-one", {
      code: h.room.code,
      session: "session-hash",
      verifier: "private-verifier",
    });
    expect(storage.takeOAuth("state-one").verifier).toBe("private-verifier");
    expect(() => storage.takeOAuth("state-one")).toThrow();
  });

  it("binds PKCE OAuth to the host session and rejects callback replay", async () => {
    const h = room();
    const { NextRequest } = await import("next/server");
    const route = await import("../../src/app/api/rooms/[code]/spotify/route");
    const callback = await import("../../src/app/api/spotify/callback/route");
    const request = new NextRequest(
      `http://127.0.0.1:3000/api/rooms/${h.room.code}/spotify`,
      {
        method: "POST",
        headers: {
          host: "127.0.0.1:3000",
          origin: "http://127.0.0.1:3000",
          cookie: `aux_${h.room.code}=${h.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: "connect" }),
      },
    );
    const response = await route.POST(request, {
      params: Promise.resolve({ code: h.room.code }),
    });
    expect(response.status).toBe(200);
    const authUrl = new URL((await response.json()).url);
    expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
    const state = authUrl.searchParams.get("state")!;
    const fetcher = vi.fn().mockImplementation(async (url: string) =>
      url.includes("/api/token")
        ? Response.json({
            access_token: "callback-access",
            refresh_token: "callback-refresh",
            expires_in: 3600,
            scope: provider.spotifyScopes,
          })
        : Response.json({ id: "callback-account" }),
    );
    vi.stubGlobal("fetch", fetcher);
    const callbackRequest = () =>
      new NextRequest(
        `http://127.0.0.1:3000/api/spotify/callback?code=authorization-code&state=${state}`,
        {
          headers: {
            cookie: `aux_spotify_oauth=${state}; aux_${h.room.code}=${h.token}`,
          },
        },
      );
    const connected = await callback.GET(callbackRequest());
    expect(connected.status).toBe(307);
    expect(connected.headers.get("location")).toContain("spotify=connected");
    expect(storage.getTokens(h.room.code)?.accountId).toBe("callback-account");
    expect(
      JSON.stringify(
        await (
          await route.GET(
            new NextRequest(request.url, {
              headers: { cookie: `aux_${h.room.code}=${h.token}` },
            }),
            { params: Promise.resolve({ code: h.room.code }) },
          )
        ).json(),
      ),
    ).not.toContain("callback-access");
    expect((await callback.GET(callbackRequest())).status).toBe(400);
  });

  it("refreshes an expired token once for concurrent provider requests", async () => {
    const h = room();
    storage.putTokens(h.room.code, {
      access: "expired-access",
      refresh: "refresh-test",
      expires: 0,
      accountId: "test-account",
    });
    const fetcher = vi.fn().mockImplementation(async (url: string) =>
      url.includes("/api/token")
        ? Response.json({
            access_token: "renewed-access",
            expires_in: 3600,
            scope: provider.spotifyScopes,
          })
        : Response.json({ id: "test-account" }),
    );
    vi.stubGlobal("fetch", fetcher);
    await Promise.all([
      provider.spotifyRequest(h.room.code, "/me"),
      provider.spotifyRequest(h.room.code, "/me"),
    ]);
    expect(
      fetcher.mock.calls.filter(([url]) => String(url).includes("/api/token")),
    ).toHaveLength(1);
    expect(storage.getTokens(h.room.code)?.access).toBe("renewed-access");
    expect(storage.getTokens(h.room.code)?.refresh).toBe("refresh-test");
  });
  it("sends a single-track play command, not a native queue request", async () => {
    vi.restoreAllMocks();
    const h = room();
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    await provider.spotify.play(h.room.code, one, "phone");
    const [url, options] = required(fetcher.mock.calls[0]);
    expect(url).toContain("/me/player/play?device_id=phone");
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body)).toEqual({ uris: [one], position_ms: 0 });
    expect(url).not.toContain("/queue");
  });
  it("parses Spotify links without fetching arbitrary URLs", () => {
    expect(
      provider.spotifyTrackId(
        "https://open.spotify.com/track/1111111111111111111111?si=x",
      ),
    ).toBe("1111111111111111111111");
    expect(
      provider.spotifyTrackId(
        "https://evil.example/track/1111111111111111111111",
      ),
    ).toBeNull();
  });
});

const serviceLinks: [
  import("@/features/listening-room/model/room").Provider,
  string,
][] = [
  ["Apple Music", "https://music.apple.com/us/album/song/123?i=456&ls=1"],
  [
    "Amazon Music",
    "https://music.amazon.in/albums/B012345678?trackAsin=B087654321&ref=share",
  ],
  ["YouTube Music", "https://music.youtube.com/watch?v=abcdefghijk&si=share"],
  ["TIDAL", "https://tidal.com/browse/track/123456"],
  ["Deezer", "https://www.deezer.com/en/track/123456"],
  ["JioSaavn", "https://www.jiosaavn.com/song/test-song/abcdefgh"],
  ["SoundCloud", "https://soundcloud.com/test-artist/test-track?si=share"],
];
describe("Multi-provider host-led playback", () => {
  it.each(serviceLinks)(
    "queues and confirms %s without calling its player or Spotify",
    async (name, url) => {
      const handoff =
        await import("@/features/listening-room/server/handoff-service");
      const defs = await import("@/features/listening-room/model/providers");
      const host = store.createRoom("Service session", "Host", name);
      const guest = store.joinRoom(host.room.code, "Member");
      const requestId = randomUUID();
      let view = await handoff.requestLinkedTrack(host.room.code, guest.token, {
        url,
        title: "A shared song",
        artist: "An artist",
        requestId,
      });
      expect(view.queue).toHaveLength(1);
      expect(view.orchestration?.control).toBe("handoff");
      expect(view.current).toBeNull();
      expect(view.playing).toBe(false);
      await handoff.requestLinkedTrack(host.room.code, guest.token, {
        url,
        title: "A shared song",
        artist: "An artist",
        requestId,
      });
      expect((await queue.queueState(host.room)).queue).toHaveLength(1);
      await worker.processRoom(host.room.code);
      expect(provider.spotify.player).not.toHaveBeenCalled();
      expect(provider.spotify.play).not.toHaveBeenCalled();
      const prepared = await handoff.prepareHandoff(host.room.code, host.token);
      expect(prepared.room.queue).toHaveLength(1);
      expect(prepared.room.current).toBeNull();
      await expect(
        handoff.confirmHandoff(
          host.room.code,
          guest.token,
          prepared.selection.id,
        ),
      ).rejects.toMatchObject({ status: 403 });
      view = await handoff.confirmHandoff(
        host.room.code,
        host.token,
        prepared.selection.id,
      );
      expect(view.queue).toHaveLength(0);
      expect(view.current).toBe(defs.parseTrackLink(url)!.id);
      expect(view.orchestration?.hostConfirmed).toBe(true);
      expect(view.playing).toBe(false);
      await handoff.confirmHandoff(
        host.room.code,
        host.token,
        prepared.selection.id,
      );
      expect(
        (await handoff.finishHandoff(host.room.code, host.token)).current,
      ).toBeNull();
    },
  );
  it("protects selected requests and cancels a selection without dequeuing", async () => {
    const handoff =
      await import("@/features/listening-room/server/handoff-service");
    const host = store.createRoom("Manual session", "Host", "Apple Music");
    const guest = store.joinRoom(host.room.code, "Member");
    const view = await handoff.requestLinkedTrack(host.room.code, guest.token, {
      url: required(serviceLinks[0])[1],
      title: "Song",
      artist: "",
      requestId: randomUUID(),
    });
    const selected = await handoff.prepareHandoff(host.room.code, host.token);
    await expect(
      orchestration.liveCommand(host.room.code, guest.token, {
        type: "remove",
        itemId: required(view.queue[0]).id,
      }),
    ).rejects.toMatchObject({ status: 409 });
    const cancelled = await handoff.cancelHandoff(
      host.room.code,
      host.token,
      selected.selection.id,
    );
    expect(cancelled.queue).toHaveLength(1);
    await orchestration.liveCommand(host.room.code, guest.token, {
      type: "remove",
      itemId: required(view.queue[0]).id,
    });
    expect((await queue.queueState(host.room)).queue).toHaveLength(0);
    await expect(
      handoff.confirmHandoff(host.room.code, host.token, selected.selection.id),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("rejects expired handoffs, mismatched providers, remote controls and ended-room requests", async () => {
    const handoff =
      await import("@/features/listening-room/server/handoff-service");
    const host = store.createRoom("Manual session", "Host", "Amazon Music");
    await expect(
      handoff.requestLinkedTrack(host.room.code, host.token, {
        url: required(serviceLinks[0])[1],
        title: "Song",
        artist: "",
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 422 });
    await handoff.requestLinkedTrack(host.room.code, host.token, {
      url: required(serviceLinks[1])[1],
      title: "Song",
      artist: "",
      requestId: randomUUID(),
    });
    const selected = await handoff.prepareHandoff(host.room.code, host.token);
    await queue.changeQueue(host.room, (state) => {
      state.handoff!.expiresAt = Date.now() - 1;
    });
    await expect(
      handoff.confirmHandoff(host.room.code, host.token, selected.selection.id),
    ).rejects.toMatchObject({ status: 409 });
    expect((await queue.queueState(host.room)).queue).toHaveLength(1);
    await expect(
      orchestration.liveCommand(host.room.code, host.token, { type: "toggle" }),
    ).rejects.toMatchObject({ status: 409 });
    await orchestration.liveCommand(host.room.code, host.token, {
      type: "end",
    });
    await expect(
      handoff.prepareHandoff(host.room.code, host.token),
    ).rejects.toMatchObject({ status: 410 });
  });
  it("canonicalizes service links, strips trackers, and rejects unsafe or non-track URLs", async () => {
    const { parseTrackLink, providerDefinitions } =
      await import("@/features/listening-room/model/providers");
    expect(providerDefinitions).toHaveLength(8);
    expect(parseTrackLink("https://youtu.be/abcdefghijk?si=share")?.url).toBe(
      "https://music.youtube.com/watch?v=abcdefghijk",
    );
    expect(parseTrackLink(required(serviceLinks[0])[1])?.url).toBe(
      "https://music.apple.com/us/album/123?i=456",
    );
    expect(parseTrackLink("https://music.apple.com/us/song/name/456")?.id).toBe(
      parseTrackLink(required(serviceLinks[0])[1])?.id,
    );
    for (const unsafe of [
      "javascript:alert(1)",
      "http://music.apple.com/us/song/123",
      "https://music.apple.com.evil.example/us/song/123",
      "https://user:password@music.apple.com/us/song/123",
      "https://music.apple.com/us/album/name/123",
      "https://www.deezer.com/playlist/123",
      "https://tidal.com/browse/track/+",
      "https://soundcloud.com/artist/sets/list",
      "https://music.youtube.com/playlist?list=abc",
      "https://music.amazon.com/search/song",
      "https://127.0.0.1/track/123",
      "https://music.apple.com:8443/us/song/123",
    ])
      expect(parseTrackLink(unsafe)).toBeNull();
  });
});

describe("room presence and departure", () => {
  it("counts independent tabs, prevents late resurrection and expires lost connections", async () => {
    const presence =
      await import("@/features/listening-room/server/room-presence");
    const { PRESENCE_WINDOW_MS } =
      await import("@/features/listening-room/model/presence");
    const h = room();
    const guest = store.joinRoom(h.room.code, "Guest");
    const first = randomUUID(),
      second = randomUUID();
    await presence.updatePresence(h.room.code, guest.room.me, first, "online");
    await presence.updatePresence(h.room.code, guest.room.me, second, "online");
    let members = await presence.roomPresence(store.readRoom(h.room.code));
    expect(members.find((member) => member.id === guest.room.me)).toMatchObject(
      { active: true, connections: 2 },
    );
    await presence.updatePresence(h.room.code, guest.room.me, first, "offline");
    await presence.updatePresence(h.room.code, guest.room.me, first, "online");
    members = await presence.roomPresence(store.readRoom(h.room.code));
    expect(members.find((member) => member.id === guest.room.me)).toMatchObject(
      { active: true, connections: 1 },
    );
    await presence.updatePresence(
      h.room.code,
      guest.room.me,
      second,
      "offline",
    );
    await (
      await redisModule.redis()
    ).zAdd(queueKeys.presence(h.room.code), {
      value: `${guest.room.me}:${randomUUID()}`,
      score: Date.now() - PRESENCE_WINDOW_MS - 1,
    });
    members = await presence.roomPresence(store.readRoom(h.room.code));
    expect(members.find((member) => member.id === guest.room.me)).toMatchObject(
      { active: false, connections: 0 },
    );
  });
  it("reuses browser membership and revokes a guest without ending the room or dropping their request", async () => {
    const h = room();
    const guest = store.joinRoom(h.room.code, "Guest");
    expect(
      store.joinRoom(h.room.code, "Same browser", guest.token).room.me,
    ).toBe(guest.room.me);
    expect(store.readRoom(h.room.code).members).toHaveLength(2);
    await orchestration.requestTrack(
      h.room.code,
      guest.token,
      two,
      randomUUID(),
    );
    await expect(
      orchestration.leaveSession(h.room.code, guest.token),
    ).resolves.toEqual({ left: true, ended: false });
    expect(() => store.identify(h.room.code, guest.token)).toThrow(
      "Join this room",
    );
    const state = await queue.queueState(h.room);
    expect(state.ended).toBe(false);
    expect(state.queue).toEqual([
      expect.objectContaining({ memberId: guest.room.me }),
    ]);
    expect(store.identify(h.room.code, h.token).host).toBe(true);
    expect(
      store
        .readRoom(h.room.code)
        .members.find((member) => member.id === guest.room.me)?.leftAt,
    ).toBeGreaterThan(0);
    expect(
      store.joinRoom(h.room.code, "Rejoined", guest.token).room.me,
    ).not.toBe(guest.room.me);
  });
  it("ends durable playback automation before revoking the host", async () => {
    const h = room();
    await expect(
      orchestration.leaveSession(h.room.code, h.token),
    ).resolves.toEqual({ left: true, ended: true });
    expect(store.readRoom(h.room.code).ended).toBe(true);
    expect((await queue.queueState(h.room)).ended).toBe(true);
    expect(storage.hasConnection(h.room.code)).toBe(false);
    expect(() => store.identify(h.room.code, h.token)).toThrow(
      "Join this room",
    );
  });
  it("keeps host membership when ending the durable queue fails", async () => {
    const h = room();
    vi.spyOn(queue, "changeQueue").mockRejectedValueOnce(
      new Error("Queue unavailable"),
    );
    await expect(
      orchestration.leaveSession(h.room.code, h.token),
    ).rejects.toThrow("Queue unavailable");
    expect(store.identify(h.room.code, h.token).host).toBe(true);
    expect(store.readRoom(h.room.code).ended).toBe(false);
  });
});

it("revokes a departed member even when ephemeral presence cleanup fails", async () => {
  const presence =
    await import("@/features/listening-room/server/room-presence");
  const h = room();
  const guest = store.joinRoom(h.room.code, "Guest");
  await presence.updatePresence(
    h.room.code,
    guest.room.me,
    randomUUID(),
    "online",
  );
  vi.spyOn(presence, "clearMemberPresence").mockRejectedValueOnce(
    new Error("Presence unavailable"),
  );
  await expect(
    orchestration.leaveSession(h.room.code, guest.token),
  ).resolves.toEqual({ left: true, ended: false });
  expect(() => store.identify(h.room.code, guest.token)).toThrow(
    "Join this room",
  );
  const members = await presence.roomPresence(store.readRoom(h.room.code));
  expect(members.find((member) => member.id === guest.room.me)).toMatchObject({
    active: false,
    connections: 0,
  });
});

it("allows a member to keep more than three pending requests", async () => {
  const h = room();
  const guest = store.joinRoom(h.room.code, "Guest");
  for (const digit of ["1", "2", "3", "4", "5"])
    await orchestration.requestTrack(
      h.room.code,
      guest.token,
      `spotify:track:${digit.repeat(22)}`,
      randomUUID(),
    );
  const state = await queue.queueState(h.room);
  expect(
    state.queue.filter((item) => item.memberId === guest.room.me),
  ).toHaveLength(5);
});
it("lists only current memberships authorized by the supplied browser cookies", async () => {
  const h = room();
  const guest = store.joinRoom(h.room.code, "Guest");
  const cookie = (token: string) => [
    { name: `aux_${h.room.code}`, value: token },
  ];
  expect(store.browserSessions([])).toEqual([]);
  expect(store.browserSessions(cookie("invalid"))).toEqual([]);
  expect(store.browserSessions(cookie(h.token))).toEqual([
    expect.objectContaining({ code: h.room.code, host: true }),
  ]);
  expect(store.browserSessions(cookie(guest.token))).toEqual([
    expect.objectContaining({ code: h.room.code, host: false }),
  ]);
  await orchestration.leaveSession(h.room.code, guest.token);
  expect(store.browserSessions(cookie(guest.token))).toEqual([]);
  await orchestration.leaveSession(h.room.code, h.token);
  expect(store.browserSessions(cookie(h.token))).toEqual([]);
  const expired = room();
  const { db } = await import("@/server/database/sqlite");
  db.prepare("UPDATE rooms SET expires=? WHERE code=?").run(
    Date.now() - 1,
    expired.room.code,
  );
  expect(
    store.browserSessions([
      { name: `aux_${expired.room.code}`, value: expired.token },
    ]),
  ).toEqual([]);
});

it("only hosts remove guests, revoke all guest sessions and preserve accepted requests", async () => {
  const host = room();
  const guest = store.joinRoom(host.room.code, "Guest");
  await orchestration.requestTrack(
    host.room.code,
    guest.token,
    one,
    randomUUID(),
  );
  await expect(
    orchestration.liveCommand(host.room.code, guest.token, {
      type: "kick",
      memberId: host.room.me,
    }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    orchestration.liveCommand(host.room.code, host.token, {
      type: "kick",
      memberId: host.room.me,
    }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    orchestration.liveCommand(host.room.code, host.token, {
      type: "kick",
      memberId: "a".repeat(24),
    }),
  ).rejects.toMatchObject({ status: 404 });
  const result = await orchestration.liveCommand(host.room.code, host.token, {
    type: "kick",
    memberId: guest.room.me,
  });
  expect(
    result.members.find((member) => member.id === guest.room.me)?.leftAt,
  ).toBeTruthy();
  expect(result.queue.some((item) => item.memberId === guest.room.me)).toBe(
    true,
  );
  expect(() => store.identify(host.room.code, guest.token)).toThrow();
  await expect(
    orchestration.requestTrack(host.room.code, guest.token, two, randomUUID()),
  ).rejects.toMatchObject({ status: 401 });
});

describe("membership changes during queue admission", () => {
  async function holdCommit(code: string) {
    const client = await redisModule.redis();
    const original = client.eval.bind(client);
    const reached = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let held = false;
    vi.spyOn(client, "eval").mockImplementation(async (...args) => {
      if (!held && args[1]?.keys?.[0] === queueKeys.state(code)) {
        held = true;
        reached.resolve();
        await release.promise;
      }
      return original(...args);
    });
    return { reached: reached.promise, release: release.resolve };
  }

  it.each(["kick", "leave", "lock"] as const)(
    "rejects a pending request after completed %s, including an already authorized CAS",
    async (action) => {
      const h = room();
      const guest = store.joinRoom(h.room.code, "Guest");
      await orchestration.requestTrack(h.room.code, h.token, one, randomUUID());
      const gate = await holdCommit(h.room.code);
      const pending = orchestration.requestTrack(
        h.room.code,
        guest.token,
        two,
        randomUUID(),
      );
      // Attach the rejection observer before releasing a pending async operation.
      const rejected = expect(pending).rejects.toMatchObject({
        status: action === "lock" ? 403 : 401,
      });
      await gate.reached;
      try {
        if (action === "leave")
          await orchestration.leaveSession(h.room.code, guest.token);
        else
          await orchestration.liveCommand(
            h.room.code,
            h.token,
            action === "kick"
              ? { type: "kick", memberId: guest.room.me }
              : { type: "lock" },
          );
      } finally {
        gate.release();
      }
      await rejected;
      expect(
        (await queue.queueState(h.room)).queue.map((item) => item.trackId),
      ).toEqual([one]);
    },
  );

  it("rechecks membership when a pending vote retries after removal", async () => {
    const h = room();
    const guest = store.joinRoom(h.room.code, "Guest");
    await orchestration.requestTrack(h.room.code, h.token, one, randomUUID());
    const item = required((await queue.queueState(h.room)).queue[0]);
    const gate = await holdCommit(h.room.code);
    const pending = orchestration.liveCommand(h.room.code, guest.token, {
      type: "vote",
      itemId: item.id,
    });
    const rejected = expect(pending).rejects.toMatchObject({ status: 401 });
    await gate.reached;
    try {
      await orchestration.liveCommand(h.room.code, h.token, {
        type: "kick",
        memberId: guest.room.me,
      });
    } finally {
      gate.release();
    }
    await rejected;
    expect(required((await queue.queueState(h.room)).queue[0]).votes).toEqual(
      [],
    );
  });

  it("rejects a pending linked request after removal before the Redis read completes", async () => {
    const host = store.createRoom("Shared session", "Host", "Apple Music");
    const guest = store.joinRoom(host.room.code, "Guest");
    const handoff =
      await import("@/features/listening-room/server/handoff-service");
    const client = await redisModule.redis();
    const original = client.get.bind(client);
    const reached = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let held = false;
    vi.spyOn(client, "get").mockImplementation(async (...args) => {
      if (!held && args[0] === queueKeys.state(host.room.code)) {
        held = true;
        reached.resolve();
        await release.promise;
      }
      return original(...args);
    });
    const pending = handoff.requestLinkedTrack(host.room.code, guest.token, {
      url: "https://music.apple.com/us/song/456",
      title: "Shared song",
      artist: "Artist",
      requestId: randomUUID(),
    });
    const rejected = expect(pending).rejects.toMatchObject({ status: 401 });
    await reached.promise;
    try {
      await orchestration.liveCommand(host.room.code, host.token, {
        type: "kick",
        memberId: guest.room.me,
      });
    } finally {
      release.resolve();
    }
    await rejected;
    expect((await queue.queueState(host.room)).queue).toEqual([]);
  });
});

describe("connection grant publication", () => {
  function attempt(code: string) {
    const state = randomUUID();
    storage.putOAuth(state, {
      code,
      session: "test-session",
      verifier: "test-verifier",
    });
    return storage.takeOAuth(state);
  }
  const grant = () => ({
    access: "new-test-access",
    refresh: "new-test-refresh",
    expires: Date.now() + 3600000,
    accountId: randomUUID(),
  });

  it("publishes a grant only for the current connection generation", () => {
    const h = room();
    const pending = attempt(h.room.code);
    const tokens = grant();
    storage.bindAccount(h.room.code, tokens, pending.generation);
    expect(storage.getTokens(h.room.code)).toEqual(tokens);
  });

  it("rejects a cancelled generation without publishing credentials", () => {
    const h = room();
    const pending = attempt(h.room.code);
    storage.disconnect(h.room.code);
    expect(() =>
      storage.bindAccount(h.room.code, grant(), pending.generation),
    ).toThrow(expect.objectContaining({ status: 409 }));
    expect(storage.hasConnection(h.room.code)).toBe(false);
  });

  it("preserves a newer connection when an older attempt is rejected", () => {
    const h = room();
    const older = attempt(h.room.code);
    const newer = attempt(h.room.code);
    const tokens = grant();
    storage.bindAccount(h.room.code, tokens, newer.generation);
    expect(() =>
      storage.bindAccount(h.room.code, grant(), older.generation),
    ).toThrow(expect.objectContaining({ status: 409 }));
    expect(storage.getTokens(h.room.code)).toEqual(tokens);
  });

  it("does not replace the existing connection when account verification fails", async () => {
    const h = room();
    const previous = storage.getTokens(h.room.code);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ id: "" })),
    );
    await expect(
      provider.spotifyAccount("new-test-access"),
    ).rejects.toMatchObject({ status: 502 });
    expect(storage.getTokens(h.room.code)).toEqual(previous);
  });

  it("verifies the new account without first storing its credentials", async () => {
    const h = room();
    storage.disconnect(h.room.code);
    const fetcher = vi.fn().mockImplementation(async () => {
      expect(storage.hasConnection(h.room.code)).toBe(false);
      return Response.json({ id: "verified-account" });
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(provider.spotifyAccount("new-test-access")).resolves.toBe(
      "verified-account",
    );
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.spotify.com/v1/me",
      expect.objectContaining({
        headers: { Authorization: "Bearer new-test-access" },
        redirect: "error",
      }),
    );
    expect(storage.hasConnection(h.room.code)).toBe(false);
  });
});
