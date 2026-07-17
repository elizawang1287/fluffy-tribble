import OpenCC from "./vendor/opencc.js";
import ToJyutping from "./vendor/to-jyutping.js";

export const MAX_INPUT_LENGTH = 2000;
export const MAX_SEGMENT_LENGTH = 80;

const pronunciationOverrides = {
  分數: "fan6 sou3",
  銀行: "ngan4 hong4",
  行路: "haang4 lou6",
  音樂: "jam1 ngok6",
  快樂: "faai3 lok6",
  老師: "lou5 si1",
  功課: "gung1 fo3",
  上課: "soeng5 fo3",
  放學: "fong3 hok6",
};

const toHongKongTraditional = OpenCC.Converter({ from: "cn", to: "hk" });
const jyutpingConverter = ToJyutping.customize(pronunciationOverrides);
const wordSegmenter = new Intl.Segmenter("zh-HK", { granularity: "word" });

export function normalizeInput(input) {
  return input.normalize("NFC").replace(/\r\n?/g, "\n").replace(/[\t\f\v]+/g, " ").replace(/ {2,}/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function splitLongSegment(text) {
  if (Array.from(text).length <= MAX_SEGMENT_LENGTH) return [text];
  const output = [];
  let buffer = "";
  let lastSoftBreak = -1;
  for (const character of text) {
    buffer += character;
    if (/[，,、：:]/u.test(character)) lastSoftBreak = buffer.length;
    if (Array.from(buffer).length >= MAX_SEGMENT_LENGTH) {
      const cut = lastSoftBreak > 0 ? lastSoftBreak : buffer.length;
      output.push(buffer.slice(0, cut).trim());
      buffer = buffer.slice(cut).trimStart();
      lastSoftBreak = -1;
    }
  }
  if (buffer.trim()) output.push(buffer.trim());
  return output;
}

export function splitIntoSegments(input) {
  const normalized = normalizeInput(input);
  if (!normalized) return [];
  const segments = [];
  for (const paragraph of normalized.split(/\n+/)) {
    let buffer = "";
    for (const character of paragraph) {
      buffer += character;
      if (/[。！？!?；;]/u.test(character)) {
        segments.push(...splitLongSegment(buffer.trim()));
        buffer = "";
      }
    }
    if (buffer.trim()) segments.push(...splitLongSegment(buffer.trim()));
  }
  return segments.filter(Boolean);
}

function createTokens(text) {
  const fullReadings = jyutpingConverter.getJyutpingList(text);
  const tokens = [];
  let readingIndex = 0;
  let sourceIndex = 0;
  for (const item of wordSegmenter.segment(text)) {
    const tokenText = item.segment;
    const characterCount = Array.from(tokenText).length;
    const readings = fullReadings.slice(readingIndex, readingIndex + characterCount);
    readingIndex += characterCount;
    const jyutping = readings.flatMap(([, value]) => value ? value.split(/\s+/).filter(Boolean) : []);
    const hasChinese = /\p{Script=Han}/u.test(tokenText);
    let status = hasChinese && jyutping.length === 0 ? "unknown" : "generated";
    if (Object.hasOwn(pronunciationOverrides, tokenText)) status = "overridden";
    tokens.push({ text: tokenText, start: sourceIndex, end: sourceIndex + tokenText.length, jyutping, status });
    sourceIndex += tokenText.length;
  }
  return tokens;
}

export function convertWrittenText(input) {
  const normalized = normalizeInput(input);
  const warnings = new Set();
  const segments = splitIntoSegments(normalized).map((source, index) => {
    const text = toHongKongTraditional(source);
    const tokens = createTokens(text);
    if (tokens.some((token) => token.status === "unknown")) warnings.add("少数字词暂时无法标注粤拼，请结合朗读确认。");
    return { id: `seg_${index + 1}`, source, text, tokens };
  });
  return {
    requestId: crypto.randomUUID(),
    expression: "written",
    sourceText: normalized,
    convertedText: segments.map((segment) => segment.text).join("\n"),
    segments,
    warnings: [...warnings],
  };
}

export function handleConvertRequest(payload) {
  const expression = payload?.expression ?? "written";
  if (expression !== "written" && expression !== "colloquial") return { status: 400, body: { error: { code: "INVALID_EXPRESSION", message: "不支持这种表达方式。" } } };
  if (expression === "colloquial") return { status: 501, body: { error: { code: "EXPRESSION_NOT_AVAILABLE", message: "香港口语功能正在准备中。" } } };
  if (typeof payload?.text !== "string") return { status: 400, body: { error: { code: "INVALID_TEXT", message: "请输入要转换的文字。" } } };
  const text = normalizeInput(payload.text);
  if (!text) return { status: 400, body: { error: { code: "EMPTY_TEXT", message: "先输入一段文字吧。" } } };
  if (Array.from(text).length > MAX_INPUT_LENGTH) return { status: 413, body: { error: { code: "TEXT_TOO_LONG", message: `一次最多可以转换 ${MAX_INPUT_LENGTH} 个字。` } } };
  return { status: 200, body: convertWrittenText(text) };
}
