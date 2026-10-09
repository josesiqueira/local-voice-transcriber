// Action popup: chooses the languages that detection picks from and saves the choice on
// every change. background.js reads it for each transcription. Loaded after languages.js.
(() => {
  const SETTINGS_KEY = "settings"; // keep equal to background.js
  const locales = navigator.languages;

  const modeInputs = document.querySelectorAll('input[name="mode"]');
  const picker = document.getElementById("picker");
  const search = document.getElementById("search");
  const count = document.getElementById("count");
  const list = document.getElementById("list");
  const noMatch = document.getElementById("no-match");
  const errorLine = document.getElementById("error");

  let settings = {};
  let mode = "any";
  let chosen = []; // codes in the order they were checked; detection breaks ties by this order

  let names = null;
  try {
    names = new Intl.DisplayNames(locales, { type: "language" });
  } catch (error) {
    console.warn("[wat] language names unavailable, showing codes", error);
  }

  function displayName(code) {
    // Whisper's code for Javanese is "jw"; the standard code is "jv".
    const standard = code === "jw" ? "jv" : code;
    let name;
    try {
      name = names?.of(standard);
    } catch (error) {
      name = undefined;
    }
    if (!name || name === standard) return code;
    return name.charAt(0).toLocaleUpperCase(locales[0]) + name.slice(1);
  }

  // Lowercase without accents, so "espanol" finds "Español".
  const fold = (text) => text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();

  const collator = new Intl.Collator(locales);
  const languages = WHISPER_LANGUAGES.map((code) => ({ code, name: displayName(code) }))
    .sort((a, b) => collator.compare(a.name, b.name));
  const nameOf = Object.fromEntries(languages.map(({ code, name }) => [code, name]));
  const searchKeyOf = Object.fromEntries(languages.map(({ code, name }) => [code, fold(name)]));

  function renderList() {
    const items = languages.map(({ code, name }) => {
      const item = document.createElement("li");
      item.dataset.code = code;
      const label = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.value = code;
      box.checked = chosen.includes(code);
      const nameText = document.createElement("span");
      nameText.className = "name";
      nameText.textContent = name;
      label.append(box, nameText);
      if (name !== code) {
        // Without a name from the browser the code is already shown once.
        const codeText = document.createElement("span");
        codeText.className = "code";
        codeText.textContent = code;
        label.append(codeText);
      }
      item.append(label);
      return item;
    });
    list.replaceChildren(...items);
  }

  function applySearch() {
    const query = fold(search.value.trim());
    let shown = 0;
    for (const item of list.children) {
      const { code } = item.dataset;
      const match = !query || searchKeyOf[code].includes(query) || code.startsWith(query);
      item.hidden = !match;
      if (match) shown += 1;
    }
    noMatch.hidden = shown > 0;
    list.scrollTop = 0;
  }

  function updateView() {
    for (const input of modeInputs) input.checked = input.value === mode;
    picker.hidden = mode !== "only";
    if (!chosen.length) {
      count.textContent = "None chosen. All languages are used until one is chosen.";
    } else {
      const label = chosen.length === 1 ? "1 language chosen" : `${chosen.length} languages chosen`;
      count.textContent = `${label}: ${chosen.map((code) => nameOf[code] || code).join(", ")}`;
    }
  }

  async function save() {
    // With "Any language" the checks stay on screen (switching back restores them), but none are saved.
    const languagesToSave = mode === "only" ? [...chosen] : [];
    settings = { ...settings, languages: languagesToSave };
    try {
      await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
      errorLine.hidden = true;
    } catch (error) {
      console.warn("[wat] could not save the settings", error);
      errorLine.hidden = false;
    }
  }

  for (const input of modeInputs) {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      mode = input.value;
      updateView();
      save();
    });
  }

  list.addEventListener("change", (event) => {
    const box = event.target;
    if (box.type !== "checkbox") return;
    chosen = chosen.filter((code) => code !== box.value);
    if (box.checked) chosen.push(box.value);
    updateView();
    save();
  });

  search.addEventListener("input", applySearch);

  async function load() {
    try {
      const stored = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];
      if (stored && typeof stored === "object") settings = stored;
    } catch (error) {
      console.warn("[wat] could not read the settings", error);
    }
    const saved = Array.isArray(settings.languages) ? settings.languages : [];
    chosen = [...new Set(saved.filter((code) => WHISPER_LANGUAGES.includes(code)))];
    mode = chosen.length ? "only" : "any";
    renderList();
    applySearch();
    updateView();
    document.body.dataset.ready = "true";
  }

  load();
})();
