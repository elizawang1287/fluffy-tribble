import test from "node:test";
import assert from "node:assert/strict";
import { campusCategories, campusPhrases, phraseForDate } from "../campus-phrases.mjs";
import {
  addHistoryItem,
  addLearningWord,
  createLearningState,
  learningStreak,
  learningWordKey,
  markDailyTask,
  normalizeLearningState,
  removeHistoryItem,
  removeLearningWord,
  setWordMastered,
} from "../learning-core.mjs";

test("normalizes malformed local learning data", () => {
  assert.deepEqual(normalizeLearningState(null), createLearningState());
  const state = normalizeLearningState({ words: [{ text: "功課", jyutping: ["gung1", "fo3"] }, { text: "坏记录", jyutping: [null] }, null], history: "bad", daily: null });
  assert.equal(state.words.length, 1);
  assert.deepEqual(state.history, []);
  assert.deepEqual(state.daily, {});
  const recovered = normalizeLearningState({
    daily: { bad: { news: true }, "2026-08-03": { news: 1, completedAt: 42 } },
    history: [{ sourceText: "缺少字段" }],
  });
  assert.deepEqual(recovered.history, []);
  assert.deepEqual(recovered.daily["2026-08-03"], { news: true, phrase: false, words: false, completedAt: null });
});

test("adds, updates, masters and removes learning words", () => {
  const word = { text: "功課", jyutping: ["gung1", "fo3"], source: "今日有咩功課？", sourceType: "campus" };
  let state = addLearningWord(createLearningState(), word, "2026-08-03T00:00:00.000Z");
  state = addLearningWord(state, { ...word, source: "功課幾時交？" });
  assert.equal(state.words.length, 1);
  assert.equal(state.words[0].source, "功課幾時交？");
  const key = learningWordKey(word);
  state = setWordMastered(state, key, true);
  assert.equal(state.words[0].mastered, true);
  assert.equal(removeLearningWord(state, key).words.length, 0);
});

test("deduplicates and removes recent conversions", () => {
  const item = { id: "one", expression: "written", sourceText: "老师好", convertedText: "老師好" };
  let state = addHistoryItem(createLearningState(), item, "2026-08-03T00:00:00.000Z");
  state = addHistoryItem(state, { ...item, id: "two" });
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].id, "two");
  assert.equal(removeHistoryItem(state, "two").history.length, 0);
});

test("tracks daily completion and streaks", () => {
  let state = createLearningState();
  for (const date of ["2026-08-01", "2026-08-02"]) {
    state = markDailyTask(state, date, "news");
    state = markDailyTask(state, date, "phrase");
    state = markDailyTask(state, date, "words");
  }
  assert.equal(learningStreak(state, "2026-08-03"), 2);
  state = markDailyTask(state, "2026-08-03", "news");
  assert.equal(learningStreak(state, "2026-08-03"), 2);
  state = markDailyTask(markDailyTask(state, "2026-08-03", "phrase"), "2026-08-03", "words");
  assert.equal(learningStreak(state, "2026-08-03"), 3);
});

test("campus phrase library has complete, unique and categorized content", () => {
  assert.ok(campusPhrases.length >= 25);
  assert.equal(new Set(campusPhrases.map((item) => item.id)).size, campusPhrases.length);
  const categories = new Set(campusCategories.map((item) => item.id));
  campusPhrases.forEach((item) => {
    assert.ok(categories.has(item.category));
    assert.ok(item.simplified && item.written && item.spoken);
  });
  assert.ok(campusPhrases.includes(phraseForDate("2026-08-03")));
});
