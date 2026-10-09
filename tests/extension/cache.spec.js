const { test, expect, stubHost, hostCalls, IDS, box } = require("./helpers");

async function stored(worker, id) {
  return worker.evaluate(async (key) => (await chrome.storage.local.get(key))[key] || null, `t:${id}`);
}

test("a result is cached by message ID", async ({ openMock, worker }) => {
  await stubHost(worker);
  const page = await openMock();
  await box(page, IDS.voiceIn).locator(".wat-btn").click();
  await expect(box(page, IDS.voiceIn)).toHaveAttribute("data-wat-state", "done");
  await expect.poll(() => stored(worker, IDS.voiceIn)).not.toBeNull();
  const entry = await stored(worker, IDS.voiceIn);
  expect(entry).toMatchObject({ text: "Hello world", language: "en", device: "cuda", seconds: 4.2 });
  expect(typeof entry.createdAt).toBe("number");
});

test("after a reload the caption comes back without calling the host", async ({ openMock, worker }) => {
  await stubHost(worker);
  const page = await openMock();
  await box(page, IDS.voiceIn).locator(".wat-btn").click();
  await expect(box(page, IDS.voiceIn)).toHaveAttribute("data-wat-state", "done");
  await expect.poll(() => stored(worker, IDS.voiceIn)).not.toBeNull();

  await stubHost(worker); // resets the call count
  await page.reload();
  await expect(box(page, IDS.voiceIn)).toHaveAttribute("data-wat-state", "done");
  await expect(box(page, IDS.voiceIn).locator(".wat-text")).toHaveText("Hello world");
  await expect(box(page, IDS.voiceOut)).toHaveAttribute("data-wat-state", "idle");
  expect((await hostCalls(worker)).count).toBe(0);
});

test("a re-rendered row shows the cached caption", async ({ openMock, worker }) => {
  await stubHost(worker);
  const page = await openMock();
  await box(page, IDS.voiceIn).locator(".wat-btn").click();
  await expect(box(page, IDS.voiceIn)).toHaveAttribute("data-wat-state", "done");
  await page.evaluate((id) => window.mock.rerenderRow(id), IDS.voiceIn);
  await expect(box(page, IDS.voiceIn)).toHaveAttribute("data-wat-state", "done");
});

test("errors are not cached", async ({ openMock, worker }) => {
  await stubHost(worker, { reply: { ok: false, error: "decode_failed", message: "x" } });
  const page = await openMock();
  await box(page, IDS.voiceIn).locator(".wat-btn").click();
  await expect(box(page, IDS.voiceIn)).toHaveAttribute("data-wat-state", "error");
  await page.waitForTimeout(300);
  expect(await stored(worker, IDS.voiceIn)).toBeNull();
});
