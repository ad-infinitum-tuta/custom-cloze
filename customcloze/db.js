// db.js — Database layer. All IndexedDB access goes through this file.
// Uses Dexie.js (loaded as a global from CDN in index.html).

const db = new Dexie("CustomClozeDB");
db.version(1).stores({
  words:   "++id, word, gramCat",
  history: "++id, wordId, sentenceHash"
});
db.version(2).stores({
  words:   "++id, word, gramCat, language",
  history: "++id, wordId, sentenceHash"
}).upgrade(tx => tx.table("words").toCollection().modify(word => {
  if (!word.language) word.language = "Unspecified";
}));

/**
 * Compute the stable hash used to identify a sentence in the history table.
 * @param {number} wordId
 * @param {string} sentenceText - full raw sentence text including (parens)
 * @returns {string}
 */
function computeHash(wordId, sentenceText) {
  return btoa(unescape(encodeURIComponent(wordId + "|" + sentenceText)));
}

/**
 * Return words, optionally filtered by category and language.
 * @param {string|null} gramCat
 * @param {string|null} language
 * @returns {Promise<Array>}
 */
export async function getWords(gramCat = null, language = null) {
  let words;
  if (gramCat) {
    words = await db.words.where("gramCat").equals(gramCat).toArray();
  } else if (language) {
    words = await db.words.where("language").equals(language).toArray();
  } else {
    words = await db.words.toArray();
  }
  return language && gramCat
    ? words.filter(word => word.language === language)
    : words;
}

/**
 * Return sorted list of distinct categories, optionally filtered by language.
 * @returns {Promise<string[]>}
 */
export async function getCategories(language = null) {
  const words = language
    ? await db.words.where("language").equals(language).toArray()
    : await db.words.toArray();
  return [...new Set(words.map(w => w.gramCat))].sort();
}

/**
 * Return sorted list of distinct languages currently in the DB.
 * @returns {Promise<string[]>}
 */
export async function getLanguages() {
  const words = await db.words.toArray();
  return [...new Set(words.map(w => w.language).filter(Boolean))].sort();
}

/**
 * Add a new word. sentences must be an array of strings.
 * @param {{word: string, gramCat: string, language: string, sentences: string[]}} param0
 * @returns {Promise<number>} new word id
 */
export async function saveWord({ word, gramCat, language, sentences }) {
  return db.words.add({ word, gramCat, language, sentences });
}

/**
 * Delete a word and all its associated history records.
 * @param {number} wordId
 */
export async function deleteWord(wordId) {
  await db.history.where("wordId").equals(wordId).delete();
  await db.words.delete(wordId);
}

/**
 * Return all history records for a single word.
 * @param {number} wordId
 * @returns {Promise<Array>}
 */
export async function getHistory(wordId) {
  return db.history.where("wordId").equals(wordId).toArray();
}

/**
 * Create or update the history record for one sentence.
 * status must be "never_reviewed", "incorrect", or "correct".
 * @param {{wordId: number, sentenceHash: string, status: string}} param0
 */
export async function upsertHistory({ wordId, sentenceHash, status }) {
  const existing = await db.history
    .where({ wordId, sentenceHash })
    .first();
  if (existing) {
    await db.history.update(existing.id, { status, lastReviewed: Date.now() });
  } else {
    await db.history.add({ wordId, sentenceHash, status, lastReviewed: Date.now() });
  }
}

export { computeHash };
