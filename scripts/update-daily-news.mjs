import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hongKongDate, mergeArchive, parseRss, selectDailyNews } from "../news-core.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const newsDirectory = join(root, "data", "news");
const indexPath = join(newsDirectory, "index.json");
const feeds = [
  { url: "https://rthk.hk/rthk/news/rss/c_expressnews_clocal.xml", source: "香港電台" },
  { url: "https://rthk.hk/rthk/news/rss/c_expressnews_csport.xml", source: "香港電台體育" },
];

async function readArchive() {
  try {
    return JSON.parse(await readFile(indexPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return { version: 1, updatedAt: null, items: [] };
    throw error;
  }
}

async function fetchFeed(feed) {
  const response = await fetch(feed.url, {
    headers: { "user-agent": "JyutCampusStudentNews/1.0 (+https://github.com/elizawang1287/fluffy-tribble)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`RSS request failed: ${response.status} ${feed.url}`);
  return parseRss(await response.text(), feed.source);
}

const date = hongKongDate();
const oldArchive = await readArchive();
const settled = await Promise.allSettled(feeds.map(fetchFeed));
const recentSources = new Set((oldArchive.items ?? []).slice(0, 7).map((entry) => entry.sourceUrl).filter(Boolean));
const recentTitles = new Set((oldArchive.items ?? []).slice(0, 7).map((entry) => entry.title).filter(Boolean));
const candidates = settled
  .flatMap((result) => result.status === "fulfilled" ? result.value : [])
  .filter((entry) => !recentSources.has(entry.sourceUrl) && !recentTitles.has(entry.title));
const item = selectDailyNews(candidates, date);

if (!item) {
  const reasons = settled.filter((result) => result.status === "rejected").map((result) => result.reason?.message);
  throw new Error(`No age-appropriate news found. ${reasons.join(" ")}`);
}

const items = mergeArchive(oldArchive.items, item);
const archive = { version: 1, updatedAt: new Date().toISOString(), items };
await mkdir(newsDirectory, { recursive: true });
await writeFile(join(newsDirectory, `${date}.json`), `${JSON.stringify(item, null, 2)}\n`, "utf8");
await writeFile(indexPath, `${JSON.stringify(archive, null, 2)}\n`, "utf8");

const retainedDates = new Set(items.map((entry) => entry.date));
for (const oldItem of oldArchive.items ?? []) {
  if (oldItem?.date && !retainedDates.has(oldItem.date)) {
    await unlink(join(newsDirectory, `${oldItem.date}.json`)).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
}

console.log(`Saved ${date}: ${item.title} (${items.length}/30 days)`);
