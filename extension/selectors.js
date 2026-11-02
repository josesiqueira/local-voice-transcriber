// Every WhatsApp Web DOM lookup lives here. Generated class names change often, so
// only attributes are used: data-id on the message, role="slider" on the voice note
// seek bar, aria-label and data-icon on the play button, the <audio> element, the voice
// icon (an svg <title> such as "ic-keyboard-voice-filled", or an older data-icon such as
// "ptt-status"), and the bubble tail icons "tail-in" and "tail-out".
// When WhatsApp Web changes its page, update this file.
const WatSelectors = (() => {
  const MESSAGE = "[data-id]";
  const PLAY_ICON = /play/i;
  // WhatsApp Web (as of 2026) marks the play button only by its aria-label, which
  // follows the interface language. Prefixes for some common languages are listed; any
  // other language falls back to the button next to the seek bar.
  const PLAY_LABEL = /^(play|reproduz|reproduc|riprodu|lire|écouter|abspiel|wiedergeb|afspelen|odtw|oynat|putar|воспроизв)/i;
  // While a note plays, its play button turns into a pause button.
  const PAUSE_ICON = /pause/i;
  const PAUSE_LABEL = /^(pause|pausa|mettre en pause|pausier|pauzeer|wstrzym|duraklat|jeda|пауз|приостанов)/i;
  // Icon names do not follow the interface language.
  const VOICE_MARKER = /keyboard-voice|ptt/i;

  function messageRows(root) {
    // Outermost [data-id] only: quoted messages inside a message may carry their own.
    return [...root.querySelectorAll(MESSAGE)].filter((el) => !el.parentElement?.closest(MESSAGE));
  }

  // The svg titles in this element that name a voice icon.
  function voiceTitles(root) {
    return [...root.querySelectorAll("svg title")].filter((title) => VOICE_MARKER.test(title.textContent));
  }

  function hasVoiceMarker(row) {
    if (voiceTitles(row).length) return true;
    return [...row.querySelectorAll("[data-icon]")].some((el) => VOICE_MARKER.test(el.getAttribute("data-icon")));
  }

  // Two independent ways to recognise a voice note, so losing either the seek bar or
  // the icons still leaves one: a seek bar with a play button next to it, or a voice
  // icon with a play or pause button found by its own icon or label.
  function isAudioMessage(row) {
    if (row.querySelector("audio")) return true;
    if (row.querySelector('[role="slider"]') && playButton(row)) return true;
    return hasVoiceMarker(row) && (markedPlayButton(row) || markedButton(row, PAUSE_ICON, PAUSE_LABEL)) !== null;
  }

  const messageId = (row) => row.getAttribute("data-id");

  // Older builds start data-id with "true_" for sent messages. Some builds give a bare
  // hash instead; then the bubble tail icon tells, and without one the player's side of
  // the row (outgoing bubbles sit on the right, or on the left in right-to-left layouts).
  function isOutgoing(row) {
    const id = messageId(row) || "";
    if (id.startsWith("true_")) return true;
    if (id.startsWith("false_")) return false;
    const tail = row.querySelector('[data-icon="tail-out"], [data-icon="tail-in"]');
    if (tail) return tail.getAttribute("data-icon") === "tail-out";
    const control = row.querySelector('[role="slider"]') || playButton(row);
    if (!control) return false;
    const box = control.getBoundingClientRect();
    const own = row.getBoundingClientRect();
    if (!own.width) return false; // not laid out
    const right = box.left + box.width / 2 > own.left + own.width / 2;
    return getComputedStyle(row).direction === "rtl" ? !right : right;
  }

  const rowById = (id) => document.querySelector(`[data-id="${CSS.escape(id)}"]`);

  // The message row that contains this node (not a quoted copy elsewhere).
  const rowOf = (node) => node.closest(MESSAGE);

  // The outermost message row around this node: a click may land inside a quoted message.
  function messageRowOf(node) {
    let row = node.closest(MESSAGE);
    while (row?.parentElement?.closest(MESSAGE)) row = row.parentElement.closest(MESSAGE);
    return row;
  }

  // A button found by its own icon or label, without looking at the seek bar.
  function markedButton(row, iconName, label) {
    const icon = [...row.querySelectorAll("[data-icon]")].find((el) => iconName.test(el.getAttribute("data-icon")));
    if (icon) return icon.closest('button, [role="button"]') || icon;
    return [...row.querySelectorAll("button[aria-label]")].find((el) => label.test(el.getAttribute("aria-label"))) || null;
  }

  const markedPlayButton = (row) => markedButton(row, PLAY_ICON, PLAY_LABEL);

  function playButton(row) {
    const marked = markedPlayButton(row);
    if (marked) return marked;
    // The play button is the first button in the smallest block that holds the seek bar.
    for (let el = row.querySelector('[role="slider"]'); el && el !== row; el = el.parentElement) {
      const button = el.querySelector("button");
      if (button) return button;
    }
    return null;
  }

  function audioSource(row) {
    const audio = row.querySelector("audio");
    return audio ? audio.currentSrc || audio.src || "" : "";
  }

  // Our box is appended as the last child of the message element.
  const mountPoint = (row) => row;

  return { messageRows, isAudioMessage, messageId, isOutgoing, rowById, rowOf, messageRowOf, playButton, audioSource, mountPoint, voiceTitles };
})();
