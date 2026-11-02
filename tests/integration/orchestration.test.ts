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
