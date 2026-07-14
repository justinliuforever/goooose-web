// Beta survey question set — shared by the /apply stepper, the server-side zod
// check, and the admin summary. Editing questions: bump SURVEY_VERSION, never the DB.

export const SURVEY_VERSION = 1;

export type SurveyQuestion = {
  id: string;
  type: "single" | "multi" | "text";
  title: string;
  hint?: string;
  options?: string[];
  // Renders an "其他" choice with an inline input, stored as `${id}_other`.
  allowOther?: boolean;
  required?: boolean;
};

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    id: "platform",
    type: "single",
    title: "你主要在哪个平台做内容？",
    options: ["小红书", "抖音", "B站", "YouTube", "视频号", "多平台都发", "还没开始，准备起号"],
    required: true,
  },
  {
    id: "category",
    type: "single",
    title: "你的内容方向？",
    options: ["知识科普 · 教程", "生活方式 · vlog", "测评 · 种草", "剧情 · 娱乐", "商业IP · 个人品牌"],
    allowOther: true,
    required: true,
  },
  {
    id: "followers",
    type: "single",
    title: "现在的粉丝量级？",
    options: ["还没发布", "1千以下", "1千 - 1万", "1万 - 10万", "10万以上"],
    required: true,
  },
  {
    id: "cadence",
    type: "single",
    title: "更新节奏？",
    options: ["每周 3 条以上", "每周 1-2 条", "偶尔更，想稳定下来", "还没开始更"],
    required: true,
  },
  {
    id: "pains",
    type: "multi",
    title: "这些环节，哪些是你真的卡过、烦过的？",
    hint: "可多选，也可以全不选",
    options: [
      "不知道拍什么，选题靠灵光一现",
      "看了很多对标账号，学不出人家的套路",
      "写脚本太慢，一条稿磨几小时",
      "AI 写的稿一股机器味，不敢直接用",
      "数据不稳定，爆过一次再也复制不了",
      "以上基本没遇到",
    ],
    allowOther: true,
  },
  {
    id: "tools",
    type: "multi",
    title: "你现在用什么辅助创作？",
    options: ["ChatGPT · DeepSeek 等直接对话", "剪映等成片工具", "基本纯手工"],
    allowOther: true,
    required: true,
  },
  {
    id: "commitment",
    type: "single",
    title: "拿到内测资格后，你的参与程度大概是？",
    hint: "这决定我们优先把名额给谁",
    options: [
      "我只是好奇看看",
      "会认真试用，顺手给反馈",
      "愿意深度共创，持续反馈 + 访谈",
    ],
    required: true,
  },
  {
    id: "wish",
    type: "text",
    title: "最希望搬砖小鹅帮你解决的一件事？",
    hint: "选填，一句话就行",
  },
];

// Admin list shows these inline; the rest appear in the expanded view.
export const SUMMARY_QUESTION_IDS = ["platform", "followers", "commitment"];

export function questionTitle(id: string): string {
  const base = id.endsWith("_other") ? id.slice(0, -"_other".length) : id;
  const q = SURVEY_QUESTIONS.find((x) => x.id === base);
  if (!q) return id;
  return id.endsWith("_other") ? `${q.title}（其他）` : q.title;
}
