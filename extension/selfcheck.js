// Self-check in the isolated world: notices when the user plays a voice note that got no
// [T] button, which means WhatsApp Web changed its page. page-hook.js says when audio
// starts playing; this file remembers the last click of the user and tells the service
// worker, which shows "!" on the toolbar icon. Nothing is sent over the network.
// Loaded after selectors.js (see manifest.json).
(() => {
  const TAG = "__wat";
  const CLICK_WINDOW_MS = 1500; // audio that starts later than this after a click is not judged
  const JUDGE_DELAY_MS = 300; // lets one scan in content.js (SCAN_INTERVAL_MS, 200 ms) run first
  const MAX_DEPTH = 25;
  const MAX_LINES = 200;
  // A label is copied only when every word is a player word, so a label that holds a
  // contact name ("Play voice message from Anna") shows as its length only.
  const LABEL_WORDS = new Set(["play", "pause", "voice", "audio", "message", "change", "playback", "speed", "currently", "ptt"]);
  const NUMBER = /^[\d.,:]+\u00d7?$/; // 1.5×, 0:42
  // Icon names such as "ic-keyboard-voice-filled": lowercase words joined by - or _.
  const ICON_NAME = /^[a-z0-9]+([_-][a-z0-9]+)+$/;

  let lastClick = null; // {at, row, id}; the id stays in memory and never goes into a report
  let lastState = null;

  // Clicks made by the user only: our own capture presses play from a script.
  function onUserClick(event) {
    if (!event.isTrusted || !(event.target instanceof Element)) return;
    // The composer (inside <footer>) plays the user's own recording before it is sent.
    if (event.target.closest("footer")) {
      lastClick = null;
      return;
    }
    const row = WatSelectors.messageRowOf(event.target);
    lastClick = { at: Date.now(), row, id: row ? WatSelectors.messageId(row) : null };
  }
  window.addEventListener("pointerdown", onUserClick, true);
  window.addEventListener("click", onUserClick, true);

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.[TAG] !== "page" || event.data.type !== "played") return;
    const click = lastClick;
    if (!click || Date.now() - click.at > CLICK_WINDOW_MS) return;
    lastClick = null;
    setTimeout(() => {
      try {
        judge(click);
      } catch (error) {
        console.warn("[wat] self-check failed", error); // for example after the extension was reloaded
      }
    }, JUDGE_DELAY_MS);
  });

  function judge(click) {
    let row = click.row;
    // WhatsApp may have rendered the row again since the click.
    if (row && !row.isConnected) row = click.id ? WatSelectors.rowById(click.id) : null;
    let state;
    if (row) state = row.querySelector(".wat-box") ? "ok" : "not_recognised";
    else if (!click.row && !document.querySelector(".wat-box")) state = "not_recognised";
    else return; // audio outside a message while other notes were recognised: nothing to learn
    report(state, state === "not_recognised" ? buildReport(row) : "");
  }

  function report(state, text) {
    if (state === lastState) return;
    lastState = state;
    try {
      chrome.runtime.sendMessage({ type: "status", state, report: text }).catch(() => {});
    } catch (error) {
      // extension reloaded or removed
    }
  }

  // Long hex runs (message IDs, phone numbers) become <idN>, other digits become 9.
  const redact = (text) => text.replace(/[A-Fa-f0-9]{8,}|\d/g, (match) => (match.length > 1 ? `<id${match.length}>` : "9"));

  function safeLabel(label) {
    const words = label.trim().split(/[\s,]+/).filter(Boolean);
    const known = words.length > 0 && words.every((w) => LABEL_WORDS.has(w.toLowerCase()) || NUMBER.test(w));
    return known ? redact(label) : `[${label.length} chars]`;
  }

  // "conv-msg-false_<number>@c.us_<id>" keeps "conv-msg" only: the rest is a message ID.
  function safeTestId(value) {
    const parts = value.split("-");
    const kept = [];
    for (const part of parts) {
      if (!/^[a-z]+$/i.test(part)) break;
      kept.push(part);
    }
    return kept.length === parts.length ? value : `${kept.join("-")}${kept.length ? "-" : ""}<id>`;
  }

  // Tag name and stable attributes only: never data-id, text, src or href.
  function describe(el) {
    const out = [el.tagName.toLowerCase()];
    if (el.hasAttribute("role")) out.push(`role=${redact(el.getAttribute("role"))}`);
    if (el.hasAttribute("data-icon")) out.push(`data-icon=${safeTestId(el.getAttribute("data-icon"))}`);
    if (el.hasAttribute("data-testid")) out.push(`data-testid=${safeTestId(el.getAttribute("data-testid"))}`);
    const label = el.getAttribute("aria-label");
    if (label) out.push(`aria-label=${safeLabel(label)}`);
    if (el.localName === "title" && el.closest("svg")) {
      const name = el.textContent.trim();
      out.push(ICON_NAME.test(name) ? `title=${name}` : "title=[title]");
    }
    return out.join(" ");
  }

  function tree(root) {
    const lines = [];
    const walk = (el, depth) => {
      if (lines.length >= MAX_LINES) return;
      lines.push("  ".repeat(depth) + describe(el));
      if (depth < MAX_DEPTH) for (const child of el.children) walk(child, depth + 1);
    };
    walk(root, 0);
    if (lines.length >= MAX_LINES) lines.push(`(stopped after ${MAX_LINES} lines)`);
    return lines;
  }

  // Without a clicked row: the first seek bar's message row, or else the largest block
  // around it that holds no other seek bar.
  function sliderBlock() {
    const slider = document.querySelector('[role="slider"]');
    if (!slider) return null;
    const row = WatSelectors.messageRowOf(slider);
    if (row) return row;
    let block = slider;
    while (block.parentElement && block.parentElement !== document.body && block.parentElement.querySelectorAll('[role="slider"]').length === 1) {
      block = block.parentElement;
    }
    return block;
  }

  function buildReport(row) {
    const icons = [...new Set([...document.querySelectorAll("[data-icon]")].map((el) => safeTestId(el.getAttribute("data-icon"))))];
    const target = row || sliderBlock();
    const lines = [
      "Local Voice Transcriber structure report",
      `extension version: ${chrome.runtime.getManifest().version}`,
      `chrome version: ${navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] || "unknown"}`,
      `date: ${new Date().toISOString().slice(0, 10)}`,
      `data-icon values: ${icons.join(", ") || "none"}`,
      `[data-id] rows: ${WatSelectors.messageRows(document).length}`,
      `[role=slider] elements: ${document.querySelectorAll('[role="slider"]').length}`,
      `.wat-box elements: ${document.querySelectorAll(".wat-box").length}`,
      `voice marker titles: ${WatSelectors.voiceTitles(document).length}`,
    ];
    if (!target) lines.push("--- no message row and no seek bar found");
    else lines.push(row ? "--- clicked message row" : "--- first seek bar block", ...tree(target));
    return lines.join("\n");
  }
})();
