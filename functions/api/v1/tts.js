import { handleConvertRequest } from "../../../conversion-core.mjs";
import {
  billableCharacters,
  monthlyCharacterLimit,
  normalizeTtsRequest,
  parseServiceAccount,
  requestGoogleAccessToken,
  synthesizeGoogleSpeech,
  ttsCacheKey,
  usageMonth,
} from "../../../google-tts-core.mjs";
import { normalizeArchive } from "../../../news-api-core.mjs";
import { jsonResponse, methodNotAllowed, readJson, securityHeaders } from "../../_lib/responses.js";

const rateBuckets = new Map();
let tokenCache = null;

function clientAddress(request) {
  return request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || "unknown";
}

function allowRequest(request, now = Date.now()) {
  const address = clientAddress(request);
  const current = rateBuckets.get(address);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(address, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  current.count += 1;
  return current.count <= 20;
}

async function newsText(env, newsDate, sentenceIndex) {
  const response = await env.ASSETS.fetch(new Request("https://assets.local/data/news/index.json"));
  if (!response.ok) throw Object.assign(new Error("news unavailable"), { code: "NEWS_UNAVAILABLE" });
  const item = normalizeArchive(await response.json()).items.find((entry) => entry.date === newsDate);
  if (!item) throw Object.assign(new Error("news not found"), { code: "NEWS_NOT_FOUND" });
  const conversion = handleConvertRequest({ text: `${item.title}。${item.summary}`, expression: "written" });
  if (conversion.status !== 200) throw Object.assign(new Error("news conversion failed"), { code: "NEWS_UNAVAILABLE" });
  if (sentenceIndex === "all") return conversion.body.convertedText;
  const segment = conversion.body.segments[sentenceIndex];
  if (!segment?.text) throw Object.assign(new Error("sentence not found"), { code: "SENTENCE_NOT_FOUND" });
  return segment.text;
}

export async function reserveMonthlyCharacters(db, month, characters, limit) {
  await db.prepare("INSERT OR IGNORE INTO tts_usage (month, used_characters) VALUES (?, 0)").bind(month).run();
  const result = await db.prepare(`
    UPDATE tts_usage
    SET used_characters = used_characters + ?, updated_at = CURRENT_TIMESTAMP
    WHERE month = ? AND used_characters + ? <= ?
  `).bind(characters, month, characters, limit).run();
  return Number(result?.meta?.changes || 0) === 1;
}

async function releaseMonthlyCharacters(db, month, characters) {
  await db.prepare(`
    UPDATE tts_usage
    SET used_characters = MAX(0, used_characters - ?), updated_at = CURRENT_TIMESTAMP
    WHERE month = ?
  `).bind(characters, month).run();
}

async function accessToken(credentials, fetchImpl) {
  const now = Date.now();
  if (tokenCache?.clientEmail === credentials.clientEmail && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token;
  }
  const result = await requestGoogleAccessToken(credentials, fetchImpl);
  tokenCache = {
    clientEmail: credentials.clientEmail,
    token: result.token,
    expiresAt: now + result.expiresIn * 1000,
  };
  return result.token;
}

function audioResponse(audio, cacheStatus) {
  return new Response(audio, {
    status: 200,
    headers: {
      ...securityHeaders,
      "cache-control": "public, max-age=2592000",
      "content-type": "audio/mpeg",
      "x-tts-cache": cacheStatus,
      "x-tts-provider": "google",
    },
  });
}

export async function onRequest(context) {
  if (context.request.method !== "POST") return methodNotAllowed(["POST"]);
  if (context.env.GOOGLE_TTS_ENABLED !== "true") {
    return jsonResponse(503, { error: { code: "TTS_DISABLED", message: "云端粤语朗读尚未启用。" } });
  }
  const credentials = parseServiceAccount(context.env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON);
  if (!credentials) {
    return jsonResponse(503, { error: { code: "TTS_NOT_CONFIGURED", message: "云端粤语朗读尚未配置。" } });
  }
  if (!context.env.TTS_DB) {
    return jsonResponse(503, { error: { code: "TTS_QUOTA_NOT_CONFIGURED", message: "云端朗读额度保护尚未配置。" } });
  }
  if (!allowRequest(context.request)) {
    return jsonResponse(429, { error: { code: "RATE_LIMITED", message: "朗读请求有点频繁，请稍后再试。" } }, { headers: { "retry-after": "60" } });
  }

  let request;
  try {
    request = normalizeTtsRequest(await readJson(context.request, 4_000), context.env);
  } catch (error) {
    return jsonResponse(error?.status === 413 ? 413 : 400, {
      error: { code: error?.code || "INVALID_TTS_REQUEST", message: "朗读请求格式不正确。" },
    });
  }

  let text;
  try {
    text = await newsText(context.env, request.newsDate, request.sentenceIndex);
  } catch (error) {
    return jsonResponse(error?.code === "NEWS_UNAVAILABLE" ? 503 : 404, {
      error: { code: error?.code || "NEWS_NOT_FOUND", message: "没有找到对应的新闻句子。" },
    });
  }
  const characters = billableCharacters(text);
  if (characters > 2_000) {
    return jsonResponse(413, { error: { code: "TTS_TEXT_TOO_LONG", message: "朗读内容过长。" } });
  }

  const key = await ttsCacheKey({ text, voice: request.voice, speakingRate: request.speakingRate });
  const cache = globalThis.caches?.default;
  const cacheRequest = new Request(new URL(`/api/v1/tts-cache/${key}`, context.request.url), { method: "GET" });
  const cached = await cache?.match(cacheRequest);
  if (cached) return new Response(cached.body, { status: 200, headers: { ...cached.headers, "x-tts-cache": "hit" } });

  const month = usageMonth();
  let reserved;
  try {
    reserved = await reserveMonthlyCharacters(
      context.env.TTS_DB,
      month,
      characters,
      monthlyCharacterLimit(context.env),
    );
  } catch {
    return jsonResponse(503, {
      error: { code: "TTS_QUOTA_UNAVAILABLE", message: "云端朗读额度保护暂时不可用。" },
    });
  }
  if (!reserved) {
    return jsonResponse(429, {
      error: { code: "MONTHLY_TTS_LIMIT_REACHED", message: "本月云端朗读免费额度已暂停使用。" },
    });
  }

  try {
    const token = await accessToken(credentials, context.fetch || fetch);
    const audio = await synthesizeGoogleSpeech({
      text,
      voice: request.voice,
      speakingRate: request.speakingRate,
      accessToken: token,
      projectId: credentials.projectId,
      fetchImpl: context.fetch || fetch,
    });
    const response = audioResponse(audio, "miss");
    if (cache) context.waitUntil?.(cache.put(cacheRequest, response.clone()));
    return response;
  } catch {
    try {
      await releaseMonthlyCharacters(context.env.TTS_DB, month, characters);
    } catch {
      // Keep the conservative reservation if storage cannot be reached again.
    }
    return jsonResponse(502, {
      error: { code: "GOOGLE_TTS_UNAVAILABLE", message: "云端朗读暂时不可用，将改用设备声音。" },
    });
  }
}
