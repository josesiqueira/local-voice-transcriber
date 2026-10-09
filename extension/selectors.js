// Every WhatsApp Web DOM lookup lives here. Generated class names change often, so
// only attributes are used: data-id on the message, data-icon on icons, role="slider"
// on the voice note seek bar, and the <audio> element. When WhatsApp Web changes its
// page, update this file.
const WatSelectors = (() => {
  const MESSAGE = "[data-id]";
  const AUDIO_ICON = /play|pause|audio|ptt/i;
  const PLAY_ICON = /play/i;
  // WhatsApp Web (as of 2026) marks the play button only by its aria-label, which
  // follows the interface language. Prefixes for some common languages are listed; any
  // other language falls back to the button next to the seek bar.
  const PLAY_LABEL = /^(play|reproduz|reproduc|riprodu|lire|écouter|abspiel|wiedergeb|afspelen|odtw|oynat|putar|воспроизв)/i;

  function messageRows(root) {
    // Outermost [data-id] only: quoted messages inside a message may carry their own.
    return [...root.querySelectorAll(MESSAGE)].filter((el) => !el.parentElement?.closest(MESSAGE));
  }

  function isAudioMessage(row) {
    if (row.querySelector("audio")) return true;
    if (!row.querySelector('[role="slider"]')) return false;
    return [...row.querySelectorAll("[data-icon]")].some((el) => AUDIO_ICON.test(el.getAttribute("data-icon")));
  }

  const messageId = (row) => row.getAttribute("data-id");
  const isOutgoing = (row) => messageId(row).startsWith("true_");
  const rowById = (id) => document.querySelector(`[data-id="${CSS.escape(id)}"]`);

  // The message row that contains this node (not a quoted copy elsewhere).
  const rowOf = (node) => node.closest(MESSAGE);

  function playButton(row) {
    const icon = [...row.querySelectorAll("[data-icon]")].find((el) => PLAY_ICON.test(el.getAttribute("data-icon")));
    if (icon) return icon.closest('button, [role="button"]') || icon;
    const labelled = [...row.querySelectorAll("button[aria-label]")].find((el) => PLAY_LABEL.test(el.getAttribute("aria-label")));
    if (labelled) return labelled;
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

  return { messageRows, isAudioMessage, messageId, isOutgoing, rowById, rowOf, playButton, audioSource, mountPoint };
})();
