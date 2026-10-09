const { test, expect, stubHost, IDS, box } = require("./helpers");

const hostErrors = [
  ["invalid_request", "Internal error (invalid request). See host.log"],
  ["model_missing", "Model not downloaded. Run install.sh"],
  ["decode_failed", "Could not decode this audio"],
  ["empty_transcription", "No speech found in this message"],
  ["reply_too_large", "Transcript too long to return"],
  ["internal_error", "Transcription failed. See host.log"],
  ["audio_too_large", "Audio is too large to transcribe"],
  ["network_block_failed", "Could not block network access, so nothing was transcribed. See host.log"],
  ["something_new", "Transcription failed. See host.log"],
];

for (const [code, text] of hostErrors) {
  test(`host error ${code} shows its text and a retry`, async ({ openMock, worker }) => {
    await stubHost(worker, { reply: { ok: false, error: code, message: "x" } });
    const page = await openMock();
    await box(page, IDS.voiceIn).locator(".wat-btn").click();
    await expect(box(page, IDS.voiceIn)).toHaveAttribute("data-wat-state", "error");
    await expect(box(page, IDS.voiceIn).locator(".wat-error")).toHaveText(text);
    await expect(box(page, IDS.voiceIn).locator(".wat-btn")).toHaveText("Retry");
  });
}

const chromeErrors = [
  ["Specified native messaging host not found.", "Local transcriber not installed. Run install.sh"],
  ["Access to the specified native messaging host is forbidden.", "Local transcriber not installed. Run install.sh"],
  ["Native host has exited.", "Transcriber stopped unexpectedly. See host.log"],
  ["Error when communicating with the native messaging host.", "Transcriber stopped unexpectedly. See host.log"],
];

for (const [message, text] of chromeErrors) {
  test(`chrome error "${message}" is mapped`, async ({ openMock, worker }) => {
    await stubHost(worker, { throwMessage: message });
    const page = await openMock();
    await box(page, IDS.voiceIn).locator(".wat-btn").click();
    await expect(box(page, IDS.voiceIn).locator(".wat-error")).toHaveText(text);
  });
}

test("a reply that is not an object counts as a crashed host", async ({ openMock, worker }) => {
  await stubHost(worker, { reply: "nonsense" });
  const page = await openMock();
  await box(page, IDS.voiceIn).locator(".wat-btn").click();
  await expect(box(page, IDS.voiceIn).locator(".wat-error")).toHaveText("Transcriber stopped unexpectedly. See host.log");
});

test("retry after an error can succeed", async ({ openMock, worker }) => {
  await stubHost(worker, { throwMessage: "Native host has exited." });
  const page = await openMock();
  await box(page, IDS.voiceIn).locator(".wat-btn").click();
  await expect(box(page, IDS.voiceIn)).toHaveAttribute("data-wat-state", "error");
  await stubHost(worker);
  await box(page, IDS.voiceIn).locator(".wat-btn").click();
  await expect(box(page, IDS.voiceIn).locator(".wat-text")).toHaveText("Hello world");
});
