import assert from "node:assert/strict";
import test from "node:test";
import { convertWrittenText, handleConvertRequest, normalizeInput, splitIntoSegments } from "../conversion-core.mjs";

test("normalizes whitespace and splits sentences", () => {
  assert.equal(normalizeInput("  第一行。\r\n  第二行！  "), "第一行。\n第二行！");
  assert.deepEqual(splitIntoSegments("第一句。第二句！第三句？"), ["第一句。", "第二句！", "第三句？"]);
});

test("splits long text without losing characters", () => {
  const input = `${"学习粤语很有用，".repeat(14)}完成。`;
  const segments = splitIntoSegments(input);
  assert.ok(segments.every((segment) => Array.from(segment).length <= 80));
  assert.equal(segments.join(""), input);
});

test("converts simplified Chinese and generates Jyutping", () => {
  const result = convertWrittenText("老师说我们明天上课。银行在学校旁边。");
  assert.equal(result.segments.length, 2);
  assert.match(result.convertedText, /^老師説我們明天上課。/);
  assert.ok(result.segments[0].tokens.flatMap((token) => token.jyutping).includes("lou5"));
  assert.ok(result.segments[1].tokens.flatMap((token) => token.jyutping).includes("hong4"));
});

test("uses conservative school-term grouping for ambiguous sentences", () => {
  const result = convertWrittenText("老师说明天上课。");
  const tokens = result.segments[0].tokens;
  assert.deepEqual(tokens.map((token) => token.text), ["老師", "説", "明天", "上課", "。。"]);
  assert.deepEqual(tokens.flatMap((token) => token.jyutping), ["lou5", "si1", "syut3", "ming4", "tin1", "soeng5", "fo3"]);
});

test("keeps token offsets intact with non-BMP characters", () => {
  const result = convertWrittenText("😊老师明天。");
  const tokens = result.segments[0].tokens;
  assert.deepEqual(tokens.map(({ text, start, end }) => ({ text, start, end })), [
    { text: "😊", start: 0, end: 2 },
    { text: "老師", start: 2, end: 4 },
    { text: "明天", start: 4, end: 6 },
    { text: "。", start: 6, end: 7 },
  ]);
});

test("validates modes, blank content and length", () => {
  assert.equal(handleConvertRequest({ text: "你好", expression: "colloquial" }).status, 501);
  assert.equal(handleConvertRequest({ text: "   ", expression: "written" }).status, 400);
  assert.equal(handleConvertRequest({ text: "学".repeat(2001), expression: "written" }).status, 413);
});
