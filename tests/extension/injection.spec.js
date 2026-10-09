const { test, expect, stubHost, IDS, box } = require("./helpers");

test("adds one [T] button to each audio message and none to text", async ({ openMock }) => {
  const page = await openMock();
  await expect(box(page, IDS.voiceIn)).toHaveCount(1);
  await expect(box(page, IDS.voiceOut)).toHaveCount(1);
  await expect(box(page, IDS.text)).toHaveCount(0);
  await expect(box(page, IDS.voiceIn).locator(".wat-btn")).toHaveText("T");
  await expect(box(page, IDS.voiceIn)).toHaveAttribute("data-wat-state", "idle");
});

test("outgoing messages get the outgoing alignment class", async ({ openMock }) => {
  const page = await openMock();
  await expect(box(page, IDS.voiceOut)).toHaveClass(/wat-out/);
  await expect(box(page, IDS.voiceIn)).not.toHaveClass(/wat-out/);
});

test("many mutations never create a second button", async ({ openMock }) => {
  const page = await openMock();
  await expect(box(page, IDS.voiceIn)).toHaveCount(1);
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.mock.addNoise(50));
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(400);
  await expect(page.locator(".wat-box")).toHaveCount(2);
});

test("new audio rows get a button", async ({ openMock }) => {
  const page = await openMock();
  await page.evaluate(() => window.mock.addVoiceRow("false_2@c.us_NEW1"));
  await expect(box(page, "false_2@c.us_NEW1")).toHaveCount(1);
});

test("a re-rendered row gets its button back", async ({ openMock }) => {
  const page = await openMock();
  await expect(box(page, IDS.voiceIn)).toHaveCount(1);
  await page.evaluate((id) => window.mock.rerenderRow(id), IDS.voiceIn);
  await expect(box(page, IDS.voiceIn)).toHaveCount(1);
});

test("a recycled row is relabeled for its new message", async ({ openMock }) => {
  const page = await openMock();
  await expect(box(page, IDS.voiceIn)).toHaveCount(1);
  await page.evaluate((id) => window.mock.recycleRow(id, "false_3@c.us_RECYCLED"), IDS.voiceIn);
  await expect(box(page, "false_3@c.us_RECYCLED")).toHaveCount(1);
  await expect(box(page, IDS.voiceIn)).toHaveCount(0);
});

test("clicking [T] does not reach WhatsApp's own click handlers", async ({ openMock, worker }) => {
  await stubHost(worker);
  const page = await openMock();
  // Count only clicks that start inside our own elements. The capture flow also clicks
  // WhatsApp's play button, which legitimately bubbles to the list.
  await page.evaluate(() => {
    window.__rowClicks = 0;
    document.getElementById("list").addEventListener("click", (event) => {
      if (event.target.closest(".wat-box")) window.__rowClicks += 1;
    });
  });
  await box(page, IDS.voiceIn).locator(".wat-btn").click();
  await expect(box(page, IDS.voiceIn)).toHaveAttribute("data-wat-state", "done", { timeout: 25_000 });
  expect(await page.evaluate(() => window.__rowClicks)).toBe(0);
});
