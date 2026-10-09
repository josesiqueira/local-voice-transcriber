// Paste into the DevTools console on web.whatsapp.com, then press WhatsApp's own play
// button on a voice note and let it play for 2 seconds. Then type: copy(__watProbe())
// It records which browser audio functions WhatsApp calls when a note plays. It keeps
// only function names, object types, MIME types, byte counts and URL schemes and hosts:
// no audio, no text, no full URLs.
(() => {
  const log = [];
  const t0 = performance.now();
  const note = (what) => log.push(`${Math.round(performance.now() - t0)} ms  ${what}`);
  const scheme = (url) => {
    try {
      const u = new URL(String(url), location.href);
      return u.protocol === "blob:" || u.protocol === "data:" ? u.protocol : `${u.protocol}//${u.host}`;
    } catch (error) {
      return "unparsable";
    }
  };
  const typeOf = (o) => (o == null ? String(o) : o.constructor?.name || typeof o);
  const wrap = (owner, name, describe) => {
    const original = owner?.[name];
    if (typeof original !== "function") return note(`(${name} not present)`);
    owner[name] = function (...args) {
      try {
        note(describe.call(this, ...args));
      } catch (error) {
        note(`${name}: probe error ${error.message}`);
      }
      return original.apply(this, args);
    };
  };
  const wrapSetter = (proto, prop, describe) => {
    const d = Object.getOwnPropertyDescriptor(proto, prop);
    if (!d?.set) return;
    Object.defineProperty(proto, prop, { ...d, set(v) { note(describe.call(this, v)); d.set.call(this, v); } });
  };
  const native = (f) => /\[native code\]/.test(Function.prototype.toString.call(f));
  const media = (el) => `${el.tagName.toLowerCase()} connected=${el.isConnected} src=${scheme(el.currentSrc || el.src || "none")} srcObject=${typeOf(el.srcObject)} readyState=${el.readyState}`;

  note(`extension page hook installed: createObjectURL=${!native(URL.createObjectURL)} play=${!native(HTMLMediaElement.prototype.play)}`);
  note(`audio elements in page now: ${document.querySelectorAll("audio, video").length}`);

  wrap(URL, "createObjectURL", (o) => `createObjectURL(${typeOf(o)}${o instanceof Blob ? ` type="${o.type}" size=${o.size}` : ""})`);
  wrap(HTMLMediaElement.prototype, "play", function () { return `play() on ${media(this)}`; });
  wrap(HTMLMediaElement.prototype, "load", function () { return `load() on ${media(this)}`; });
  wrapSetter(HTMLMediaElement.prototype, "src", (v) => `media.src = ${scheme(v)}`);
  wrapSetter(HTMLMediaElement.prototype, "srcObject", (v) => `media.srcObject = ${typeOf(v)}`);
  if (window.MediaSource) {
    wrap(MediaSource.prototype, "addSourceBuffer", (mime) => `MediaSource.addSourceBuffer("${mime}")`);
    wrap(SourceBuffer.prototype, "appendBuffer", (b) => `SourceBuffer.appendBuffer(${b?.byteLength} bytes)`);
  }
  const AC = window.BaseAudioContext || window.AudioContext;
  wrap(AC.prototype, "decodeAudioData", (b) => `decodeAudioData(${typeOf(b)} ${b?.byteLength} bytes, starts "${b instanceof ArrayBuffer ? String.fromCharCode(...new Uint8Array(b, 0, Math.min(4, b.byteLength))).replace(/[^\x20-\x7e]/g, "?") : ""}")`);
  wrap(window.AudioContext?.prototype, "createMediaElementSource", (el) => `createMediaElementSource(${el && media(el)})`);
  wrap(AC.prototype, "createBufferSource", () => "createBufferSource()");
  wrap(window, "fetch", (input) => `fetch(${scheme(input?.url ?? input)})`);
  wrap(XMLHttpRequest.prototype, "open", (method, url) => `XMLHttpRequest.open(${method} ${scheme(url)})`);
  // Audio and Worker are constructors, so they get a Proxy that keeps `new` working.
  const wrapConstructor = (name, describe) => {
    if (typeof window[name] !== "function") return;
    window[name] = new Proxy(window[name], {
      construct(target, args, newTarget) {
        note(describe(...args));
        return Reflect.construct(target, args, newTarget);
      },
    });
  };
  wrapConstructor("Audio", (src) => `new Audio(${src === undefined ? "" : scheme(src)})`);
  wrapConstructor("Worker", (url) => `new Worker(${scheme(url)})`);

  window.__watProbe = () => {
    note(`audio elements in page at report time: ${[...document.querySelectorAll("audio, video")].map(media).join(" | ") || "none"}`);
    return log.join("\n");
  };
  console.log("[wat probe] ready: play a voice note with WhatsApp's own button, wait 2 s, then run copy(__watProbe())");
})();
