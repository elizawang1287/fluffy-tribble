import { handleConvertRequest } from "../../../conversion-core.mjs";
import { jsonResponse, methodNotAllowed, readJson } from "../../_lib/responses.js";

const buckets = new Map();
const windowMs = 60_000;
const maxRequests = 30;

function clientAddress(request) {
  return request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || "unknown";
}

function allowRequest(request, now = Date.now()) {
  const address = clientAddress(request);
  const current = buckets.get(address);
  if (!current || current.resetAt <= now) {
    buckets.set(address, { count: 1, resetAt: now + windowMs });
    return true;
  }
  current.count += 1;
  return current.count <= maxRequests;
}

function pruneBuckets(now = Date.now()) {
  if (buckets.size < 1_000) return;
  for (const [address, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(address);
  }
}

export async function onRequest(context) {
  if (context.request.method !== "POST") return methodNotAllowed(["POST"]);
  pruneBuckets();
  if (!allowRequest(context.request)) {
    return jsonResponse(429, {
      error: { code: "RATE_LIMITED", message: "请求有点频繁，请一分钟后再试。" },
    }, { headers: { "retry-after": "60" } });
  }

  try {
    const result = handleConvertRequest(await readJson(context.request));
    return jsonResponse(result.status, result.body);
  } catch (error) {
    const status = error?.status === 413 ? 413 : 400;
    return jsonResponse(status, {
      error: {
        code: status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON",
        message: status === 413 ? "请求内容过长。" : "请求内容不是有效的 JSON。",
      },
    });
  }
}
