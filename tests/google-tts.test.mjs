import assert from "node:assert/strict";
import test from "node:test";
import {
  billableCharacters,
  googleTtsDefaults,
  monthlyCharacterLimit,
  normalizeTtsRequest,
  parseServiceAccount,
  synthesizeGoogleSpeech,
  ttsCacheKey,
  usageMonth,
} from "../google-tts-core.mjs";
import { reserveMonthlyCharacters } from "../functions/api/v1/tts.js";

test("Google TTS credentials are parsed without exposing their original shape", () => {
  const credentials = parseServiceAccount(JSON.stringify({
    project_id: "school-project",
    client_email: "tts@school-project.iam.gserviceaccount.com",
    private_key: "line-one\\nline-two",
  }));
  assert.deepEqual(credentials, {
    projectId: "school-project",
    clientEmail: "tts@school-project.iam.gserviceaccount.com",
    privateKey: "line-one\nline-two",
  });
  assert.equal(parseServiceAccount("not-json"), null);
});

test("Google TTS requests accept only archived-news coordinates and Cantonese voices", () => {
  assert.deepEqual(normalizeTtsRequest({ newsDate: "2026-08-05", sentenceIndex: 2 }), {
    newsDate: "2026-08-05",
    sentenceIndex: 2,
    voice: googleTtsDefaults.defaultVoice,
    speakingRate: 0.92,
  });
  assert.equal(normalizeTtsRequest({
    newsDate: "2026-08-05",
    sentenceIndex: "all",
    voice: "en-US-Neural2-A",
    speakingRate: 9,
  }).voice, googleTtsDefaults.defaultVoice);
  assert.throws(() => normalizeTtsRequest({ newsDate: "bad", sentenceIndex: 0 }), /invalid TTS request/);
});

test("monthly TTS limit can be lowered but never raised above the safety ceiling", () => {
  assert.equal(monthlyCharacterLimit({}), 800_000);
  assert.equal(monthlyCharacterLimit({ GOOGLE_TTS_MONTHLY_CHAR_LIMIT: "500000" }), 500_000);
  assert.equal(monthlyCharacterLimit({ GOOGLE_TTS_MONTHLY_CHAR_LIMIT: "9999999" }), 800_000);
  assert.equal(usageMonth(new Date("2026-08-31T23:59:00Z")), "2026-08");
});

test("TTS usage and cache keys count Unicode safely and include voice settings", async () => {
  assert.equal(billableCharacters("粤语😀"), 3);
  const first = await ttsCacheKey({ text: "早晨", voice: "yue-HK-Standard-A", speakingRate: 0.92 });
  const same = await ttsCacheKey({ text: "早晨", voice: "yue-HK-Standard-A", speakingRate: 0.92 });
  const changed = await ttsCacheKey({ text: "早晨", voice: "yue-HK-Standard-B", speakingRate: 0.92 });
  assert.equal(first, same);
  assert.notEqual(first, changed);
});

test("Google TTS requests identify the billing project without exposing credentials", async () => {
  let captured;
  const audio = await synthesizeGoogleSpeech({
    text: "早晨",
    voice: "yue-HK-Standard-A",
    speakingRate: 0.92,
    accessToken: "short-lived-token",
    projectId: "school-project",
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return new Response(JSON.stringify({ audioContent: btoa("audio") }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assert.equal(captured.url, "https://texttospeech.googleapis.com/v1/text:synthesize");
  assert.equal(captured.init.headers["x-goog-user-project"], "school-project");
  assert.equal(captured.init.headers.authorization, "Bearer short-lived-token");
  assert.deepEqual(Array.from(audio), Array.from(new TextEncoder().encode("audio")));
});

test("TTS quota reservation relies on one conditional database update", async () => {
  const calls = [];
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          calls.push({ sql, values });
          return { run: async () => ({ meta: { changes: sql.includes("UPDATE") ? 1 : 0 } }) };
        },
      };
    },
  };
  assert.equal(await reserveMonthlyCharacters(db, "2026-08", 120, 800_000), true);
  assert.deepEqual(calls[1].values, [120, "2026-08", 120, 800_000]);
  assert.match(calls[1].sql, /used_characters \+ \? <= \?/);
});
