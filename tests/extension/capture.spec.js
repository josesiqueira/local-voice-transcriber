const { test, expect, stubHost, hostCalls, IDS, box } = require("./helpers");

async function transcribeAndGetBytes(page, worker) {
  await box(page, IDS.voiceIn).locator(".wat-btn").click();
  await expect(box(page, IDS.voiceIn)).toHaveAttribute("data-wat-state", "done", { timeout: 25_000 });
  const { first } = await hostCalls(worker);
  return Buffer.from(first.audio_b64, "base64");
}

test("audio element added on play", async ({ openMock, worker }) => {
  await stubHost(worker);
  const page = await openMock({ variant: "attached" });
  const bytes = await transcribeAndGetBytes(page, worker);
  expect(bytes.subarray(0, 4).toString()).toBe("OggS");
});

test("audio element already present: no playback needed", async ({ openMock, worker }) => {
  await stubHost(worker);
  const page = await openMock({ variant: "preloaded" });
  await expect(page.locator(`[data-id="${IDS.voiceIn}"]`).locator("xpath=..")).toHaveAttribute("data-ready", "1");
  const bytes = await transcribeAndGetBytes(page, worker);
  expect(bytes.subarray(0, 4).toString()).toBe("OggS");
  expect(await page.evaluate(() => window.mock.plays)).toBe(0);
});

test("play button found by its label when it has no icon", async ({ openMock, worker }) => {
  await stubHost(worker);
  const page = await openMock({ variant: "labelled" });
  const bytes = await transcribeAndGetBytes(page, worker);
  expect(bytes.subarray(0, 4).toString()).toBe("OggS");
  expect(await page.evaluate(() => window.mock.plays)).toBe(1);
});

test("play button found from the seek bar when its label is in an unknown language", async ({ openMock, worker }) => {
  await stubHost(worker);
  const page = await openMock({ variant: "labelled", label: "Sprachnachricht abspielen" });
  const bytes = await transcribeAndGetBytes(page, worker);
  expect(bytes.subarray(0, 4).toString()).toBe("OggS");
  expect(await page.evaluate(() => window.mock.plays)).toBe(1);
});

test("Web Audio playback is captured from decodeAudioData", async ({ openMock, worker }) => {
  await stubHost(worker);
  const page = await openMock({ variant: "webaudio" });
  const bytes = await transcribeAndGetBytes(page, worker);
  expect(bytes.subarray(0, 4).toString()).toBe("OggS");
});

test("no audio within the timeout shows audio_not_found", async ({ openMock, worker }) => {
  test.setTimeout(60_000);
  await stubHost(worker);
  const page = await openMock({ variant: "broken" });
  await box(page, IDS.voiceIn).locator(".wat-btn").click();
  await expect(box(page, IDS.voiceIn).locator(".wat-error")).toHaveText(
    "Could not read this audio. Play it once, then retry",
    { timeout: 30_000 },
  );
  expect((await hostCalls(worker)).count).toBe(0);
});

test("a row recycled while its capture is queued is not captured under the old ID", async ({ openMock, worker }) => {
  test.setTimeout(60_000);
  await stubHost(worker);
  const page = await openMock({ delay: 2000 });
  const second = "true_111111111111@c.us_3EB0AAAA0003";
  const recycled = "false_9@c.us_RECYCLED";
  await box(page, IDS.voiceIn).locator(".wat-btn").click();
  await box(page, second).locator(".wat-btn").click();
  // The first capture is still waiting for its slow play; the second is queued behind it.
  await page.waitForTimeout(500);
  await page.evaluate(([id, other]) => window.mock.recycleRow(id, other), [second, recycled]);
  await expect(box(page, IDS.voiceIn)).toHaveAttribute("data-wat-state", "done", { timeout: 25_000 });
  await page.waitForTimeout(5000); // the queued capture would start and finish within this time
  expect(await page.evaluate((id) => window.mock.playsById[id] || 0, recycled)).toBe(0);
  expect((await hostCalls(worker)).count).toBe(1);
});
