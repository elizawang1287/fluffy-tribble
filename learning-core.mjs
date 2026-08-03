export const LEARNING_STATE_VERSION = 1;
export const MAX_HISTORY_ITEMS = 20;
export const DAILY_TASKS = ["news", "phrase", "words"];

export function createLearningState() {
  return { version: LEARNING_STATE_VERSION, words: [], history: [], daily: {} };
}

function normalizeDaily(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([date, progress]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !progress || typeof progress !== "object" || Array.isArray(progress)) return [];
    const normalized = Object.fromEntries(DAILY_TASKS.map((task) => [task, Boolean(progress[task])]));
    normalized.completedAt = typeof progress.completedAt === "string" ? progress.completedAt : null;
    return [[date, normalized]];
  }));
}

export function normalizeLearningState(value) {
  if (!value || typeof value !== "object") return createLearningState();
  return {
    version: LEARNING_STATE_VERSION,
    words: Array.isArray(value.words) ? value.words.filter((item) => item
      && typeof item.text === "string"
      && Array.isArray(item.jyutping)
      && item.jyutping.every((syllable) => typeof syllable === "string")) : [],
    history: Array.isArray(value.history) ? value.history.filter((item) => item
      && typeof item.id === "string"
      && ["written", "colloquial"].includes(item.expression)
      && typeof item.sourceText === "string"
      && typeof item.convertedText === "string"
      && typeof item.createdAt === "string").slice(0, MAX_HISTORY_ITEMS) : [],
    daily: normalizeDaily(value.daily),
  };
}

export function learningWordKey(word) {
  return `${word.text}\u0000${word.jyutping.join(" ")}`;
}

export function addLearningWord(state, word, savedAt = new Date().toISOString()) {
  const normalized = normalizeLearningState(state);
  const key = learningWordKey(word);
  const existing = normalized.words.find((item) => learningWordKey(item) === key);
  if (existing) {
    return {
      ...normalized,
      words: normalized.words.map((item) => learningWordKey(item) === key
        ? { ...item, source: word.source || item.source, sourceType: word.sourceType || item.sourceType }
        : item),
    };
  }
  return {
    ...normalized,
    words: [{ ...word, savedAt, mastered: false }, ...normalized.words].slice(0, 300),
  };
}

export function removeLearningWord(state, key) {
  const normalized = normalizeLearningState(state);
  return { ...normalized, words: normalized.words.filter((word) => learningWordKey(word) !== key) };
}

export function setWordMastered(state, key, mastered) {
  const normalized = normalizeLearningState(state);
  return {
    ...normalized,
    words: normalized.words.map((word) => learningWordKey(word) === key ? { ...word, mastered: Boolean(mastered) } : word),
  };
}

export function addHistoryItem(state, item, createdAt = new Date().toISOString()) {
  const normalized = normalizeLearningState(state);
  const key = `${item.expression}\u0000${item.sourceText}`;
  const history = normalized.history.filter((entry) => `${entry.expression}\u0000${entry.sourceText}` !== key);
  return { ...normalized, history: [{ ...item, createdAt }, ...history].slice(0, MAX_HISTORY_ITEMS) };
}

export function removeHistoryItem(state, id) {
  const normalized = normalizeLearningState(state);
  return { ...normalized, history: normalized.history.filter((item) => item.id !== id) };
}

export function markDailyTask(state, date, task, completedAt = new Date().toISOString()) {
  if (!DAILY_TASKS.includes(task)) return normalizeLearningState(state);
  const normalized = normalizeLearningState(state);
  const current = normalized.daily[date] ?? {};
  const next = { ...current, [task]: true };
  next.completedAt = DAILY_TASKS.every((name) => next[name]) ? (current.completedAt ?? completedAt) : null;
  return { ...normalized, daily: { ...normalized.daily, [date]: next } };
}

function shiftDate(date, offset) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

export function learningStreak(state, today) {
  const normalized = normalizeLearningState(state);
  let cursor = normalized.daily[today]?.completedAt ? today : shiftDate(today, -1);
  let count = 0;
  while (normalized.daily[cursor]?.completedAt) {
    count += 1;
    cursor = shiftDate(cursor, -1);
  }
  return count;
}
