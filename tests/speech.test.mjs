import test from "node:test";
import assert from "node:assert/strict";
import { createSpeechPlan, isCantoneseVoice, rankCantoneseVoices } from "../speech-core.mjs";

test("recognizes Hong Kong Cantonese voices", () => {
  assert.equal(isCantoneseVoice({ name: "Microsoft HiuMaan Online", lang: "zh-HK" }), true);
  assert.equal(isCantoneseVoice({ name: "Cantonese Voice", lang: "en-US" }), true);
  assert.equal(isCantoneseVoice({ name: "普通话", lang: "zh-CN" }), false);
});

test("prefers natural Cantonese voices while preserving stable order", () => {
  const voices = [
    { name: "Basic Cantonese", lang: "zh-HK", voiceURI: "basic" },
    { name: "Microsoft HiuMaan Online (Natural)", lang: "zh-HK", voiceURI: "natural" },
    { name: "Yue Voice", lang: "yue-HK", voiceURI: "yue" },
    { name: "English Natural", lang: "en-US", voiceURI: "english" },
  ];
  assert.deepEqual(rankCantoneseVoices(voices).map((voice) => voice.voiceURI), ["natural", "yue", "basic"]);
});

test("creates a speech plan with punctuation-aware pauses and intonation", () => {
  const plan = createSpeechPlan("班主任提醒大家，明天八点集合。你准备好了吗？太好了！");
  assert.deepEqual(plan.map((part) => part.text), ["班主任提醒大家，", "明天八点集合。", "你准备好了吗？", "太好了！"]);
  assert.ok(plan[0].pauseMs < plan[1].pauseMs);
  assert.ok(plan[2].pitch > 1);
  assert.ok(plan[3].pitch > 1);
});

test("keeps a short introductory clause with the following phrase", () => {
  const plan = createSpeechPlan("老师说，明天八点集合。");
  assert.deepEqual(plan.map((part) => part.text), ["老师说，明天八点集合。"]);
});

test("gives news titles a deliberate transition pause", () => {
  const [title] = createSpeechPlan("校园运动会开幕", { section: "title" });
  assert.equal(title.section, "title");
  assert.equal(title.pauseMs, 380);
  assert.equal(title.rateMultiplier, 0.98);
});

test("ignores blank speech input", () => {
  assert.deepEqual(createSpeechPlan(" \n "), []);
});
