import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanText, hongKongDate, newsLimits } from "./news-core.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REMOTE_URL = "https://raw.githubusercontent.com/elizawang1287/fluffy-tribble/main/data/news/index.json";
const CACHE_TTL_MS = 15 * 60 * 1000;

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
    source: cleanText(item.source || "新聞來源").slice(0, 30),
    sourceUrl: safeHttpsUrl(item.sourceUrl),
    publishedAt: item.publishedAt ? cleanText(item.publishedAt).slice(0, 80) : null,
  };
}

function normalizeArchive(value) {
  const items = (Array.isArray(value?.items) ? value.items : [])
    .map(normalizeItem)
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, newsLimits.maxDays);
  return { version: 1, updatedAt: value?.updatedAt || null, items };
}

function fallbackArchive() {
  const date = hongKongDate();
  return {
    version: 1,
    updatedAt: null,
    items: [{
      id: date,
      date,
      title: "今日短新聞正在準備中",
      summary: "新聞資料暫時未能更新。你仍然可以使用文字轉換、粵拼和朗讀功能，稍後再回來看看今天的短新聞。",
      category: "提示",
      source: "粵讀校園",
      sourceUrl: "",
      publishedAt: null,
      isFallback: true,
    }],
  };
}

async function fetchRemote(fetchImpl, remoteUrl) {
  const url = new URL(remoteUrl);
  url.searchParams.set("day", hongKongDate());
  const response = await fetchImpl(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`News archive request failed with ${response.status}`);
  const archive = normalizeArchive(await response.json());
  if (!archive.items.length) throw new Error("Remote news archive is empty");
  return archive;
}

async function readLocal(localPath) {
  const archive = normalizeArchive(JSON.parse(await readFile(localPath, "utf8")));
  if (!archive.items.length) throw new Error("Local news archive is empty");
  return archive;
}

export function createNewsService({
  fetchImpl = globalThis.fetch,
  remoteUrl = process.env.NEWS_ARCHIVE_URL || DEFAULT_REMOTE_URL,
  localPath = join(root, "data", "news", "index.json"),
  cacheTtlMs = CACHE_TTL_MS,
} = {}) {
  let cached = null;
  let expiresAt = 0;

  return {
    async getArchive(now = Date.now()) {
      if (cached && now < expiresAt) return cached;
      let archive;
      let status = "remote";
      try {
        archive = await fetchRemote(fetchImpl, remoteUrl);
      } catch {
        status = "local";
        try {
          archive = await readLocal(localPath);
        } catch {
          status = "fallback";
          archive = fallbackArchive();
        }
      }
      cached = {
        ...archive,
        maxDays: newsLimits.maxDays,
        status,
      };
      expiresAt = now + (status === "remote" ? cacheTtlMs : Math.min(cacheTtlMs, 5 * 60 * 1000));
      return cached;
    },
  };
}

export { normalizeArchive };
