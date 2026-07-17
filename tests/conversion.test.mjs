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

test("validates modes, blank content and length", () => {
  assert.equal(handleConvertRequest({ text: "你好", expression: "colloquial" }).status, 501);
  assert.equal(handleConvertRequest({ text: "   ", expression: "written" }).status, 400);
  assert.equal(handleConvertRequest({ text: "学".repeat(2001), expression: "written" }).status, 413);
});
