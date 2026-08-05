import { jsonResponse, methodNotAllowed } from "./_lib/responses.js";

export function onRequest(context) {
  if (context.request.method !== "GET") return methodNotAllowed(["GET"]);
  return jsonResponse(200, { status: "ok", platform: "cloudflare-pages" });
}
