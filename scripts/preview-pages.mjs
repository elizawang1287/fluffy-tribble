import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { onRequest as convertRequest } from "../functions/api/v1/convert.js";
import { onRequest as newsRequest } from "../functions/api/v1/news.js";
import { onRequest as ttsRequest } from "../functions/api/v1/tts.js";
import { onRequest as healthRequest } from "../functions/health.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultOutput = join(root, "dist");
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
]);

function safeAssetPath(output, pathname) {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const target = normalize(join(output, relative));
  return target.startsWith(normalize(output) + sep) ? target : null;
}

async function assetResponse(output, input) {
  const url = new URL(typeof input === "string" ? input : input.url);
  const path = safeAssetPath(output, url.pathname);
  if (!path) return new Response("Not found", { status: 404 });
  try {
    return new Response(await readFile(path), {
      status: 200,
      headers: { "content-type": contentTypes.get(extname(path)) || "application/octet-stream" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

async function webRequest(request, origin) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  return new Request(new URL(request.url || "/", origin), {
    method: request.method,
    headers: request.headers,
    body,
    duplex: body ? "half" : undefined,
  });
}

async function send(response, webResponse) {
  response.writeHead(webResponse.status, Object.fromEntries(webResponse.headers));
  response.end(Buffer.from(await webResponse.arrayBuffer()));
}

export function createPreviewServer({ output = defaultOutput } = {}) {
  return createServer(async (request, response) => {
    const origin = `http://${request.headers.host || "127.0.0.1"}`;
    const incoming = await webRequest(request, origin);
    const pathname = new URL(incoming.url).pathname;
    const context = {
      request: incoming,
      env: { ASSETS: { fetch: (input) => assetResponse(output, input) } },
    };

    try {
      if (pathname === "/api/v1/convert") return await send(response, await convertRequest(context));
      if (pathname === "/api/v1/news") return await send(response, await newsRequest(context));
      if (pathname === "/api/v1/tts") return await send(response, await ttsRequest(context));
      if (pathname === "/health") return await send(response, await healthRequest(context));
      if (!new Set(["GET", "HEAD"]).has(request.method || "GET")) {
        response.writeHead(405, { allow: "GET, HEAD" });
        response.end();
        return;
      }
      const path = safeAssetPath(output, pathname);
      if (!path) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      const details = await stat(path);
      response.writeHead(200, {
        "content-length": details.size,
        "content-type": contentTypes.get(extname(path)) || "application/octet-stream",
        "x-content-type-options": "nosniff",
      });
      if (request.method === "HEAD") response.end();
      else createReadStream(path).pipe(response);
    } catch {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end("Preview server error");
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number.parseInt(process.env.PORT || "3001", 10);
  createPreviewServer().listen(port, "127.0.0.1", () => {
    console.log(`Cloudflare Pages 本地预览：http://127.0.0.1:${port}`);
  });
}
