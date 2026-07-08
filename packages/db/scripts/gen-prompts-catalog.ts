// Generates notes/prompts_catalog.md by rendering every prompt builder with
// placeholder args, so the catalog is always in sync with the code.
// Run: pnpm --filter @goooose/db exec tsx scripts/gen-prompts-catalog.ts
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildVideoAnalysisPrompt,
  buildVideoMapSummaryPrompt,
  buildSopPartialReducePrompt,
  buildHumanSopPrompt,
  buildAiSopReferencePrompt,
  buildHottestSopPrompt,
} from "@goooose/prompts/clerk";
import { buildCommentsSummaryPrompt } from "@goooose/prompts/clerk-comments";
import { buildSeriesDetectPrompt } from "@goooose/prompts/clerk-series";
import {
  buildClassificationPrompt,
  buildViralTriggerPrompt,
  buildIdeaGenerationPrompt,
} from "@goooose/prompts/muse";
import {
  buildChannelBiblePrompt,
  buildBibleFromDocumentPrompt,
  buildScriptWritingPrompt,
  buildLongFormOutlinePrompt,
  buildSectionExpandPrompt,
  buildTopicAnalysisPrompt,
  buildFactCheckPrompt,
  buildChineseHumanizerPrompt,
  buildScriptCompressPrompt,
  buildScriptExpandPrompt,
} from "@goooose/prompts/poet";

type Entry = {
  fn: string;
  title: string;
  model: string;
  source: string;
  flow: string;
  purpose: string;
  note?: string;
  render: () => string;
};

const P = {
  channelName: "{{频道名}}",
  channelDesc: "{{本频道定位/简介}}",
  videoTitle: "{{视频标题}}",
  competitorTitle: "{{竞品视频标题}}",
  competitorChannel: "{{竞品频道名}}",
  thumbnail: "{{封面图 URL}}",
  url: "{{视频 URL}}",
  transcript: "{{视频文字稿（带 [mm:ss] 时间戳）}}",
  transcriptPreview: "{{文字稿前段（约 2000 字）}}",
  videosData: "{{各视频拆解小结（map 步产出）}}",
  analysisSummary: "{{该视频的结构化分析摘要}}",
  docTranscript: "{{人设文档的忠实转写（Claude 视觉转写产出）}}",
  commentsSummary: "{{热门评论总结}}",
  date: "{{生成日期}}",
  ideaText: "{{选题想法}}",
  viralTrigger: "{{爆款触发点}}",
  references: "{{参考资料（竞品文字稿 / 笔记等）}}",
  verbatimFacts: "{{原文事实（保留原语言，逐字）}}",
  bible: "{{频道圣经}}",
  sop: "{{AI 参考 SOP}}",
  topic: "{{用户填写的选题}}",
  sourceTitle: "{{来源视频标题}}",
  sourceChannel: "{{来源频道名}}",
  scriptText: "{{AI 初稿（中文）}}",
  marker: "{{段落标记，如 [HOOK]}}",
  keyPoints: "{{本段要点列表}}",
  overallArc: "{{整体情绪弧线}}",
  outlineSummary: "{{大纲全貌}}",
  prevTail: "{{上一段结尾}}",
  emotionalNote: "{{本段语气/能量}}",
} as const;

const lang = "zh" as const;

const entries: Entry[] = [
  // ── Clerk ──────────────────────────────────────────────────────────────
  {
    fn: "buildVideoAnalysisPrompt",
    title: "逐条视频 / 笔记拆解",
    model: "DeepSeek Pro（截断 / 空输出时用 Flash 重试一次）",
    source: "../packages/prompts/src/clerk.ts#L104",
    flow: "Clerk 1.2 · 步骤 3.2",
    purpose: "把单条视频的文字稿 + 元数据拆成结构化「爆款 DNA」（钩子 / 框架 / 节奏 / 选题角度，带 [mm:ss] 引用）。",
    note: "展示 YouTube 视频版（中文）。小红书图文 / 视频会在最前面加一段说明；章节、赞助片段等可选段落有则插入。",
    render: () =>
      buildVideoAnalysisPrompt({
        title: P.videoTitle,
        views: 1_000_000,
        durationSec: 510,
        thumbnailUrl: P.thumbnail,
        transcript: P.transcript,
        contentType: "video",
        language: lang,
      }),
  },
  {
    fn: "buildVideoMapSummaryPrompt",
    title: "单视频拆解小结（SOP map 步）",
    model: "DeepSeek Flash",
    source: "../packages/prompts/src/clerk.ts#L209",
    flow: "Clerk 1.2 · 步骤 5（map）",
    purpose: "把单条视频的拆解压缩成一份可复用的「打法小结」，后续 SOP 在小结之上归并（控制上下文规模）；结果缓存在库里，增量分析不重算。",
    note: "无文字稿 / 转写乱码时按「无文字稿」处理，禁止引用台词或编时间码。",
    render: () =>
      buildVideoMapSummaryPrompt({
        title: P.videoTitle,
        views: 1_000_000,
        durationSec: 510,
        contentType: "video",
        transcript: P.transcript,
        analysis: P.analysisSummary,
        language: lang,
      }),
  },
  {
    fn: "buildSopPartialReducePrompt",
    title: "SOP 分批归并（partial reduce）",
    model: "DeepSeek Pro",
    source: "../packages/prompts/src/clerk.ts#L273",
    flow: "Clerk 1.2 · 步骤 5（reduce）",
    purpose: "把一批视频的拆解小结归并成一份「部分套路集」；各批结果拼接后再喂给三份 SOP 的最终合成。",
    render: () =>
      buildSopPartialReducePrompt({
        videosData: P.videosData,
        language: lang,
      }),
  },
  {
    fn: "buildHumanSopPrompt",
    title: "真人版 SOP（创作者手册）",
    model: "DeepSeek Pro",
    source: "../packages/prompts/src/clerk.ts#L318",
    flow: "Clerk 1.2 · 步骤 5",
    purpose: "把所有视频拆解汇总成给创作者本人看的创作手册（内容支柱 / 品牌嗓音 / 观众旅程 / 写作清单等）。",
    note: "中文 / 英文由 language 控制，此处中文版。输入为 map/reduce 后的小结汇总，不是原始文字稿。",
    render: () =>
      buildHumanSopPrompt({
        channelName: P.channelName,
        videoCount: 20,
        totalViews: 5_000_000,
        date: P.date,
        videosData: P.videosData,
        language: lang,
      }),
  },
  {
    fn: "buildAiSopReferencePrompt",
    title: "AI 参考版 SOP",
    model: "DeepSeek Pro",
    source: "../packages/prompts/src/clerk.ts#L398",
    flow: "Clerk 1.2 · 步骤 5",
    purpose: "把汇总拆解整理成给 Poet 写稿 AI 读的结构化参考。",
    note: "强制英文输出（供 AI 阅读，不给终端用户看），与 language 无关。",
    render: () =>
      buildAiSopReferencePrompt({
        channelName: P.channelName,
        videoCount: 20,
        totalViews: 5_000_000,
        date: P.date,
        videosData: P.videosData,
        language: lang,
      }),
  },
  {
    fn: "buildHottestSopPrompt",
    title: "爆款版 SOP（最高播放深拆）",
    model: "DeepSeek Pro",
    source: "../packages/prompts/src/clerk.ts#L501",
    flow: "Clerk 1.2 · 步骤 5",
    purpose: "对播放量第一的视频做逐段深拆，提炼可复用套路；可叠加热门评论总结。",
    note: "中文 / 英文由 language 控制。评论总结为可选输入。「单视频 SOP」（clerk-analyze-single-video 任务）复用本 prompt。",
    render: () =>
      buildHottestSopPrompt({
        channelName: P.channelName,
        title: P.videoTitle,
        views: 1_000_000,
        durationSec: 510,
        url: P.url,
        transcript: P.transcript,
        analysisSummary: P.analysisSummary,
        commentsSummary: P.commentsSummary,
        language: lang,
      }),
  },
  {
    fn: "buildCommentsSummaryPrompt",
    title: "热门评论总结",
    model: "DeepSeek Flash",
    source: "../packages/prompts/src/clerk-comments.ts#L7",
    flow: "Clerk 1.2 · 步骤 4",
    purpose: "把播放量第一视频的热门评论总结成观众反馈，喂给爆款版 SOP。",
    render: () =>
      buildCommentsSummaryPrompt({
        videoTitle: P.videoTitle,
        comments: [
          { text: "{{评论内容 1}}", likes: 1200 },
          { text: "{{评论内容 2}}", likes: 340 },
        ],
        language: lang,
      }),
  },
  {
    fn: "buildSeriesDetectPrompt",
    title: "系列栏目检测",
    model: "DeepSeek Flash（空结果回退 Pro）",
    source: "../packages/prompts/src/clerk-series.ts#L7",
    flow: "Clerk 1.4（独立按钮）",
    purpose: "从视频标题 + 时长 + 播放量聚类，判断频道是否有固定系列栏目。",
    render: () =>
      buildSeriesDetectPrompt({
        channelName: P.channelName,
        videos: [
          { title: "{{视频标题 1}}", duration_sec: 600, views: 120000 },
          { title: "{{视频标题 2}}", duration_sec: 90, views: 45000 },
          { title: "{{视频标题 3}}", duration_sec: 720, views: 88000 },
        ],
        language: lang,
      }),
  },
  // ── Muse ───────────────────────────────────────────────────────────────
  {
    fn: "buildClassificationPrompt",
    title: "竞品相关性判断",
    model: "DeepSeek Flash",
    source: "../packages/prompts/src/muse.ts#L15",
    flow: "Muse 2.2 · 步骤 4",
    purpose: "判断竞品视频有没有可迁移的爆款机制（看钩子 / 情绪 / 叙事结构，不是题材是否相同）。",
    render: () =>
      buildClassificationPrompt({
        channelDescription: P.channelDesc,
        title: P.competitorTitle,
        channelName: P.competitorChannel,
        views: 1_000_000,
        durationSec: 510,
        transcriptPreview: P.transcriptPreview,
        language: lang,
      }),
  },
  {
    fn: "buildViralTriggerPrompt",
    title: "爆款触发器提炼",
    model: "DeepSeek Pro（空输出回退 Flash）",
    source: "../packages/prompts/src/muse.ts#L63",
    flow: "Muse 2.2 · 步骤 5",
    purpose: "读完整文字稿，提炼「点击 / 观看 / 转发」三类触发点。",
    render: () =>
      buildViralTriggerPrompt({
        channelDescription: P.channelDesc,
        title: P.competitorTitle,
        channelName: P.competitorChannel,
        views: 1_000_000,
        durationSec: 510,
        transcript: P.transcript,
        language: lang,
      }),
  },
  {
    fn: "buildIdeaGenerationPrompt",
    title: "选题生成",
    model: "DeepSeek Pro（空输出回退 Flash）",
    source: "../packages/prompts/src/muse.ts#L107",
    flow: "Muse 2.2 · 步骤 6",
    purpose: "基于触发器，为本频道生成 N 条选题（故事角度 / 事实数据 / 为何相似 / 封面概念 / 钩子类型 / 风险点）。",
    render: () =>
      buildIdeaGenerationPrompt({
        channelDescription: P.channelDesc,
        title: P.competitorTitle,
        channelName: P.competitorChannel,
        views: 1_000_000,
        viralTrigger: P.viralTrigger,
        numIdeas: 5,
        language: lang,
      }),
  },
  // ── Poet ───────────────────────────────────────────────────────────────
  {
    fn: "buildChannelBiblePrompt",
    title: "频道圣经生成",
    model: "DeepSeek Flash（流式）",
    source: "../packages/prompts/src/poet.ts#L14",
    flow: "Poet 3.1 · 步骤 2",
    purpose:
      "把频道想法固化成锚点化圣经：首行 TOPIC:（可选 HOST:）+ 9 个英文锚点章节（POSITIONING / PERSONA / AUDIENCE / CONTENT_PILLARS / CONTENT_RULES / METHODOLOGY / INFORMATION_SOURCES / TOPIC_FRAMEWORK / FACT_SHEET）。写稿 / 选题 / Muse 各自按需取节。",
    render: () =>
      buildChannelBiblePrompt({
        ideaText: P.ideaText,
        channelDescription: P.channelDesc,
        language: lang,
      }),
  },
  {
    fn: "buildBibleFromDocumentPrompt",
    title: "圣经文件导入（文档 → 圣经）",
    model: "DeepSeek Pro（空输出回退 Flash）",
    source: "../packages/prompts/src/poet.ts#L97",
    flow: "Poet 3.1b · 文件导入 · 步骤 2",
    purpose:
      "把用户上传的人设 / IP 文档的忠实转写重组为锚点化圣经；数字 / 专名必须逐字来自转写，生成后另跑数字审计（违规行删除并标记存疑）。",
    note: "上游的文档转写由 Claude Sonnet 4.6 完成（integrations/docTranscribe，模板不在 prompts 包，暂不收录本目录）。",
    render: () =>
      buildBibleFromDocumentPrompt({
        transcript: P.docTranscript,
        channelName: P.channelName,
        language: lang,
      }),
  },
  {
    fn: "buildTopicAnalysisPrompt",
    title: "选题分析",
    model: "DeepSeek Pro（空输出回退 Flash）",
    source: "../packages/prompts/src/poet.ts#L365",
    flow: "Poet 3.2 · 步骤 2",
    purpose:
      "把用户给的选题 + 参考拆成结构化选题（与 Muse 选题同构）。圣经只取无事实类章节（不取 PERSONA / METHODOLOGY，防张冠李戴）；导入圣经的已核实事实另走独立区块。",
    render: () =>
      buildTopicAnalysisPrompt({
        channelBible: P.bible,
        sopReference: P.sop,
        topic: P.topic,
        referencesContext: P.references,
        language: lang,
      }),
  },
  {
    fn: "buildScriptWritingPrompt",
    title: "短稿写作",
    model: "DeepSeek Pro",
    source: "../packages/prompts/src/poet.ts#L164",
    flow: "Poet 3.3 · 短稿步骤 1",
    purpose: "结合选题 + 圣经 + SOP，一次性写出完整短稿。",
    render: () =>
      buildScriptWritingPrompt({
        channelBible: P.bible,
        sopReference: P.sop,
        referencesContext: P.references,
        verbatimFactsContext: P.verbatimFacts,
        sourceTitle: P.sourceTitle,
        sourceChannel: P.sourceChannel,
        viralTrigger: P.viralTrigger,
        ideaText: P.ideaText,
        language: lang,
        targetWordCount: 1000,
      }),
  },
  {
    fn: "buildLongFormOutlinePrompt",
    title: "长稿大纲",
    model: "DeepSeek Pro",
    source: "../packages/prompts/src/poet.ts#L249",
    flow: "Poet 3.3 · 长稿步骤 1",
    purpose: "长稿先列大纲，按比例分配各段字数（钩子 / 铺垫 / 正文 / CTA / 高潮 / 收尾）。",
    render: () =>
      buildLongFormOutlinePrompt({
        sopReference: P.sop,
        referencesContext: P.references,
        ideaText: P.ideaText,
        viralTrigger: P.viralTrigger,
        targetWordCount: 3000,
        language: lang,
      }),
  },
  {
    fn: "buildSectionExpandPrompt",
    title: "长稿逐段扩写",
    model: "DeepSeek Pro（空输出时用 Flash 重试该段）",
    source: "../packages/prompts/src/poet.ts#L311",
    flow: "Poet 3.3 · 长稿步骤 2",
    purpose: "按大纲把每一段扩写成正文，逐段调用后拼接。",
    render: () =>
      buildSectionExpandPrompt({
        language: lang,
        sopReference: P.sop,
        referencesContext: P.references,
        verbatimFactsContext: P.verbatimFacts,
        overallArc: P.overallArc,
        outlineSummary: P.outlineSummary,
        prevTail: P.prevTail,
        marker: P.marker,
        keyPoints: P.keyPoints,
        targetCount: 300,
        emotionalNote: P.emotionalNote,
      }),
  },
  {
    fn: "buildFactCheckPrompt",
    title: "原文事实核查",
    model: "DeepSeek Pro（空输出回退 Flash）",
    source: "../packages/prompts/src/poet.ts#L435",
    flow: "Poet 3.2 · 步骤 3（写稿前亦复核）",
    purpose:
      "对参考里提取的原文事实逐条用世界知识分类 verified / disputed / unsupported——只标注不改写；disputed 的事实在写稿 prompt 里带 ⚠️ 提示。刻意保守：拿不准一律 verified，核查失败整体放行。",
    render: () =>
      buildFactCheckPrompt({
        items: [
          { index: 1, fact: "{{原文事实 1}}", src: "{{来源标题}}" },
          { index: 2, fact: "{{原文事实 2}}", src: "{{来源标题}}" },
        ],
        referenceTitles: ["{{参考标题 1}}", "{{参考标题 2}}"],
        language: lang,
      }),
  },
  {
    fn: "buildChineseHumanizerPrompt",
    title: "中文口语化改写",
    model: "DeepSeek Pro",
    source: "../packages/prompts/src/poet.ts#L475",
    flow: "Poet 3.3 · 口语化步骤",
    purpose: "把 AI 初稿改写成真人开口说话的口语。仅中文短稿运行；长稿与英文稿跳过。",
    render: () => buildChineseHumanizerPrompt(P.scriptText),
  },
  {
    fn: "buildScriptCompressPrompt",
    title: "长度门 · 超长压缩",
    model: "DeepSeek Pro（空输出回退 Flash）",
    source: "../packages/prompts/src/poet.ts#L512",
    flow: "Poet 3.3 · 长度门（最后一步）",
    purpose:
      "稿件超过目标 1.2× 时压缩进 0.85–1.2× 窗口：删冗余与复读、必要时整段删信息密度最低的中段；段落标记与数字逐字保留。",
    render: () =>
      buildScriptCompressPrompt({
        scriptText: P.scriptText,
        language: lang,
        targetWordCount: 1000,
      }),
  },
  {
    fn: "buildScriptExpandPrompt",
    title: "长度门 · 不足扩写",
    model: "DeepSeek Pro（空输出回退 Flash）",
    source: "../packages/prompts/src/poet.ts#L538",
    flow: "Poet 3.3 · 长度门（最后一步）",
    purpose:
      "稿件低于目标下限时扩写到 0.9–1.15×：只深化既有段落（细节 / 例子须来自参考资料），不加新段落、不复读、不编造。",
    render: () =>
      buildScriptExpandPrompt({
        scriptText: P.scriptText,
        language: lang,
        targetWordCount: 1000,
        referencesContext: P.references,
      }),
  },
];

const sections: Array<{ name: string; fns: string[] }> = [
  {
    name: "1. Clerk · 频道分析",
    fns: [
      "buildVideoAnalysisPrompt",
      "buildVideoMapSummaryPrompt",
      "buildSopPartialReducePrompt",
      "buildHumanSopPrompt",
      "buildAiSopReferencePrompt",
      "buildHottestSopPrompt",
      "buildCommentsSummaryPrompt",
      "buildSeriesDetectPrompt",
    ],
  },
  {
    name: "2. Muse · 竞品监控",
    fns: ["buildClassificationPrompt", "buildViralTriggerPrompt", "buildIdeaGenerationPrompt"],
  },
  {
    name: "3. Poet · 写稿",
    fns: [
      "buildChannelBiblePrompt",
      "buildBibleFromDocumentPrompt",
      "buildTopicAnalysisPrompt",
      "buildFactCheckPrompt",
      "buildScriptWritingPrompt",
      "buildLongFormOutlinePrompt",
      "buildSectionExpandPrompt",
      "buildChineseHumanizerPrompt",
      "buildScriptCompressPrompt",
      "buildScriptExpandPrompt",
    ],
  },
];

const byFn = new Map(entries.map((e) => [e.fn, e]));

function renderEntry(e: Entry): string {
  const meta = [
    `- 作用：${e.purpose}`,
    `- 模型：${e.model}`,
    `- 源码：[\`${e.fn}\`](${e.source})　·　流程：${e.flow}`,
  ];
  if (e.note) meta.push(`- 说明：${e.note}`);
  const body = e.render().trim();
  // Some prompt bodies contain their own ``` fences; pick an outer fence longer
  // than the longest backtick run inside so it can't be closed prematurely.
  const longestRun = Math.max(0, ...(body.match(/`+/g) ?? []).map((s) => s.length));
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `### ${e.fn} — ${e.title}\n\n${meta.join("\n")}\n\n${fence}text\n${body}\n${fence}\n`;
}

const parts: string[] = [];
parts.push(`# Goooose Prompt 目录（模板版）

> 本文列出三大模块（Clerk / Muse / Poet）用到的全部 prompt，按模块分节，配可点击源码链接。
> 与 [pipeline_flow.md](./pipeline_flow.md) 互补：那份讲「流程里哪一步用哪个 prompt」，本文讲「prompt 本身长什么样」。
>
> **占位符约定**：\`{{中文标签}}\` 表示运行时填入的变量；数量类字段（视频数、目标字数、时长、播放量等）以示例数值展示。
> 多数 prompt 的中文 / 英文输出由 \`language\` 参数控制，本文展示中文版（个别强制英文的已标注）。可选段落有内容时才插入。
>
> **本文为自动生成，请勿手改。** 改了 prompt 后重新生成：
> \`pnpm --filter @goooose/db exec tsx scripts/gen-prompts-catalog.ts\`
`);

for (const sec of sections) {
  parts.push(`\n---\n\n## ${sec.name}\n`);
  for (const fn of sec.fns) {
    const e = byFn.get(fn);
    if (!e) throw new Error(`Missing entry for ${fn}`);
    parts.push(renderEntry(e));
  }
}

const out = parts.join("\n");
const target = resolve(import.meta.dirname, "../../../notes/prompts_catalog.md");
writeFileSync(target, out, "utf8");
console.log(`Wrote ${target} (${entries.length} prompts, ${out.length} chars)`);
