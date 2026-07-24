import assert from "node:assert/strict";
import test from "node:test";
import { mergeArchive, parseRss, selectDailyNews, shortenSummary } from "../news-core.mjs";
import { createNewsService, normalizeArchive } from "../news-service.mjs";

const rss = `<?xml version="1.0" encoding="utf-8"?>
<rss><channel>
  <item>
    <title><![CDATA[中學生科學比賽展示環保發明]]></title>
    <description><![CDATA[來自多間中學的學生參加科學比賽，展示節約能源和保護環境的新發明。活動亦設工作坊，讓同學認識創新科技如何改善日常生活。]]></description>
    <link>https://news.rthk.hk/rthk/ch/component/k2/1234567-20260724.htm</link>
    <pubDate>Fri, 24 Jul 2026 08:00:00 +0800</pubDate>
  </item>
  <item>
    <title>涉及暴力襲擊的新聞</title>
    <description>警方調查一宗襲擊案件。</description>
    <link>https://news.rthk.hk/rthk/ch/component/k2/7654321.htm</link>
  </item>
</channel></rss>`;

test("parses RTHK RSS and selects an age-appropriate story", () => {
  const items = parseRss(rss);
  assert.equal(items.length, 2);
  const selected = selectDailyNews(items, "2026-07-24");
  assert.equal(selected.title, "中學生科學比賽展示環保發明");
  assert.equal(selected.category, "教育");
  assert.equal(selected.date, "2026-07-24");
  assert.match(selected.sourceUrl, /^https:\/\/news\.rthk\.hk\//);
});

test("rejects unsafe URLs and blocked-only news", () => {
  const unsafe = rss.replaceAll("https://news.rthk.hk", "http://example.com");
  assert.equal(parseRss(unsafe).length, 0);
  assert.equal(selectDailyNews(parseRss(rss).slice(1), "2026-07-24"), null);
});

test("shortens summaries at a sentence boundary", () => {
  const text = `${"這是一段適合學生閱讀的新聞內容，".repeat(8)}第一段完結。${"後續內容".repeat(30)}`;
  const shortened = shortenSummary(text);
  assert.ok(shortened.length <= 200);
  assert.ok(shortened.endsWith("。") || shortened.endsWith("…"));
});

test("archive is deduplicated, sorted and limited to 30 days", () => {
  const existing = Array.from({ length: 35 }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return { date: `2026-06-${day}`, title: day };
  });
  const items = mergeArchive(existing, { date: "2026-07-24", title: "today" });
  assert.equal(items.length, 30);
  assert.equal(items[0].date, "2026-07-24");
  assert.equal(new Set(items.map((item) => item.date)).size, 30);
});

test("news service caches a normalized remote archive", async () => {
  let requests = 0;
  const service = createNewsService({
    fetchImpl: async () => {
      requests += 1;
      return new Response(JSON.stringify({
        items: [{ date: "2026-07-24", title: "<b>校園新聞</b>", summary: "學生參觀科學館。", source: "香港電台", sourceUrl: "https://news.rthk.hk/story" }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const first = await service.getArchive(1_000);
  const second = await service.getArchive(2_000);
  assert.equal(first.status, "remote");
  assert.equal(first.items[0].title, "校園新聞");
  assert.equal(second.items[0].title, "校園新聞");
  assert.equal(requests, 1);
});

test("normalization strips unsafe archive links", () => {
  const archive = normalizeArchive({
    items: [{ date: "2026-07-24", title: "標題", summary: "摘要", sourceUrl: "javascript:alert(1)" }],
  });
  assert.equal(archive.items[0].sourceUrl, "");
});
