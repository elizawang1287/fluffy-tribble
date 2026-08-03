import { createSpeechPlan, rankCantoneseVoices } from "./speech-core.mjs";
import { campusCategories, campusPhrases, phraseForDate } from "./campus-phrases.mjs";
import {
  addHistoryItem,
  addLearningWord,
  createLearningState,
  learningStreak,
  learningWordKey,
  markDailyTask,
  normalizeLearningState,
  removeHistoryItem,
  removeLearningWord,
  setWordMastered,
} from "./learning-core.mjs";

const $ = (selector) => document.querySelector(selector);
const source = $("#source-text");
const convertButton = $("#convert-button");
const messageRegion = $("#message-region");
const results = $("#results");
const sentenceList = $("#sentence-list");
const speechStatus = $("#speech-status");
const modeButtons = [...document.querySelectorAll("[data-expression]")];
const example = "老师说，我们明天八点半在图书馆集合。请带好数学作业和学生证！";
const learningStorageKey = "jyut-campus:learning:v1";
let conversion = null;
let cantoneseVoice = null;
let cantoneseVoices = [];
let selectedVoiceKey = "";
let speechRate = 0.92;
let speechRunId = 0;
let speechPauseTimer = null;
let speakingId = null;
let speechRepeat = 1;
let jyutpingHidden = false;
let expression = "written";
let newsItems = [];
let activeNews = null;
const newsConversions = new Map();
const phraseConversions = new Map();
let campusCategory = "classroom";
let toastTimer = null;

function loadLearningState() {
  try {
    return normalizeLearningState(JSON.parse(localStorage.getItem(learningStorageKey)));
  } catch {
    return createLearningState();
  }
}

let learningState = loadLearningState();

function hongKongDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function showLearningToast(text) {
  const toast = $("#learning-toast");
  toast.textContent = text;
  toast.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2200);
}

function saveLearningState(nextState) {
  learningState = normalizeLearningState(nextState);
  try {
    localStorage.setItem(learningStorageKey, JSON.stringify(learningState));
  } catch {
    showLearningToast("浏览器未能保存学习记录。仍可继续使用其他功能。");
  }
  renderWordbook();
  renderHistory();
  renderDailyPlan();
  updateWordSaveButtons();
}

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
  const idleLabel = button.dataset.idleLabel || (button.id === "news-speak" ? "粤语朗读" : "播放本句");
  button.innerHTML = `<span aria-hidden="true">${playing ? "■" : "▶"}</span> ${playing ? "停止" : idleLabel}`;
}

function clearSpeechHighlights() {
  document.querySelectorAll(".speaking").forEach((element) => element.classList.remove("speaking"));
}

function resetSpeechButtons() {
  document.querySelectorAll("[data-speech-action]").forEach((button) => setSpeakButtonState(button, false));
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
  document.querySelectorAll("[data-requires-voice]").forEach((button) => { button.disabled = !cantoneseVoice; });
  const newsSpeak = $("#news-speak");
  if (newsSpeak) newsSpeak.disabled = !cantoneseVoice || !activeNews;
}

function setSpeechUnavailable() {
  stopSpeaking();
  cantoneseVoice = null;
  cantoneseVoices = [];
  updateVoiceControls();
  document.querySelectorAll("[data-requires-voice]").forEach((button) => { button.disabled = true; });
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

function repeatSpeechPlan(plan, count) {
  if (count <= 1) return plan;
  return Array.from({ length: count }, (_, repeatIndex) => plan.map((part, partIndex) => ({
    ...part,
    pauseMs: partIndex === plan.length - 1 && repeatIndex < count - 1 ? 650 : part.pauseMs,
  }))).flat();
}

function speak(segment, button) {
  if (!cantoneseVoice) return showMessage("当前设备没有香港粤语声音，请在系统设置中添加“粤语（香港）”。");
  playSpeechPlan({
    id: segment.id,
    plan: repeatSpeechPlan(createSpeechPlan(segment.text), speechRepeat),
    button,
    highlight: () => button.closest(".sentence-card"),
    onError: () => showMessage("朗读没有成功，请检查设备的粤语声音设置。"),
  });
}

function tokenDatasetKey(token) {
  return encodeURIComponent(learningWordKey(token));
}

function updateWordSaveButtons() {
  const saved = new Set(learningState.words.map((word) => encodeURIComponent(learningWordKey(word))));
  document.querySelectorAll(".save-word-button").forEach((button) => {
    const isSaved = saved.has(button.dataset.wordKey);
    button.classList.toggle("saved", isSaved);
    button.textContent = isSaved ? "★" : "☆";
    button.setAttribute("aria-label", isSaved ? "已加入生词本" : "加入生词本");
    button.title = isSaved ? "已加入生词本" : "加入生词本";
  });
}

function saveToken(token, context) {
  const key = learningWordKey(token);
  if (learningState.words.some((word) => learningWordKey(word) === key)) {
    showLearningToast(`“${token.text}”已经在生词本里了`);
    return;
  }
  saveLearningState(addLearningWord(learningState, {
    text: token.text,
    jyutping: token.jyutping,
    source: context.source ?? "",
    sourceType: context.sourceType ?? "conversion",
  }));
  showLearningToast(`已收藏“${token.text}”`);
}

function renderToken(token, context = {}) {
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
    if (context.practice) {
      wrapper.classList.add("practice-token");
      wrapper.title = "隐藏粤拼时，点击这个词显示答案";
      wrapper.addEventListener("click", () => {
        if (jyutpingHidden) wrapper.classList.add("revealed");
      });
    }
    if (context.collectible !== false) {
      const save = document.createElement("button");
      save.type = "button";
      save.className = "save-word-button";
      save.dataset.wordKey = tokenDatasetKey(token);
      save.textContent = "☆";
      save.setAttribute("aria-label", "加入生词本");
      save.addEventListener("click", (event) => {
        event.stopPropagation();
        saveToken(token, context);
      });
      wrapper.append(save);
    }
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
    segment.tokens.forEach((token) => line.append(renderToken(token, { source: segment.text, sourceType: "news" })));
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
  renderDailyPlan();
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

function completeDailyTask(task, message) {
  const date = hongKongDate();
  if (learningState.daily[date]?.[task]) return;
  saveLearningState(markDailyTask(learningState, date, task));
  if (message) showLearningToast(message);
}

async function getPhraseConversion(phrase) {
  if (phraseConversions.has(phrase.id)) return phraseConversions.get(phrase.id);
  const response = await fetch("/api/v1/convert", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: phrase.spoken, expression: "written" }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "粤拼暂时未能生成。");
  phraseConversions.set(phrase.id, data);
  return data;
}

function renderPhraseTokens(container, data, phrase) {
  container.replaceChildren();
  data.segments.forEach((segment) => {
    const line = document.createElement("span");
    line.className = "phrase-token-line";
    segment.tokens.forEach((token) => line.append(renderToken(token, { source: phrase.spoken, sourceType: "campus" })));
    container.append(line);
  });
  container.hidden = false;
  updateWordSaveButtons();
}

async function revealPhraseJyutping(phrase, container, button) {
  button.disabled = true;
  button.textContent = "生成中…";
  try {
    renderPhraseTokens(container, await getPhraseConversion(phrase), phrase);
    button.textContent = "已显示粤拼";
    completeDailyTask("phrase", "完成了今天的校园粤语任务");
  } catch (error) {
    button.disabled = false;
    button.textContent = "重试粤拼";
    $("#campus-status").textContent = error instanceof Error ? error.message : "粤拼暂时未能生成。";
  }
}

function speakCampusPhrase(phrase, button, highlight) {
  if (!cantoneseVoice) {
    $("#campus-status").textContent = "当前设备没有香港粤语声音，仍可查看文字和粤拼。";
    return;
  }
  completeDailyTask("phrase", "完成了今天的校园粤语任务");
  playSpeechPlan({
    id: `campus-${phrase.id}`,
    plan: createSpeechPlan(phrase.spoken),
    button,
    highlight: () => highlight,
    onError: () => { $("#campus-status").textContent = "校园短句朗读没有成功，请检查设备的粤语声音。"; },
  });
}

function renderCampusFilters() {
  const filters = $("#campus-filters");
  filters.replaceChildren();
  [{ id: "all", label: "全部" }, ...campusCategories].forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = category.label;
    button.classList.toggle("active", campusCategory === category.id);
    button.setAttribute("aria-pressed", String(campusCategory === category.id));
    button.addEventListener("click", () => {
      campusCategory = category.id;
      renderCampusFilters();
      renderCampusPhrases();
    });
    filters.append(button);
  });
}

function renderCampusPhrases() {
  const list = $("#campus-phrase-list");
  list.replaceChildren();
  const phrases = campusCategory === "all" ? campusPhrases : campusPhrases.filter((phrase) => phrase.category === campusCategory);
  phrases.forEach((phrase) => {
    const card = document.createElement("article");
    card.className = "campus-phrase-card";
    card.dataset.phraseId = phrase.id;
    const category = campusCategories.find((item) => item.id === phrase.category)?.label ?? "校园";
    const tag = document.createElement("span");
    tag.className = "campus-category";
    tag.textContent = category;
    const simplified = document.createElement("p");
    simplified.className = "campus-simplified";
    simplified.textContent = phrase.simplified;
    const spoken = document.createElement("h3");
    spoken.textContent = phrase.spoken;
    const written = document.createElement("p");
    written.className = "campus-written";
    written.textContent = `书面语：${phrase.written}`;
    const actions = document.createElement("div");
    actions.className = "campus-card-actions";
    const play = document.createElement("button");
    play.type = "button";
    play.dataset.speechAction = "true";
    play.dataset.requiresVoice = "true";
    play.dataset.idleLabel = "听口语";
    play.disabled = !cantoneseVoice;
    setSpeakButtonState(play, false);
    play.addEventListener("click", () => speakCampusPhrase(phrase, play, card));
    const reveal = document.createElement("button");
    reveal.type = "button";
    reveal.textContent = "看粤拼";
    const pronunciation = document.createElement("div");
    pronunciation.className = "campus-pronunciation";
    pronunciation.hidden = true;
    reveal.addEventListener("click", () => revealPhraseJyutping(phrase, pronunciation, reveal));
    actions.append(play, reveal);
    card.append(tag, simplified, spoken, written, actions, pronunciation);
    list.append(card);
  });
}

function renderWordbook() {
  const list = $("#wordbook-list");
  if (!list) return;
  $("#wordbook-count").textContent = `${learningState.words.length} 个词`;
  list.replaceChildren();
  if (learningState.words.length === 0) {
    const empty = document.createElement("p");
    empty.className = "shelf-empty";
    empty.textContent = "还没有生词。试试点击繁体和粤拼旁边的 ☆。";
    list.append(empty);
    return;
  }
  learningState.words.forEach((word) => {
    const card = document.createElement("article");
    card.className = `word-card ${word.mastered ? "mastered" : ""}`;
    const main = document.createElement("div");
    const heading = document.createElement("h3");
    heading.textContent = word.text;
    const reading = document.createElement("p");
    reading.className = "word-reading";
    reading.textContent = word.jyutping.join(" ");
    const sourceText = document.createElement("p");
    sourceText.className = "word-source";
    sourceText.textContent = word.source ? `来自：${word.source}` : "来自学习内容";
    main.append(heading, reading, sourceText);
    const actions = document.createElement("div");
    actions.className = "word-actions";
    const play = document.createElement("button");
    play.type = "button";
    play.dataset.speechAction = "true";
    play.dataset.requiresVoice = "true";
    play.dataset.idleLabel = "听读音";
    play.disabled = !cantoneseVoice;
    setSpeakButtonState(play, false);
    play.addEventListener("click", () => playSpeechPlan({
      id: `word-${learningWordKey(word)}`,
      plan: createSpeechPlan(word.text),
      button: play,
      highlight: () => card,
      onError: () => showLearningToast("生词朗读没有成功。"),
    }));
    const mastered = document.createElement("button");
    mastered.type = "button";
    mastered.textContent = word.mastered ? "还要复习" : "我会了";
    mastered.addEventListener("click", () => {
      saveLearningState(setWordMastered(learningState, learningWordKey(word), !word.mastered));
      if (!word.mastered) completeDailyTask("words", "完成了今天的生词复习");
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger-text";
    remove.textContent = "移除";
    remove.addEventListener("click", () => saveLearningState(removeLearningWord(learningState, learningWordKey(word))));
    actions.append(play, mastered, remove);
    card.append(main, actions);
    list.append(card);
  });
}

function formatStoredDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function renderHistory() {
  const list = $("#conversion-history-list");
  if (!list) return;
  list.replaceChildren();
  if (learningState.history.length === 0) {
    const empty = document.createElement("p");
    empty.className = "shelf-empty";
    empty.textContent = "完成一次文字转换后，记录会出现在这里。";
    list.append(empty);
    return;
  }
  learningState.history.forEach((item) => {
    const card = document.createElement("article");
    card.className = "history-card";
    const content = document.createElement("div");
    const meta = document.createElement("span");
    meta.textContent = `${item.expression === "colloquial" ? "香港口语" : "书面语"} · ${formatStoredDate(item.createdAt)}`;
    const sourceText = document.createElement("h3");
    sourceText.textContent = item.sourceText;
    const converted = document.createElement("p");
    converted.textContent = item.convertedText;
    content.append(meta, sourceText, converted);
    const actions = document.createElement("div");
    const reopen = document.createElement("button");
    reopen.type = "button";
    reopen.textContent = "重新学习";
    reopen.addEventListener("click", async () => {
      selectExpression(item.expression);
      source.value = item.sourceText;
      updateInputState();
      await convert();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger-text";
    remove.textContent = "删除";
    remove.addEventListener("click", () => saveLearningState(removeHistoryItem(learningState, item.id)));
    actions.append(reopen, remove);
    card.append(content, actions);
    list.append(card);
  });
}

function renderDailyPlan() {
  const date = hongKongDate();
  const progress = learningState.daily[date] ?? {};
  $("#learning-streak").textContent = String(learningStreak(learningState, date));
  document.querySelectorAll("[data-daily-link]").forEach((button) => {
    const completed = Boolean(progress[button.dataset.dailyLink]);
    button.classList.toggle("completed", completed);
    button.querySelector("span").textContent = completed ? "✓" : "○";
  });
  const phrase = phraseForDate(date);
  $("#daily-phrase-simplified").textContent = phrase.simplified;
  $("#daily-phrase-spoken").textContent = phrase.spoken;
  const markRead = $("#mark-news-read");
  markRead.textContent = progress.news ? "今日已读 ✓" : "标记已读";
  markRead.disabled = Boolean(progress.news) || !activeNews;
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
    segment.tokens.forEach((token) => tokens.append(renderToken(token, { source: segment.text, sourceType: "conversion", practice: true })));
    const footer = document.createElement("div");
    footer.className = "sentence-footer";
    const play = document.createElement("button");
    play.className = "speak-button";
    play.type = "button";
    play.dataset.speechAction = "true";
    play.dataset.idleLabel = "播放本句";
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
  results.classList.toggle("jyutping-hidden", jyutpingHidden);
  updateWordSaveButtons();
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
    saveLearningState(addHistoryItem(learningState, {
      id: body.requestId,
      expression: body.expression,
      sourceText: body.sourceText,
      convertedText: body.convertedText,
    }));
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
$("#mark-news-read").addEventListener("click", () => completeDailyTask("news", "完成了今天的新闻阅读任务"));
$("#speech-repeat").addEventListener("change", (event) => {
  speechRepeat = Number(event.target.value) === 3 ? 3 : 1;
  stopSpeaking();
});
$("#toggle-jyutping").addEventListener("click", () => {
  jyutpingHidden = !jyutpingHidden;
  results.classList.toggle("jyutping-hidden", jyutpingHidden);
  if (jyutpingHidden) document.querySelectorAll(".practice-token").forEach((token) => token.classList.remove("revealed"));
  $("#toggle-jyutping").textContent = jyutpingHidden ? "显示全部粤拼" : "隐藏粤拼";
  $("#toggle-jyutping").setAttribute("aria-pressed", String(jyutpingHidden));
});
$("#daily-phrase-speak").addEventListener("click", () => {
  const phrase = phraseForDate(hongKongDate());
  speakCampusPhrase(phrase, $("#daily-phrase-speak"), document.querySelector(".daily-phrase-card"));
});
$("#daily-phrase-jyutping-button").addEventListener("click", () => {
  const phrase = phraseForDate(hongKongDate());
  revealPhraseJyutping(phrase, $("#daily-phrase-jyutping"), $("#daily-phrase-jyutping-button"));
});
document.querySelectorAll("[data-daily-link]").forEach((button) => button.addEventListener("click", () => {
  const targets = { news: ".daily-news", phrase: ".daily-phrase-card", words: "#wordbook" };
  document.querySelector(targets[button.dataset.dailyLink])?.scrollIntoView({ behavior: "smooth", block: "start" });
}));
$("#clear-wordbook").addEventListener("click", () => {
  if (!learningState.words.length || !window.confirm("确定清空全部生词吗？")) return;
  saveLearningState({ ...learningState, words: [] });
});
$("#clear-history").addEventListener("click", () => {
  if (!learningState.history.length || !window.confirm("确定清空全部转换记录吗？")) return;
  saveLearningState({ ...learningState, history: [] });
});
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
renderCampusFilters();
renderCampusPhrases();
renderWordbook();
renderHistory();
renderDailyPlan();
refreshVoice();
loadNews();
window.speechSynthesis?.addEventListener("voiceschanged", refreshVoice);
window.addEventListener("pagehide", stopSpeaking);
