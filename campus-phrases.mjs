export const campusCategories = [
  { id: "classroom", label: "课堂" },
  { id: "homework", label: "功课与测验" },
  { id: "break", label: "小息与设施" },
  { id: "friends", label: "同学交流" },
  { id: "school", label: "校务与活动" },
];

export const campusPhrases = [
  { id: "class-01", category: "classroom", simplified: "请翻到课本第十五页。", written: "請翻到課本第十五頁。", spoken: "唔該揭到課本第十五頁。" },
  { id: "class-02", category: "classroom", simplified: "老师，可以再说一次吗？", written: "老師，可以再說一次嗎？", spoken: "老師，可唔可以再講一次呀？" },
  { id: "class-03", category: "classroom", simplified: "我听不懂这道题。", written: "我聽不懂這道題。", spoken: "我聽唔明呢題。" },
  { id: "class-04", category: "classroom", simplified: "老师，我可以去洗手间吗？", written: "老師，我可以去洗手間嗎？", spoken: "老師，我可唔可以去洗手間呀？" },
  { id: "class-05", category: "classroom", simplified: "请和旁边的同学讨论。", written: "請和旁邊的同學討論。", spoken: "請同隔籬同學討論。" },
  { id: "class-06", category: "classroom", simplified: "今天要分组吗？", written: "今天要分組嗎？", spoken: "今日係咪要分組呀？" },
  { id: "class-07", category: "classroom", simplified: "现在要抄下来吗？", written: "現在要抄下來嗎？", spoken: "而家要唔要抄低呀？" },
  { id: "class-08", category: "classroom", simplified: "答案要写在哪里？", written: "答案要寫在哪裡？", spoken: "答案要寫喺邊度呀？" },
  { id: "work-01", category: "homework", simplified: "今天有什么作业？", written: "今天有甚麼功課？", spoken: "今日有咩功課呀？" },
  { id: "work-02", category: "homework", simplified: "这份作业什么时候交？", written: "這份功課甚麼時候交？", spoken: "呢份功課幾時交呀？" },
  { id: "work-03", category: "homework", simplified: "我忘记带作业了。", written: "我忘記帶功課了。", spoken: "我唔記得帶功課呀。" },
  { id: "work-04", category: "homework", simplified: "这张通告要家长签名吗？", written: "這張通告要家長簽名嗎？", spoken: "呢張通告係咪要家長簽名呀？" },
  { id: "work-05", category: "homework", simplified: "明天要默书吗？", written: "明天要默書嗎？", spoken: "聽日係咪要默書呀？" },
  { id: "work-06", category: "homework", simplified: "测验考到哪一课？", written: "測驗考到哪一課？", spoken: "測驗考到第幾課呀？" },
  { id: "break-01", category: "break", simplified: "小卖部在哪里？", written: "小食部在哪裡？", spoken: "小食部喺邊度呀？" },
  { id: "break-02", category: "break", simplified: "我可以借一支笔吗？", written: "我可以借一支筆嗎？", spoken: "可唔可以借支筆畀我呀？" },
  { id: "break-03", category: "break", simplified: "这里有人坐吗？", written: "這裡有人坐嗎？", spoken: "呢度有冇人坐呀？" },
  { id: "break-04", category: "break", simplified: "我可以一起玩吗？", written: "我可以一起玩嗎？", spoken: "我可唔可以一齊玩呀？" },
  { id: "break-05", category: "break", simplified: "礼堂怎么走？", written: "禮堂怎樣走？", spoken: "禮堂點行呀？" },
  { id: "friends-01", category: "friends", simplified: "我是刚转来的。", written: "我是剛轉來的。", spoken: "我係啱啱轉校過嚟㗎。" },
  { id: "friends-02", category: "friends", simplified: "你叫什么名字？", written: "你叫甚麼名字？", spoken: "你叫咩名呀？" },
  { id: "friends-03", category: "friends", simplified: "我们一起吃午饭吧。", written: "我們一起吃午飯吧。", spoken: "我哋一齊食晏啦。" },
  { id: "friends-04", category: "friends", simplified: "可以教我怎么做吗？", written: "可以教我怎樣做嗎？", spoken: "可唔可以教我點做呀？" },
  { id: "friends-05", category: "friends", simplified: "这句话用粤语怎么说？", written: "這句話用粵語怎樣說？", spoken: "呢句用廣東話點講呀？" },
  { id: "school-01", category: "school", simplified: "校务处在哪里？", written: "校務處在哪裡？", spoken: "校務處喺邊度呀？" },
  { id: "school-02", category: "school", simplified: "请问这张表交到哪里？", written: "請問這張表交到哪裡？", spoken: "請問呢張表要交去邊度呀？" },
  { id: "school-03", category: "school", simplified: "我的学生证不见了。", written: "我的學生證不見了。", spoken: "我張學生證唔見咗。" },
  { id: "school-04", category: "school", simplified: "明天要穿体育服吗？", written: "明天要穿體育服嗎？", spoken: "聽日係咪要着體育服呀？" },
  { id: "school-05", category: "school", simplified: "活动几点集合？", written: "活動幾點集合？", spoken: "活動幾點集合呀？" },
];

export function phraseForDate(date) {
  const seed = String(date).replace(/\D/gu, "").split("").reduce((total, digit) => total + Number(digit), 0);
  return campusPhrases[seed % campusPhrases.length];
}
