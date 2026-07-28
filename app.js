import { createSpeechPlan, rankCantoneseVoices } from "./speech-core.mjs";

const $ = (selector) => document.querySelector(selector);
const source = $("#source-text");
const convertButton = $("#convert-button");
const messageRegion = $("#message-region");
const results = $("#results");
const sentenceList = $("#sentence-list");
const speechStatus = $("#speech-status");
const modeButtons = [...document.querySelectorAll("[data-expression]")];
const example = "老师说，我们明天八点半在图书馆集合。请带好数学作业和学生证！";
let conversion = null;
let cantoneseVoice = null;
let cantoneseVoices = [];
let selectedVoiceKey = "";
let speechRate = 0.92;
let speechRunId = 0;
let speechPauseTimer = null;
let speakingId = null;
let expression = "written";
let newsItems = [];
let activeNews = null;
const newsConversions = new Map();

function showMessage(text, kind = "error") {
  messageRegion.replaceChildren();
  if (!text) return;
  const message = document.createElement("p");
  message.className = `message ${kind}-message`;
  message.setAttribute("role", kind === "error" ? "alert" : "status");
  message.textContent = text;
  messageRegion.append(message);
}

function updateInputState() {
  const count = Array.from(source.value).length;
  const counter = $("#character-count");
  counter.textContent = `${count} / 2000`;
  counter.classList.toggle("warning", count > 1800);
  convertButton.disabled = !source.value.trim();
}

function voiceKey(voice) {
  if (!voice) return "";
  return voice?.voiceURI || `${voice?.name ?? ""}|${voice?.lang ?? ""}`;
}

function setSpeakButtonState(button, playing) {
  const idleLabel = button.id === "news-speak" ? "粤语朗读" : "播放本句";
  button.innerHTML = `<span aria-hidden="true">${playing ? "■" : "▶"}</span> ${playing ? "停止" : idleLabel}`;
}

function clearSpeechHighlights() {
  document.querySelectorAll(".speaking").forEach((element) => element.classList.remove("speaking"));
}

function resetSpeechButtons() {
  document.querySelectorAll(".speak-button").forEach((button) => setSpeakButtonState(button, false));
  const newsSpeak = $("#news-speak");
  if (newsSpeak) setSpeakButtonState(newsSpeak, false);
}

function stopSpeaking() {
  speechRunId += 1;
  if (speechPauseTimer) clearTimeout(speechPauseTimer);
  speechPauseTimer = null;
  speakingId = null;
  window.speechSynthesis?.cancel();
  clearSpeechHighlights();
  resetSpeechButtons();
}

function updateVoiceControls() {
  document.querySelectorAll("[data-speech-voice]").forEach((select) => {
    const fragment = document.createDocumentFragment();
    if (cantoneseVoices.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "未找到粤语声音";
      fragment.append(option);
    } else {
      cantoneseVoices.forEach((voice, index) => {
        const option = document.createElement("option");
        option.value = voiceKey(voice);
        option.textContent = `${index === 0 ? "推荐 · " : ""}${voice.name}`;
        fragment.append(option);
      });
    }
    select.replaceChildren(fragment);
    select.disabled = cantoneseVoices.length === 0;
    if (cantoneseVoice) select.value = voiceKey(cantoneseVoice);
  });
}

function refreshVoice() {
  if (!("speechSynthesis" in window)) return setSpeechUnavailable();
  const previousVoiceKey = voiceKey(cantoneseVoice);
  cantoneseVoices = rankCantoneseVoices(speechSynthesis.getVoices());
  cantoneseVoice = cantoneseVoices.find((voice) => voiceKey(voice) === selectedVoiceKey) ?? cantoneseVoices[0] ?? null;
  selectedVoiceKey = voiceKey(cantoneseVoice);
  if (previousVoiceKey && previousVoiceKey !== selectedVoiceKey) stopSpeaking();
  updateVoiceControls();
  speechStatus.className = `speech-status ${cantoneseVoice ? "ready" : "unavailable"}`;
  speechStatus.firstElementChild.textContent = cantoneseVoice ? "●" : "○";
  speechStatus.lastElementChild.textContent = cantoneseVoice ? `正在使用：${cantoneseVoice.name}（已优化断句）` : "未找到香港粤语声音；仍可查看繁体和粤拼";
  document.querySelectorAll(".speak-button").forEach((button) => { button.disabled = !cantoneseVoice; });
  const newsSpeak = $("#news-speak");
  if (newsSpeak) newsSpeak.disabled = !cantoneseVoice || !activeNews;
}

function setSpeechUnavailable() {
  stopSpeaking();
  cantoneseVoice = null;
  cantoneseVoices = [];
  updateVoiceControls();
  speechStatus.className = "speech-status unavailable";
  speechStatus.lastElementChild.textContent = "当前浏览器不支持语音朗读；仍可查看繁体和粤拼";
}

function toneClass(syllable) {
  const tone = syllable.match(/([1-6])$/)?.[1];
  return tone ? `tone-${tone}` : "";
}

function playSpeechPlan({ id, plan, button, highlight, onError }) {
  if (!cantoneseVoice || plan.length === 0) return;
  if (speakingId === id) return stopSpeaking();
  stopSpeaking();
  speakingId = id;
  const runId = speechRunId;
  setSpeakButtonState(button, true);

  const playPart = (index) => {
    if (runId !== speechRunId || speakingId !== id) return;
    if (index >= plan.length) {
      stopSpeaking();
      return;
    }
    const part = plan[index];
    const utterance = new SpeechSynthesisUtterance(part.text);
    utterance.voice = cantoneseVoice;
    utterance.lang = cantoneseVoice.lang;
    utterance.rate = Math.min(1.2, Math.max(0.6, speechRate * part.rateMultiplier));
    utterance.pitch = part.pitch;
    utterance.onstart = () => {
      if (runId !== speechRunId) return;
      clearSpeechHighlights();
      highlight?.(part)?.classList.add("speaking");
    };
    utterance.onend = () => {
      if (runId !== speechRunId) return;
      speechPauseTimer = setTimeout(() => playPart(index + 1), part.pauseMs);
    };
    utterance.onerror = (event) => {
      if (runId !== speechRunId || event.error === "canceled") return;
      stopSpeaking();
      onError?.();
    };
    speechSynthesis.speak(utterance);
  };

  playPart(0);
}

function speak(segment, button) {
  if (!cantoneseVoice) return showMessage("当前设备没有香港粤语声音，请在系统设置中添加“粤语（香港）”。");
  playSpeechPlan({
    id: segment.id,
    plan: createSpeechPlan(segment.text),
    button,
    highlight: () => button.closest(".sentence-card"),
    onError: () => showMessage("朗读没有成功，请检查设备的粤语声音设置。"),
  });
}

function renderToken(token) {
  const wrapper = document.createElement("span");
  wrapper.className = `token ${token.jyutping.length ? "" : "punctuation"}`;
  const hanzi = document.createElement("span");
  hanzi.className = "hanzi";
  hanzi.textContent = token.text;
  wrapper.append(hanzi);
  if (token.jyutping.length) {
    const reading = document.createElement("span");
    reading.className = "jyutping";
    for (const syllable of token.jyutping) {
      const span = document.createElement("span");
      span.className = toneClass(syllable);
      span.textContent = syllable;
      reading.append(span);
    }
    wrapper.append(reading);
  }
  return wrapper;
}

function formatNewsDate(date) {
  const parsed = new Date(`${date}T00:00:00+08:00`);
  return Number.isNaN(parsed.valueOf())
    ? date
    : new Intl.DateTimeFormat("zh-HK", { month: "long", day: "numeric", weekday: "short" }).format(parsed);
}

async function convertNews(item) {
  const tokenList = $("#news-token-list");
  if (newsConversions.has(item.date)) {
    renderNewsTokens(newsConversions.get(item.date));
    return;
  }
  tokenList.innerHTML = '<p class="news-loading">正在生成粤拼…</p>';
  try {
    const response = await fetch("/api/v1/convert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: `${item.title}。${item.summary}`, expression: "written" }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message);
    newsConversions.set(item.date, data);
    if (activeNews?.date === item.date) renderNewsTokens(data);
  } catch {
    tokenList.innerHTML = '<p class="news-loading">粤拼暂时未能生成，请稍后再试。</p>';
  }
}

function renderNewsTokens(data) {
  const tokenList = $("#news-token-list");
  tokenList.replaceChildren();
  data.segments.forEach((segment) => {
    const line = document.createElement("div");
    line.className = "news-token-line";
    line.lang = "zh-HK";
    segment.tokens.forEach((token) => line.append(renderToken(token)));
    tokenList.append(line);
  });
}

function selectNews(item) {
  if (speakingId?.startsWith("news-")) stopSpeaking();
  activeNews = item;
  $("#news-category").textContent = item.category;
  $("#news-date").dateTime = item.date;
  $("#news-date").textContent = formatNewsDate(item.date);
  $("#news-title").textContent = item.title;
  $("#news-summary").textContent = item.summary;
  $("#news-source").textContent = `来源：${item.source}`;
  const sourceLink = $("#news-source-link");
  sourceLink.hidden = !item.sourceUrl;
  if (item.sourceUrl) sourceLink.href = item.sourceUrl;
  $("#news-speak").disabled = !cantoneseVoice;
  document.querySelectorAll(".history-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.date === item.date);
  });
  convertNews(item);
}

function renderNewsHistory() {
  const list = $("#news-history-list");
  list.replaceChildren();
  newsItems.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-item";
    button.dataset.date = item.date;
    const date = document.createElement("time");
    date.dateTime = item.date;
    date.textContent = formatNewsDate(item.date);
    const title = document.createElement("span");
    title.textContent = item.title;
    button.append(date, title);
    button.addEventListener("click", () => selectNews(item));
    list.append(button);
  });
}

function speakNews() {
  if (!activeNews || !cantoneseVoice) return;
  const button = $("#news-speak");
  const titlePlan = createSpeechPlan(activeNews.title, { section: "title" });
  const summaryPlan = createSpeechPlan(activeNews.summary);
  playSpeechPlan({
    id: `news-${activeNews.date}`,
    plan: [...titlePlan, ...summaryPlan],
    button,
    highlight: (part) => part.section === "title" ? $("#news-title") : $("#news-summary"),
    onError: () => {
      $("#news-error").textContent = "朗读没有成功，请检查设备是否安装了“粤语（香港）”声音。";
    },
  });
}

async function loadNews() {
  try {
    const response = await fetch("/api/v1/news");
    const data = await response.json();
    if (!response.ok || !data.items?.length) throw new Error(data.error?.message);
    newsItems = data.items;
    renderNewsHistory();
    selectNews(newsItems[0]);
    if (data.status === "fallback") $("#news-error").textContent = "新闻源暂时未更新，当前显示的是备用提示。";
  } catch {
    $("#news-title").textContent = "今天的新闻暂时未能载入";
    $("#news-summary").textContent = "文字转换功能仍可正常使用，请稍后再回来看看。";
    $("#news-token-list").innerHTML = '<p class="news-loading">暂无内容</p>';
    $("#news-error").textContent = "新闻服务连接失败。";
  }
}

function renderResult(data) {
  conversion = data;
  const isColloquial = data.expression === "colloquial";
  $("#result-title").textContent = isColloquial ? "香港口语参考说法" : "跟着粤拼读一读";
  $("#copy-traditional").textContent = isColloquial ? "复制口语" : "复制繁体";
  sentenceList.replaceChildren();
  data.segments.forEach((segment, index) => {
    const card = document.createElement("article");
    card.className = "sentence-card";
    const number = document.createElement("div");
    number.className = "sentence-number";
    number.textContent = String(index + 1).padStart(2, "0");
    const content = document.createElement("div");
    content.className = "sentence-content";
    if (isColloquial) {
      const reference = document.createElement("p");
      reference.className = "written-reference";
      const label = document.createElement("strong");
      label.textContent = "书面语：";
      reference.append(label, segment.writtenText);
      content.append(reference);
    }
    const tokens = document.createElement("div");
    tokens.className = "token-line";
    tokens.lang = "zh-HK";
    segment.tokens.forEach((token) => tokens.append(renderToken(token)));
    const footer = document.createElement("div");
    footer.className = "sentence-footer";
    const play = document.createElement("button");
    play.className = "speak-button";
    play.type = "button";
    play.disabled = !cantoneseVoice;
    play.innerHTML = '<span aria-hidden="true">▶</span> 播放本句';
    play.addEventListener("click", () => speak(segment, play));
    footer.append(play);
    if (segment.tokens.some((token) => token.status === "unknown")) {
      const note = document.createElement("span"); note.className = "unknown-note"; note.textContent = "有字词暂未标音"; footer.append(note);
    }
    content.append(tokens);
    if (isColloquial && segment.changes.length) {
      const changes = document.createElement("div");
      changes.className = "change-list";
      const changeLabel = document.createElement("strong");
      changeLabel.textContent = "本句转换";
      changes.append(changeLabel);
      segment.changes.forEach((change) => {
        const item = document.createElement("span");
        item.textContent = `${change.from} → ${change.to}`;
        item.title = change.description;
        changes.append(item);
      });
      content.append(changes);
    }
    content.append(footer);
    card.append(number, content);
    sentenceList.append(card);
  });
  const warnings = $("#result-warnings");
  warnings.replaceChildren(...data.warnings.map((text) => { const p = document.createElement("p"); p.className = "result-warning"; p.textContent = text; return p; }));
  results.hidden = false;
  refreshVoice();
  results.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}

async function convert() {
  if (!source.value.trim()) return showMessage("先输入一段想学习的文字吧。");
  convertButton.disabled = true;
  convertButton.firstChild.textContent = "正在转换… ";
  showMessage("");
  stopSpeaking();
  try {
    const requestedExpression = expression;
    const response = await fetch("/api/v1/convert", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: source.value, expression: requestedExpression }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message ?? "转换失败，请稍后再试。");
    renderResult(body);
  } catch (error) {
    showMessage(error instanceof Error ? error.message : "转换失败，请稍后再试。");
  } finally {
    convertButton.firstChild.textContent = "开始转换 ";
    updateInputState();
  }
}

function selectExpression(nextExpression) {
  expression = nextExpression;
  modeButtons.forEach((button) => {
    const active = button.dataset.expression === expression;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  $("#mode-help").textContent = expression === "colloquial"
    ? "免费规则版会转换常见校园和日常说法；结果仅供学习参考。"
    : "适合课文、通知和正式文字。";
  stopSpeaking();
  conversion = null;
  results.hidden = true;
  showMessage("");
}

async function copy(value, label) {
  try { await navigator.clipboard.writeText(value); showMessage(`已复制${label}`, "success"); }
  catch { showMessage("复制没有成功，请手动选择文字复制。"); }
}

source.addEventListener("input", updateInputState);
modeButtons.forEach((button) => button.addEventListener("click", () => selectExpression(button.dataset.expression)));
$("#example-button").addEventListener("click", () => { source.value = example; updateInputState(); source.focus(); });
$("#clear-button").addEventListener("click", () => { stopSpeaking(); source.value = ""; conversion = null; results.hidden = true; showMessage(""); updateInputState(); source.focus(); });
convertButton.addEventListener("click", convert);
$("#copy-traditional").addEventListener("click", () => conversion && copy(conversion.convertedText, conversion.expression === "colloquial" ? "香港口语" : "繁体文字"));
$("#copy-jyutping").addEventListener("click", () => conversion && copy(conversion.segments.flatMap((segment) => segment.tokens.flatMap((token) => token.jyutping)).join(" "), "粤拼"));
$("#news-speak").addEventListener("click", speakNews);
document.querySelectorAll("[data-speech-voice]").forEach((select) => select.addEventListener("change", (event) => {
  selectedVoiceKey = event.target.value;
  cantoneseVoice = cantoneseVoices.find((voice) => voiceKey(voice) === selectedVoiceKey) ?? cantoneseVoices[0] ?? null;
  selectedVoiceKey = voiceKey(cantoneseVoice);
  stopSpeaking();
  updateVoiceControls();
  refreshVoice();
}));
document.querySelectorAll("[data-speech-rate]").forEach((select) => select.addEventListener("change", (event) => {
  speechRate = Number(event.target.value) || 0.92;
  document.querySelectorAll("[data-speech-rate]").forEach((other) => { other.value = String(speechRate); });
  stopSpeaking();
}));
$("#news-history-toggle").addEventListener("click", () => {
  const history = $("#news-history");
  history.hidden = !history.hidden;
  $("#news-history-toggle").setAttribute("aria-expanded", String(!history.hidden));
  $("#news-history-toggle").textContent = history.hidden ? "查看往期" : "收起往期";
});
refreshVoice();
loadNews();
window.speechSynthesis?.addEventListener("voiceschanged", refreshVoice);
window.addEventListener("pagehide", stopSpeaking);
