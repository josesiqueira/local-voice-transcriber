const { test, expect, stubHost, openPopup, IDS, box, watchStatus, statusMessages, badgeAndStatus } = require("./helpers");

// A row with a play button but neither a seek bar nor a voice icon: not recognised.
const UNRECOGNISED = { variant: "labelled", icons: false, slider: false };
const playButtonOf = (page, id) => page.locator(`[data-id="${id}"] button`).first();
const states = async (worker) => (await statusMessages(worker)).map((message) => message.state);

// Badge texts of every open tab.
const allBadges = (worker) =>
  worker.evaluate(async () => Promise.all((await chrome.tabs.query({})).map((tab) => chrome.action.getBadgeText({ tabId: tab.id }))));

test("playing a voice note that got no T button sets the badge, stores a report and shows the notice", async ({ openMock, worker, context }) => {
  await watchStatus(worker);
  const page = await openMock(UNRECOGNISED);
  await page.waitForTimeout(600);
  await expect(page.locator(".wat-box")).toHaveCount(0);

  await playButtonOf(page, IDS.voiceIn).click();
  await expect.poll(() => page.evaluate(() => window.mock.plays)).toBe(1);
  await expect.poll(() => states(worker)).toEqual(["not_recognised"]);
  const [{ tabId }] = await statusMessages(worker);
  await expect.poll(async () => (await badgeAndStatus(worker, tabId)).badge).toBe("!");
  expect(await worker.evaluate((tabId) => chrome.action.getBadgeBackgroundColor({ tabId }), tabId)).toEqual([197, 34, 31, 255]);
  expect((await badgeAndStatus(worker)).badge).toBe(""); // only this tab

  const { status } = await badgeAndStatus(worker, tabId);
  expect(status.state).toBe("not_recognised");
  expect(typeof status.at).toBe("number");
  const report = status.report;
  expect(report).toContain("Local Voice Transcriber structure report");
  expect(report).toContain("extension version: 0.2.0");
  expect(report).toMatch(/^chrome version: \d+$/m);
  expect(report).toMatch(/^date: \d{4}-\d{2}-\d{2}$/m);
  expect(report).toContain("[data-id] rows: 3");
  expect(report).toContain("[role=slider] elements: 0");
  expect(report).toContain(".wat-box elements: 0");
  expect(report).toContain("voice marker titles: 0");
  expect(report).toContain("--- clicked message row");
  expect(report).toContain("data-testid=conv-msg-<id>");
  expect(report).not.toContain("c.us");
  expect(report).toContain("aria-label=Voice message");
  expect(report).toContain("aria-label=[32 chars]"); // a label that is not about audio
  // No message ID, phone number, time or text from the page.
  for (const id of Object.values(IDS)) expect(report).not.toContain(id);
  for (const part of ["1111", "3EB0", "AAAA", "0001", "10:15", "0:02", "Sent by", "data-id="]) expect(report).not.toContain(part);

  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const popup = await openPopup(context, worker);
  const notice = popup.locator("#notice");
  await expect(notice.getByRole("heading", { name: "Voice notes not recognised" })).toBeVisible();
  await expect(notice).toContainText("The report holds only the page structure: no names, numbers or message text.");
  const issue = notice.getByRole("link", { name: "Open an issue" });
  await expect(issue).toHaveAttribute("href", "https://github.com/josesiqueira/local-voice-transcriber/issues/new?title=Voice%20notes%20not%20recognised");
  await expect(issue).toHaveAttribute("target", "_blank");
  // The notice sits above the language settings.
  const [noticeTop, headingTop] = await popup.evaluate(() => [
    document.getElementById("notice").getBoundingClientRect().top,
    document.querySelector("h1").getBoundingClientRect().top,
  ]);
  expect(noticeTop).toBeLessThan(headingTop);

  await notice.getByRole("button", { name: "Copy report" }).click();
  await expect(notice.getByRole("button")).toHaveText("Copied");
  expect(await popup.evaluate(() => navigator.clipboard.readText())).toBe(report);
  await expect(notice.getByRole("button")).toHaveText("Copy report", { timeout: 3000 });
});

test("a label that holds a name never reaches the report", async ({ openMock, worker }) => {
  await stubHost(worker);
  const page = await openMock({ ...UNRECOGNISED, voiceLabel: "Voice message from Anna" });
  await page.locator(`[data-id="${IDS.voiceIn}"] button`).first().click();
  await expect.poll(async () => (await worker.evaluate(() => chrome.storage.session.get("status"))).status?.report || "").toContain("structure report");
  const { report } = (await worker.evaluate(() => chrome.storage.session.get("status"))).status;
  expect(report).not.toContain("Anna");
  expect(report).toContain("aria-label=[23 chars]");
});


test("the badge clears once a played voice note is recognised", async ({ openMock, worker }) => {
  await watchStatus(worker);
  const page = await openMock(UNRECOGNISED);
  await playButtonOf(page, IDS.voiceIn).click();
  await expect.poll(() => states(worker)).toEqual(["not_recognised"]);
  const [{ tabId }] = await statusMessages(worker);
  await expect.poll(async () => (await badgeAndStatus(worker, tabId)).badge).toBe("!");

  // A later page version that the extension recognises again.
  await page.evaluate(() => {
    for (const bubble of document.querySelectorAll(".bubble")) {
      if (bubble.querySelector("button")) bubble.insertAdjacentHTML("beforeend", "<svg><title>ic-keyboard-voice-filled</title></svg>");
    }
  });
  await expect(box(page, IDS.voiceOut)).toHaveCount(1);
  await playButtonOf(page, IDS.voiceOut).click();
  await expect.poll(() => states(worker)).toEqual(["not_recognised", "ok"]);
  await expect.poll(() => badgeAndStatus(worker, tabId)).toEqual({ badge: "", status: null });
});

test("playing a recognised voice note leaves no badge", async ({ openMock, worker }) => {
  await watchStatus(worker);
  const page = await openMock();
  await expect(box(page, IDS.voiceIn)).toHaveCount(1);
  await playButtonOf(page, IDS.voiceIn).click();
  await expect.poll(() => states(worker)).toEqual(["ok"]);
  const [{ tabId }] = await statusMessages(worker);
  expect(await badgeAndStatus(worker, tabId)).toEqual({ badge: "", status: null });
});

test("Web Audio playback is checked too", async ({ openMock, worker }) => {
  await watchStatus(worker);
  const page = await openMock({ variant: "webaudio" });
  await expect(box(page, IDS.voiceIn)).toHaveCount(1);
  await playButtonOf(page, IDS.voiceIn).click();
  await expect.poll(() => states(worker)).toEqual(["ok"]);
});

test("our own capture does not set the badge", async ({ openMock, worker }) => {
  await watchStatus(worker);
  await stubHost(worker);
  const page = await openMock();
  await box(page, IDS.voiceIn).locator(".wat-btn").click();
  await expect(box(page, IDS.voiceIn)).toHaveAttribute("data-wat-state", "done", { timeout: 25_000 });
  expect(await page.evaluate(() => window.mock.plays)).toBe(1);
  await page.waitForTimeout(2000);
  expect(await statusMessages(worker)).toEqual([]);
  expect(await allBadges(worker)).toEqual([""]);
  expect((await badgeAndStatus(worker)).status).toBeNull();
});

test("audio that starts without a recent click is not judged", async ({ openMock, worker }) => {
  await watchStatus(worker);
  const page = await openMock(UNRECOGNISED);
  // A script click is not a user click.
  await page.evaluate(() => document.querySelector("[data-id] button").click());
  await expect.poll(() => page.evaluate(() => window.mock.plays)).toBe(1);
  await page.waitForTimeout(1500);
  expect(await statusMessages(worker)).toEqual([]);
  expect(await allBadges(worker)).toEqual([""]);
});
