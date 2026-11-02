// Service worker: takes transcription requests from content scripts over a port,
// runs them one at a time through the native host, and maps failures to error codes.
// It also shows the self-check result from selfcheck.js on the toolbar icon.
const HOST_NAME = "io.github.josesiqueira.local_voice_transcriber";
const SETTINGS_KEY = "settings"; // keep equal to popup.js; transcripts use the "t:" prefix
const STATUS_KEY = "status"; // keep equal to popup.js; in chrome.storage.session
const MAX_REPORT_CHARS = 20000;

// The only path to the native host. Tests replace send() through the worker's evaluate.
globalThis.hostTransport = {
  send(request) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendNativeMessage(HOST_NAME, request, (reply) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(reply);
      });
    });
  },
};

function failure(error, message) {
  return { ok: false, error, message };
}

function mapNativeError(message) {
  // Exact texts from Chrome's native messaging documentation.
  if (
    message.includes("Specified native messaging host not found.") ||
    message.includes("Access to the specified native messaging host is forbidden.")
  ) {
    return failure("host_not_installed", message);
  }
  return failure("host_crashed", message);
}

function normalizeReply(reply) {
  if (!reply || typeof reply !== "object" || typeof reply.ok !== "boolean") {
    return failure("host_crashed", "The host sent no valid reply");
  }
  if (!reply.ok) return failure(String(reply.error || "internal_error"), String(reply.message || ""));
  if (typeof reply.text !== "string" || !reply.text.trim()) {
    return failure("empty_transcription", "The host returned no text");
  }
  return { ok: true, text: reply.text, language: reply.language, device: reply.device, seconds: reply.seconds };
}

// The languages chosen in the popup, in the order they were checked. Empty means any language.
async function savedLanguages() {
  let settings;
  try {
    settings = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];
  } catch (error) {
    console.warn("[wat] could not read the settings, detecting any language", error);
    return [];
  }
  const languages = settings?.languages;
  if (!Array.isArray(languages)) return [];
  const valid = languages.filter((code) => typeof code === "string" && /^[a-z]{2,3}$/.test(code));
  return [...new Set(valid)].slice(0, 100);
}

async function transcribe(request) {
  try {
    const native = { audio_b64: request.audio_b64, mime: request.mime };
    const languages = await savedLanguages();
    if (languages.length) native.languages = languages;
    const reply = await globalThis.hostTransport.send(native);
    return normalizeReply(reply);
  } catch (error) {
    return mapNativeError(String(error?.message ?? error));
  }
}

// One host process at a time: two model loads do not fit in the GPU's free memory.
let queue = Promise.resolve();
function enqueue(job) {
  const run = queue.then(job, job);
  queue = run.catch(() => {});
  return run;
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "transcribe") return;
  let connected = true;
  port.onDisconnect.addListener(() => (connected = false));
  port.onMessage.addListener((message) => {
    // {type: "ping"} messages only keep this worker alive during long runs.
    if (message?.type !== "transcribe") return;
    enqueue(() => (connected ? transcribe(message) : null))
      .then((result) => {
        if (!connected || !result) return;
        port.postMessage(result);
        port.disconnect();
      })
      .catch((error) => console.warn("[wat] could not send the result", error));
  });
});

// "not_recognised": a voice note played that got no [T] button. The badge is per tab, and
// the latest report stays in session storage (memory only) for the popup until Chrome closes.
async function showStatus(tabId, state, report) {
  if (state === "not_recognised") {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#c5221f" });
    await chrome.action.setBadgeText({ tabId, text: "!" });
    const status = { state, report: String(report || "").slice(0, MAX_REPORT_CHARS), at: Date.now() };
    await chrome.storage.session.set({ [STATUS_KEY]: status });
  } else if (state === "ok") {
    await chrome.action.setBadgeText({ tabId, text: "" });
    await chrome.storage.session.remove(STATUS_KEY);
  }
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "status" || typeof sender.tab?.id !== "number") return;
  showStatus(sender.tab.id, message.state, message.report).catch((error) => console.warn("[wat] could not show the status", error));
});
