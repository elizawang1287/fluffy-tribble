const cantoneseNamePattern = /cantonese|廣東話|广东话|粤语|粵語|香港/i;
const naturalVoicePattern = /natural|online|neural|hiu ?maan|hiu ?gaai|wan ?lung/i;

export function isCantoneseVoice(voice) {
  const language = String(voice?.lang ?? "").toLowerCase().replace("_", "-");
  return language === "yue-hk"
    || language === "zh-hk"
    || language.startsWith("yue-")
    || cantoneseNamePattern.test(String(voice?.name ?? ""));
}

function voiceScore(voice) {
  const name = String(voice?.name ?? "");
  const language = String(voice?.lang ?? "").toLowerCase().replace("_", "-");
  let score = 0;
  if (language === "yue-hk") score += 80;
  else if (language === "zh-hk") score += 70;
  else if (language.startsWith("yue-")) score += 60;
  if (naturalVoicePattern.test(name)) score += 35;
  if (/microsoft|apple|google/i.test(name)) score += 8;
  if (voice?.default) score += 2;
  return score;
}

export function rankCantoneseVoices(voices) {
  return [...voices]
    .filter(isCantoneseVoice)
    .map((voice, index) => ({ voice, index, score: voiceScore(voice) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ voice }) => voice);
}

function pauseFor(text, section) {
  if (section === "title" && /[。！？!?]$/u.test(text)) return 420;
  if (/[！？!?]$/u.test(text)) return 340;
  if (/。$/u.test(text)) return 300;
  if (/[；;]$/u.test(text)) return 230;
  if (/[：:]$/u.test(text)) return 180;
  if (/，$/u.test(text)) return 130;
  if (/、$/u.test(text)) return 90;
  return section === "title" ? 380 : 160;
}

function pitchFor(text, section) {
  if (/[？?]$/u.test(text)) return 1.06;
  if (/[！!]$/u.test(text)) return 1.04;
  return section === "title" ? 1.02 : 1;
}

function mergeShortLeadIns(chunks) {
  const merged = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const spokenLength = Array.from(chunk.replace(/[，、；：。！？!?;:]/gu, "")).length;
    if (spokenLength < 5 && /[，、：:]$/u.test(chunk) && chunks[index + 1]) {
      merged.push(`${chunk}${chunks[index + 1]}`);
      index += 1;
    } else {
      merged.push(chunk);
    }
  }
  return merged;
}

export function createSpeechPlan(text, { section = "body" } = {}) {
  const normalized = String(text ?? "").replace(/\s+/gu, " ").trim();
  if (!normalized) return [];
  const chunks = normalized.match(/[^，、；：。！？!?;:]+[，、；：。！？!?;:]?/gu) ?? [normalized];
  return mergeShortLeadIns(chunks)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => ({
      text: chunk,
      pauseMs: pauseFor(chunk, section),
      pitch: pitchFor(chunk, section),
      rateMultiplier: section === "title" ? 0.98 : 1,
      section,
    }));
}
