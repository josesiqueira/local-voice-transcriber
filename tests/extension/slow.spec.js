const fs = require("fs");
const path = require("path");
const { test, expect, stubHost, IDS, box, ROOT } = require("./helpers");

// With the ping setInterval in content.js disabled, this test still passes.
// Playwright's attachment to the service worker (worker.evaluate) may keep the worker alive past the
// 30 s idle limit, and there is no documented way to detach it, so this does NOT prove the pings are needed.
test("@slow a 45 second host call still delivers its reply", async ({ openMock, worker }) => {
  test.setTimeout(120_000);
  await stubHost(worker, { delayMs: 45_000 });
  const page = await openMock();
  await box(page, IDS.voiceIn).locator(".wat-btn").click();
  await expect(box(page, IDS.voiceIn)).toHaveAttribute("data-wat-state", "done", { timeout: 90_000 });
});

// Chromium reads user-level host manifests from <user data dir>/NativeMessagingHosts.
test.describe("@slow real host", () => {
  test.beforeEach(async ({ userDataDir }) => {
    const id = /^EXTENSION_ID="([a-p]{32})"$/m.exec(fs.readFileSync(path.join(ROOT, "install.sh"), "utf8"))[1];
    const dir = path.join(userDataDir, "NativeMessagingHosts");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "io.github.josesiqueira.local_voice_transcriber.json"),
      JSON.stringify({
        name: "io.github.josesiqueira.local_voice_transcriber",
        description: "test",
        path: path.join(ROOT, "host", "run-host.sh"),
        type: "stdio",
        allowed_origins: [`chrome-extension://${id}/`],
      }),
    );
  });

  test("@slow transcribes a speech sample through Chromium and the real host", async ({ openMock }) => {
    test.setTimeout(300_000);
    const sample = path.join(ROOT, "tests", "audio", "speech-30s.ogg");
    test.skip(!fs.existsSync(sample), "tests/audio/speech-30s.ogg missing");
    const page = await openMock({ audioFile: sample });
    const started = Date.now();
    await box(page, IDS.voiceIn).locator(".wat-btn").click();
    await expect(box(page, IDS.voiceIn)).toHaveAttribute("data-wat-state", "done", { timeout: 240_000 });
    const seconds = (Date.now() - started) / 1000;
    const text = await box(page, IDS.voiceIn).locator(".wat-text").textContent();
    const title = await box(page, IDS.voiceIn).locator(".wat-lang").getAttribute("title");
    console.log(`click to caption: ${seconds.toFixed(2)} s; host: ${title}; text: ${text.slice(0, 80)}`);
    const expected = process.env.WAT_SAMPLE_LANGUAGE;
    if (expected) await expect(box(page, IDS.voiceIn).locator(".wat-lang")).toHaveText(expected.toUpperCase());
    else await expect(box(page, IDS.voiceIn).locator(".wat-lang")).not.toHaveText("");
    expect(text.split(/\s+/).length).toBeGreaterThan(20);
  });
});
