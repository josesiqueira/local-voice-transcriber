// Paste into the DevTools console on web.whatsapp.com with a chat open that shows a voice note.
// Prints the structure of audio message rows: tag names and stable attributes only.
// IDs and phone numbers are replaced, and only short audio-related aria-labels are shown.
(() => {
  const ids = (s) => s.replace(/[A-Fa-f0-9]{8,}/g, (m) => `<id${m.length}>`).replace(/\d/g, "9");
  const KEY = /voice|audio|ptt|play|pause|mic/i;
  const attrs = (el) => {
    const out = [el.tagName.toLowerCase()];
    for (const a of ["role", "data-icon", "data-testid", "data-id"]) if (el.hasAttribute(a)) out.push(`${a}=${ids(el.getAttribute(a))}`);
    const label = el.getAttribute("aria-label");
    if (label) out.push(KEY.test(label) && label.length < 40 ? `aria-label=${ids(label)}` : `aria-label=[${label.length} chars]`);
    if (el.tagName === "AUDIO") out.push(`src-scheme=${(el.getAttribute("src") || "none").split(":")[0]}`);
    return out.join(" ");
  };
  const tree = (el, depth = 0) => (depth > 16 ? [] : ["  ".repeat(depth) + attrs(el), ...[...el.children].flatMap((c) => tree(c, depth + 1))]);
  const main = document.querySelector("#main") || document.body;
  const icons = [...new Set([...main.querySelectorAll("[data-icon]")].map((e) => e.getAttribute("data-icon")))];
  const rows = [...main.querySelectorAll("[data-id]")].filter((r) => r.querySelector('audio, [role="slider"], [data-icon*="ptt"], [data-icon*="audio"]'));
  const out = [
    `audio elements in page: ${document.querySelectorAll("audio").length}`,
    `data-icon values: ${icons.join(", ")}`,
    `audio-like rows: ${rows.length}`,
    ...rows.slice(0, 2).flatMap((r, i) => [`--- row ${i}`, ...tree(r)]),
  ].join("\n");
  copy(out);
  console.log(out);
})();
