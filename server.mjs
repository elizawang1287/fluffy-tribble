import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { handleConvertRequest } from "./conversion-core.mjs";
import { createNewsService } from "./news-service.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "0.0.0.0";
const rateBuckets = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/speech-core.mjs", ["speech-core.mjs", "text/javascript; charset=utf-8"]],
  ["/learning-core.mjs", ["learning-core.mjs", "text/javascript; charset=utf-8"]],
  ["/campus-phrases.mjs", ["campus-phrases.mjs", "text/javascript; charset=utf-8"]],
]);

function sendJson(response, status, body, cacheControl = "no-store") {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": cacheControl, "x-content-type-options": "nosniff" });
  response.end(JSON.stringify(body));
}

function clientAddress(request) {
  const forwarded = request.headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value?.split(",")[0].trim() || request.socket.remoteAddress || "unknown";
}

function allowConversionRequest(request, now = Date.now()) {
  const address = clientAddress(request);
  const current = rateBuckets.get(address);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(address, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  current.count += 1;
  return current.count <= RATE_LIMIT_MAX_REQUESTS;
}

function pruneRateBuckets(now = Date.now()) {
  if (rateBuckets.size < 1_000) return;
  for (const [address, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(address);
  }
}

async function readJson(request, maxBytes = 32_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error("too large"), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createServer({ newsService = createNewsService() } = {}) {
  return createHttpServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/health" && request.method === "GET") {
      sendJson(response, 200, { status: "ok" });
      return;
    }
    if (url.pathname === "/api/v1/convert" && request.method === "POST") {
      pruneRateBuckets();
      if (!allowConversionRequest(request)) {
        response.setHeader("retry-after", "60");
        sendJson(response, 429, { error: { code: "RATE_LIMITED", message: "请求有点频繁，请一分钟后再试。" } });
        return;
      }
      try {
        const result = handleConvertRequest(await readJson(request));
        sendJson(response, result.status, result.body);
      } catch (error) {
        const status = error?.status === 413 ? 413 : 400;
        sendJson(response, status, { error: { code: status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON", message: status === 413 ? "请求内容过长。" : "请求内容不是有效的 JSON。" } });
      }
      return;
    }
    if (url.pathname === "/api/v1/news" && request.method === "GET") {
      try {
        sendJson(response, 200, await newsService.getArchive(), "public, max-age=300");
      } catch {
        sendJson(response, 503, { error: { code: "NEWS_UNAVAILABLE", message: "新聞暫時未能載入，請稍後再試。" } });
      }
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { allow: "GET, HEAD, POST" });
      response.end();
      return;
    }

    const asset = staticFiles.get(url.pathname);
    if (!asset) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" });
      response.end("Not found");
      return;
    }
    const [file, contentType] = asset;
    try {
      const path = join(root, file);
      const details = await stat(path);
      response.writeHead(200, { "content-type": contentType, "content-length": details.size, "cache-control": "no-cache", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'" });
      if (request.method === "HEAD") response.end();
      else createReadStream(path).pipe(response);
    } catch {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end("Server error");
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  createServer().listen(port, host, () => console.log(`粤读校园：http://127.0.0.1:${port}`));
}
