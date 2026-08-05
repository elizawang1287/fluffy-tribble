export function createNewsSentenceEntries(conversion) {
  const segments = Array.isArray(conversion?.segments) ? conversion.segments : [];
  return segments
    .filter((segment) => String(segment?.text ?? "").trim())
    .map((segment, index) => ({
      ...segment,
      tokens: Array.isArray(segment.tokens) ? segment.tokens : [],
      index,
      section: index === 0 ? "title" : "body",
      label: index === 0 ? "标题" : `第 ${index} 句`,
      idleLabel: index === 0 ? "听标题" : "听本句",
    }));
}

export function clampNewsSentenceIndex(index, sentenceCount) {
  const count = Math.max(0, Number(sentenceCount) || 0);
  if (count === 0) return 0;
  const numericIndex = Number.isFinite(Number(index)) ? Math.trunc(Number(index)) : 0;
  return Math.min(count - 1, Math.max(0, numericIndex));
}

export function moveNewsSentence(index, direction, sentenceCount) {
  return clampNewsSentenceIndex(Number(index) + Number(direction), sentenceCount);
}
