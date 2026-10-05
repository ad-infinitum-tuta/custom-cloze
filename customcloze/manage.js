// manage.js — Manages the word management screen.
// Exports: initManage()

import * as db from "./db.js";

const SAMPLE_FILES = [
  { filename: "Arabic.csv",              label: "Arabic" },
  { filename: "Chinese_Simplified.csv",  label: "Chinese Simplified" },
  { filename: "Chinese_Traditional.csv", label: "Chinese Traditional" },
  { filename: "English.csv",             label: "English" },
  { filename: "French.csv",              label: "French" },
  { filename: "Hindi.csv",               label: "Hindi" },
  { filename: "Korean.csv",              label: "Korean" },
  { filename: "Spanish.csv",             label: "Spanish" },
  { filename: "Thai.csv",                label: "Thai" },
];

// ---------------------------------------------------------------------------
// Public init — called once by app.js
// ---------------------------------------------------------------------------

export async function initManage() {
  // Tab buttons
  document.getElementById("tab-manual").addEventListener("click",  () => showTab("panel-manual"));
  document.getElementById("tab-csv").addEventListener("click",     () => showTab("panel-csv"));
  document.getElementById("tab-samples").addEventListener("click", () => showTab("panel-samples"));

  // Add / remove sentence rows
  document.getElementById("add-sentence-btn").addEventListener("click", addSentenceRow);
  document.getElementById("sentences-container").addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-sentence-btn")) {
      e.target.closest(".sentence-row").remove();
      updateRemoveButtons();
    }
  });

  // Save word
  document.getElementById("save-word-btn").addEventListener("click", handleSave);

  // Custom category toggle
  document.getElementById("custom-cat-toggle").addEventListener("change", (e) => {
    document.getElementById("custom-cat-input").style.display = e.target.checked ? "" : "none";
  });

  // CSV drag-and-drop
  const dropZone = document.getElementById("drop-zone");
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) handleCsvFile(file);
  });

  // CSV file picker
  document.getElementById("csv-file-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleCsvFile(file);
    e.target.value = ""; // reset so same file can be re-selected
  });

  // Default tab
  showTab("panel-manual");

  // Populate category dropdown
  await refreshGramcatSelect();

  // Render word list
  await renderSavedWords();
}

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------

function showTab(panelId) {
  document.querySelectorAll(".manage-panel").forEach(p => p.classList.remove("active"));
  document.getElementById(panelId).classList.add("active");

  // Update tab button styles
  ["tab-manual", "tab-csv", "tab-samples"].forEach(id => {
    document.getElementById(id).classList.remove("active-tab");
  });
  const tabMap = {
    "panel-manual":  "tab-manual",
    "panel-csv":     "tab-csv",
    "panel-samples": "tab-samples",
  };
  const tabId = tabMap[panelId];
  if (tabId) document.getElementById(tabId).classList.add("active-tab");

  if (panelId === "panel-samples") renderSampleButtons();
}

// ---------------------------------------------------------------------------
// Manual entry: sentence row management
// ---------------------------------------------------------------------------

function addSentenceRow() {
  const container = document.getElementById("sentences-container");
  const row = document.createElement("div");
  row.className = "sentence-row";
  row.innerHTML = `
    <input type="text" class="sentence-input" placeholder="She finally (achieved) her goal." />
    <button class="remove-sentence-btn">×</button>
  `;
  container.appendChild(row);
  updateRemoveButtons();
  // Focus the new input
  row.querySelector(".sentence-input").focus();
}

function updateRemoveButtons() {
  const rows = document.querySelectorAll(".sentence-row");
  rows.forEach(row => {
    row.querySelector(".remove-sentence-btn").disabled = rows.length === 1;
  });
}

// ---------------------------------------------------------------------------
// Save word
// ---------------------------------------------------------------------------

async function handleSave() {
  const statusEl = document.getElementById("save-status");
  statusEl.className = "";
  statusEl.textContent = "";

  const word = document.getElementById("word-input").value.trim();
  if (!word) {
    statusEl.className = "error";
    statusEl.textContent = "Please enter a word.";
    return;
  }

  const language = document.getElementById("language-input").value.trim();
  if (!language) {
    statusEl.className = "error";
    statusEl.textContent = "Please enter a language.";
    return;
  }

  let gramCat;
  const useCustom = document.getElementById("custom-cat-toggle").checked;
  if (useCustom) {
    gramCat = document.getElementById("custom-cat-input").value.trim();
    if (!gramCat) {
      statusEl.className = "error";
      statusEl.textContent = "Please enter a custom category name.";
      return;
    }
  } else {
    gramCat = document.getElementById("gramcat-select").value;
  }

  const sentences = Array.from(document.querySelectorAll(".sentence-input"))
    .map(el => el.value.trim())
    .filter(s => s.length > 0);

  if (sentences.length === 0) {
    statusEl.className = "error";
    statusEl.textContent = "Please enter at least one sentence.";
    return;
  }

  await db.saveWord({ word, gramCat, language, sentences });

  statusEl.textContent = `"${word}" saved successfully.`;

  // Reset form
  document.getElementById("word-input").value = "";
  const container = document.getElementById("sentences-container");
  container.innerHTML = `
    <div class="sentence-row">
      <input type="text" class="sentence-input" placeholder="She finally (achieved) her goal." />
      <button class="remove-sentence-btn" disabled>×</button>
    </div>
  `;

  await refreshGramcatSelect();
  await renderSavedWords();
  notifyDbUpdated();
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

function handleCsvFile(file) {
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: async (result) => {
      let imported = 0;
      let errors   = 0;

      for (const row of result.data) {
        const word     = (row.word     || "").trim();
        const category = (row.category || "").trim();
        const language = (row.language || "").trim();
        const rawSentences = (row.sentences || "").trim();

        if (!word || !category || !language) { errors++; continue; }

        const sentences = rawSentences.split("|").map(s => s.trim()).filter(s => s.length > 0);
        if (sentences.length === 0) { errors++; continue; }

        await db.saveWord({ word, gramCat: category, language, sentences });
        imported++;
      }

      document.getElementById("csv-status").textContent =
        `Imported ${imported} word${imported !== 1 ? "s" : ""}. ${errors} row${errors !== 1 ? "s" : ""} had errors.`;

      await refreshGramcatSelect();
      await renderSavedWords();
      notifyDbUpdated();
    },
  });
}

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------

async function renderSampleButtons() {
  const container = document.getElementById("sample-buttons");
  container.innerHTML = "";

  const allDbWords = await db.getWords();

  for (const { filename, label } of SAMPLE_FILES) {
    let csvWords = [];
    try {
      const response = await fetch(`samples/${filename}`);
      const text = await response.text();
      const parsed = Papa.parse(text, { header: false, skipEmptyLines: true });
      csvWords = parsed.data
        .filter(r => r[0] && r[1])
        .map(r => ({
          word: r[0].trim(),
          gramCat: r[1].trim(),
          rawSentences: r[2] || "",
          language: (r[3] || "").trim(),
        }));
    } catch {
      const btn = document.createElement("button");
      btn.textContent = `⚠️ Failed to load ${label}`;
      btn.disabled = true;
      container.appendChild(btn);
      continue;
    }

    // Count how many DB words match any CSV entry, including language.
    // Including the first sentence prevents false matches for words that are
    // spelled identically across languages (e.g. "bien", "venir" in Spanish/French).
    const csvPairs = new Set(csvWords.map(w => {
      const firstSentence = w.rawSentences.split("|")[0].trim();
      return `${w.word}|${w.gramCat}|${w.language}|${firstSentence}`;
    }));
    const legacyCsvPairs = new Set(csvWords.map(w => {
      const firstSentence = w.rawSentences.split("|")[0].trim();
      return `${w.word}|${w.gramCat}|${firstSentence}`;
    }));
    const matchingDbWords = allDbWords.filter(w => {
      const firstSentence = (w.sentences[0] || "").trim();
      return csvPairs.has(`${w.word}|${w.gramCat}|${w.language}|${firstSentence}`) ||
        (w.language === "Unspecified" &&
          legacyCsvPairs.has(`${w.word}|${w.gramCat}|${firstSentence}`));
    });
    const count = matchingDbWords.length;

    const btn = document.createElement("button");

    if (count > 0) {
      // Already (at least partially) imported — show delete button
      btn.textContent = `🗑️ ${count} ${label}`;
      btn.dataset.action = "delete";
      btn.addEventListener("click", async () => {
        for (const w of matchingDbWords) {
          await db.deleteWord(w.id);
        }
        await refreshGramcatSelect();
        await renderSavedWords();
        notifyDbUpdated();
        await renderSampleButtons();
      });
    } else {
      // Not yet imported — show import button
      btn.textContent = `🌐 ${label}`;
      btn.dataset.action = "import";
      btn.addEventListener("click", async () => {
        for (const { word, gramCat, rawSentences, language } of csvWords) {
          const sentences = rawSentences.split("|").map(s => s.trim()).filter(s => s.length > 0);
          if (sentences.length > 0 && language) {
            await db.saveWord({ word, gramCat, language, sentences });
          }
        }
        await refreshGramcatSelect();
        await renderSavedWords();
        notifyDbUpdated();
        await renderSampleButtons();
      });
    }

    container.appendChild(btn);
  }
}

// ---------------------------------------------------------------------------
// Saved words list
// ---------------------------------------------------------------------------

async function renderSavedWords() {
  const listEl = document.getElementById("saved-words-list");
  listEl.innerHTML = "";

  const words = await db.getWords();

  if (words.length === 0) {
    const p = document.createElement("p");
    p.textContent = "No words saved yet.";
    listEl.appendChild(p);
    return;
  }

  for (const word of words) {
    const row = document.createElement("div");
    row.className = "word-row";

    const wordSpan = document.createElement("span");
    wordSpan.className = "word-text";
    wordSpan.textContent = word.word;

    const catSpan = document.createElement("span");
    catSpan.className = "gramcat-badge";
    catSpan.textContent = word.gramCat;

    const languageSpan = document.createElement("span");
    languageSpan.className = "language-badge";
    languageSpan.textContent = word.language || "Unspecified";

    const countSpan = document.createElement("span");
    countSpan.className = "sentence-count";
    countSpan.textContent = `${word.sentences.length} sentence(s)`;

    const delBtn = document.createElement("button");
    delBtn.className = "delete-word-btn";
    delBtn.dataset.wordId = word.id;
    delBtn.textContent = "🗑️";
    delBtn.setAttribute("aria-label", `Delete ${word.word}`);
    delBtn.addEventListener("click", async () => {
      await db.deleteWord(word.id);
      await refreshGramcatSelect();
      await renderSavedWords();
      notifyDbUpdated();
    });

    row.append(wordSpan, languageSpan, catSpan, countSpan, delBtn);
    listEl.appendChild(row);
  }
}

// ---------------------------------------------------------------------------
// Category dropdown helpers
// ---------------------------------------------------------------------------

async function refreshGramcatSelect() {
  const categories = await db.getCategories();
  const select = document.getElementById("gramcat-select");
  const current = select.value;

  // Build fresh options — keep built-in defaults even if DB is empty
  const defaultCats = [
    "Adjective", "Adposition", "Adverb", "Auxiliary Verb", "Classifier",
    "Conjunction", "Determiner", "Interjection", "Noun", "Particle", "Pronoun", "Verb",
  ];
  const allCats = [...new Set([...defaultCats, ...categories])].sort();

  select.innerHTML = "";
  for (const cat of allCats) {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  }

  // Restore previous selection if still valid
  if (allCats.includes(current)) select.value = current;
}

// ---------------------------------------------------------------------------
// db-updated event
// ---------------------------------------------------------------------------

function notifyDbUpdated() {
  window.dispatchEvent(new CustomEvent("db-updated"));
}
