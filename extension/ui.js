// Builds and updates the [T] button and the caption. Knows nothing about WhatsApp or the host.
const WatUi = (() => {
  const ERROR_TEXT = {
    host_not_installed: "Local transcriber not installed. Run install.sh",
    host_crashed: "Transcriber stopped unexpectedly. See host.log",
    worker_stopped: "Transcriber connection lost. Retry",
    audio_not_found: "Could not read this audio. Play it once, then retry",
    audio_too_large: "Audio is too large to transcribe",
    invalid_request: "Internal error (invalid request). See host.log",
    model_missing: "Model not downloaded. Run install.sh",
    decode_failed: "Could not decode this audio",
    empty_transcription: "No speech found in this message",
    reply_too_large: "Transcript too long to return",
    internal_error: "Transcription failed. See host.log",
    network_block_failed: "Could not block network access, so nothing was transcribed. See host.log",
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function create(messageId, outgoing, onTranscribe) {
    const box = el("div", outgoing ? "wat-box wat-out" : "wat-box");
    box.dataset.watId = messageId;
    const row = el("div", "wat-row");
    const button = el("button", "wat-btn", "T");
    button.type = "button";
    button.title = "Transcribe this voice message";
    const status = el("span", "wat-status");
    const caption = el("div", "wat-caption");
    caption.hidden = true;
    row.append(button, status);
    box.append(row, caption);

    // Keep our clicks away from WhatsApp's handlers (message selection and so on).
    for (const type of ["click", "mousedown", "mouseup", "pointerdown", "pointerup"]) {
      box.addEventListener(type, (event) => event.stopPropagation());
    }
    button.addEventListener("click", () => {
      if (box.dataset.watState === "working") return;
      onTranscribe(box);
    });
    setIdle(box);
    return box;
  }

  const parts = (box) => ({
    button: box.querySelector(".wat-btn"),
    status: box.querySelector(".wat-status"),
    caption: box.querySelector(".wat-caption"),
  });

  function setIdle(box) {
    const { button, status, caption } = parts(box);
    box.dataset.watState = "idle";
    button.hidden = false;
    button.disabled = false;
    button.textContent = "T";
    status.replaceChildren();
    caption.hidden = true;
  }

  function setWorking(box) {
    const { button, status, caption } = parts(box);
    box.dataset.watState = "working";
    button.hidden = false;
    button.disabled = true;
    status.replaceChildren(el("span", "wat-spinner"), document.createTextNode("Transcribing..."));
    caption.hidden = true;
  }

  function setDone(box, result) {
    const { button, status, caption } = parts(box);
    box.dataset.watState = "done";
    button.hidden = true;
    status.replaceChildren();
    const text = el("div", "wat-text", result.text);
    const lang = el("span", "wat-lang", String(result.language || "").toUpperCase());
    lang.title = `${result.device}, ${result.seconds} s`;
    const copy = el("button", "wat-copy", "Copy");
    copy.type = "button";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(result.text);
        copy.textContent = "Copied";
      } catch (error) {
        console.warn("[wat] copy failed", error);
        copy.textContent = "Copy failed";
      }
      setTimeout(() => (copy.textContent = "Copy"), 1500);
    });
    const meta = el("div", "wat-meta");
    meta.append(lang, copy);
    caption.replaceChildren(text, meta);
    caption.hidden = false;
  }

  function setError(box, code) {
    const { button, status, caption } = parts(box);
    box.dataset.watState = "error";
    box.dataset.watError = code;
    button.hidden = false;
    button.disabled = false;
    button.textContent = "Retry";
    status.replaceChildren(el("span", "wat-error", ERROR_TEXT[code] || ERROR_TEXT.internal_error));
    caption.hidden = true;
  }

  return { create, setIdle, setWorking, setDone, setError, ERROR_TEXT };
})();
