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

// Only group words whose boundaries are useful and dependable in a school
// context. Anything else is shown character by character instead of trusting
// a general-purpose Chinese segmenter that may choose the wrong meaning.
const highConfidenceTerms = [
  "學生證", "圖書館", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日",
  "班主任", "普通話", "體育課", "音樂課", "數學課", "中文課", "英文課",
  "老師", "同學", "學生", "學校", "課室", "教室", "操場", "禮堂", "校服",
  "功課", "作業", "上課", "下課", "放學", "小息", "考試", "測驗", "默書", "集合",
  "中文", "英文", "數學", "常識", "音樂", "體育", "今天", "明天", "昨天",
  "早上", "上午", "中午", "下午", "晚上", "八點半", "我們", "你們", "他們",
  "銀行", "行路", "快樂", "分數",
].sort((left, right) => Array.from(right).length - Array.from(left).length);

const toHongKongTraditional = OpenCC.Converter({ from: "cn", to: "hk" });
const jyutpingConverter = ToJyutping.customize(pronunciationOverrides);

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
  const characters = Array.from(text);
  const tokens = [];
  let characterIndex = 0;
  let sourceIndex = 0;

  while (characterIndex < characters.length) {
    const remainingText = characters.slice(characterIndex).join("");
    const matchedTerm = highConfidenceTerms.find((term) => remainingText.startsWith(term));
    let tokenCharacters;

    if (matchedTerm) {
      tokenCharacters = Array.from(matchedTerm);
    } else if (/^[\p{Letter}\p{Number}]$/u.test(characters[characterIndex]) && !/\p{Script=Han}/u.test(characters[characterIndex])) {
      let end = characterIndex + 1;
      while (end < characters.length && /^[\p{Letter}\p{Number}]$/u.test(characters[end]) && !/\p{Script=Han}/u.test(characters[end])) end += 1;
      tokenCharacters = characters.slice(characterIndex, end);
    } else {
      tokenCharacters = [characters[characterIndex]];
    }

    const tokenText = tokenCharacters.join("");
    const readings = fullReadings.slice(characterIndex, characterIndex + tokenCharacters.length);
    const jyutping = readings.flatMap(([, value]) => value ? value.split(/\s+/).filter(Boolean) : []);
    const hasChinese = /\p{Script=Han}/u.test(tokenText);
    const hasUnreadChinese = readings.some(([character, value]) => /\p{Script=Han}/u.test(character) && !value);
    let status = hasChinese && hasUnreadChinese ? "unknown" : "generated";
    if (Object.hasOwn(pronunciationOverrides, tokenText)) status = "overridden";
    tokens.push({ text: tokenText, start: sourceIndex, end: sourceIndex + tokenText.length, jyutping, status });
    characterIndex += tokenCharacters.length;
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
