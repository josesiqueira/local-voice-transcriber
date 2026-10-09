// Entry point in the isolated world: finds audio messages, adds the [T] button,
// runs a transcription on click, and restores cached captions.
// Loaded after selectors.js, ui.js and capture.js (see manifest.json).
(() => {
  const SCAN_INTERVAL_MS = 200;
  const PING_INTERVAL_MS = 20000; // the worker stops after 30 s without events
  const MAX_AUDIO_BYTES = 40 * 1024 * 1024; // keep equal to host/config.py
  const CACHE_PREFIX = "t:";
  const inFlight = new Set(); // message IDs being transcribed

  const failure = (error) => ({ ok: false, error, message: "" });

  function boxFor(row) {
    return WatSelectors.mountPoint(row).querySelector(":scope > .wat-box");
  }

  function boxesFor(id) {
    return document.querySelectorAll(`.wat-box[data-wat-id="${CSS.escape(id)}"]`);
  }

  function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  function askWorker(request) {
    return new Promise((resolve) => {
      let port;
      try {
        port = chrome.runtime.connect({ name: "transcribe" });
      } catch (error) {
        resolve(failure("worker_stopped")); // extension reloaded or removed
        return;
      }
      let finished = false;
      const ping = setInterval(() => {
        try {
          port.postMessage({ type: "ping" });
        } catch (error) {
          // the disconnect handler reports it
        }
      }, PING_INTERVAL_MS);
      const finish = (result) => {
        if (finished) return;
        finished = true;
        clearInterval(ping);
        resolve(result);
      };
      port.onMessage.addListener((result) => {
        finish(result);
        port.disconnect();
      });
      port.onDisconnect.addListener(() => finish(failure("worker_stopped")));
      try {
        port.postMessage(request);
      } catch (error) {
        finish(failure("worker_stopped"));
      }
    });
  }

  async function runTranscription(id, box) {
    // The clicked box's own row; fall back to a lookup if WhatsApp re-rendered it since.
    const own = WatSelectors.rowOf(box);
    const row = own?.isConnected ? own : WatSelectors.rowById(id);
    if (!row) return failure("audio_not_found");
    let audio;
    try {
      audio = await WatCapture.getAudio(row, id);
    } catch (error) {
      console.warn("[wat] capture failed", error);
      return failure("audio_not_found");
    }
    if (audio.buffer.byteLength > MAX_AUDIO_BYTES) return failure("audio_too_large");
    return askWorker({ type: "transcribe", messageId: id, audio_b64: toBase64(audio.buffer), mime: audio.mime });
  }

  async function onTranscribe(box) {
    const id = box.dataset.watId;
    if (inFlight.has(id)) return;
    inFlight.add(id);
    boxesFor(id).forEach(WatUi.setWorking);
    let result;
    try {
      result = await runTranscription(id, box);
    } catch (error) {
      console.warn("[wat] transcription failed", error);
      result = failure("internal_error");
    } finally {
      inFlight.delete(id);
    }
    if (result.ok) {
      boxesFor(id).forEach((b) => WatUi.setDone(b, result));
      const entry = { text: result.text, language: result.language, device: result.device, seconds: result.seconds, createdAt: Date.now() };
      try {
        await chrome.storage.local.set({ [CACHE_PREFIX + id]: entry });
      } catch (error) {
        console.warn("[wat] could not cache the transcript", error); // caption still shows
      }
    } else {
      boxesFor(id).forEach((b) => WatUi.setError(b, result.error));
    }
  }

  async function scan() {
    const fresh = [];
    for (const row of WatSelectors.messageRows(document)) {
      const existing = boxFor(row);
      if (!WatSelectors.isAudioMessage(row)) {
        existing?.remove();
        continue;
      }
      const id = WatSelectors.messageId(row);
      if (existing && existing.dataset.watId === id) continue;
      existing?.remove();
      const box = WatUi.create(id, WatSelectors.isOutgoing(row), onTranscribe);
      WatSelectors.mountPoint(row).appendChild(box);
      if (inFlight.has(id)) WatUi.setWorking(box);
      else fresh.push(box);
    }
    if (!fresh.length) return;
    let cached = {};
    try {
      cached = await chrome.storage.local.get(fresh.map((box) => CACHE_PREFIX + box.dataset.watId));
    } catch (error) {
      console.warn("[wat] could not read the cache", error);
      return;
    }
    for (const box of fresh) {
      const entry = cached[CACHE_PREFIX + box.dataset.watId];
      if (entry && box.dataset.watState === "idle") WatUi.setDone(box, entry);
    }
  }

  // At most one scan per SCAN_INTERVAL_MS, however many mutations arrive.
  let timer = null;
  function scheduleScan() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      scan().catch((error) => console.warn("[wat] scan failed", error));
    }, SCAN_INTERVAL_MS);
  }

  new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-id"] });
  scheduleScan();
})();
