const encoder = new TextEncoder();
const defaultVoice = "yue-HK-Chirp3-HD-Aoede";
const defaultMonthlyLimit = 800_000;
const allowedVoicePattern = /^yue-HK-(?:Standard-[A-D]|Chirp3-HD-[A-Za-z]+)$/;

function base64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemBytes(value) {
  const content = value
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(content);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function parseServiceAccount(value) {
  if (!value) return null;
  try {
    const credentials = typeof value === "string" ? JSON.parse(value) : value;
    if (!credentials?.project_id || !credentials?.client_email || !credentials?.private_key) return null;
    return {
      projectId: String(credentials.project_id),
      clientEmail: String(credentials.client_email),
      privateKey: String(credentials.private_key).replace(/\\n/g, "\n"),
    };
  } catch {
    return null;
  }
}

export function normalizeTtsRequest(value, env = {}) {
  const newsDate = /^\d{4}-\d{2}-\d{2}$/.test(value?.newsDate) ? value.newsDate : "";
  const sentenceIndex = value?.sentenceIndex === "all"
    ? "all"
    : Number.isInteger(value?.sentenceIndex) && value.sentenceIndex >= 0 ? value.sentenceIndex : null;
  const configuredVoice = String(env.GOOGLE_TTS_VOICE || defaultVoice);
  const requestedVoice = value?.voice ? String(value.voice) : configuredVoice;
  const voice = allowedVoicePattern.test(requestedVoice) ? requestedVoice : configuredVoice;
  const speakingRate = Math.min(1.1, Math.max(0.75, Number(value?.speakingRate) || 0.92));
  if (!newsDate || sentenceIndex === null || !allowedVoicePattern.test(voice)) {
    throw Object.assign(new Error("invalid TTS request"), { code: "INVALID_TTS_REQUEST" });
  }
  return { newsDate, sentenceIndex, voice, speakingRate };
}

export function monthlyCharacterLimit(env = {}) {
  const configured = Number.parseInt(env.GOOGLE_TTS_MONTHLY_CHAR_LIMIT || "", 10);
  return Number.isFinite(configured) && configured > 0
    ? Math.min(defaultMonthlyLimit, configured)
    : defaultMonthlyLimit;
}

export function usageMonth(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

export function billableCharacters(text) {
  return Array.from(String(text)).length;
}

export async function ttsCacheKey({ text, voice, speakingRate }) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`${voice}\n${speakingRate}\n${text}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createServiceAccountJwt(credentials, now = Date.now()) {
  const issuedAt = Math.floor(now / 1000);
  const header = base64Url(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = base64Url(encoder.encode(JSON.stringify({
    iss: credentials.clientEmail,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: issuedAt,
    exp: issuedAt + 3600,
  })));
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemBytes(credentials.privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(unsigned));
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

export async function requestGoogleAccessToken(credentials, fetchImpl = fetch) {
  const assertion = await createServiceAccountJwt(credentials);
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Google OAuth returned ${response.status}`);
  const result = await response.json();
  if (!result.access_token) throw new Error("Google OAuth did not return an access token");
  return { token: result.access_token, expiresIn: Number(result.expires_in) || 3600 };
}

export async function synthesizeGoogleSpeech({ text, voice, speakingRate, accessToken, projectId, fetchImpl = fetch }) {
  const response = await fetchImpl("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json; charset=utf-8",
      "x-goog-user-project": projectId,
    },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: "yue-HK", name: voice },
      audioConfig: { audioEncoding: "MP3", speakingRate },
    }),
  });
  if (!response.ok) throw new Error(`Google TTS returned ${response.status}`);
  const result = await response.json();
  if (!result.audioContent) throw new Error("Google TTS did not return audio");
  const binary = atob(result.audioContent);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export const googleTtsDefaults = { defaultVoice, defaultMonthlyLimit };
