// engine.js — Game logic. No DOM code. Imports from db.js only.
// Returns plain objects; callers are responsible for rendering.

import { getWords, getHistory, computeHash } from "./db.js";

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Parse a sentence string, extracting the (parenthesised) blank.
 * Returns an array of parts, or null if no (marker) found.
 * @param {string} sentenceText
 * @returns {Array|null}
 */
function maskSentence(sentenceText) {
  const match = sentenceText.match(/\(([^)]+)\)/);
  if (!match) return null;
  const before = sentenceText.slice(0, match.index);
  const answer = match[1];
  const after  = sentenceText.slice(match.index + match[0].length);
  const parts = [];
  if (before) parts.push({ type: "text", text: before });
  parts.push({ type: "blank", answer });
  if (after)  parts.push({ type: "text", text: after });
  return parts;
}

/**
 * Return the first (marker) form found across a word's sentences.
 * Falls back to word.word if none found.
 * @param {{word: string, sentences: string[]}} word
 * @returns {string}
 */
function getContextualForm(word) {
  const shuffled = [...word.sentences].sort(() => Math.random() - 0.5);
  for (const s of shuffled) {
    const m = s.match(/\(([^)]+)\)/);
    if (m) return m[1];
  }
  return word.word;
}

/**
 * Fisher-Yates in-place shuffle. Returns the same array.
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Exported function
// ---------------------------------------------------------------------------

/**
 * Select up to 5 sentences from the given category and language and build the word bank.
 *
 * @param {string} gramCat
 * @param {string|null} language
 * @returns {Promise<{sessionWords: SessionWord[], wordBank: BankChip[]}|null>}
 *
 * SessionWord: { wordId, sentenceHash, parts }
 * BankChip:    { id, text, isDistractor }
 */
export async function selectSentences(gramCat, language = null) {
  const allWords = await getWords(gramCat, language);

  // -------------------------------------------------------------------------
  // Step 1 — Bucket each word
  // -------------------------------------------------------------------------
  const bucket1 = []; // has ≥1 never_reviewed maskable sentence
  const bucket2 = []; // no never_reviewed, but ≥1 incorrect
  const bucket3 = []; // all correct — sort by oldest lastReviewed

  // Each bucket entry: { word, maskable, historyMap }
  // maskable: [{ sentenceText, parts, hash }]

  for (const word of allWords) {
    // Collect maskable sentences
    const maskable = [];
    for (const s of word.sentences) {
      const parts = maskSentence(s);
      if (!parts) continue;
      const hash = computeHash(word.id, s);
      maskable.push({ sentenceText: s, parts, hash });
    }
    if (maskable.length === 0) continue; // word has no usable sentences

    // Fetch history and build Map<hash → {status, lastReviewed}>
    const histRecords = await getHistory(word.id);
    const histMap = new Map(histRecords.map(r => [r.sentenceHash, r]));

    // Determine bucket
    let hasNeverReviewed = false;
    let hasIncorrect = false;
    let oldestCorrect = Infinity;

    for (const { hash } of maskable) {
      const rec = histMap.get(hash);
      const status = rec ? rec.status : "never_reviewed";
      if (status === "never_reviewed") {
        hasNeverReviewed = true;
      } else if (status === "incorrect") {
        hasIncorrect = true;
      } else if (status === "correct") {
        if (rec.lastReviewed < oldestCorrect) oldestCorrect = rec.lastReviewed;
      }
    }

    const entry = { word, maskable, histMap };
    if (hasNeverReviewed) {
      bucket1.push(entry);
    } else if (hasIncorrect) {
      bucket2.push(entry);
    } else {
      // All correct — attach oldest lastReviewed for sorting
      entry.oldestCorrect = oldestCorrect === Infinity ? 0 : oldestCorrect;
      bucket3.push(entry);
    }
  }

  // -------------------------------------------------------------------------
  // Step 2 — Pick up to 5 words
  // -------------------------------------------------------------------------
  shuffle(bucket1);
  shuffle(bucket2);
  // Bucket 3: sort by floor(oldestCorrect / 86_400_000) asc, then shuffle within equal day
  bucket3.sort((a, b) => {
    const da = Math.floor(a.oldestCorrect / 86_400_000);
    const db_ = Math.floor(b.oldestCorrect / 86_400_000);
    return da - db_;
  });

  const chosen = [];
  for (const entry of [...bucket1, ...bucket2, ...bucket3]) {
    if (chosen.length >= 5) break;
    chosen.push(entry);
  }

  if (chosen.length === 0) return null;

  // -------------------------------------------------------------------------
  // Step 3 — Pick one sentence per chosen word
  // -------------------------------------------------------------------------
  const SESSION_WORDS_MAX = 5;
  const sessionWords = [];

  for (const { word, maskable, histMap, ...rest } of chosen) {
    // Determine which statuses qualify for this word's bucket
    const rec0 = histMap.get(maskable[0]?.hash);
    // Figure out bucket by checking the first entry's status as proxy
    // Simpler: re-evaluate which sentences qualify
    let qualifying = [];
    let hasBucket1Sentence = false;
    let hasBucket2Sentence = false;
    for (const m of maskable) {
      const rec = histMap.get(m.hash);
      const status = rec ? rec.status : "never_reviewed";
      if (status === "never_reviewed") hasBucket1Sentence = true;
      if (status === "incorrect") hasBucket2Sentence = true;
    }

    if (hasBucket1Sentence) {
      qualifying = maskable.filter(m => {
        const rec = histMap.get(m.hash);
        return !rec || rec.status === "never_reviewed";
      });
    } else if (hasBucket2Sentence) {
      qualifying = maskable.filter(m => {
        const rec = histMap.get(m.hash);
        return rec && rec.status === "incorrect";
      });
    } else {
      qualifying = [...maskable];
    }

    shuffle(qualifying);
    let chosen_sentence = null;
    for (const candidate of qualifying) {
      const parts = maskSentence(candidate.sentenceText);
      if (parts) { chosen_sentence = { sentenceText: candidate.sentenceText, parts, hash: candidate.hash }; break; }
    }
    if (!chosen_sentence) continue;

    sessionWords.push({
      wordId: word.id,
      sentenceHash: chosen_sentence.hash,
      parts: chosen_sentence.parts,
    });
  }

  if (sessionWords.length === 0) return null;

  // -------------------------------------------------------------------------
  // Step 4 — Build the word bank
  // -------------------------------------------------------------------------
  const chosenWordIds = new Set(sessionWords.map(sw => sw.wordId));
  const chips = [];

  // One chip per session word (the correct answer)
  for (let i = 0; i < sessionWords.length; i++) {
    const blankPart = sessionWords[i].parts.find(p => p.type === "blank");
    chips.push({ id: `chip-${i}`, text: blankPart.answer, isDistractor: false });
  }

  // Up to 2 distractor chips from non-session words
  const nonSelected = allWords.filter(w => !chosenWordIds.has(w.id));
  shuffle(nonSelected);
  let distractorCount = 0;
  let chipIndex = sessionWords.length;
  for (const w of nonSelected) {
    if (distractorCount >= 2) break;
    const form = getContextualForm(w);
    if (form) {
      chips.push({ id: `chip-${chipIndex}`, text: form, isDistractor: true });
      chipIndex++;
      distractorCount++;
    }
  }

  // Shuffle all chips
  shuffle(chips);

  // -------------------------------------------------------------------------
  // Step 5 — Shuffle session words and return
  // -------------------------------------------------------------------------
  shuffle(sessionWords);
  return { sessionWords, wordBank: chips };
}
