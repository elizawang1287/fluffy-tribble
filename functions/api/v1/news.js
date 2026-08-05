import { normalizeArchive } from "../../../news-api-core.mjs";
import { jsonResponse, methodNotAllowed } from "../../_lib/responses.js";

export async function onRequest(context) {
  if (context.request.method !== "GET") return methodNotAllowed(["GET"]);

  try {
    const assetUrl = new URL("/data/news/index.json", context.request.url);
    const response = await context.env.ASSETS.fetch(new Request(assetUrl, {
      headers: { accept: "application/json" },
    }));
    if (!response.ok) throw new Error(`News asset returned ${response.status}`);
    const archive = normalizeArchive(await response.json());
    if (!archive.items.length) throw new Error("News archive is empty");
    return jsonResponse(200, { ...archive, maxDays: 30, status: "static" }, {
      cacheControl: "public, max-age=300",
    });
  } catch {
    return jsonResponse(503, {
      error: { code: "NEWS_UNAVAILABLE", message: "新闻暂时未能载入，请稍后再试。" },
    });
  }
}
