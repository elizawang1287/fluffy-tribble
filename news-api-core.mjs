import { cleanText, newsLimits } from "./news-core.mjs";

function safeHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)rthk\.hk$/i.test(url.hostname) ? url.href : "";
  } catch {
    return "";
  }
}

function normalizeItem(item) {
  if (!item || typeof item !== "object") return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : "";
  const title = cleanText(item.title).slice(0, 90);
  const summary = cleanText(item.summary).slice(0, newsLimits.maxSummaryLength);
  if (!date || !title || !summary) return null;
  return {
    id: date,
    date,
    title,
    summary,
    category: cleanText(item.category || "生活").slice(0, 12),
    source: cleanText(item.source || "新闻来源").slice(0, 30),
    sourceUrl: safeHttpsUrl(item.sourceUrl),
    publishedAt: item.publishedAt ? cleanText(item.publishedAt).slice(0, 80) : null,
  };
}

export function normalizeArchive(value) {
  const items = (Array.isArray(value?.items) ? value.items : [])
    .map(normalizeItem)
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, newsLimits.maxDays);
  return { version: 1, updatedAt: value?.updatedAt || null, items };
}
