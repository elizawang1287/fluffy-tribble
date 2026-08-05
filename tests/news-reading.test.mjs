import test from "node:test";
import assert from "node:assert/strict";
import { clampNewsSentenceIndex, createNewsSentenceEntries, moveNewsSentence } from "../news-reading-core.mjs";

test("turns converted news segments into title and sentence reading entries", () => {
  const entries = createNewsSentenceEntries({
    segments: [
      { id: "seg_1", text: "校园运动会开幕。", tokens: [{ text: "校园" }] },
      { id: "seg_2", text: "同学们参加了接力赛。", tokens: [{ text: "同学" }] },
      { id: "seg_3", text: "老师提醒大家注意安全。", tokens: [{ text: "老师" }] },
    ],
  });

  assert.deepEqual(entries.map(({ label, section, idleLabel }) => ({ label, section, idleLabel })), [
    { label: "标题", section: "title", idleLabel: "听标题" },
    { label: "第 1 句", section: "body", idleLabel: "听本句" },
    { label: "第 2 句", section: "body", idleLabel: "听本句" },
  ]);
  assert.equal(entries[1].tokens[0].text, "同学");
});

test("ignores empty or malformed converted news segments", () => {
  assert.deepEqual(createNewsSentenceEntries(null), []);
  assert.deepEqual(createNewsSentenceEntries({ segments: [{ text: "  " }, null] }), []);
  assert.deepEqual(createNewsSentenceEntries({ segments: [{ text: "有文字但没有词元。" }] })[0].tokens, []);
});

test("keeps news sentence navigation within the available pages", () => {
  assert.equal(clampNewsSentenceIndex(-2, 4), 0);
  assert.equal(clampNewsSentenceIndex(9, 4), 3);
  assert.equal(clampNewsSentenceIndex(2, 4), 2);
  assert.equal(moveNewsSentence(0, -1, 4), 0);
  assert.equal(moveNewsSentence(1, 1, 4), 2);
  assert.equal(moveNewsSentence(3, 1, 4), 3);
  assert.equal(moveNewsSentence(2, 1, 0), 0);
});
