// Shared setup for the extension tests: launches Chromium with the unpacked
// extension and serves the mock page on https://web.whatsapp.com/.
const fs = require("fs");
const os = require("os");
const path = require("path");
const base = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..", "..");
const EXTENSION = path.join(ROOT, "extension");
const MOCK_PAGE = fs.readFileSync(path.join(ROOT, "tests", "mock-whatsapp.html"));
const MOCK_AUDIO = path.join(ROOT, "tests", "mock-audio.ogg");

const test = base.test.extend({
  userDataDir: async ({}, use) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wat-profile-"));
    await use(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  },
  context: async ({ userDataDir }, use) => {
    const context = await base.chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${EXTENSION}`,
        `--load-extension=${EXTENSION}`,
        "--autoplay-policy=no-user-gesture-required",
      ],
    });
    await use(context);
    await context.close();
  },
  worker: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent("serviceworker");
    await use(worker);
  },
  openMock: async ({ context }, use) => {
    await use(async ({ variant = "detached", delay = 0, audioFile = MOCK_AUDIO, dark = false, label = "" } = {}) => {
      await context.route("https://web.whatsapp.com/**", (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === "/mock-audio.ogg") {
          return route.fulfill({ body: fs.readFileSync(audioFile), contentType: "audio/ogg" });
        }
        return route.fulfill({ body: MOCK_PAGE, contentType: "text/html" });
      });
      const page = context.pages()[0] || (await context.newPage());
      await page.goto(`https://web.whatsapp.com/?variant=${variant}&delay=${delay}${label ? `&label=${encodeURIComponent(label)}` : ""}`);
      if (dark) await page.evaluate(() => document.body.classList.add("dark"));
      return page;
    });
  },
});

// Replaces the native host inside the service worker. `reply` is returned after
// `delayMs`; `throwMessage` makes the call fail like chrome.runtime.lastError.
async function stubHost(worker, { reply, delayMs = 0, throwMessage = null } = {}) {
  await worker.evaluate(
    ({ reply, delayMs, throwMessage }) => {
      globalThis.__watCalls = [];
      globalThis.__watRunning = 0;
      globalThis.__watMaxRunning = 0;
      globalThis.hostTransport.send = async (request) => {
        globalThis.__watCalls.push(request);
        globalThis.__watRunning += 1;
        globalThis.__watMaxRunning = Math.max(globalThis.__watMaxRunning, globalThis.__watRunning);
        try {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          if (throwMessage) throw new Error(throwMessage);
          return reply;
        } finally {
          globalThis.__watRunning -= 1;
        }
      };
    },
    { reply: reply ?? { ok: true, text: "Hello world", language: "en", device: "cuda", seconds: 4.2 }, delayMs, throwMessage },
  );
}

async function hostCalls(worker) {
  return worker.evaluate(() => ({
    count: (globalThis.__watCalls || []).length,
    maxRunning: globalThis.__watMaxRunning || 0,
    first: (globalThis.__watCalls || [])[0] || null,
    all: globalThis.__watCalls || [],
  }));
}

// Opens the action popup as a tab. The extension ID is the host part of the worker's URL.
async function openPopup(context, worker) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  await page.locator('body[data-ready="true"]').waitFor();
  return page;
}

const IDS = {
  voiceIn: "false_111111111111@c.us_3EB0AAAA0001",
  text: "false_111111111111@c.us_3EB0AAAA0002",
  voiceOut: "true_111111111111@c.us_3EB0AAAA0003",
};

const box = (page, id) => page.locator(`.wat-box[data-wat-id="${id}"]`);

module.exports = { test, expect: base.expect, stubHost, hostCalls, openPopup, IDS, box, ROOT };
