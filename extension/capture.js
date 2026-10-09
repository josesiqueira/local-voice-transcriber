// Isolated-world side of audio capture: asks page-hook.js (MAIN world) for the bytes
// of one message's audio. Order: an existing <audio> blob source
// first, otherwise arm the hook and press the message's own play button.
const WatCapture = (() => {
  const TAG = "__wat";
  const TIMEOUT_MS = 20000;
  const pending = new Map(); // id -> {resolve, reject, timer, onArmed}
  let counter = 0;

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.[TAG] !== "page") return;
    const message = event.data;
    const waiting = pending.get(message.id);
    if (!waiting) return;
    if (message.type === "armed") {
      waiting.onArmed?.();
      return;
    }
    pending.delete(message.id);
    clearTimeout(waiting.timer);
    if (message.type === "captured") {
      console.info(`[wat] capture via ${message.via}`);
      waiting.resolve({ buffer: message.buffer, mime: message.mime });
    } else {
      waiting.reject(new Error(`page hook failed: ${message.reason}`));
    }
  });

  function ask(type, extra, onArmed) {
    const id = `wat-${++counter}-${Date.now()}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        window.postMessage({ [TAG]: "content", type: "disarm", id }, location.origin);
        reject(new Error(`no audio within ${TIMEOUT_MS} ms`));
      }, TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer, onArmed });
      window.postMessage({ [TAG]: "content", type, id, ...extra }, location.origin);
    });
  }

  async function captureOne(row, id) {
    // The row may have been reused for another message while this capture waited in the queue.
    if (WatSelectors.messageId(row) !== id || !row.isConnected) {
      row = WatSelectors.rowById(id);
      if (!row) throw new Error("the message is no longer in the page");
    }
    const src = WatSelectors.audioSource(row);
    if (src.startsWith("blob:")) {
      try {
        return await ask("get", { url: src });
      } catch (error) {
        console.warn("[wat] reading the audio element failed, trying playback", error);
      }
    }
    const play = WatSelectors.playButton(row);
    if (!play) throw new Error("no play button in this message");
    return ask("arm", { timeoutMs: TIMEOUT_MS }, () => play.click());
  }

  // One capture at a time: the hook has a single arm slot, and two armed
  // plays would swap their audio. A failed capture must not block the next.
  let chain = Promise.resolve();
  function getAudio(row, id) {
    const run = chain.then(() => captureOne(row, id));
    chain = run.catch(() => {});
    return run;
  }

  return { getAudio };
})();
