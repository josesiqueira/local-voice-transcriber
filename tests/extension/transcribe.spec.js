const { test, expect, stubHost, hostCalls, IDS, box } = require("./helpers");

test("click shows working, then the caption with text and language", async ({ openMock, worker }) => {
  await stubHost(worker, { delayMs: 800 });
  const page = await openMock();
  await box(page, IDS.voiceIn).locator(".wat-btn").click();
  await expect(box(page, IDS.voiceIn)).toHaveAttribute("data-wat-state", "working");
  await expect(box(page, IDS.voiceIn).locator(".wat-status")).toContainText("Transcribing...");
  await expect(box(page, IDS.voiceIn)).toHaveAttribute("data-wat-state", "done");
  await expect(box(page, IDS.voiceIn).locator(".wat-text")).toHaveText("Hello world");
  await expect(box(page, IDS.voiceIn).locator(".wat-lang")).toHaveText("EN");
  await expect(box(page, IDS.voiceIn).locator(".wat-lang")).toHaveAttribute("title", "cuda, 4.2 s");
  await expect(box(page, IDS.voiceIn).locator(".wat-btn")).toBeHidden();
});

test("the host receives the note's Ogg bytes as base64", async ({ openMock, worker }) => {
  await stubHost(worker);
  const page = await openMock();
  await box(page, IDS.voiceIn).locator(".wat-btn").click();
  await expect(box(page, IDS.voiceIn)).toHaveAttribute("data-wat-state", "done");
  const { first } = await hostCalls(worker);
  expect(Object.keys(first).sort()).toEqual(["audio_b64", "mime"]);
  expect(Buffer.from(first.audio_b64, "base64").subarray(0, 4).toString()).toBe("OggS");
  expect(first.mime).toContain("audio/ogg");
});

test("capturing does not leave the note playing", async ({ openMock, worker }) => {
  await stubHost(worker);
  const page = await openMock();
  await box(page, IDS.voiceIn).locator(".wat-btn").click();
  await expect(box(page, IDS.voiceIn)).toHaveAttribute("data-wat-state", "done");
  await expect(page.locator(`[data-id="${IDS.voiceIn}"] [data-icon]`).first()).toHaveAttribute("data-icon", "audio-play");
});

test("clicks while working are ignored", async ({ openMock, worker }) => {
  await stubHost(worker, { delayMs: 1500 });
  const page = await openMock();
  const button = box(page, IDS.voiceIn).locator(".wat-btn");
  await button.click();
  await button.click({ force: true });
  await button.click({ force: true });
  await expect(box(page, IDS.voiceIn)).toHaveAttribute("data-wat-state", "done");
  expect((await hostCalls(worker)).count).toBe(1);
});

test("queue runs one host call at a time", async ({ openMock, worker }) => {
  await stubHost(worker, { delayMs: 1000 });
  const page = await openMock();
  await box(page, IDS.voiceIn).locator(".wat-btn").click();
  await box(page, IDS.voiceOut).locator(".wat-btn").click();
  await expect(box(page, IDS.voiceIn)).toHaveAttribute("data-wat-state", "done");
  await expect(box(page, IDS.voiceOut)).toHaveAttribute("data-wat-state", "done", { timeout: 10_000 });
  const calls = await hostCalls(worker);
  expect(calls.count).toBe(2);
  expect(calls.maxRunning).toBe(1);
});

test("re-rendered row during work gets the result", async ({ openMock, worker }) => {
  await stubHost(worker, { delayMs: 1500 });
  const page = await openMock();
  await box(page, IDS.voiceIn).locator(".wat-btn").click();
  await expect(box(page, IDS.voiceIn)).toHaveAttribute("data-wat-state", "working");
  await page.evaluate((id) => window.mock.rerenderRow(id), IDS.voiceIn);
  await expect(box(page, IDS.voiceIn)).toHaveAttribute("data-wat-state", "working");
  await expect(box(page, IDS.voiceIn)).toHaveAttribute("data-wat-state", "done");
  expect((await hostCalls(worker)).count).toBe(1);
});

test("caption keeps accents, umlauts and emoji", async ({ openMock, worker }) => {
  await stubHost(worker, { reply: { ok: true, text: "café naïve 中文 \u{1F642}", language: "fr", device: "cpu", seconds: 9.1 } });
  const page = await openMock();
  await box(page, IDS.voiceIn).locator(".wat-btn").click();
  await expect(box(page, IDS.voiceIn).locator(".wat-text")).toHaveText("café naïve 中文 \u{1F642}");
  await expect(box(page, IDS.voiceIn).locator(".wat-lang")).toHaveText("FR");
});

test("caption renders text, not HTML", async ({ openMock, worker }) => {
  await stubHost(worker, { reply: { ok: true, text: "<b>x</b><img src=x>", language: "en", device: "cuda", seconds: 1 } });
  const page = await openMock();
  await box(page, IDS.voiceIn).locator(".wat-btn").click();
  await expect(box(page, IDS.voiceIn).locator(".wat-text")).toHaveText("<b>x</b><img src=x>");
  await expect(box(page, IDS.voiceIn).locator(".wat-text b, .wat-text img")).toHaveCount(0);
});

test("copy puts the text on the clipboard", async ({ openMock, worker, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "https://web.whatsapp.com" });
  await stubHost(worker);
  const page = await openMock();
  await box(page, IDS.voiceIn).locator(".wat-btn").click();
  await box(page, IDS.voiceIn).locator(".wat-copy").click();
  await expect(box(page, IDS.voiceIn).locator(".wat-copy")).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Hello world");
});

test("caption text is selectable", async ({ openMock, worker }) => {
  await stubHost(worker);
  const page = await openMock();
  await box(page, IDS.voiceIn).locator(".wat-btn").click();
  const userSelect = await box(page, IDS.voiceIn).locator(".wat-text").evaluate((el) => getComputedStyle(el).userSelect);
  expect(userSelect).toBe("text");
});

test("two quick clicks capture both notes", async ({ openMock, worker }) => {
  test.setTimeout(60_000);
  await stubHost(worker, { delayMs: 300 });
  const page = await openMock();
  await expect(box(page, IDS.voiceIn)).toBeVisible();
  await expect(box(page, IDS.voiceOut)).toBeVisible();
  await page.evaluate(([a, b]) => {
    for (const id of [a, b]) document.querySelector(`.wat-box[data-wat-id="${id}"] .wat-btn`).click();
  }, [IDS.voiceIn, IDS.voiceOut]);
  await expect(box(page, IDS.voiceIn)).toHaveAttribute("data-wat-state", "done", { timeout: 30_000 });
  await expect(box(page, IDS.voiceOut)).toHaveAttribute("data-wat-state", "done", { timeout: 30_000 });
  const calls = await hostCalls(worker);
  expect(calls.count).toBe(2);
  expect(calls.maxRunning).toBe(1);
});
