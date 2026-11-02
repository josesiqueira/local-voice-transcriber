const { test, expect, stubHost, hostCalls, IDS, bareId, box } = require("./helpers");

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

test("a voice note without a seek bar is recognised by its svg voice icon title", async ({ openMock, worker }) => {
  await stubHost(worker);
  const page = await openMock({ variant: "labelled", icons: false, slider: false, marker: "title" });
  await expect(page.locator('[role="slider"]')).toHaveCount(0);
  await expect(box(page, IDS.voiceIn)).toHaveCount(1);
  await expect(box(page, IDS.voiceOut)).toHaveCount(1);
  await expect(box(page, IDS.text)).toHaveCount(0);
  // The play button is found by its label, so the capture still works.
  await box(page, IDS.voiceIn).locator(".wat-btn").click();
  await expect(box(page, IDS.voiceIn)).toHaveAttribute("data-wat-state", "done", { timeout: 25_000 });
  expect(Buffer.from((await hostCalls(worker)).first.audio_b64, "base64").subarray(0, 4).toString()).toBe("OggS");
});

test("a voice note recognised by its voice icon keeps its button while it plays", async ({ openMock }) => {
  const page = await openMock({ variant: "labelled", icons: false, slider: false, marker: "title" });
  await expect(box(page, IDS.voiceIn)).toHaveCount(1);
  await page.locator(`[data-id="${IDS.voiceIn}"] button[aria-label="Play voice message"]`).click();
  await expect(page.locator(`[data-id="${IDS.voiceIn}"] button[aria-label="Pause voice message"]`)).toHaveCount(1);
  await page.evaluate(() => window.mock.addNoise(5)); // makes the extension scan again
  await page.waitForTimeout(500);
  await expect(box(page, IDS.voiceIn)).toHaveCount(1);
});

test("a voice note without a seek bar is recognised by an older ptt data-icon", async ({ openMock }) => {
  const page = await openMock({ variant: "labelled", slider: false });
  await expect(box(page, IDS.voiceIn)).toHaveCount(1);
  await expect(box(page, IDS.voiceOut)).toHaveCount(1);
});

test("a play button without a seek bar or a voice icon is not taken for a voice note", async ({ openMock }) => {
  const page = await openMock({ variant: "labelled", icons: false, slider: false });
  await expect(page.locator('button[aria-label="Play voice message"]')).toHaveCount(2);
  await page.waitForTimeout(600);
  await expect(page.locator(".wat-box")).toHaveCount(0);
});

test("without the data-id prefix, the tail icon tells an outgoing message", async ({ openMock }) => {
  // Every bubble on the left, so only the tail icon can tell the direction.
  const page = await openMock({ variant: "labelled", ids: "bare", tails: true, sides: false });
  await expect(box(page, bareId(IDS.voiceOut))).toHaveClass(/wat-out/);
  await expect(box(page, bareId(IDS.voiceIn))).not.toHaveClass(/wat-out/);
});

test("without the data-id prefix or tail icons, the player's side tells an outgoing message", async ({ openMock }) => {
  const page = await openMock({ variant: "labelled", ids: "bare" });
  await expect(page.locator('[data-icon^="tail"]')).toHaveCount(0);
  await expect(box(page, bareId(IDS.voiceOut))).toHaveClass(/wat-out/);
  await expect(box(page, bareId(IDS.voiceIn))).not.toHaveClass(/wat-out/);
});

test("in a right-to-left layout an outgoing message on the left is still outgoing", async ({ openMock }) => {
  const page = await openMock({ variant: "labelled", ids: "bare" });
  await expect(box(page, bareId(IDS.voiceOut))).toHaveCount(1);
  // The mock's layout mirrors like WhatsApp's: outgoing bubbles move to the left.
  await page.evaluate(() => {
    document.documentElement.dir = "rtl";
    document.querySelectorAll(".wat-box").forEach((el) => el.remove());
  });
  await expect(box(page, bareId(IDS.voiceOut))).toHaveClass(/wat-out/);
  await expect(box(page, bareId(IDS.voiceIn))).not.toHaveClass(/wat-out/);
  const sides = await page.evaluate((ids) => ids.map((id) => {
    const rect = document.querySelector(`[data-id="${id}"] [role="slider"]`).getBoundingClientRect();
    return rect.left + rect.width / 2 < window.innerWidth / 2 ? "left" : "right";
  }), [bareId(IDS.voiceOut), bareId(IDS.voiceIn)]);
  expect(sides).toEqual(["left", "right"]);
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
