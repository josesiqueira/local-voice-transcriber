// Runs in the page's own JavaScript world at document_start (see manifest.json).
// It keeps references to the audio Blobs WhatsApp creates and, when armed by
// capture.js, hands over the bytes of the next audio that starts playing. It wraps
// standard browser functions only; it never touches WhatsApp's own modules.
(() => {
  const TAG = "__wat";
  const MAX_BLOBS = 20;
  const AUDIO_TYPE = /^(audio\/|video\/ogg|application\/ogg)/i;
  const blobs = new Map(); // blob: URL -> Blob, oldest first; kept after revokeObjectURL
  let armed = null; // {id, timer}

  const post = (message, transfer = []) => window.postMessage({ [TAG]: "page", ...message }, location.origin, transfer);

  const originalCreate = URL.createObjectURL;
  URL.createObjectURL = function (object) {
    const url = originalCreate.apply(this, arguments);
    if (object instanceof Blob && AUDIO_TYPE.test(object.type)) {
      blobs.set(url, object);
      if (blobs.size > MAX_BLOBS) blobs.delete(blobs.keys().next().value);
    }
    return url;
  };

  async function sendBlob(id, url, via, settled) {
    try {
      const blob = blobs.get(url) || (await (await fetch(url)).blob());
      const buffer = await blob.arrayBuffer();
      // Report only after the note is paused again, so a quick retry never sees it mid-play.
      if (settled) await settled;
      post({ type: "captured", id, buffer, mime: blob.type || "audio/ogg", via }, [buffer]);
    } catch (error) {
      post({ type: "failed", id, reason: String(error?.message ?? error) });
    }
  }

  function disarm() {
    if (armed) clearTimeout(armed.timer);
    armed = null;
  }

  function arm(id, timeoutMs) {
    disarm();
    armed = { id, timer: setTimeout(disarm, timeoutMs) };
  }

  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    const src = this.currentSrc || this.src || "";
    if (!armed || !(this instanceof HTMLAudioElement) || !src.startsWith("blob:")) return originalPlay.apply(this, arguments);
    const { id } = armed;
    disarm();
    const media = this;
    const wasMuted = media.muted;
    media.muted = true;
    const playing = originalPlay.apply(this, arguments);
    const settled = Promise.resolve(playing)
      .catch(() => {})
      .finally(() => {
        media.pause();
        try {
          media.currentTime = 0;
        } catch (error) {
          // not seekable yet; harmless
        }
        media.muted = wasMuted;
      });
    // A play() that never settles must not hold the capture back for long.
    sendBlob(id, src, "play", Promise.race([settled, new Promise((resolve) => setTimeout(resolve, 2000))]));
    return playing;
  };

  function sniffMime(buffer) {
    const head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
    return String.fromCharCode(...head) === "OggS" ? "audio/ogg" : "application/octet-stream";
  }

  const AudioContextBase = window.BaseAudioContext || window.AudioContext;
  const originalDecode = AudioContextBase.prototype.decodeAudioData;
  AudioContextBase.prototype.decodeAudioData = function (data) {
    if (armed && data instanceof ArrayBuffer) {
      const { id } = armed;
      disarm();
      try {
        const copy = data.slice(0); // decodeAudioData detaches the original buffer
        post({ type: "captured", id, buffer: copy, mime: sniffMime(copy), via: "decodeAudioData" }, [copy]);
      } catch (error) {
        // a detached buffer must never make WhatsApp's own call throw
      }
    }
    return originalDecode.apply(this, arguments);
  };

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.[TAG] !== "content") return;
    const message = event.data;
    if (message.type === "get") {
      if (typeof message.url !== "string" || !message.url.startsWith("blob:")) post({ type: "failed", id: message.id, reason: "not a blob: URL" });
      else sendBlob(message.id, message.url, "audio element");
    }
    else if (message.type === "arm") {
      arm(message.id, message.timeoutMs);
      post({ type: "armed", id: message.id });
    } else if (message.type === "disarm" && armed?.id === message.id) disarm();
  });
})();
