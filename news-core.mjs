const DEFAULT_MAX_DAYS = 30;
const MIN_SUMMARY_LENGTH = 80;
const MAX_SUMMARY_LENGTH = 200;

const SAFE_TOPICS = [
  "學校", "學生", "教育", "中學", "小學", "青年", "學習", "閱讀", "科學", "科技",
  "創新", "機械人", "環保", "氣候", "天文", "太空", "文化", "藝術", "博物館",
  "歷史", "音樂", "體育", "運動", "比賽", "足球", "游泳", "健康", "天氣", "交通",
];

const BLOCKED_TOPICS = [
  "死亡", "傷亡", "謀殺", "兇殺", "性侵", "自殺", "屍體", "槍擊", "爆炸",
  "戰爭", "博彩", "賭博", "毒品", "虐待", "墮樓", "斬人", "襲擊", "血案",
];

const CATEGORY_RULES = [
  ["教育", ["學校", "學生", "教育", "中學", "小學", "學習", "閱讀", "考試"]],
  ["科學", ["科學", "科技", "創新", "機械人", "天文", "太空", "環保", "氣候"]],
  ["文化", ["文化", "藝術", "博物館", "歷史", "音樂"]],
  ["體育", ["體育", "運動", "比賽", "足球", "游泳"]],
  ["生活", ["健康", "天氣", "交通", "青年"]],
];

function decodeXml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([\da-f]+);/gi, (_, number) => String.fromCodePoint(Number.parseInt(number, 16)));
}

export function cleanText(value = "") {
  return decodeXml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/(?:詳情|詳細內容)(?:請)?(?:瀏覽|參閱)?[:：]?\s*https?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tagValue(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? cleanText(match[1]) : "";
}

function safeSourceUrl(value) {
  try {
    const url = new URL(cleanText(value));
    if (url.protocol !== "https:") return "";
    if (!/(^|\.)rthk\.hk$/i.test(url.hostname)) return "";
    return url.href;
  } catch {
    return "";
  }
}

export function parseRss(xml, source = "香港電台") {
  if (typeof xml !== "string") return [];
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((match) => {
    const block = match[1];
    const title = tagValue(block, "title");
    const description = tagValue(block, "description");
    const sourceUrl = safeSourceUrl(tagValue(block, "link"));
    const publishedAt = tagValue(block, "pubDate");
    return { title, description, source, sourceUrl, publishedAt };
  }).filter((item) => item.title && item.description && item.sourceUrl);
}

function scoreCandidate(item) {
  const text = `${item.title} ${item.description}`;
  if (BLOCKED_TOPICS.some((word) => text.includes(word))) return -1;
  return SAFE_TOPICS.reduce((score, word) => score + (text.includes(word) ? 1 : 0), 0);
}

function categoryFor(item) {
  const text = `${item.title} ${item.description}`;
  return CATEGORY_RULES.find(([, words]) => words.some((word) => text.includes(word)))?.[0] ?? "生活";
}

export function shortenSummary(value, maxLength = MAX_SUMMARY_LENGTH) {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  const beginning = text.slice(0, maxLength + 1);
  const sentenceEnd = Math.max(
    beginning.lastIndexOf("。"),
    beginning.lastIndexOf("！"),
    beginning.lastIndexOf("？"),
  );
  if (sentenceEnd >= MIN_SUMMARY_LENGTH) return beginning.slice(0, sentenceEnd + 1);
  return `${text.slice(0, maxLength - 1).replace(/[，、；：\s]+$/u, "")}…`;
}

export function selectDailyNews(items, date) {
  const ranked = items
    .map((item, index) => ({ item, index, score: scoreCandidate(item) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  if (!ranked.length) return null;
  const selected = ranked[0].item;
  return {
    id: date,
    date,
    title: cleanText(selected.title).slice(0, 90),
    summary: shortenSummary(selected.description),
    category: categoryFor(selected),
    source: selected.source,
    sourceUrl: selected.sourceUrl,
    publishedAt: selected.publishedAt || null,
  };
}

export function mergeArchive(existingItems, newItem, maxDays = DEFAULT_MAX_DAYS) {
  const byDate = new Map();
  for (const item of [newItem, ...(Array.isArray(existingItems) ? existingItems : [])]) {
    if (item?.date && !byDate.has(item.date)) byDate.set(item.date, item);
  }
  return [...byDate.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, maxDays);
}

export function hongKongDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export const newsLimits = {
  maxDays: DEFAULT_MAX_DAYS,
  minSummaryLength: MIN_SUMMARY_LENGTH,
  maxSummaryLength: MAX_SUMMARY_LENGTH,
};
