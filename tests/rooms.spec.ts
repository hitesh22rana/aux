import { test, expect } from "@playwright/test";
test("host and member share a persisted queue with enforced permissions", async ({
  browser,
}) => {
  const host = await browser.newContext();
  const guest = await browser.newContext();
  const h = await host.newPage();
  const g = await guest.newPage();
  await h.goto("/");
  await h.getByRole("button", { name: "Create a room", exact: true }).click();
  await h.getByLabel("Use demo playback (silent)").check();
  await h.getByLabel("Your name", { exact: true }).fill("Alex");
  await h.getByLabel("Give your room a name").fill("Shared session");
  await h.getByRole("button", { name: "Create room" }).click();
  await expect(h).toHaveURL(/room=[A-F0-9]{6}/);
  const code = new URL(h.url()).searchParams.get("room")!;
  await expect(
    h.getByRole("heading", { name: "Shared session" }),
  ).toBeVisible();
  await h
    .getByRole("button", { name: "Add Golden to queue", exact: true })
    .click();
  await expect(
    h.getByRole("button", { name: "Golden already queued" }),
  ).toBeDisabled();
  await g.goto(`/?room=${code}`);
  await expect(g.getByRole("dialog")).toBeVisible();
  await g.getByLabel("Your name", { exact: true }).fill("Maya");
  await g.getByRole("button", { name: "Join the room", exact: true }).click();
  await expect(g.getByRole("dialog")).not.toBeVisible();
  await g
    .getByRole("button", { name: "Add Sunflower to queue", exact: true })
    .click();
  await expect(
    h.getByRole("button", { name: "Vote for Sunflower" }),
  ).toBeVisible({ timeout: 8000 });
  await expect(
    g.getByRole("button", { name: "Play demo playback" }),
  ).toBeDisabled();
  const forbidden = await guest.request.patch(`/api/rooms/${code}`, {
    data: { type: "next" },
  });
  expect(forbidden.status()).toBe(403);
  await g.getByRole("button", { name: "Vote for Sunflower" }).click();
  await expect(
    g.getByRole("button", { name: "Vote for Sunflower" }),
  ).toHaveAttribute("aria-pressed", "true");
  await h.reload();
  await expect(
    h.getByRole("button", { name: "Vote for Sunflower" }),
  ).toBeVisible();
  await h.getByRole("button", { name: "Room settings", exact: true }).click();
  await h
    .getByRole("button", { name: "Pause new requests", exact: true })
    .click();
  await expect(
    h.getByRole("button", { name: "Pause new requests", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const locked = await guest.request.patch(`/api/rooms/${code}`, {
    data: { type: "add", trackId: "ilahi" },
  });
  expect(locked.status()).toBe(403);
  await h.getByRole("button", { name: "Close dialog" }).click();
  await h.getByRole("button", { name: "Skip to next song" }).click();
  await expect(h.locator(".current-track h2")).toHaveText("Sunflower");
  await host.close();
  await guest.close();
});
test("mobile demo search, queue actions, navigation and empty states", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Everyone gets a say." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("button", { name: "Discover music", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search songs" })
    .fill("no-match-ever");
  await expect(page.getByText("No songs found.")).toBeVisible();
  await page.getByRole("button", { name: "Reset search", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Dreams to queue", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Dreams already queued" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("button", { name: "The room", exact: false })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Vote for Dreams" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Remove Dreams", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Vote for Dreams" }),
  ).not.toBeVisible();
  await page.screenshot({
    path: "test-results/aux-mobile.png",
    fullPage: true,
  });
});

test("API rejects invalid, duplicate and excess requests and closes ended rooms", async ({
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
        data: { name: "", person: "Alex", provider: "Spotify" },
      })
    ).status(),
  ).toBe(400);
  const created = await host.post("/api/rooms", {
    data: { name: "API session", person: "Alex", provider: "Spotify" },
  });
  expect(created.ok()).toBeTruthy();
  const { code } = await created.json();
  expect((await stranger.get(`/api/rooms/${code}`)).status()).toBe(401);
  expect(
    (
      await host.patch(`/api/rooms/${code}`, {
        headers: { origin: "https://other.example" },
        data: { type: "end" },
      })
    ).status(),
  ).toBe(403);
  for (const trackId of ["golden", "sunflower", "ilahi", "less"])
    expect(
      (
        await host.patch(`/api/rooms/${code}`, {
          data: { type: "add", trackId },
        })
      ).ok(),
    ).toBeTruthy();
  expect(
    (
      await host.patch(`/api/rooms/${code}`, {
        data: { type: "add", trackId: "sunflower" },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await host.patch(`/api/rooms/${code}`, {
        data: { type: "add", trackId: "dreams" },
      })
    ).status(),
  ).toBe(409);
  expect(
    (await host.patch(`/api/rooms/${code}`, { data: { type: "end" } })).ok(),
  ).toBeTruthy();
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

test("live rooms use the Aux queue and explain missing Spotify configuration", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create a room", exact: true })
    .click();
  await page.getByLabel("Your name", { exact: true }).fill("Live host");
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
  ).toBeVisible();
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
  await h.getByLabel("Your name", { exact: true }).fill("Apple host");
  await h.getByRole("button", { name: "Create room" }).click();
  await expect(h).toHaveURL(/room=[A-F0-9]{6}/);
  await expect(
    h.getByRole("region", { name: "Apple Music handoff" }),
  ).toBeVisible();
  await expect(
    h.getByRole("button", { name: "Connect Spotify", exact: true }),
  ).not.toBeVisible();
  await g.goto(h.url());
  await g.getByLabel("Your name", { exact: true }).fill("Member");
  await g.getByRole("button", { name: "Join the room", exact: true }).click();
  await g
    .getByLabel("Song link", { exact: true })
    .fill("https://music.apple.com/us/album/test/123?i=456");
  await g.getByLabel("Song title", { exact: true }).fill("Our shared song");
  await g.getByLabel("Artist", { exact: false }).fill("Our artist");
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
  await expect(h.getByText("HOST CONFIRMED", { exact: true })).toBeVisible();
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
  await page.getByLabel("Your name", { exact: true }).fill("Amazon host");
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
    .getByLabel("Song link", { exact: true })
    .fill("https://music.amazon.com/tracks/B012345678");
  await page.getByLabel("Song title", { exact: true }).fill("Shared song");
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
