import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { onRequest as convertRequest } from "../functions/api/v1/convert.js";
import { onRequest as newsRequest } from "../functions/api/v1/news.js";
import { onRequest as ttsRequest } from "../functions/api/v1/tts.js";
import { onRequest as healthRequest } from "../functions/health.js";
import { createPreviewServer } from "../scripts/preview-pages.mjs";

function request(path, init = {}) {
  return new Request(`https://jyut-campus.pages.dev${path}`, init);
}

test("Pages build contains only public assets", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  const headers = await readFile(new URL("../dist/_headers", import.meta.url), "utf8");
  assert.match(html, /粤读校园/);
  assert.match(headers, /Content-Security-Policy/);
  await assert.rejects(readFile(new URL("../dist/package.json", import.meta.url)));
});

test("health function identifies the Cloudflare deployment", async () => {
  const response = healthRequest({ request: request("/health") });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", platform: "cloudflare-pages" });
});

test("conversion function returns structured written Cantonese tokens", async () => {
  const response = await convertRequest({
    request: request("/api/v1/convert", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.10" },
      body: JSON.stringify({ text: "老师说明天上课。", expression: "written" }),
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.expression, "written");
  assert.ok(body.segments[0].tokens.length > 0);
});

test("conversion function rejects unsupported methods and oversized input", async () => {
  const getResponse = await convertRequest({ request: request("/api/v1/convert") });
  assert.equal(getResponse.status, 405);
  assert.equal(getResponse.headers.get("allow"), "POST");

  const largeResponse = await convertRequest({
    request: request("/api/v1/convert", {
      method: "POST",
      headers: { "cf-connecting-ip": "203.0.113.11" },
      body: JSON.stringify({ text: "学".repeat(33_000), expression: "written" }),
    }),
  });
  assert.equal(largeResponse.status, 413);
});

test("conversion function applies a best-effort per-isolate rate limit", async () => {
  let response;
  for (let index = 0; index < 31; index += 1) {
    response = await convertRequest({
      request: request("/api/v1/convert", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.12" },
        body: JSON.stringify({ text: "老师。", expression: "written" }),
      }),
    });
  }
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
});

test("news function reads and normalizes the static archive", async () => {
  const response = await newsRequest({
    request: request("/api/v1/news"),
    env: {
      ASSETS: {
        fetch: async () => new Response(JSON.stringify({
          version: 1,
          items: [{
            date: "2026-08-04",
            title: "<b>校园科学日</b>",
            summary: "学生参加科学活动。",
            source: "香港电台",
            sourceUrl: "https://news.rthk.hk/story",
          }],
        }), { status: 200, headers: { "content-type": "application/json" } }),
      },
    },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "static");
  assert.equal(body.maxDays, 30);
  assert.equal(body.items[0].title, "校园科学日");
});

test("news function returns a controlled error when the asset is unavailable", async () => {
  const response = await newsRequest({
    request: request("/api/v1/news"),
    env: { ASSETS: { fetch: async () => new Response("missing", { status: 404 }) } },
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "NEWS_UNAVAILABLE");
});

test("TTS function stays safely disabled until credentials and quota storage exist", async () => {
  const disabled = await ttsRequest({
    request: request("/api/v1/tts", { method: "POST" }),
    env: {},
  });
  assert.equal(disabled.status, 503);
  assert.equal((await disabled.json()).error.code, "TTS_DISABLED");

  const missingQuota = await ttsRequest({
    request: request("/api/v1/tts", { method: "POST" }),
    env: {
      GOOGLE_TTS_ENABLED: "true",
      GOOGLE_TTS_SERVICE_ACCOUNT_JSON: JSON.stringify({
        project_id: "test",
        client_email: "tts@test.iam.gserviceaccount.com",
        private_key: "unused-in-this-test",
      }),
    },
  });
  assert.equal(missingQuota.status, 503);
  assert.equal((await missingQuota.json()).error.code, "TTS_QUOTA_NOT_CONFIGURED");
});

test("local preview serves the Pages build and Functions end to end", async () => {
  const server = createPreviewServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const page = await fetch(origin);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /粤读校园/);

    const health = await fetch(`${origin}/health`);
    assert.deepEqual(await health.json(), { status: "ok", platform: "cloudflare-pages" });

    const conversion = await fetch(`${origin}/api/v1/convert`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "我们明天上课。", expression: "colloquial" }),
    });
    assert.equal(conversion.status, 200);
    assert.equal((await conversion.json()).expression, "colloquial");

    const news = await fetch(`${origin}/api/v1/news`);
    assert.equal(news.status, 200);
    assert.ok((await news.json()).items.length > 0);

    const tts = await fetch(`${origin}/api/v1/tts`, { method: "POST" });
    assert.equal(tts.status, 503);
    assert.equal((await tts.json()).error.code, "TTS_DISABLED");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
