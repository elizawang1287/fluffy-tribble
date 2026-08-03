import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../server.mjs";

async function withServer(run, options) {
  const server = createServer(options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("serves the learning page with security headers", () => withServer(async (origin) => {
  const response = await fetch(origin);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
  const html = await response.text();
  assert.match(html, /粤读校园/);
  assert.match(html, /香港口语/);
}));

test("serves the browser speech helper module", () => withServer(async (origin) => {
  const response = await fetch(`${origin}/speech-core.mjs`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/javascript/);
  assert.match(await response.text(), /createSpeechPlan/);
}));

test("serves learning modules without exposing arbitrary files", () => withServer(async (origin) => {
  for (const file of ["learning-core.mjs", "campus-phrases.mjs"]) {
    const response = await fetch(`${origin}/${file}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/javascript/);
  }
}));

test("exposes a health check for the hosting platform", () => withServer(async (origin) => {
  const response = await fetch(`${origin}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
}));

test("serves the daily news archive", () => withServer(async (origin) => {
  const response = await fetch(`${origin}/api/v1/news`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.items[0].title, "校園科學日");
  assert.equal(body.maxDays, 30);
}, {
  newsService: {
    getArchive: async () => ({
      version: 1,
      maxDays: 30,
      status: "remote",
      items: [{ date: "2026-07-24", title: "校園科學日", summary: "學生參加科學活動。" }],
    }),
  },
}));

test("conversion endpoint returns structured tokens", () => withServer(async (origin) => {
  const response = await fetch(`${origin}/api/v1/convert`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "老师明天上课。", expression: "written" }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.expression, "written");
  assert.ok(body.segments[0].tokens.length > 0);
}));

test("conversion endpoint supports Hong Kong colloquial mode", () => withServer(async (origin) => {
  const response = await fetch(`${origin}/api/v1/convert`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "我们明天上课。", expression: "colloquial" }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.expression, "colloquial");
  assert.equal(body.convertedText, "我哋聽日上堂。");
  assert.equal(body.segments[0].writtenText, "我們明天上課。");
  assert.ok(body.segments[0].changes.length > 0);
}));

test("does not expose arbitrary project files", () => withServer(async (origin) => {
  assert.equal((await fetch(`${origin}/package.json`)).status, 404);
  assert.equal((await fetch(`${origin}/work/npm-cache`)).status, 404);
}));

test("rate limits repeated conversion requests by client address", () => withServer(async (origin) => {
  let response;
  for (let index = 0; index < 31; index += 1) {
    response = await fetch(`${origin}/api/v1/convert`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
      body: JSON.stringify({ text: "老师。", expression: "written" }),
    });
  }
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
}));
