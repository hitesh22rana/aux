import { test, expect, type Page } from "@playwright/test";

async function createRoom(page: Page, provider = "Apple Music") {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create a room", exact: true })
    .click();
  await page.getByRole("radio", { name: provider, exact: true }).check();
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Host");
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  await expect(page).toHaveURL(/room=[A-F0-9]{6}/);
  return new URL(page.url()).searchParams.get("room")!;
}
async function addSong(page: Page, title: string, id = "456") {
  await page
    .getByRole("textbox", { name: "Song link", exact: true })
    .fill(`https://music.apple.com/us/album/test/123?i=${id}`);
  await page
    .getByRole("textbox", { name: "Song title", exact: true })
    .fill(title);
  await page
    .getByRole("button", { name: "Add song request", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `Vote for ${title}` }),
  ).toBeVisible();
}

test("host and member share durable requests and enforce room permissions", async ({
  browser,
}) => {
  const host = await browser.newContext();
  const guest = await browser.newContext();
  const h = await host.newPage();
  const g = await guest.newPage();
  const code = await createRoom(h);
  await g.goto(h.url());
  await g
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Guest");
  await g.getByRole("button", { name: "Join the room", exact: true }).click();
  await expect(g.getByRole("dialog")).not.toBeVisible();
  await addSong(g, "Shared pick");
  await expect(
    h.getByRole("button", { name: "Vote for Shared pick" }),
  ).toBeVisible({ timeout: 8000 });
  await g.getByRole("button", { name: "Vote for Shared pick" }).click();
  await expect(
    g.getByRole("button", { name: "Vote for Shared pick" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    (
      await guest.request.patch(`/api/rooms/${code}`, {
        data: { type: "lock" },
      })
    ).status(),
  ).toBe(403);
  await h.reload();
  await expect(
    h.getByRole("button", { name: "Vote for Shared pick" }),
  ).toBeVisible();
  await expect(
    h.getByRole("button", { name: "Room settings", exact: true }),
  ).toHaveCount(1);
  await expect(h.getByRole("button", { name: "Queue settings" })).toHaveCount(
    0,
  );
  await h.getByRole("button", { name: "Room settings", exact: true }).click();
  await h
    .getByRole("button", { name: "Pause new requests", exact: true })
    .click();
  await expect(
    h.getByRole("button", { name: "Pause new requests", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    (
      await guest.request.post(`/api/rooms/${code}/handoff`, {
        data: {
          type: "request",
          url: "https://music.apple.com/us/album/test/123?i=789",
          title: "Blocked",
          requestId: crypto.randomUUID(),
        },
      })
    ).status(),
  ).toBe(403);
  await h
    .getByRole("button", { name: "End session and leave", exact: true })
    .click();
  await expect(g.locator(".ended-banner")).toBeVisible({ timeout: 8000 });
  await host.close();
  await guest.close();
});

test("mobile room has real empty states, one settings entry and working navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText(/demo|sample group/i)).toHaveCount(0);
  await expect(page.locator(".queue-row")).toHaveCount(0);
  await createRoom(page);
  await expect(
    page.getByRole("heading", { name: "Your next great song goes here." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Room settings", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Room settings", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Room settings" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await addSong(page, "Mobile song");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "people", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "people", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("API validates requests, rejects duplicates and closes ended sessions", async ({
  playwright,
}) => {
  const host = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3000",
  });
  const stranger = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3000",
  });
  expect(
    (
      await host.post("/api/rooms", {
        data: { name: " ", person: "Host", provider: "Apple Music" },
      })
    ).status(),
  ).toBe(400);
  const created = await host.post("/api/rooms", {
    data: { name: "API session", person: "Host", provider: "Apple Music" },
  });
  expect(created.ok()).toBe(true);
  const { code, queue, mode, current } = await created.json();
  expect(queue).toEqual([]);
  expect(current).toBeNull();
  expect(mode).toBe("live");
  expect((await stranger.get(`/api/rooms/${code}`)).status()).toBe(401);
  expect(
    (
      await host.patch(`/api/rooms/${code}`, {
        headers: { origin: "https://other.example" },
        data: { type: "end" },
      })
    ).status(),
  ).toBe(403);
  const request = (id: string) => ({
    type: "request",
    url: `https://music.apple.com/us/album/test/123?i=${id}`,
    title: "API pick",
    requestId: crypto.randomUUID(),
  });
  expect(
    (
      await host.post(`/api/rooms/${code}/handoff`, {
        data: { ...request("456"), title: " " },
      })
    ).status(),
  ).toBe(400);
  for (const id of ["456", "457", "458"])
    expect(
      (
        await host.post(`/api/rooms/${code}/handoff`, { data: request(id) })
      ).ok(),
    ).toBe(true);
  expect(
    (
      await host.post(`/api/rooms/${code}/handoff`, { data: request("456") })
    ).status(),
  ).toBe(409);
  expect(
    (
      await host.post(`/api/rooms/${code}/handoff`, { data: request("459") })
    ).status(),
  ).toBe(200);
  expect(
    (await host.patch(`/api/rooms/${code}`, { data: { type: "end" } })).ok(),
  ).toBe(true);
  expect(
    (
      await stranger.post(`/api/rooms/${code}`, {
        data: { name: "Late member" },
      })
    ).status(),
  ).toBe(410);
  expect(
    (
      await host.patch(`/api/rooms/${code}`, { data: { type: "toggle" } })
    ).status(),
  ).toBe(410);
  await host.dispose();
  await stranger.dispose();
});

test("live rooms use the Aux queue without connector setup instructions", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create a room", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Live host");
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page).toHaveURL(/room=[A-F0-9]{6}/);
  await expect(
    page.getByRole("heading", { name: "Song requests 0" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Search Spotify songs" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect Spotify", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Spotify setup is needed on this server.", { exact: false }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/aux-live-queue.png",
    fullPage: true,
  });
});

test("Apple Music host-led handoff preserves requests until explicit host confirmation", async ({
  browser,
}) => {
  const host = await browser.newContext();
  const guest = await browser.newContext();
  const h = await host.newPage();
  const g = await guest.newPage();
  await h.goto("/");
  await h.getByRole("button", { name: "Create a room", exact: true }).click();
  await expect(h.getByRole("radio")).toHaveCount(8);
  await h.getByRole("radio", { name: /Apple Music/ }).check();
  await h
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Apple host");
  await h.getByRole("button", { name: "Create room" }).click();
  await expect(h).toHaveURL(/room=[A-F0-9]{6}/);
  await expect(
    h.getByRole("region", { name: "Apple Music handoff" }),
  ).toBeVisible();
  await expect(
    h.getByRole("button", { name: "Connect Spotify", exact: true }),
  ).not.toBeVisible();
  await g.goto(h.url());
  await g
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Member");
  await g.getByRole("button", { name: "Join the room", exact: true }).click();
  await g
    .getByRole("textbox", { name: "Song link", exact: true })
    .fill("https://music.apple.com/us/album/test/123?i=456");
  await g
    .getByRole("textbox", { name: "Song title", exact: true })
    .fill("Our shared song");
  await g
    .getByRole("textbox", { name: "Artist", exact: true })
    .fill("Our artist");
  await g
    .getByRole("button", { name: "Add song request", exact: true })
    .click();
  await expect(
    h.getByRole("button", { name: "Vote for Our shared song" }),
  ).toBeVisible({ timeout: 8000 });
  await expect(
    g.getByRole("button", { name: "Select next request", exact: true }),
  ).not.toBeVisible();
  await h
    .getByRole("button", { name: "Select next request", exact: true })
    .click();
  await expect(
    h.getByRole("link", { name: "Open in Apple Music", exact: true }),
  ).toHaveAttribute("href", "https://music.apple.com/us/album/123?i=456");
  await expect(h.locator(".queue-row")).toHaveCount(1);
  await h
    .getByRole("button", { name: "I started this song", exact: true })
    .click();
  await expect(h.locator(".queue-row")).toHaveCount(0);
  await expect(h.locator(".current-track h2")).toHaveText("Our shared song");
  await expect(h.getByText("Host confirmed", { exact: true })).toBeVisible();
  await expect(h.getByRole("progressbar")).not.toBeVisible();
  await h
    .getByRole("button", { name: "Mark current finished", exact: true })
    .click();
  await expect(h.locator(".current-track h2")).toHaveText(
    "Your soundtrack awaits",
  );
  await h.screenshot({
    path: "test-results/aux-apple-handoff.png",
    fullPage: true,
  });
  await host.close();
  await guest.close();
});

test("Amazon Music and the remaining handoff services are selectable on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create a room", exact: true })
    .click();
  for (const name of [
    "Spotify",
    "Apple Music",
    "Amazon Music",
    "YouTube Music",
    "TIDAL",
    "Deezer",
    "JioSaavn",
    "SoundCloud",
  ])
    await expect(
      page.getByRole("radio", { name: new RegExp(name) }),
    ).toBeEnabled();
  await page.getByRole("radio", { name: /Amazon Music/ }).check();
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Amazon host");
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(
    page.getByRole("region", { name: "Amazon Music handoff" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("textbox", { name: "Song link", exact: true })
    .fill("https://music.amazon.com/tracks/B012345678");
  await page
    .getByRole("textbox", { name: "Song title", exact: true })
    .fill("Shared song");
  await page
    .getByRole("button", { name: "Add song request", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Select next request", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Open in Amazon Music", exact: true }),
  ).toHaveAttribute("href", "https://music.amazon.com/tracks/B012345678");
  await page.screenshot({
    path: "test-results/aux-amazon-mobile.png",
    fullPage: true,
  });
});

test("catalog search clears stale results when the query changes", async ({
  page,
}) => {
  await page.route("**/api/rooms/*/spotify?q=**", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q");
    await route.fulfill({
      json: {
        tracks: [
          {
            id: "spotify:track:1111111111111111111111",
            title: query === "gold" ? "Golden result" : "Sunflower result",
            artist: "Search artist",
            album: "Search album",
            duration: 180,
            art: "placeholder",
            mood: "",
            provider: "Spotify",
            url: "https://open.spotify.com/track/1111111111111111111111",
          },
        ],
      },
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create a room", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Search host");
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  const search = page.getByRole("textbox", { name: "Search Spotify songs" });
  await search.fill("gold");
  await expect(
    page.getByRole("heading", { name: "Golden result" }),
  ).toBeVisible();
  await search.fill("sun");
  await expect(
    page.getByRole("heading", { name: "Golden result" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sunflower result" }),
  ).toBeVisible();
  await search.fill("");
  await expect(
    page.getByRole("heading", { name: "Sunflower result" }),
  ).not.toBeVisible();
  await expect(
    page.getByText("Searching Spotify…", { exact: true }),
  ).not.toBeVisible();
});

test("create and join forms validate inline and focus the invalid field", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create a room", exact: true })
    .click();
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  await expect(
    page.getByText("Enter your name.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Your name", exact: true }),
  ).toBeFocused();
  await expect(page.locator("form")).toHaveAttribute("novalidate", "");
  await page.getByRole("textbox", { name: "Your name", exact: true }).fill(" ");
  await page
    .getByRole("textbox", { name: "Give your room a name", exact: true })
    .fill("");
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  await expect(
    page.getByText("Enter a room name.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Join a room", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Join the room", exact: true })
    .click();
  await expect(
    page.getByText("Enter the six-character room code."),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Room code", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("textbox", { name: "Room code", exact: true })
    .fill("zzzzzz");
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Name");
  await page
    .getByRole("button", { name: "Join the room", exact: true })
    .click();
  await expect(
    page.getByText("Enter the six-character room code."),
  ).toBeVisible();
});

test("song form validates service links inline and aligns required and unmarked labels", async ({
  page,
}) => {
  await createRoom(page);
  await page
    .getByRole("button", { name: "Add song request", exact: true })
    .click();
  await expect(
    page.getByText("Enter a song link.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Enter the song title.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Song link", exact: true }),
  ).toBeFocused();
  await expect(page.getByText("(optional)", { exact: true })).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Song link", exact: true })
    .fill("https://music.amazon.com/tracks/B012345678");
  await page
    .getByRole("textbox", { name: "Song title", exact: true })
    .fill("Cross service");
  await page
    .getByRole("button", { name: "Add song request", exact: true })
    .click();
  await expect(
    page.getByText("Use a song link from Apple Music for this room."),
  ).toBeVisible();
  await expect(page.locator(".queue-row")).toHaveCount(0);
  const title = await page
    .getByRole("textbox", { name: "Song title", exact: true })
    .boundingBox();
  const artist = await page
    .getByRole("textbox", { name: "Artist", exact: true })
    .boundingBox();
  expect(title?.y).toBe(artist?.y);
  await addSong(page, "Valid song");
  await expect(
    page.getByRole("textbox", { name: "Song title", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("textbox", { name: "Song link", exact: true }),
  ).toHaveValue("");
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: "test-results/aux-validated-form.png",
    fullPage: true,
  });
});

test("failed song requests preserve drafts and reuse their idempotency key", async ({
  page,
}) => {
  await createRoom(page);
  const requestIds: string[] = [];
  await page.route("**/api/rooms/*/handoff", async (route) => {
    const body = route.request().postDataJSON();
    if (body.type !== "request") {
      await route.continue();
      return;
    }
    requestIds.push(body.requestId);
    if (requestIds.length === 1)
      await route.fulfill({
        status: 503,
        json: { error: "Queue temporarily unavailable. Try again." },
      });
    else await route.continue();
  });
  await page
    .getByRole("textbox", { name: "Song link", exact: true })
    .fill("https://music.apple.com/us/album/123?i=456");
  await page
    .getByRole("textbox", { name: "Song title", exact: true })
    .fill("Retry song");
  await page
    .getByRole("button", { name: "Add song request", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Queue temporarily unavailable." }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Song title", exact: true }),
  ).toHaveValue("Retry song");
  await page
    .getByRole("button", { name: "Add song request", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Vote for Retry song" }),
  ).toBeVisible();
  expect(requestIds).toHaveLength(2);
  expect(requestIds[0]).toBe(requestIds[1]);
  await expect(
    page.getByRole("textbox", { name: "Song title", exact: true }),
  ).toHaveValue("");
});

test("home ignores saved rooms and the home link leaves an active room", async ({
  page,
}) => {
  const code = await createRoom(page);
  await page.evaluate(
    (savedCode) => localStorage.setItem("aux-room", savedCode),
    code,
  );
  const roomReads: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "GET" &&
      request.url().includes(`/api/rooms/${code}`)
    )
      roomReads.push(request.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Pass the aux." }),
  ).toBeVisible();
  await expect(page).toHaveURL("http://127.0.0.1:3000/");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Room settings", exact: true }),
  ).toHaveCount(0);
  expect(roomReads).toEqual([]);
  await page.goto(`/?room=${code}`);
  await expect(
    page.getByRole("button", { name: "Room settings", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Aux home" }).click();
  await expect(
    page.getByRole("heading", { name: "Pass the aux." }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Room settings", exact: true }),
  ).toHaveCount(0);
});

test("closed and invalid invitation links show the landing page without opening a form", async ({
  page,
}) => {
  const code = await createRoom(page);
  const ended = await page.request.patch(`/api/rooms/${code}`, {
    data: { type: "end" },
  });
  expect(ended.ok()).toBe(true);
  await page.goto(`/?room=${code}`);
  await expect(
    page.getByRole("alert").filter({ hasText: "no longer available" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Pass the aux." }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Room settings", exact: true }),
  ).toHaveCount(0);
  await expect(page).toHaveURL("http://127.0.0.1:3000/");
  await page.goto("/?room=invalid");
  await expect(
    page.getByRole("alert").filter({ hasText: "no longer available" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("extension-added root attributes do not cause hydration warnings", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const install = () => {
      if (!document.documentElement) return false;
      document.documentElement.setAttribute("data-lt-installed", "true");
      document.documentElement.setAttribute("suppresshydrationwarning", "true");
      return true;
    };
    if (!install()) {
      const observer = new MutationObserver(() => {
        if (install()) observer.disconnect();
      });
      observer.observe(document, { childList: true, subtree: true });
    }
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create a room", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    errors.filter((message) =>
      /hydrat|didn.t match|server rendered/i.test(message),
    ),
  ).toEqual([]);
});

test("invitation loading blocks the landing page until the room is resolved", async ({
  page,
}) => {
  const code = await createRoom(page);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/rooms/${code}`, async (route) => {
    if (route.request().method() === "GET") await gate;
    await route.continue();
  });
  await page.goto(`/?room=${code}`);
  await expect(
    page.getByRole("status").filter({ hasText: "Opening your room" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Pass the aux." }),
  ).toHaveCount(0);
  release();
  await expect(
    page.getByRole("button", { name: "Room settings", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Join a room", exact: true }),
  ).toHaveCount(0);
});

test("guest tabs share presence and explicit leave revokes their browser session", async ({
  browser,
}) => {
  const host = await browser.newContext();
  const guests = await browser.newContext();
  const h = await host.newPage();
  const code = await createRoom(h);
  const g = await guests.newPage();
  await g.goto(h.url());
  await g
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Presence guest");
  await g.getByRole("button", { name: "Join the room", exact: true }).click();
  await expect(g.getByRole("dialog")).toHaveCount(0);
  const second = await guests.newPage();
  await second.goto(`/?room=${code}`);
  await expect(
    second.getByRole("button", { name: "Room settings", exact: true }),
  ).toBeVisible();
  const guest = (await (await guests.request.get(`/api/rooms/${code}`)).json())
    .me;
  await expect
    .poll(async () => {
      const room = await (await host.request.get(`/api/rooms/${code}`)).json();
      return room.members.find((member: { id: string }) => member.id === guest)
        ?.connections;
    })
    .toBe(2);
  await second.close();
  await expect
    .poll(async () => {
      const room = await (await host.request.get(`/api/rooms/${code}`)).json();
      return room.members.find((member: { id: string }) => member.id === guest)
        ?.connections;
    })
    .toBe(1);
  await g.getByRole("button", { name: "Room settings", exact: true }).click();
  await expect(
    g.getByRole("button", { name: "End session and leave", exact: true }),
  ).toHaveCount(0);
  await g.getByRole("button", { name: "Leave room", exact: true }).click();
  await expect(g.getByRole("heading", { name: "Pass the aux." })).toBeVisible();
  expect((await guests.request.get(`/api/rooms/${code}`)).status()).toBe(401);
  expect((await host.request.get(`/api/rooms/${code}`)).status()).toBe(200);
  await host.close();
  await guests.close();
});

test("closing the last tab marks a retained membership away", async ({
  browser,
}) => {
  const host = await browser.newContext();
  const guest = await browser.newContext();
  const h = await host.newPage();
  const code = await createRoom(h);
  const g = await guest.newPage();
  await g.goto(h.url());
  await g
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Away guest");
  await g.getByRole("button", { name: "Join the room", exact: true }).click();
  await expect(g.getByRole("dialog")).toHaveCount(0);
  const me = (await (await guest.request.get(`/api/rooms/${code}`)).json()).me;
  await expect
    .poll(async () => {
      const room = await (await host.request.get(`/api/rooms/${code}`)).json();
      return room.members.find((member: { id: string }) => member.id === me)
        ?.active;
    })
    .toBe(true);
  await g.close();
  await expect
    .poll(async () => {
      const room = await (await host.request.get(`/api/rooms/${code}`)).json();
      return room.members.find((member: { id: string }) => member.id === me)
        ?.active;
    })
    .toBe(false);
  await h.getByRole("button", { name: /people/ }).click();
  await expect(
    h
      .locator(".member-card")
      .filter({ hasText: "Away guest" })
      .getByRole("img", { name: "Away", exact: true }),
  ).toBeVisible();
  await host.close();
  await guest.close();
});

test("the centre column stops at the form while the taller side panel continues", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await createRoom(page);
  const left = page.locator(".left-column"),
    right = page.locator(".right-column");
  const geometry = await left.evaluate((element) => ({
    top: element.getBoundingClientRect().top + scrollY,
    height: element.getBoundingClientRect().height,
  }));
  await page.evaluate(
    (y) => scrollTo(0, y),
    geometry.top + geometry.height - 876,
  );
  const beforeLeft = await left.boundingBox();
  const beforeRight = await right.boundingBox();
  await page.evaluate(() => scrollBy(0, 60));
  const afterLeft = await left.boundingBox();
  const afterRight = await right.boundingBox();
  expect(beforeLeft).not.toBeNull();
  expect(afterLeft).not.toBeNull();
  expect(
    Math.abs(
      afterLeft!.y + afterLeft!.height - (beforeLeft!.y + beforeLeft!.height),
    ),
  ).toBeLessThan(3);
  expect(afterRight!.y).toBeLessThan(beforeRight!.y - 30);
});

test("room code slots accept paste, correction and keyboard navigation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Join a room", exact: true }).click();
  const first = page.getByRole("textbox", { name: "Room code", exact: true });
  await first.fill("ab12cd");
  const slots = page.locator('[data-slot="otp-input-slot"]');
  await expect(slots).toHaveCount(6);
  await expect(slots.nth(0)).toHaveValue("A");
  await expect(slots.nth(5)).toHaveValue("D");
  await slots.nth(5).press("Backspace");
  await expect(slots.nth(5)).toHaveValue("");
  await slots.nth(5).fill("e");
  await expect(slots.nth(5)).toHaveValue("E");
  await slots.nth(5).press("ArrowLeft");
  await expect(slots.nth(4)).toBeFocused();
  await page.screenshot({ path: "test-results/aux-room-code.png" });
});

test("saved host sessions can be resumed from home and stay private to their browser", async ({
  page,
  browser,
}) => {
  const code = await createRoom(page);
  const stranger = await browser.newContext();
  expect(
    (
      await (
        await stranger.request.get("http://127.0.0.1:3000/api/rooms")
      ).json()
    ).sessions,
  ).toEqual([]);
  await page.getByRole("link", { name: "Aux home" }).click();
  await page
    .getByRole("button", { name: "Your sessions", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Your sessions" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Resume The listening room", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`room=${code}`));
  await expect(
    page.getByRole("button", { name: "Room settings", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Aux home" }).click();
  await expect(
    page.getByRole("button", { name: "Your sessions", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("button", { name: "Room settings", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Room settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "End session and leave", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Your sessions", exact: true })
    .click();
  await expect(
    page.getByText("No active sessions in this browser.", { exact: false }),
  ).toBeVisible();
  await stranger.close();
});

test("member settings hide host actions while server authorization remains enforced", async ({
  browser,
}) => {
  const host = await browser.newContext();
  const guest = await browser.newContext();
  const h = await host.newPage();
  const code = await createRoom(h, "Spotify");
  const g = await guest.newPage();
  await g.goto(h.url());
  await g
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Member");
  await g.getByRole("button", { name: "Join the room", exact: true }).click();
  await expect(
    g.getByRole("button", { name: "Skip to next song", exact: true }),
  ).toHaveCount(0);
  await expect(
    g.getByRole("button", {
      name: /Pause Spotify playback|Resume Spotify playback/,
    }),
  ).toHaveCount(0);
  await g.getByRole("button", { name: "Room settings", exact: true }).click();
  await expect(
    g.getByRole("button", { name: "Pause new requests", exact: true }),
  ).toHaveCount(0);
  await expect(
    g.getByRole("button", { name: "End session and leave", exact: true }),
  ).toHaveCount(0);
  await expect(
    g.getByText("Up to 3 queued songs per person.", { exact: true }),
  ).toHaveCount(0);
  await expect(
    g.getByRole("button", { name: "Leave room", exact: true }),
  ).toBeVisible();
  expect(
    (
      await guest.request.patch(`/api/rooms/${code}`, {
        data: { type: "lock" },
      })
    ).status(),
  ).toBe(403);
  await host.close();
  await guest.close();
});

test("room-code slots fill their container without clipping on narrow screens", async ({
  page,
}) => {
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Join a room", exact: true })
      .click();
    const widget = page.locator('[data-slot="otp-input"]');
    const field = page.locator(".form-field").filter({ has: widget });
    const inputBox = await widget.boundingBox(),
      fieldBox = await field.boundingBox();
    expect(Math.abs(inputBox!.width - fieldBox!.width)).toBeLessThan(2);
    const slots = page.locator('[data-slot="otp-input-slot"]');
    const last = await slots.last().boundingBox();
    expect(last!.x + last!.width).toBeLessThanOrEqual(
      inputBox!.x + inputBox!.width + 1,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("invite code characters are centered within full-width slots", async ({
  page,
}) => {
  const code = await createRoom(page);
  await page
    .getByRole("button", { name: "Invite friends", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const widget = page.locator('[data-slot="otp-input"]');
  const slots = widget.locator('[data-slot="otp-input-cell"]');
  for (let index = 0; index < 6; index++) {
    await expect(slots.nth(index).locator("input")).toHaveValue(code[index]!);
    const cell = await slots.nth(index).boundingBox();
    const glyph = await slots
      .nth(index)
      .locator('[data-slot="otp-input-char"]')
      .boundingBox();
    expect(
      Math.abs(cell!.y + cell!.height / 2 - (glyph!.y + glyph!.height / 2)),
    ).toBeLessThan(3);
  }
  await page.screenshot({ path: "test-results/aux-invite-responsive.png" });
});

test("home is a single screen at standard desktop and phone sizes", async ({
  page,
}) => {
  for (const size of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "How Aux works", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Your sessions", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Your people." }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight + 1,
      ),
    ).toBe(true);
    await page.screenshot({ path: `test-results/aux-home-${size.width}.png` });
  }
});

test("color preferences persist and system follows device changes without hydration errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const toggle = () =>
    page.getByRole("button", { name: /Switch to (light|dark) mode/ });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await toggle().click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(toggle()).toHaveAccessibleName("Switch to light mode");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await toggle().click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Join a room", exact: false }).click();
  await expect(page.getByRole("dialog")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.evaluate(() => localStorage.removeItem("aux-theme"));
  await page.reload();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(
    errors.filter((error) =>
      /hydration|didn't match|did not match/i.test(error),
    ),
  ).toEqual([]);
});
