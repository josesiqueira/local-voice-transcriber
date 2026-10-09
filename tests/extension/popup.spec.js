const { test, expect, stubHost, hostCalls, openPopup, IDS, box } = require("./helpers");

async function savedSettings(worker) {
  return worker.evaluate(async () => (await chrome.storage.local.get("settings")).settings || null);
}

async function transcribeNote(page, id) {
  await box(page, id).locator(".wat-btn").click();
  await expect(box(page, id)).toHaveAttribute("data-wat-state", "done");
}

const check = (popup, code) => popup.locator(`#list input[value="${code}"]`);
const visibleItems = (popup) => popup.locator("#list li:not([hidden])");

test("by default any language is detected and the request has no languages", async ({ context, worker, openMock }) => {
  const popup = await openPopup(context, worker);
  await expect(popup.getByRole("heading", { name: "Languages" })).toBeVisible();
  await expect(popup.getByRole("radio", { name: "Any language" })).toBeChecked();
  await expect(popup.locator("#picker")).toBeHidden();

  await stubHost(worker);
  const page = await openMock();
  await transcribeNote(page, IDS.voiceIn);
  expect(Object.keys((await hostCalls(worker)).first).sort()).toEqual(["audio_b64", "mime"]);
});

test("checked languages are saved and sent in the order they were checked", async ({ context, worker, openMock }) => {
  const popup = await openPopup(context, worker);
  await popup.getByRole("radio", { name: "Only these languages" }).check();
  await expect(popup.locator("#picker")).toBeVisible();
  await expect(popup.locator("#count")).toHaveText("None chosen. All languages are used until one is chosen.");
  expect(await savedSettings(worker)).toEqual({ languages: [] });

  await popup.locator("#search").fill("nl");
  await check(popup, "nl").check();
  await popup.locator("#search").fill("de");
  await check(popup, "de").check();
  await expect(popup.locator("#count")).toContainText("2 languages chosen");
  await expect.poll(() => savedSettings(worker)).toEqual({ languages: ["nl", "de"] });

  await stubHost(worker);
  const page = await openMock();
  await transcribeNote(page, IDS.voiceIn);
  expect((await hostCalls(worker)).first.languages).toEqual(["nl", "de"]);

  // Unchecking both goes back to any language.
  await popup.bringToFront();
  await popup.locator("#search").fill("");
  await check(popup, "nl").uncheck();
  await check(popup, "de").uncheck();
  await expect(popup.locator("#count")).toContainText("All languages are used until one is chosen");
  await expect.poll(() => savedSettings(worker)).toEqual({ languages: [] });
  await page.bringToFront();
  await transcribeNote(page, IDS.voiceOut);
  const { all } = await hostCalls(worker);
  expect(all).toHaveLength(2);
  expect("languages" in all[1]).toBe(false);
});

test("the choice is shown again when the popup reopens", async ({ context, worker }) => {
  let popup = await openPopup(context, worker);
  await popup.getByRole("radio", { name: "Only these languages" }).check();
  for (const code of ["es", "en", "fr"]) await check(popup, code).check();
  await expect.poll(() => savedSettings(worker)).toEqual({ languages: ["es", "en", "fr"] });
  await popup.close();

  popup = await openPopup(context, worker);
  await expect(popup.getByRole("radio", { name: "Only these languages" })).toBeChecked();
  for (const code of ["es", "en", "fr"]) await expect(check(popup, code)).toBeChecked();
  await expect(popup.locator("#list input:checked")).toHaveCount(3);
});

test("switching back to any language sends no languages, and switching again restores the checks", async ({ context, worker, openMock }) => {
  const popup = await openPopup(context, worker);
  await popup.getByRole("radio", { name: "Only these languages" }).check();
  await check(popup, "de").check();
  await popup.getByRole("radio", { name: "Any language" }).check();
  await expect(popup.locator("#picker")).toBeHidden();
  await expect.poll(() => savedSettings(worker)).toEqual({ languages: [] });

  await stubHost(worker);
  const page = await openMock();
  await transcribeNote(page, IDS.voiceIn);
  expect("languages" in (await hostCalls(worker)).first).toBe(false);

  await popup.bringToFront();
  await popup.getByRole("radio", { name: "Only these languages" }).check();
  await expect(check(popup, "de")).toBeChecked();
  await expect.poll(() => savedSettings(worker)).toEqual({ languages: ["de"] });
});

test("the search filters the list by name and by code", async ({ context, worker }) => {
  const popup = await openPopup(context, worker);
  await popup.getByRole("radio", { name: "Only these languages" }).check();
  await expect(popup.locator("#list li")).toHaveCount(100);
  await expect(visibleItems(popup)).toHaveCount(100);

  const dutch = await popup.evaluate(() => new Intl.DisplayNames(navigator.languages, { type: "language" }).of("nl"));
  await popup.locator("#search").fill(dutch.toUpperCase());
  await expect(check(popup, "nl")).toBeVisible();
  const shown = await visibleItems(popup).allTextContents();
  expect(shown.length).toBeLessThan(100);
  for (const text of shown) expect(text.toLowerCase()).toContain(dutch.toLowerCase());

  await popup.locator("#search").fill("yue");
  await expect(visibleItems(popup)).toHaveCount(1);
  await expect(check(popup, "yue")).toBeVisible();

  await popup.locator("#search").fill("qqqq");
  await expect(visibleItems(popup)).toHaveCount(0);
  await expect(popup.locator("#no-match")).toBeVisible();

  await popup.locator("#search").fill("");
  await expect(visibleItems(popup)).toHaveCount(100);
  await expect(popup.locator("#no-match")).toBeHidden();
});

test("Javanese uses Whisper's code jw and shows a name", async ({ context, worker }) => {
  const errors = [];
  const popup = await context.newPage();
  popup.on("pageerror", (error) => errors.push(error));
  await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  await popup.locator('body[data-ready="true"]').waitFor();
  await popup.getByRole("radio", { name: "Only these languages" }).check();

  const item = popup.locator('#list li[data-code="jw"]');
  await expect(item.locator(".code")).toHaveText("jw");
  const javanese = await popup.evaluate(() => new Intl.DisplayNames(navigator.languages, { type: "language" }).of("jv"));
  await expect(item.locator(".name")).toHaveText(javanese.charAt(0).toUpperCase() + javanese.slice(1));
  await check(popup, "jw").check();
  await expect.poll(() => savedSettings(worker)).toEqual({ languages: ["jw"] });
  expect(errors).toEqual([]);
});

test("the list is sorted by display name", async ({ context, worker }) => {
  const popup = await openPopup(context, worker);
  const names = await popup.locator("#list .name").allTextContents();
  const sorted = await popup.evaluate((list) => [...list].sort(new Intl.Collator(navigator.languages).compare), names);
  expect(names).toEqual(sorted);
});

test("a damaged saved value is ignored", async ({ context, worker, openMock }) => {
  await worker.evaluate(() => chrome.storage.local.set({ settings: { languages: ["de", 5, "DE", "de", "x;y", null] } }));
  await stubHost(worker);
  const page = await openMock();
  await transcribeNote(page, IDS.voiceIn);
  expect((await hostCalls(worker)).first.languages).toEqual(["de"]);

  await worker.evaluate(() => chrome.storage.local.set({ settings: { languages: "de" } }));
  await transcribeNote(page, IDS.voiceOut);
  expect("languages" in (await hostCalls(worker)).all[1]).toBe(false);
});

test("the popup works by keyboard", async ({ context, worker }) => {
  const popup = await openPopup(context, worker);
  await popup.getByRole("radio", { name: "Any language" }).focus();
  await popup.keyboard.press("ArrowDown");
  await expect(popup.getByRole("radio", { name: "Only these languages" })).toBeChecked();
  await popup.keyboard.press("Tab");
  await expect(popup.locator("#search")).toBeFocused();
  await popup.keyboard.type("es");
  await popup.keyboard.press("Tab");
  await popup.keyboard.press("Space");
  const first = await popup.locator("#list li:not([hidden]) input").first().getAttribute("value");
  await expect.poll(() => savedSettings(worker)).toEqual({ languages: [first] });
});
