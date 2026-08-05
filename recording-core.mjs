export const recordingMaxDurationMs = 20_000;

export function recordingKey(newsDate, sentenceIndex) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(newsDate)) ? String(newsDate) : "unknown";
  const index = Number.isInteger(sentenceIndex) && sentenceIndex >= 0 ? sentenceIndex : 0;
  return `${date}:${index}`;
}

export function formatRecordingDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.min(5999, Math.ceil(Number(milliseconds) / 1000) || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function preferredRecordingMimeType(isTypeSupported) {
  if (typeof isTypeSupported !== "function") return "";
  return [
    "audio/webm;codecs=opus",
    "audio/mp4",
    "audio/webm",
  ].find((type) => isTypeSupported(type)) || "";
}

export function recordingErrorMessage(name) {
  const messages = {
    NotAllowedError: "没有获得麦克风权限，请在浏览器设置中允许后重试。",
    NotFoundError: "没有找到可用的麦克风。",
    NotReadableError: "麦克风正被其他程序占用，请关闭后重试。",
    SecurityError: "当前页面不能使用麦克风，请通过 HTTPS 打开网站。",
  };
  return messages[name] || "录音没有成功，请检查麦克风和浏览器权限。";
}
