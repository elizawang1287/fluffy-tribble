const rule = (id, from, to, description) => ({ id, from, to, description });

// These rules intentionally cover only common, dependable school and daily
// expressions. Unmatched text stays in written Chinese instead of being
// rewritten speculatively.
export const colloquialRules = [
  rule("question_have", "有沒有", "有冇", "常用疑问句"),
  rule("question_copula", "是不是", "係咪", "常用疑问句"),
  rule("question_why_hk", "為甚麼", "點解", "常用疑问词"),
  rule("question_why", "為什麼", "點解", "常用疑问词"),
  rule("question_what_hk", "甚麼", "乜嘢", "常用疑问词"),
  rule("question_what", "什麼", "乜嘢", "常用疑问词"),
  rule("question_where_hk", "哪裏", "邊度", "常用疑问词"),
  rule("question_where", "哪裡", "邊度", "常用疑问词"),
  rule("question_where_er", "哪兒", "邊度", "常用疑问词"),
  rule("question_how", "怎麼", "點樣", "常用疑问词"),
  rule("place_here", "這裏", "呢度", "常用地点说法"),
  rule("place_here_variant", "這裡", "呢度", "常用地点说法"),
  rule("place_there", "那裏", "嗰度", "常用地点说法"),
  rule("place_there_variant", "那裡", "嗰度", "常用地点说法"),
  rule("demonstrative_this", "這個", "呢個", "常用指示词"),
  rule("demonstrative_that", "那個", "嗰個", "常用指示词"),

  rule("pronoun_we", "我們", "我哋", "人称代词"),
  rule("pronoun_you_plural", "你們", "你哋", "人称代词"),
  rule("pronoun_they", "他們", "佢哋", "人称代词"),
  rule("pronoun_they_female", "她們", "佢哋", "人称代词"),
  rule("pronoun_they_neutral", "它們", "佢哋", "人称代词"),
  rule("possessive_mine", "我的", "我嘅", "所属表达"),
  rule("possessive_yours", "你的", "你嘅", "所属表达"),
  rule("possessive_his", "他的", "佢嘅", "所属表达"),
  rule("possessive_hers", "她的", "佢嘅", "所属表达"),
  rule("possessive_teacher", "老師的", "老師嘅", "所属表达"),
  rule("possessive_classmate", "同學的", "同學嘅", "所属表达"),

  rule("time_now", "現在", "而家", "常用时间说法"),
  rule("time_today", "今天", "今日", "常用时间说法"),
  rule("time_tomorrow", "明天", "聽日", "常用时间说法"),
  rule("time_yesterday", "昨天", "尋日", "常用时间说法"),
  rule("time_just_now", "剛才", "頭先", "常用时间说法"),

  rule("negation_not_copula", "不是", "唔係", "否定表达"),
  rule("negation_he_not_here", "他不在", "佢唔喺", "人称及否定表达"),
  rule("negation_she_not_here", "她不在", "佢唔喺", "人称及否定表达"),
  rule("negation_not_have", "沒有", "冇", "否定表达"),
  rule("negation_not_here", "不在", "唔喺", "否定表达"),
  rule("negation_do_not", "不要", "唔好", "否定表达"),
  rule("negation_dont_know", "不知道", "唔知", "否定表达"),
  rule("negation_cannot", "不可以", "唔可以", "否定表达"),
  rule("negation_will_not", "不會", "唔會", "否定表达"),
  rule("negation_dont_want", "不想", "唔想", "否定表达"),
  rule("copula_but", "但是", "但係", "常用连接词"),
  rule("copula_only", "只是", "只係", "常用判断句"),
  rule("copula_then", "就是", "就係", "常用判断句"),
  rule("copula_i", "我是", "我係", "常用判断句"),
  rule("copula_you", "你是", "你係", "常用判断句"),
  rule("copula_he", "他是", "佢係", "常用判断句"),
  rule("copula_she", "她是", "佢係", "常用判断句"),
  rule("copula_this", "這是", "呢個係", "常用判断句"),
  rule("copula_that", "那是", "嗰個係", "常用判断句"),
  rule("possessive_new", "新的", "新嘅", "常用所属表达"),
  rule("possessive_good", "好的", "好嘅", "常用所属表达"),
  rule("possessive_important", "重要的", "重要嘅", "常用所属表达"),
  rule("possessive_school", "學校的", "學校嘅", "常用所属表达"),

  rule("location_school", "在學校", "喺學校", "常用地点表达"),
  rule("location_library", "在圖書館", "喺圖書館", "常用地点表达"),
  rule("location_classroom", "在課室", "喺課室", "常用地点表达"),
  rule("location_classroom_cn", "在教室", "喺課室", "常用地点表达"),
  rule("location_playground", "在操場", "喺操場", "常用地点表达"),
  rule("location_home", "在家", "喺屋企", "常用地点表达"),

  rule("verb_speak_words", "説話", "講嘢", "常用动词"),
  rule("verb_know", "知道", "知", "常用动词"),
  rule("verb_like", "喜歡", "鍾意", "常用动词"),
  rule("verb_see", "看見", "見到", "常用动词"),
  rule("verb_eat_meal", "吃飯", "食飯", "常用动词"),
  rule("verb_go_home", "回家", "返屋企", "常用动词"),
  rule("verb_say", "説", "講", "常用动词"),
  rule("verb_look", "看", "睇", "常用动词"),
  rule("verb_eat", "吃", "食", "常用动词"),

  rule("school_homework", "作業", "功課", "校园常用词"),
  rule("school_class_start", "上課", "上堂", "校园常用词"),
  rule("school_class_end", "下課", "落堂", "校园常用词"),
  rule("school_classroom", "教室", "課室", "校园常用词"),
].sort((left, right) => Array.from(right.from).length - Array.from(left.from).length);

export const colloquialTerms = [...new Set(colloquialRules.map(({ to }) => to))]
  .filter((term) => Array.from(term).length > 1)
  .sort((left, right) => Array.from(right).length - Array.from(left).length);

export function applyColloquialRules(text) {
  const characters = Array.from(text);
  const output = [];
  const changes = [];
  let index = 0;

  while (index < characters.length) {
    const remainingText = characters.slice(index).join("");
    const matchedRule = colloquialRules.find(({ from }) => remainingText.startsWith(from));
    if (!matchedRule) {
      output.push(characters[index]);
      index += 1;
      continue;
    }

    output.push(matchedRule.to);
    changes.push({
      from: matchedRule.from,
      to: matchedRule.to,
      rule: matchedRule.id,
      description: matchedRule.description,
    });
    index += Array.from(matchedRule.from).length;
  }

  return { text: output.join(""), changes };
}
