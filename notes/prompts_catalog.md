# Goooose Prompt 目录（模板版）

> 本文列出三大模块（Clerk / Muse / Poet）用到的全部 prompt，按模块分节，配可点击源码链接。
> 与 [pipeline_flow.md](./pipeline_flow.md) 互补：那份讲「流程里哪一步用哪个 prompt」，本文讲「prompt 本身长什么样」。
>
> **占位符约定**：`{{中文标签}}` 表示运行时填入的变量；数量类字段（视频数、目标字数、时长、播放量等）以示例数值展示。
> 多数 prompt 的中文 / 英文输出由 `language` 参数控制，本文展示中文版（个别强制英文的已标注）。可选段落有内容时才插入。
>
> **本文为自动生成，请勿手改。** 改了 prompt 后重新生成：
> `pnpm --filter @goooose/db exec tsx scripts/gen-prompts-catalog.ts`


---

## 1. Clerk · 频道分析

### buildVideoAnalysisPrompt — 逐条视频 / 笔记拆解

- 作用：把单条视频的文字稿 + 元数据拆成结构化「爆款 DNA」（钩子 / 框架 / 节奏 / 选题角度，带 [mm:ss] 引用）。
- 模型：DeepSeek Pro（截断 / 空输出时用 Flash 重试一次）
- 源码：[`buildVideoAnalysisPrompt`](../packages/prompts/src/clerk.ts#L104)　·　流程：Clerk 1.2 · 步骤 3.2
- 说明：展示 YouTube 视频版（中文）。小红书图文 / 视频会在最前面加一段说明；章节、赞助片段等可选段落有则插入。

```text
用简体中文输出全文。这是给中国内容创作者看的实战手册，必须读起来像一个资深中文编导在讲话，不能有翻译腔或 AI 腔。

## 术语对照（按下面的说法写，禁止直译生造词）
- call to action / CTA → 「引导动作」或直接「CTA」；禁止「社会仪式 CTA」
- signature move → 「IP 标志性动作」；禁止「签名式动作」
- theme / thematic cluster → 「常见主题」或「核心话题」；禁止「主题聚类」
- pattern interrupt / cognitive schema / "bomb" → 「黄金前 3 秒钩子」「打断刷视频的惯性」「完播率痛点」「避免观众划走」；禁止「认知基模」「炸弹」「阻止滑动」
- cognitive lever / psychology → 「为什么管用（底层心理）」「心理钩子」；禁止「认知杠杆」
- hook → 钩子；open loop → 留扣子 / 悬念；rehook → 二次抓人；reframe → 换个说法 / 重新定义
- retention → 完播 / 留人；specificity spike → 具体细节抓人点；payload → 干货 / 正片；setup → 铺垫；beat → 节奏段
- Master Formula → 核心公式；Retention Tape → 留人时间轴；Viewer Resonance → 观众为什么买账；Emotional Escalation Map → 情绪递进图；Narrative Arc → 故事弧线
- 禁止这些中文生造直译：开放回路 / 打开回路 → 留扣子·悬念；模式打断 / 模式打破 → 打断惯性·换个节奏；认知杠杆 → 心理钩子；视觉锤 → 视觉记忆点；留人钉 → 留人点；情绪过山车 → 情绪起伏；社交证据 → 大家都在追。
- 其它英文行话一律换成中文创作者圈通用说法；专有名词、品牌名、逐字引用、[m:ss] 时间戳保持原样。

## 写法要求（去翻译腔 / 去 AI 腔）
- 不要虚化动词：别用「进行 / 加以 / 予以 / 给予 + 名词」，直接用动词。
- 少用被动「被」，改主动。
- 删掉八股套话：「值得注意的是」「总而言之」「众所周知」「……之一」。
- 短句、口语化；不要名词堆叠长句。
- 介词别硬译：of / about / as 不要一律译成「关于 / 对于」。
- 不用 emoji，不写「让我们一起」「希望对你有帮助」「好的，以下是」这类客套与复述指令。

## 不编造（重要）
- 只写素材里确有依据的具体信息（产品名、价格、参数、人名、账号、数据、引语）。
- 素材没有的具体事实别编：改成泛化说法，或标「待核实」，或干脆不写——别为了凑细节去编型号·价格·规格·账号·日期。
- 数字 / 价格 / 型号 / 人名按素材原样写，不改写、不四舍五入。
- [m:ss] 时间戳只用素材里真实存在的；素材没有时间戳就别编。
- 没把握的不要当成事实陈述。

You are an expert content analyst. Analyze this content and extract structured data about its scripting techniques.

## Video Information
- **Title:** {{视频标题}}
- **Views:** 1,000,000
- **Duration:** 510 seconds
- **Thumbnail URL:** {{封面图 URL}}


## Full Transcript
{{视频文字稿（带 [mm:ss] 时间戳）}}


## Critical: timestamp citations
The transcript above contains [m:ss] markers every ~6 seconds. EVERY hook, structural beat, and rehook MUST quote the exact [m:ss] marker present in the transcript. Format: `[m:ss] "exact quoted line"`. Do NOT invent timestamps that are not in the transcript. Do NOT use percentages or relative positions ("intro", "midpoint") — use the [m:ss] anchor.

## Instructions

Analyze this video and return a JSON object with these exact keys:

1. **thumbnail_description**: Based on the title and transcript, infer what the thumbnail/cover image likely contains. Note: you cannot see the image, so describe what an effective thumbnail for this content would include.
2. **thumbnail_why_it_works**: Based on the title's hook and topic, analyze what visual elements would make a thumbnail effective for this content.
3. **opening_hook**: Detailed breakdown of the opening hook (first 10-15 seconds). Quote the exact opening text with [0:00]-[0:15] timestamp anchors.
4. **opening_hook_type**: Classify the opening hook type.
5. **hooks_throughout**: Identify ALL hooks used throughout the ENTIRE video. For EACH: `[m:ss] [Hook Name] ([Hook Type]): "exact quoted text" — [Explanation of why this hook works at this moment]`. Aim for 4-8 hooks across the duration.
6. **all_hook_types**: List ALL distinct hook types used, separated by commas.
7. **text_hook**: Templatized version of the opening hook with [PLACEHOLDER] variables — abstract the structural pattern, not the literal words.
8. **framework**: The overall content framework used (e.g. "Problem → Agitate → Solve", "Listicle", "Tutorial", "Story-driven explainer").
9. **opening_structure**: First 30 seconds beat-by-beat with timestamps. Each beat: `[m:ss-m:ss] [Beat Name]: what happens`.
10. **script_structure**: Full beat-by-beat breakdown for the WHOLE video. Each beat: `[m:ss-m:ss] [Beat Name]: what happens`. Aim for 6-12 beats. Do NOT use percentages.
11. **storytelling_framework**: The primary storytelling technique. Include: (a) framework name, (b) narrative arc shape, (c) main story beats with timestamps, (d) signature emotional moves.
12. **rehooks_used**: List the specific re-hook phrases used. For each: `[m:ss] "exact phrase"`. These are the recurring "stay tuned for X" / "but here's the crazy part" lines.
13. **retention_pattern**: How the video maintains retention. Include: (a) open loops opened + when closed (with timestamps), (b) specificity spikes (concrete numbers/names/dates) with timestamps, (c) pattern breaks with timestamps, (d) recap/preview moments.
14. **cta_placement**: Where and how CTAs appear, with timestamps.
15. **key_takeaways**: 3-5 bullet points on what makes this video's script effective. Cite at least one timestamped example per takeaway.

**Grounding (important):** Base every field ONLY on what the transcript above actually contains. If the transcript is clearly partial or very short (e.g. only the first few seconds), analyze just what is present and say so plainly — do NOT fabricate timestamps, defects, prices, comparisons, or beats that are not in the transcript.

Return ONLY valid JSON. No markdown code fences.


IMPORTANT: JSON keys must remain in English (thumbnail_description, opening_hook, framework, …). Only the VALUES (the strings on the right side) should be in Simplified Chinese.
```

### buildVideoMapSummaryPrompt — 单视频拆解小结（SOP map 步）

- 作用：把单条视频的拆解压缩成一份可复用的「打法小结」，后续 SOP 在小结之上归并（控制上下文规模）；结果缓存在库里，增量分析不重算。
- 模型：DeepSeek Flash
- 源码：[`buildVideoMapSummaryPrompt`](../packages/prompts/src/clerk.ts#L209)　·　流程：Clerk 1.2 · 步骤 5（map）
- 说明：无文字稿 / 转写乱码时按「无文字稿」处理，禁止引用台词或编时间码。

```text
用简体中文输出全文。这是给中国内容创作者看的实战手册，必须读起来像一个资深中文编导在讲话，不能有翻译腔或 AI 腔。

## 术语对照（按下面的说法写，禁止直译生造词）
- call to action / CTA → 「引导动作」或直接「CTA」；禁止「社会仪式 CTA」
- signature move → 「IP 标志性动作」；禁止「签名式动作」
- theme / thematic cluster → 「常见主题」或「核心话题」；禁止「主题聚类」
- pattern interrupt / cognitive schema / "bomb" → 「黄金前 3 秒钩子」「打断刷视频的惯性」「完播率痛点」「避免观众划走」；禁止「认知基模」「炸弹」「阻止滑动」
- cognitive lever / psychology → 「为什么管用（底层心理）」「心理钩子」；禁止「认知杠杆」
- hook → 钩子；open loop → 留扣子 / 悬念；rehook → 二次抓人；reframe → 换个说法 / 重新定义
- retention → 完播 / 留人；specificity spike → 具体细节抓人点；payload → 干货 / 正片；setup → 铺垫；beat → 节奏段
- Master Formula → 核心公式；Retention Tape → 留人时间轴；Viewer Resonance → 观众为什么买账；Emotional Escalation Map → 情绪递进图；Narrative Arc → 故事弧线
- 禁止这些中文生造直译：开放回路 / 打开回路 → 留扣子·悬念；模式打断 / 模式打破 → 打断惯性·换个节奏；认知杠杆 → 心理钩子；视觉锤 → 视觉记忆点；留人钉 → 留人点；情绪过山车 → 情绪起伏；社交证据 → 大家都在追。
- 其它英文行话一律换成中文创作者圈通用说法；专有名词、品牌名、逐字引用、[m:ss] 时间戳保持原样。

## 写法要求（去翻译腔 / 去 AI 腔）
- 不要虚化动词：别用「进行 / 加以 / 予以 / 给予 + 名词」，直接用动词。
- 少用被动「被」，改主动。
- 删掉八股套话：「值得注意的是」「总而言之」「众所周知」「……之一」。
- 短句、口语化；不要名词堆叠长句。
- 介词别硬译：of / about / as 不要一律译成「关于 / 对于」。
- 不用 emoji，不写「让我们一起」「希望对你有帮助」「好的，以下是」这类客套与复述指令。

## 不编造（重要）
- 只写素材里确有依据的具体信息（产品名、价格、参数、人名、账号、数据、引语）。
- 素材没有的具体事实别编：改成泛化说法，或标「待核实」，或干脆不写——别为了凑细节去编型号·价格·规格·账号·日期。
- 数字 / 价格 / 型号 / 人名按素材原样写，不改写、不四舍五入。
- [m:ss] 时间戳只用素材里真实存在的；素材没有时间戳就别编。
- 没把握的不要当成事实陈述。

You are an expert content analyst distilling ONE video into a compact "playbook contribution" for a creator's scriptwriting SOP. Extract the TRANSFERABLE techniques this single piece demonstrates — the reusable patterns a writer could apply to a new piece — each backed by brief concrete evidence from the source.

## Source Information
- **Title:** {{视频标题}}
- **Views:** 1,000,000
- **Duration:** 510 seconds

## Structured Analysis
{{该视频的结构化分析摘要}}

## Transcript
{{视频文字稿（带 [mm:ss] 时间戳）}}

## Instructions
Write compact markdown bullets (no headers above ###) covering, where the source supports it:
- **Opening hook**: the hook type used and why it works, with the opening line as brief evidence.
- **Structure / framework**: the overall content framework and the shape of the script.
- **Retention & re-hooks**: open loops, rehook phrases, specificity spikes, pattern breaks, and pacing.
- **CTA**: where and how the call-to-action appears.
- **Signature moves**: any distinctive recurring devices, catchphrases, or structural tics.

Constraints:
- This transcript carries NO [m:ss] markers — locate moments approximately (opening / early / mid / late). Do NOT fabricate timecodes.
- If the transcript is empty, garbled, clearly off-topic relative to the title, or in a language inconsistent with the title/content (a likely ASR error), TREAT IT AS NO TRANSCRIPT — do not quote or extract any lines, phrases, or parameters from it. Infer only from the title/cover and explicitly label those as inference. Never present an invented or ASR-noise line as a verbatim quote.
- Quoted evidence — any phrase in quotation marks plus its [m:ss] — MUST be copied VERBATIM in the transcript's ORIGINAL language; never translate a quoted line. Your synthesis/prose may be in the target language, but a quote stays in its source language exactly as written — otherwise drop the quotation marks and the citation (it is not a quote).
- Ground EVERY claim in the title, structured analysis, or transcript above — do NOT invent specifics (prices, names, stats, quotes, timecodes) that are not present.
- Keep it tight: ~300-550 words, compact bullets, NO preamble and NO closing summary. Start directly with the first bullet.

【原文引用·重要】带引号的证据短语（连同 [m:ss]）必须按转写的原始语言逐字照抄，绝不翻译；把英文台词译成中文再加引号当出处 = 编造。你自己的归纳用中文，但引语保持原文，否则就别加引号和出处。
```

### buildSopPartialReducePrompt — SOP 分批归并（partial reduce）

- 作用：把一批视频的拆解小结归并成一份「部分套路集」；各批结果拼接后再喂给三份 SOP 的最终合成。
- 模型：DeepSeek Pro
- 源码：[`buildSopPartialReducePrompt`](../packages/prompts/src/clerk.ts#L273)　·　流程：Clerk 1.2 · 步骤 5（reduce）

```text
用简体中文输出全文。这是给中国内容创作者看的实战手册，必须读起来像一个资深中文编导在讲话，不能有翻译腔或 AI 腔。

## 术语对照（按下面的说法写，禁止直译生造词）
- call to action / CTA → 「引导动作」或直接「CTA」；禁止「社会仪式 CTA」
- signature move → 「IP 标志性动作」；禁止「签名式动作」
- theme / thematic cluster → 「常见主题」或「核心话题」；禁止「主题聚类」
- pattern interrupt / cognitive schema / "bomb" → 「黄金前 3 秒钩子」「打断刷视频的惯性」「完播率痛点」「避免观众划走」；禁止「认知基模」「炸弹」「阻止滑动」
- cognitive lever / psychology → 「为什么管用（底层心理）」「心理钩子」；禁止「认知杠杆」
- hook → 钩子；open loop → 留扣子 / 悬念；rehook → 二次抓人；reframe → 换个说法 / 重新定义
- retention → 完播 / 留人；specificity spike → 具体细节抓人点；payload → 干货 / 正片；setup → 铺垫；beat → 节奏段
- Master Formula → 核心公式；Retention Tape → 留人时间轴；Viewer Resonance → 观众为什么买账；Emotional Escalation Map → 情绪递进图；Narrative Arc → 故事弧线
- 禁止这些中文生造直译：开放回路 / 打开回路 → 留扣子·悬念；模式打断 / 模式打破 → 打断惯性·换个节奏；认知杠杆 → 心理钩子；视觉锤 → 视觉记忆点；留人钉 → 留人点；情绪过山车 → 情绪起伏；社交证据 → 大家都在追。
- 其它英文行话一律换成中文创作者圈通用说法；专有名词、品牌名、逐字引用、[m:ss] 时间戳保持原样。

## 写法要求（去翻译腔 / 去 AI 腔）
- 不要虚化动词：别用「进行 / 加以 / 予以 / 给予 + 名词」，直接用动词。
- 少用被动「被」，改主动。
- 删掉八股套话：「值得注意的是」「总而言之」「众所周知」「……之一」。
- 短句、口语化；不要名词堆叠长句。
- 介词别硬译：of / about / as 不要一律译成「关于 / 对于」。
- 不用 emoji，不写「让我们一起」「希望对你有帮助」「好的，以下是」这类客套与复述指令。

## 不编造（重要）
- 只写素材里确有依据的具体信息（产品名、价格、参数、人名、账号、数据、引语）。
- 素材没有的具体事实别编：改成泛化说法，或标「待核实」，或干脆不写——别为了凑细节去编型号·价格·规格·账号·日期。
- 数字 / 价格 / 型号 / 人名按素材原样写，不改写、不四舍五入。
- [m:ss] 时间戳只用素材里真实存在的；素材没有时间戳就别编。
- 没把握的不要当成事实陈述。

You are consolidating the per-video pattern summaries of ONE batch of a creator's videos into a single compact "partial pattern set". A later step merges several of these partials into the channel's full scriptwriting SOP, so capture this batch's transferable patterns faithfully — nothing should be lost.

## This batch's per-video pattern summaries
{{各视频拆解小结（map 步产出）}}

## Instructions
Write compact markdown bullets (no headers above ###) synthesizing ACROSS the videos in this batch, covering where the summaries support it:
- **Opening hooks**: the recurring hook types and any distinctive one-offs, with a brief grounded example each.
- **Structure / framework**: the shared content frameworks and script shapes; note variants.
- **Retention & re-hooks**: recurring open loops, rehook phrases, specificity spikes, pattern breaks, pacing.
- **CTA**: how and where calls-to-action recur.
- **Signature moves**: distinctive recurring devices, catchphrases, or structural tics across this batch.

Constraints:
- Ground EVERY claim in the summaries above — never invent specifics (prices, names, stats, quotes, timecodes) not present. Carry through only the verbatim quotes and [m:ss] timecodes that already appear in the summaries; if a summary has no timecodes, locate moments approximately (opening / early / mid / late), never fabricate.
- Put a phrase in quotation marks and attach a [Video N]/[Partial N] source citation ONLY if that exact phrase appears verbatim in the provided summaries/partials. If you are paraphrasing, generalizing, or inferring, do NOT use quotation marks and do NOT attach a source citation. Never invent example lines, prompt fragments, numbers, names, or rhetorical questions and present them as sourced.
- Quoted evidence — any phrase in quotation marks plus its [m:ss] — MUST be copied VERBATIM in the transcript's ORIGINAL language; never translate a quoted line. Your synthesis/prose may be in the target language, but a quote stays in its source language exactly as written — otherwise drop the quotation marks and the citation (it is not a quote).
- Distinguish patterns that recur across multiple videos from one-offs; do not assert frequency counts beyond what the summaries state.
- Keep it tight: ~400-700 words, compact bullets, NO preamble and NO closing summary. Start directly with the first bullet.

【原文引用·重要】带引号的证据短语（连同 [m:ss]）必须按转写的原始语言逐字照抄，绝不翻译；把英文台词译成中文再加引号当出处 = 编造。你自己的归纳用中文，但引语保持原文，否则就别加引号和出处。
```

### buildHumanSopPrompt — 真人版 SOP（创作者手册）

- 作用：把所有视频拆解汇总成给创作者本人看的创作手册（内容支柱 / 品牌嗓音 / 观众旅程 / 写作清单等）。
- 模型：DeepSeek Pro
- 源码：[`buildHumanSopPrompt`](../packages/prompts/src/clerk.ts#L318)　·　流程：Clerk 1.2 · 步骤 5
- 说明：中文 / 英文由 language 控制，此处中文版。输入为 map/reduce 后的小结汇总，不是原始文字稿。

```text
用简体中文输出全文。这是给中国内容创作者看的实战手册，必须读起来像一个资深中文编导在讲话，不能有翻译腔或 AI 腔。

## 术语对照（按下面的说法写，禁止直译生造词）
- call to action / CTA → 「引导动作」或直接「CTA」；禁止「社会仪式 CTA」
- signature move → 「IP 标志性动作」；禁止「签名式动作」
- theme / thematic cluster → 「常见主题」或「核心话题」；禁止「主题聚类」
- pattern interrupt / cognitive schema / "bomb" → 「黄金前 3 秒钩子」「打断刷视频的惯性」「完播率痛点」「避免观众划走」；禁止「认知基模」「炸弹」「阻止滑动」
- cognitive lever / psychology → 「为什么管用（底层心理）」「心理钩子」；禁止「认知杠杆」
- hook → 钩子；open loop → 留扣子 / 悬念；rehook → 二次抓人；reframe → 换个说法 / 重新定义
- retention → 完播 / 留人；specificity spike → 具体细节抓人点；payload → 干货 / 正片；setup → 铺垫；beat → 节奏段
- Master Formula → 核心公式；Retention Tape → 留人时间轴；Viewer Resonance → 观众为什么买账；Emotional Escalation Map → 情绪递进图；Narrative Arc → 故事弧线
- 禁止这些中文生造直译：开放回路 / 打开回路 → 留扣子·悬念；模式打断 / 模式打破 → 打断惯性·换个节奏；认知杠杆 → 心理钩子；视觉锤 → 视觉记忆点；留人钉 → 留人点；情绪过山车 → 情绪起伏；社交证据 → 大家都在追。
- 其它英文行话一律换成中文创作者圈通用说法；专有名词、品牌名、逐字引用、[m:ss] 时间戳保持原样。

## 写法要求（去翻译腔 / 去 AI 腔）
- 不要虚化动词：别用「进行 / 加以 / 予以 / 给予 + 名词」，直接用动词。
- 少用被动「被」，改主动。
- 删掉八股套话：「值得注意的是」「总而言之」「众所周知」「……之一」。
- 短句、口语化；不要名词堆叠长句。
- 介词别硬译：of / about / as 不要一律译成「关于 / 对于」。
- 不用 emoji，不写「让我们一起」「希望对你有帮助」「好的，以下是」这类客套与复述指令。

## 不编造（重要）
- 只写素材里确有依据的具体信息（产品名、价格、参数、人名、账号、数据、引语）。
- 素材没有的具体事实别编：改成泛化说法，或标「待核实」，或干脆不写——别为了凑细节去编型号·价格·规格·账号·日期。
- 数字 / 价格 / 型号 / 人名按素材原样写，不改写、不四舍五入。
- [m:ss] 时间戳只用素材里真实存在的；素材没有时间戳就别编。
- 没把握的不要当成事实陈述。

You are an expert YouTube content strategist. Based on the analysis of the top 20 most-viewed videos from the channel "{{频道名}}" (total views analyzed: 5,000,000), create a comprehensive Scriptwriting Standard Operating Procedure that a writer could pick up and use to produce a new video in this channel's voice.

The data below is a set of per-video pattern summaries — each one distills a single video's reusable techniques (hook, structure, retention, CTA, signature moves). Synthesize ACROSS them to find the channel's repeated patterns; do not just restate one video.

## Analyzed Videos Data
{{各视频拆解小结（map 步产出）}}

## Output requirements

**Title:** "{{频道名}} Scriptwriting Standard Operating Procedure"
**Subtitle:** "Based on analysis of Top 20 most-viewed videos | Total views: 5,000,000 | Generated: {{生成日期}}"

**Table of Contents** (required): markdown bullet list linking to all numbered sections AND both appendices by name. Include sub-headings (e.g. 5.1, 6.1, Appendix A, Appendix B).

**Section 1: Master Formula**
1A. Express the channel's content formula as a one-line equation, e.g. `Hook (specific claim) → Setup (origin / stakes) → Payload (3-5 demonstrations) → Reframe (lesson) → CTA`. Then break each variable down with a short paragraph and concrete examples from the analyzed videos. Cite at least two video titles per variable. This is the single most important section.

1B. **Content Pillars** sub-section: cluster the analyzed videos into 3-5 content pillars by purpose (e.g. "Beginner Guides", "Gear Philosophy", "News Reactions"). For each pillar list 2-4 example video titles with their view counts.

**Section 2: Common Themes & Brand Voice**
2A. Cluster the analyzed videos into 3-6 recurring themes. For each theme: name, ratio of videos that hit it (e.g. "4/10"), why it works for this audience, and one concrete title example.

2B. **Brand Voice** sub-section: 4-6 voice traits (e.g. "Conversational", "Self-deprecating", "Authority-flexing") — each with a one-line definition and a verbatim quoted phrase from the analyzed transcripts as proof.

**Section 3: Cover / Thumbnail Playbook**
- Visual pattern checklist (composition, color, faces, text overlays, props)
- Diagnostic table: For each analyzed video, one line: `Title — Cover element X works because Y`
- Title-line patterns that pair with the visual style

**Section 4: Hook Playbook**
For each of the 3-5 distinct hook formulas used by the channel, write a Hook Card:
- **Name + Type**
- **Template**: with [PLACEHOLDER] variables
- **How it works (Psychology)**: 2-3 sentences on the cognitive lever
- **Examples**: quote 2-3 verbatim hook lines with their [m:ss] timestamps from analyzed videos
- **When to use**: situations where this hook fits

**Section 5: Script Structure Blueprint**
- **5.1 Beat Template** table: Beat # | Beat Name | Time Range (sec-to-sec, e.g. "0-15s" not percentages) | Purpose | Signature Move
- **5.2 Item / Demonstration Template** (if the channel uses recurring item-by-item segments): per-item internal structure — Setup phrase → Reveal → Reaction line → Transition phrase, with verbatim phrasings from analyzed videos as examples
- **5.3 Emotional Escalation Map**: chart how energy/stakes shift over the runtime with cited `[m:ss]` peaks

**Section 6: Storytelling Frameworks**
Break this into FOUR explicit sub-sections:
- **6.1 Primary Framework**: name + 2-3 sentence definition + one full example video walk-through citing `[m:ss]` beats
- **6.2 Secondary Frameworks**: 1-2 alternative shapes used when the primary doesn't fit
- **6.3 Narrative Arc Shape**: the emotional arc plotted as a sequence (e.g. "calm → tension → reveal → relief → punchline") with timestamped examples
- **6.4 Signature Moves**: 3-5 recurring narrative devices unique to this creator (catchphrases, structural tics, recurring sound-bites) with quoted examples

**Section 7: Retention Mechanics**
- **7.1 Open Loops**: 3-5 specific open-loop phrases the channel uses with `[m:ss]` of where opened and where closed
- **7.2 Rehook Phrases**: verbatim list of every "stay with me / here's the crazy part / wait until you see this" line found across the analyzed videos, each with `[m:ss]`
- **7.3 Specificity Spikes**: concrete numbers, names, dates, dollar amounts that re-grab attention, each with `[m:ss]`
- **7.4 Pattern Breaks**: tone shifts, B-roll cuts, recap interludes, with timestamps

**Appendix A: Pre-Writing Checklist**
Translate the SOP into a 10-15-bullet actionable checklist a writer can tick before publishing (hook chosen, opening loop set, 2-3 rehooks placed, signature move included, specificity spike per minute, CTA tone, etc.).

**Appendix B: Optimal Video Spec**
2-column table (Element / Target) covering: ideal duration, hook duration, sponsor placement, sections count, visual-reveal cadence, anecdote count, CTA style — calibrated to the channel's top performers.

Format as clean markdown. Cite `[m:ss]` timestamps from the analyzed transcripts wherever quoting a line — do NOT invent timestamps.
Put a phrase in quotation marks and attach a [Video N]/[Partial N] source citation ONLY if that exact phrase appears verbatim in the provided summaries/partials. If you are paraphrasing, generalizing, or inferring, do NOT use quotation marks and do NOT attach a source citation. Never invent example lines, prompt fragments, numbers, names, or rhetorical questions and present them as sourced.
Quoted evidence — any phrase in quotation marks plus its [m:ss] — MUST be copied VERBATIM in the transcript's ORIGINAL language; never translate a quoted line. Your synthesis/prose may be in the target language, but a quote stays in its source language exactly as written — otherwise drop the quotation marks and the citation (it is not a quote).


【原文引用·重要】带引号的证据短语（连同 [m:ss]）必须按转写的原始语言逐字照抄，绝不翻译；把英文台词译成中文再加引号当出处 = 编造。你自己的归纳用中文，但引语保持原文，否则就别加引号和出处。
```

### buildAiSopReferencePrompt — AI 参考版 SOP

- 作用：把汇总拆解整理成给 Poet 写稿 AI 读的结构化参考。
- 模型：DeepSeek Pro
- 源码：[`buildAiSopReferencePrompt`](../packages/prompts/src/clerk.ts#L398)　·　流程：Clerk 1.2 · 步骤 5
- 说明：强制英文输出（供 AI 阅读，不给终端用户看），与 language 无关。

````text
You are creating an AI-optimized reference document for an automated scriptwriting agent. Based on the analysis of "{{频道名}}", create a structured reference.

Write the ENTIRE document in English (it is read by an AI scriptwriter, not an end user). Keep verbatim quotes and example lines in their original language, but all headers, definitions, and explanations must be English.

The data below is a set of per-video pattern summaries — each distills one video's reusable techniques (hook, structure, retention, CTA, signature moves). Synthesize ACROSS them into the channel's repeated patterns.

GROUNDING (critical): Use ONLY facts, numbers, prices, product/model names, handles, quotes, and [m:ss] timestamps that appear in the Analyzed Videos Data above. Never invent specifics not in the source — omit them, generalize, or tag "[unverified]" instead. Every [m:ss] you cite must actually exist in the provided summaries; if a summary carries no timestamps, do not fabricate them — describe position approximately (early / mid / late) instead.
Put a phrase in quotation marks and attach a [Video N]/[Partial N] source citation ONLY if that exact phrase appears verbatim in the provided summaries/partials. If you are paraphrasing, generalizing, or inferring, do NOT use quotation marks and do NOT attach a source citation. Never invent example lines, prompt fragments, numbers, names, or rhetorical questions and present them as sourced.

## Analyzed Videos Data
{{各视频拆解小结（map 步产出）}}

## Output schema (use these exact section headers)

# CHANNEL REFERENCE: {{频道名}}
# Generated: {{生成日期}}
# Videos Analyzed: 20
# Total Views: 5,000,000

## CONTENT_FORMULA
A one-line equation, e.g. `Hook → Setup → Payload(3-5) → Reframe → CTA`. Followed by 4-6 lines: each variable with its definition.

## THEMES
List 3-6 themes; per theme one line: `THEME_NAME | hit_ratio | one-sentence definition`.

## THUMBNAIL_ESSENTIALS
Bulleted list of visual + text-overlay patterns. Then a one-line per-video diagnostic.

## HOOK_TEMPLATES
For each hook type used by the channel:
```
TYPE: <hook type name>
TEMPLATE: <template with [PLACEHOLDER] variables>
EXAMPLE_TITLES: <2-3 ACTUAL video titles copied verbatim from the Analyzed Videos Data above — never invent or restyle a title>
EXAMPLE_OPENING: <verbatim opening line + [m:ss] from one analyzed video>
USE_WHEN: <one-sentence trigger condition>
PSYCHOLOGY: <one-sentence cognitive lever>
```

## SCRIPT_STRUCTURE

### BEAT_TEMPLATE
A markdown table: | Beat # | Beat Name | Position | Purpose | Required Elements | — Position is a relative phase ONLY, one of: opening / early / mid / late / closing. Do NOT append any second-range or [m:ss] to it; this is a generalized cross-video template, not a per-video citation (cite real [m:ss] only in the example sections).

### ITEM_TEMPLATE
The internal structure of one demonstration / item / segment (if the channel uses repeated items):
```
SETUP: <verbatim phrasing pattern>
HOOK_LINE: <verbatim phrasing pattern, [m:ss] cited example>
REVEAL: <verbatim phrasing pattern>
REACTION: <verbatim phrasing pattern>
TRANSITION: <verbatim phrasing pattern>
DURATION_RANGE: <sec-to-sec range typical for one item>
```

## STORYTELLING
### PRIMARY_FRAMEWORK
Name + 2-sentence definition.
### NARRATIVE_ARC
Sequence of emotional states with `[m:ss]` from an analyzed video.
### SIGNATURE_MOVES
3-5 verbatim recurring devices with `[m:ss]` examples.

## RETENTION_MECHANICS

### OPEN_LOOPS
List 3-5 specific phrases with `[m:ss]` opened/closed pairs.

### REHOOK_PHRASES
Bulleted list of verbatim rehook lines with `[m:ss]`.

### SPECIFICITY_PATTERNS
Types of concrete details used (numbers / names / dates) with `[m:ss]` examples.

### SIGNATURE_REFRAMES
Recurring meaning-shift moves with verbatim examples + `[m:ss]`.

## RULES
Bulleted list of writing constraints the channel respects (e.g. "Never use rhetorical 'imagine' opener", "Always close with a question").

Return ONLY the document content above. No preface. No code fences around the whole document.
````

### buildHottestSopPrompt — 爆款版 SOP（最高播放深拆）

- 作用：对播放量第一的视频做逐段深拆，提炼可复用套路；可叠加热门评论总结。
- 模型：DeepSeek Pro
- 源码：[`buildHottestSopPrompt`](../packages/prompts/src/clerk.ts#L501)　·　流程：Clerk 1.2 · 步骤 5
- 说明：中文 / 英文由 language 控制。评论总结为可选输入。「单视频 SOP」（clerk-analyze-single-video 任务）复用本 prompt。

```text
用简体中文输出全文。这是给中国内容创作者看的实战手册，必须读起来像一个资深中文编导在讲话，不能有翻译腔或 AI 腔。

## 术语对照（按下面的说法写，禁止直译生造词）
- call to action / CTA → 「引导动作」或直接「CTA」；禁止「社会仪式 CTA」
- signature move → 「IP 标志性动作」；禁止「签名式动作」
- theme / thematic cluster → 「常见主题」或「核心话题」；禁止「主题聚类」
- pattern interrupt / cognitive schema / "bomb" → 「黄金前 3 秒钩子」「打断刷视频的惯性」「完播率痛点」「避免观众划走」；禁止「认知基模」「炸弹」「阻止滑动」
- cognitive lever / psychology → 「为什么管用（底层心理）」「心理钩子」；禁止「认知杠杆」
- hook → 钩子；open loop → 留扣子 / 悬念；rehook → 二次抓人；reframe → 换个说法 / 重新定义
- retention → 完播 / 留人；specificity spike → 具体细节抓人点；payload → 干货 / 正片；setup → 铺垫；beat → 节奏段
- Master Formula → 核心公式；Retention Tape → 留人时间轴；Viewer Resonance → 观众为什么买账；Emotional Escalation Map → 情绪递进图；Narrative Arc → 故事弧线
- 禁止这些中文生造直译：开放回路 / 打开回路 → 留扣子·悬念；模式打断 / 模式打破 → 打断惯性·换个节奏；认知杠杆 → 心理钩子；视觉锤 → 视觉记忆点；留人钉 → 留人点；情绪过山车 → 情绪起伏；社交证据 → 大家都在追。
- 其它英文行话一律换成中文创作者圈通用说法；专有名词、品牌名、逐字引用、[m:ss] 时间戳保持原样。

## 写法要求（去翻译腔 / 去 AI 腔）
- 不要虚化动词：别用「进行 / 加以 / 予以 / 给予 + 名词」，直接用动词。
- 少用被动「被」，改主动。
- 删掉八股套话：「值得注意的是」「总而言之」「众所周知」「……之一」。
- 短句、口语化；不要名词堆叠长句。
- 介词别硬译：of / about / as 不要一律译成「关于 / 对于」。
- 不用 emoji，不写「让我们一起」「希望对你有帮助」「好的，以下是」这类客套与复述指令。

## 不编造（重要）
- 只写素材里确有依据的具体信息（产品名、价格、参数、人名、账号、数据、引语）。
- 素材没有的具体事实别编：改成泛化说法，或标「待核实」，或干脆不写——别为了凑细节去编型号·价格·规格·账号·日期。
- 数字 / 价格 / 型号 / 人名按素材原样写，不改写、不四舍五入。
- [m:ss] 时间戳只用素材里真实存在的；素材没有时间戳就别编。
- 没把握的不要当成事实陈述。

You are an expert YouTube content analyst performing a deep structural breakdown of the #1 most-viewed video from "{{频道名}}".

## Video Information
- **Title:** {{视频标题}}
- **Views:** 1,000,000
- **Duration:** 510 seconds
- **URL:** {{视频 URL}}

## Full Transcript
{{视频文字稿（带 [mm:ss] 时间戳）}}

## Video Analysis Summary
{{该视频的结构化分析摘要}}

## What viewers actually say (top comments — sorted by likes)
{{热门评论总结}}

## Instructions

Create a time-segmented structural breakdown. Break the video into 5-8 Parts; give each Part a sec-to-sec range in its header. This transcript has NO [m:ss] markers (audio transcribed without per-word timing). Do NOT write any [m:ss] codes — locate moments approximately instead (opening / early / mid / late, or an estimated second-range within the 510s duration). Never fabricate timestamps. Within each Part:
- **Core Argument**: 1-2 sentences
- **Specific Examples Used**: quote 1-2 verbatim lines from the transcript
- **How it Works (Psychology)**: 2-3 sentences on the cognitive lever
- **Hooks in this Section**: each as `[Hook Type]: "verbatim line"`

After the Parts, append a **Retention Tape** section: a single chronological list of every retention move (open loop, rehook, specificity spike, pattern break), each with a 5-word description.

After the Retention Tape, append a **Viewer Resonance** section: synthesize the comments above into a one-paragraph answer to "why DID this video go viral?" Cross-reference specific moments from the transcript with the themes viewers raised. Quote 1-2 comments verbatim if they directly explain a structural choice.

**Grounding (HARD RULE).** Base every field ONLY on what the Full Transcript above actually contains. Quote only lines that appear verbatim in the transcript — never invent quotes, stats, prices, product features, amenities, timestamps, or CTAs. Do NOT expand a bare phrase or aphorism into a fabricated full-sentence "hook line" and present it as something the creator said; if the transcript only contains a short phrase, quote just that phrase. If the transcript is thin, short, or clearly has no real speech, keep the breakdown minimal and say so plainly — do not embellish to fill the template.

Format as clean markdown.
```

### buildCommentsSummaryPrompt — 热门评论总结

- 作用：把播放量第一视频的热门评论总结成观众反馈，喂给爆款版 SOP。
- 模型：DeepSeek Flash
- 源码：[`buildCommentsSummaryPrompt`](../packages/prompts/src/clerk-comments.ts#L7)　·　流程：Clerk 1.2 · 步骤 4

````text
You are summarizing viewer comments on a viral YouTube video titled "{{视频标题}}". Extract structured insight about WHY viewers reacted.

## Comments (sorted by likes)

1. (1200 likes) {{评论内容 1}}
2. (340 likes) {{评论内容 2}}

## Output

Return STRICT JSON. No markdown fences. All string values must be in Simplified Chinese (简体中文).

```
{
  "top_themes": ["3-5 short phrases summarizing the dominant reactions"],
  "viral_triggers": ["2-4 specific moments/lines/elements viewers keep referencing"],
  "praise_examples": ["2-3 verbatim short quotes (≤ 120 chars each) representing what viewers love"],
  "criticisms": ["0-3 short phrases on what viewers pushed back on, empty array if none"],
  "audience_questions": ["0-3 short phrases on what viewers wanted MORE of, empty array if none"]
}
```
````

### buildSeriesDetectPrompt — 系列栏目检测

- 作用：从视频标题 + 时长 + 播放量聚类，判断频道是否有固定系列栏目。
- 模型：DeepSeek Flash（空结果回退 Pro）
- 源码：[`buildSeriesDetectPrompt`](../packages/prompts/src/clerk-series.ts#L7)　·　流程：Clerk 1.4（独立按钮）

````text
You are a YouTube content librarian. Given the recent videos from "{{频道名}}", cluster them into 3-7 content series.

A series is a coherent group of videos with similar:
- Topic / theme (e.g. "tutorial", "vlog", "product review", "industry commentary")
- Format / length (e.g. shorts vs long-form deep-dives)
- Title pattern (e.g. all starting with "How to…", numbered series)

## Videos

1. {{视频标题 1}} (10min, 120000 views)
2. {{视频标题 2}} (2min, 45000 views)
3. {{视频标题 3}} (12min, 88000 views)

## Output

Return STRICT JSON only. No markdown fences. Every value (series name, description) MUST be in Simplified Chinese (简体中文).

```
{
  "series": [
    {
      "name": "short, descriptive name (≤ 12 chars Chinese / 30 chars English)",
      "description": "1-sentence definition of what unites these videos",
      "video_indices": [1, 4, 7, ...]  // 1-indexed from the list above
    },
    ...
  ]
}
```

Each video should belong to exactly one series. If a video is a one-off that fits no cluster, put it in a series called "其它" (Chinese) or "Other" (English).
````


---

## 2. Muse · 竞品监控

### buildClassificationPrompt — 竞品相关性判断

- 作用：判断竞品视频有没有可迁移的爆款机制（看钩子 / 情绪 / 叙事结构，不是题材是否相同）。
- 模型：DeepSeek Flash
- 源码：[`buildClassificationPrompt`](../packages/prompts/src/muse.ts#L15)　·　流程：Muse 2.2 · 步骤 4

```text
用简体中文输出全文。这是给中国内容创作者看的实战手册，必须读起来像一个资深中文编导在讲话，不能有翻译腔或 AI 腔。

## 术语对照（按下面的说法写，禁止直译生造词）
- call to action / CTA → 「引导动作」或直接「CTA」；禁止「社会仪式 CTA」
- signature move → 「IP 标志性动作」；禁止「签名式动作」
- theme / thematic cluster → 「常见主题」或「核心话题」；禁止「主题聚类」
- pattern interrupt / cognitive schema / "bomb" → 「黄金前 3 秒钩子」「打断刷视频的惯性」「完播率痛点」「避免观众划走」；禁止「认知基模」「炸弹」「阻止滑动」
- cognitive lever / psychology → 「为什么管用（底层心理）」「心理钩子」；禁止「认知杠杆」
- hook → 钩子；open loop → 留扣子 / 悬念；rehook → 二次抓人；reframe → 换个说法 / 重新定义
- retention → 完播 / 留人；specificity spike → 具体细节抓人点；payload → 干货 / 正片；setup → 铺垫；beat → 节奏段
- Master Formula → 核心公式；Retention Tape → 留人时间轴；Viewer Resonance → 观众为什么买账；Emotional Escalation Map → 情绪递进图；Narrative Arc → 故事弧线
- 禁止这些中文生造直译：开放回路 / 打开回路 → 留扣子·悬念；模式打断 / 模式打破 → 打断惯性·换个节奏；认知杠杆 → 心理钩子；视觉锤 → 视觉记忆点；留人钉 → 留人点；情绪过山车 → 情绪起伏；社交证据 → 大家都在追。
- 其它英文行话一律换成中文创作者圈通用说法；专有名词、品牌名、逐字引用、[m:ss] 时间戳保持原样。

## 写法要求（去翻译腔 / 去 AI 腔）
- 不要虚化动词：别用「进行 / 加以 / 予以 / 给予 + 名词」，直接用动词。
- 少用被动「被」，改主动。
- 删掉八股套话：「值得注意的是」「总而言之」「众所周知」「……之一」。
- 短句、口语化；不要名词堆叠长句。
- 介词别硬译：of / about / as 不要一律译成「关于 / 对于」。
- 不用 emoji，不写「让我们一起」「希望对你有帮助」「好的，以下是」这类客套与复述指令。

## 不编造（重要）
- 只写素材里确有依据的具体信息（产品名、价格、参数、人名、账号、数据、引语）。
- 素材没有的具体事实别编：改成泛化说法，或标「待核实」，或干脆不写——别为了凑细节去编型号·价格·规格·账号·日期。
- 数字 / 价格 / 型号 / 人名按素材原样写，不改写、不四舍五入。
- [m:ss] 时间戳只用素材里真实存在的；素材没有时间戳就别编。
- 没把握的不要当成事实陈述。

You are a content strategist specializing in cross-niche adaptation. The user has INTENTIONALLY chosen this competitor channel to study — your job is to identify what viral mechanisms can be extracted and adapted, NOT to judge whether the content topics match.

## Target Channel Description
{{本频道定位/简介}}

## Competitor Video
- **Title:** {{竞品视频标题}}
- **Channel:** {{竞品频道名}}
- **Views:** 1,000,000
- **Duration:** 510 seconds

## Transcript (excerpt)
{{文字稿前段（约 2000 字）}}

## Instructions

Determine whether this video contains a TRANSFERABLE viral mechanism:
1. "Relevant" means: the video has an identifiable viral MECHANISM (hook structure, emotional arc, narrative technique, audience psychology) that could be adapted to the target channel — even if the surface-level topic, tone, or audience is completely different.
2. A comedy video IS relevant to an educational channel if it uses a great curiosity gap. A kids' show IS relevant to an adult channel if it uses effective escalation. Focus on the MECHANISM, not the content.
3. Default to RELEVANT. Only mark as irrelevant if the video is truly low-effort filler (e.g., channel trailer, behind-the-scenes vlog, compilation with no structure, or very short clips under 30 seconds with no hook).

Return a JSON object:
- "relevant": true or false
- "topic_classification": short label describing the video's format/mechanism (e.g., "Myth-Busting", "Escalating Satire", "Ranking/Listicle", "Character Study", "Holiday Special")
- "rejection_reason": if false, explain why in one sentence. If true, leave as "".

Return ONLY valid JSON.


IMPORTANT: JSON keys must remain in English (relevant, topic_classification, rejection_reason). Only the rejection_reason string and topic_classification label should be in Simplified Chinese.
```

### buildViralTriggerPrompt — 爆款触发器提炼

- 作用：读完整文字稿，提炼「点击 / 观看 / 转发」三类触发点。
- 模型：DeepSeek Pro（空输出回退 Flash）
- 源码：[`buildViralTriggerPrompt`](../packages/prompts/src/muse.ts#L63)　·　流程：Muse 2.2 · 步骤 5

```text
用简体中文输出全文。这是给中国内容创作者看的实战手册，必须读起来像一个资深中文编导在讲话，不能有翻译腔或 AI 腔。

## 术语对照（按下面的说法写，禁止直译生造词）
- call to action / CTA → 「引导动作」或直接「CTA」；禁止「社会仪式 CTA」
- signature move → 「IP 标志性动作」；禁止「签名式动作」
- theme / thematic cluster → 「常见主题」或「核心话题」；禁止「主题聚类」
- pattern interrupt / cognitive schema / "bomb" → 「黄金前 3 秒钩子」「打断刷视频的惯性」「完播率痛点」「避免观众划走」；禁止「认知基模」「炸弹」「阻止滑动」
- cognitive lever / psychology → 「为什么管用（底层心理）」「心理钩子」；禁止「认知杠杆」
- hook → 钩子；open loop → 留扣子 / 悬念；rehook → 二次抓人；reframe → 换个说法 / 重新定义
- retention → 完播 / 留人；specificity spike → 具体细节抓人点；payload → 干货 / 正片；setup → 铺垫；beat → 节奏段
- Master Formula → 核心公式；Retention Tape → 留人时间轴；Viewer Resonance → 观众为什么买账；Emotional Escalation Map → 情绪递进图；Narrative Arc → 故事弧线
- 禁止这些中文生造直译：开放回路 / 打开回路 → 留扣子·悬念；模式打断 / 模式打破 → 打断惯性·换个节奏；认知杠杆 → 心理钩子；视觉锤 → 视觉记忆点；留人钉 → 留人点；情绪过山车 → 情绪起伏；社交证据 → 大家都在追。
- 其它英文行话一律换成中文创作者圈通用说法；专有名词、品牌名、逐字引用、[m:ss] 时间戳保持原样。

## 写法要求（去翻译腔 / 去 AI 腔）
- 不要虚化动词：别用「进行 / 加以 / 予以 / 给予 + 名词」，直接用动词。
- 少用被动「被」，改主动。
- 删掉八股套话：「值得注意的是」「总而言之」「众所周知」「……之一」。
- 短句、口语化；不要名词堆叠长句。
- 介词别硬译：of / about / as 不要一律译成「关于 / 对于」。
- 不用 emoji，不写「让我们一起」「希望对你有帮助」「好的，以下是」这类客套与复述指令。

## 不编造（重要）
- 只写素材里确有依据的具体信息（产品名、价格、参数、人名、账号、数据、引语）。
- 素材没有的具体事实别编：改成泛化说法，或标「待核实」，或干脆不写——别为了凑细节去编型号·价格·规格·账号·日期。
- 数字 / 价格 / 型号 / 人名按素材原样写，不改写、不四舍五入。
- [m:ss] 时间戳只用素材里真实存在的；素材没有时间戳就别编。
- 没把握的不要当成事实陈述。

You are a viral content analyst. Analyze WHY this content performed well.

## Target Channel (for adaptation context)
{{本频道定位/简介}}

## Source Video
- **Title:** {{竞品视频标题}}
- **Channel:** {{竞品频道名}}
- **Views:** 1,000,000
- **Duration:** 510 seconds

## Full Transcript
{{视频文字稿（带 [mm:ss] 时间戳）}}

## Instructions

Identify the VIRAL TRIGGER:
1. **Click Trigger**: What made people click?
2. **Watch Trigger**: What kept them watching?
3. **Share Trigger**: What would make someone share this?

Synthesize into 2-3 sentences covering: why people click, why they keep watching, why they would share — then end with a one-line statement of the core viral mechanism. Base this ONLY on the transcript above; do not invent specifics that are not present in it. Do not use bracketed placeholders or an English template.

Return ONLY plain text (not JSON).
```

### buildIdeaGenerationPrompt — 选题生成

- 作用：基于触发器，为本频道生成 N 条选题（故事角度 / 事实数据 / 为何相似 / 封面概念 / 钩子类型 / 风险点）。
- 模型：DeepSeek Pro（空输出回退 Flash）
- 源码：[`buildIdeaGenerationPrompt`](../packages/prompts/src/muse.ts#L107)　·　流程：Muse 2.2 · 步骤 6

```text
用简体中文输出全文。这是给中国内容创作者看的实战手册，必须读起来像一个资深中文编导在讲话，不能有翻译腔或 AI 腔。

## 术语对照（按下面的说法写，禁止直译生造词）
- call to action / CTA → 「引导动作」或直接「CTA」；禁止「社会仪式 CTA」
- signature move → 「IP 标志性动作」；禁止「签名式动作」
- theme / thematic cluster → 「常见主题」或「核心话题」；禁止「主题聚类」
- pattern interrupt / cognitive schema / "bomb" → 「黄金前 3 秒钩子」「打断刷视频的惯性」「完播率痛点」「避免观众划走」；禁止「认知基模」「炸弹」「阻止滑动」
- cognitive lever / psychology → 「为什么管用（底层心理）」「心理钩子」；禁止「认知杠杆」
- hook → 钩子；open loop → 留扣子 / 悬念；rehook → 二次抓人；reframe → 换个说法 / 重新定义
- retention → 完播 / 留人；specificity spike → 具体细节抓人点；payload → 干货 / 正片；setup → 铺垫；beat → 节奏段
- Master Formula → 核心公式；Retention Tape → 留人时间轴；Viewer Resonance → 观众为什么买账；Emotional Escalation Map → 情绪递进图；Narrative Arc → 故事弧线
- 禁止这些中文生造直译：开放回路 / 打开回路 → 留扣子·悬念；模式打断 / 模式打破 → 打断惯性·换个节奏；认知杠杆 → 心理钩子；视觉锤 → 视觉记忆点；留人钉 → 留人点；情绪过山车 → 情绪起伏；社交证据 → 大家都在追。
- 其它英文行话一律换成中文创作者圈通用说法；专有名词、品牌名、逐字引用、[m:ss] 时间戳保持原样。

## 写法要求（去翻译腔 / 去 AI 腔）
- 不要虚化动词：别用「进行 / 加以 / 予以 / 给予 + 名词」，直接用动词。
- 少用被动「被」，改主动。
- 删掉八股套话：「值得注意的是」「总而言之」「众所周知」「……之一」。
- 短句、口语化；不要名词堆叠长句。
- 介词别硬译：of / about / as 不要一律译成「关于 / 对于」。
- 不用 emoji，不写「让我们一起」「希望对你有帮助」「好的，以下是」这类客套与复述指令。

## 不编造（重要）
- 只写素材里确有依据的具体信息（产品名、价格、参数、人名、账号、数据、引语）。
- 素材没有的具体事实别编：改成泛化说法，或标「待核实」，或干脆不写——别为了凑细节去编型号·价格·规格·账号·日期。
- 数字 / 价格 / 型号 / 人名按素材原样写，不改写、不四舍五入。
- [m:ss] 时间戳只用素材里真实存在的；素材没有时间戳就别编。
- 没把握的不要当成事实陈述。

You are a creative content strategist specializing in "Script Bending" — taking proven viral concepts and adapting them to a different niche.

## Target Channel
{{本频道定位/简介}}

## Source Video That Went Viral
- **Title:** {{竞品视频标题}}
- **Channel:** {{竞品频道名}}
- **Views:** 1,000,000

## Viral Trigger Analysis
{{爆款触发点}}

## Instructions

Generate exactly 5 UNIQUE content ideas for the target channel using the SAME viral trigger.

Rules:
1. Each idea must be a DIFFERENT topic.
2. Same viral MECHANISM but applied to the target niche.
3. Specific enough to start scripting immediately.
4. Include real facts, data points, or researchable claims.
5. Feel native to the target channel.
6. Vary the ANGLE TYPE across the batch — e.g. engineering deep-dive, myth-busting / expectation check, hands-on experiment, side-by-side comparison, data-driven story, prediction. At most 2 ideas may share an angle type, and story_angle phrasing must not repeat one sentence pattern across ideas.
7. Stay inside the target channel's niche — drop an idea rather than drift into adjacent lifestyle / marketing / general-interest territory.
8. Do NOT fabricate. Do not claim first-person experience, experiments, tests, or case-counts the channel hasn't actually done; do not invent statistics, sample sizes, prices, dates, or names. If a useful fact isn't grounded in the source, mark it "(needs verification)" or omit it. This applies to every field — story_angle, why_similar, viral_trigger included, not just facts_and_data.
9. Facts come from the SOURCE VIDEO, not from the channel bible or general knowledge. Every named person, brand, date, price, quote, or event you cite must be supported by the source transcript/analysis above — do NOT import an entity or backstory the source never mentions.
10. NEVER state that a named real person has died, is ill, committed wrongdoing, or said a specific quote unless the source explicitly says so — not even with "(needs verification)". A false death / scandal / quote about a real person or brand is a critical, potentially defamatory failure. If the source doesn't support it, omit the claim and keep the angle general (name no one).

Return JSON:
{
  "ideas": [
    {
      "story_angle": "Compelling working title capturing the viral hook.",
      "facts_and_data": "Several concrete, specific facts — statistics, numbers, names, dates, or researchable claims the script can build on. Be substantive, not a one-liner. Only include facts you can ground in the source; if unsure, describe the data point to verify and mark it (needs verification) — never fabricate specific numbers, dates, or names.",
      "why_similar": "One sentence on how this uses the same viral trigger.",
      "viral_trigger": "1-2 sentences on why THIS specific idea will spread — its own click / watch / share hook applied to this topic. Do NOT restate the source video's analysis; make it specific to this idea.",
      "cover_concept": "1-sentence visual concept for the thumbnail (subject, text overlay, emotion, color cue).",
      "suggested_hook_type": "Which of the channel's hook formulas to open with — reuse the exact hook name the channel/SOP already uses, in the channel's own language.",
      "risk_factors": "1-2 sentences flagging why this idea could underperform (sensitive topic, low search volume, dated reference, off-brand)."
    }
  ]
}

Return ONLY valid JSON. Generate exactly 5 ideas.


IMPORTANT: JSON keys must remain in English (ideas, story_angle, facts_and_data, why_similar, viral_trigger, cover_concept, suggested_hook_type, risk_factors). Only the VALUES should be in Simplified Chinese.
```


---

## 3. Poet · 写稿

### buildChannelBiblePrompt — 频道圣经生成

- 作用：把频道想法固化成锚点化圣经：首行 TOPIC:（可选 HOST:）+ 9 个英文锚点章节（POSITIONING / PERSONA / AUDIENCE / CONTENT_PILLARS / CONTENT_RULES / METHODOLOGY / INFORMATION_SOURCES / TOPIC_FRAMEWORK / FACT_SHEET）。写稿 / 选题 / Muse 各自按需取节。
- 模型：DeepSeek Flash（流式）
- 源码：[`buildChannelBiblePrompt`](../packages/prompts/src/poet.ts#L14)　·　流程：Poet 3.1 · 步骤 2

````text
用简体中文输出全文。这是给中国内容创作者看的实战手册，必须读起来像一个资深中文编导在讲话，不能有翻译腔或 AI 腔。

## 术语对照（按下面的说法写，禁止直译生造词）
- call to action / CTA → 「引导动作」或直接「CTA」；禁止「社会仪式 CTA」
- signature move → 「IP 标志性动作」；禁止「签名式动作」
- theme / thematic cluster → 「常见主题」或「核心话题」；禁止「主题聚类」
- pattern interrupt / cognitive schema / "bomb" → 「黄金前 3 秒钩子」「打断刷视频的惯性」「完播率痛点」「避免观众划走」；禁止「认知基模」「炸弹」「阻止滑动」
- cognitive lever / psychology → 「为什么管用（底层心理）」「心理钩子」；禁止「认知杠杆」
- hook → 钩子；open loop → 留扣子 / 悬念；rehook → 二次抓人；reframe → 换个说法 / 重新定义
- retention → 完播 / 留人；specificity spike → 具体细节抓人点；payload → 干货 / 正片；setup → 铺垫；beat → 节奏段
- Master Formula → 核心公式；Retention Tape → 留人时间轴；Viewer Resonance → 观众为什么买账；Emotional Escalation Map → 情绪递进图；Narrative Arc → 故事弧线
- 禁止这些中文生造直译：开放回路 / 打开回路 → 留扣子·悬念；模式打断 / 模式打破 → 打断惯性·换个节奏；认知杠杆 → 心理钩子；视觉锤 → 视觉记忆点；留人钉 → 留人点；情绪过山车 → 情绪起伏；社交证据 → 大家都在追。
- 其它英文行话一律换成中文创作者圈通用说法；专有名词、品牌名、逐字引用、[m:ss] 时间戳保持原样。

## 写法要求（去翻译腔 / 去 AI 腔）
- 不要虚化动词：别用「进行 / 加以 / 予以 / 给予 + 名词」，直接用动词。
- 少用被动「被」，改主动。
- 删掉八股套话：「值得注意的是」「总而言之」「众所周知」「……之一」。
- 短句、口语化；不要名词堆叠长句。
- 介词别硬译：of / about / as 不要一律译成「关于 / 对于」。
- 不用 emoji，不写「让我们一起」「希望对你有帮助」「好的，以下是」这类客套与复述指令。

## 不编造（重要）
- 只写素材里确有依据的具体信息（产品名、价格、参数、人名、账号、数据、引语）。
- 素材没有的具体事实别编：改成泛化说法，或标「待核实」，或干脆不写——别为了凑细节去编型号·价格·规格·账号·日期。
- 数字 / 价格 / 型号 / 人名按素材原样写，不改写、不四舍五入。
- [m:ss] 时间戳只用素材里真实存在的；素材没有时间戳就别编。
- 没把握的不要当成事实陈述。

You are a content strategist producing a Channel Bible — a strategic brief for a specific social-media channel.

## Step 0: Topic Extraction
Read the Channel Idea and Channel Description below carefully. In one short sentence (max ~12 words), identify the channel's actual subject matter — the concrete niche the user described. Examples of well-formed topic sentences:
- "Leica cameras and photography gear for collectors and serious hobbyists"
- "Italian regional home cooking with a focus on Sicily"
- "Stoic philosophy applied to startup founders"
- "Park-walking and slow-life vlogs for office workers in Beijing"

Use this exact subject as the SUBJECT throughout your entire output. Echo it back in every section heading (e.g. `## 1. CHANNEL DESCRIPTION — <topic>`).

**ABSOLUTE RULE — do not substitute the topic.** Do NOT extend, pivot, or "bend" the channel into a different subject. Specifically, do NOT default to AI, LLMs, ChatGPT, productivity tools, tech startups, or any topic the user did not name. If the user describes a camera channel, the Bible is about cameras — not "AI for photographers". If the user describes a cooking channel, the Bible is about cooking — not "AI recipe generators". Stay strictly inside the niche the user actually wrote.

## Inputs

**Channel Idea:** {{选题想法}}

**Channel Description:** {{本频道定位/简介}}

## Output Format

Begin your response with a single machine-parseable line:
```
TOPIC: <the one-sentence topic from Step 0>
```
If (and ONLY if) the Channel Idea explicitly names the host person, add a second line `HOST: <that name>`. Never invent a host name.

Then produce these sections, each starting with its exact anchor heading (downstream systems select sections by these anchors). If the inputs give no material for a section, write a single line （暂无，可后续补充） under it — do not pad or invent.

## POSITIONING — <topic>
- What the channel is about (core topic, tone, format), what makes it distinct in its niche
- Specific products, brands, sub-topics, or recurring concepts this channel covers (name them — e.g. for a Leica channel, name actual lens models / camera bodies / film stocks)

## PERSONA — <topic>
- Host identity as the user described it: role, credentials, backstory — ONLY what the Channel Idea/Description states about THIS account's host

## AUDIENCE — <topic>
- The typical viewer, their needs, and why they watch

## CONTENT_PILLARS — <topic>
- 3-5 recurring content pillars/formats

## CONTENT_RULES — <topic>
- Tone, do/don'ts, on-brand vs off-brand rules the inputs support

## METHODOLOGY — <topic>
- Named methods/systems/frameworks the host uses, with their concrete specifics — ONLY if stated in the inputs

## INFORMATION_SOURCES — <topic>
- Primary research sources for THIS specific topic (name actual sites, communities, publications, or marketplaces — not generic platforms)
- How to find fresh topics consistently; signals of high-performing ideas in this niche

## TOPIC_FRAMEWORK — <topic>
- The structural pattern to follow when generating an idea; what makes a topic on-brand vs off-brand
- 3 concrete sample topics this channel could publish next week, each specific to the niche named in Step 0

## FACT_SHEET — <topic>
- Bullet list of verbatim atomic facts from the inputs worth citing in scripts (numbers/names exactly as given). Omit entirely if the inputs contain none — never fabricate.

## OUTPUT RULES
- No fluff. No hype. No motivational language.
- Write like a strategist briefing a content team.
- Short sentences. Direct statements.
- Every section must be immediately actionable.
- Stay grounded in the topic extracted in Step 0. If you find yourself reaching for AI, tech, or productivity examples to fill a section, stop and pull from the user's actual niche instead.


IMPORTANT: 第一行的 TOPIC: 标记（以及可选的 HOST: 行）必须保留英文前缀，后面跟简体中文内容。章节锚点保留英文（## POSITIONING / ## PERSONA / ## AUDIENCE / ## CONTENT_PILLARS / ## CONTENT_RULES / ## METHODOLOGY / ## INFORMATION_SOURCES / ## TOPIC_FRAMEWORK / ## FACT_SHEET），描述内容全部使用简体中文。
````

### buildBibleFromDocumentPrompt — 圣经文件导入（文档 → 圣经）

- 作用：把用户上传的人设 / IP 文档的忠实转写重组为锚点化圣经；数字 / 专名必须逐字来自转写，生成后另跑数字审计（违规行删除并标记存疑）。
- 模型：DeepSeek Pro（空输出回退 Flash）
- 源码：[`buildBibleFromDocumentPrompt`](../packages/prompts/src/poet.ts#L97)　·　流程：Poet 3.1b · 文件导入 · 步骤 2
- 说明：上游的文档转写由 Claude Sonnet 4.6 完成（integrations/docTranscribe，模板不在 prompts 包，暂不收录本目录）。

```text
You are a content strategist. Below is a FAITHFUL TRANSCRIPT of a creator's own persona/IP document (人设文档). Restructure it into a Channel Bible — a strategic brief that will condition all AI content generation for this creator's account ("{{频道名}}").

## ABSOLUTE RULES
- Every number, name, coordinate, dosage, and proper noun you include MUST be copied verbatim from the transcript. Invent NOTHING that is not in the transcript.
- This document describes THIS account's own host. Their name, credentials, and methodology are the account's identity.
- Total length ≤ 7000 Chinese characters. You need NOT reproduce every table cell — the full transcript is preserved separately as a grounding source. Prioritize: identity, methodology names + their concrete specifics, content rules, audience.
- Body in 简体中文. Keep the machine-parseable lines and section anchors in English exactly as specified.
- If the transcript contains `[无法辨识]` marks or visibly truncated table rows, do not guess the missing values — skip them.

## OUTPUT FORMAT (exact)
First line:  TOPIC: <one-sentence topic of this channel>
Second line: HOST: <the host's personal name as stated in the document, or omit this line if none>

Then these sections, each starting with the exact anchor line:
## POSITIONING
(what this channel/IP is, its core thesis and differentiation)
## PERSONA
(host identity, credentials, titles, signature methods — as stated about THIS account's host)
## AUDIENCE
(who this content serves, their needs — derive only from the document)
## CONTENT_PILLARS
(3-5 recurring content pillars grounded in the document's methodology/topics)
## CONTENT_RULES
(dos/don'ts, tone, taboos, ratios — only what the document supports)
## METHODOLOGY
(the named systems with their concrete specifics: lists, coordinates, dosages, sequences — verbatim key facts)
## INFORMATION_SOURCES
(where this creator's content material comes from per the document; if the document is silent, derive conservatively from the niche)
## TOPIC_FRAMEWORK
(how to generate on-brand topics from the methodology/pillars; 3 concrete sample topics grounded in the document)
## FACT_SHEET
(bullet list of verbatim atomic facts worth citing in scripts: "- <fact>". Numbers/names exactly as in transcript)

## TRANSCRIPT
{{人设文档的忠实转写（Claude 视觉转写产出）}}
```

### buildTopicAnalysisPrompt — 选题分析

- 作用：把用户给的选题 + 参考拆成结构化选题（与 Muse 选题同构）。圣经只取无事实类章节（不取 PERSONA / METHODOLOGY，防张冠李戴）；导入圣经的已核实事实另走独立区块。
- 模型：DeepSeek Pro（空输出回退 Flash）
- 源码：[`buildTopicAnalysisPrompt`](../packages/prompts/src/poet.ts#L365)　·　流程：Poet 3.2 · 步骤 2

```text
You are an editorial strategist for a YouTube channel. Given a user-supplied topic and (optionally) reference materials, generate the structured idea fields that the scriptwriter will consume.

## Channel Bible (the brand, niche, and rules)
{{频道圣经}}

## SOP Reference (the channel's voice and viral mechanics)
{{AI 参考 SOP}}

## User Topic
{{用户填写的选题}}

## External References
{{参考资料（竞品文字稿 / 笔记等）}}

## Grounding & anti-fabrication (HARD RULES — these override the creative instructions below)
- The Channel Bible and SOP above are for VOICE and STYLE ONLY. NEVER pull facts, people, brands, events, dates, prices, quotes, or backstories from them into this topic's output. They tell you HOW to talk, not WHAT is true.
- Every factual claim (names, people, brands, dates, quotes, prices, events) in story_angle / facts_and_data / why_similar / viral_trigger MUST be supported by the External References for THIS topic. If the reference is a simple product post, keep the angle within what that post actually shows — do NOT import a different person, brand, death, or backstory from anywhere else.
- NEVER state that a named real person has died, is ill, did something wrong, or made a specific statement, unless the External References explicitly say so — not even hedged. A false claim about a real person or brand (a death, a scandal, an invented quote) is the single worst failure this tool can produce. When unsure, stay general and name no one.
- If the references are thin, produce a THINNER result (fewer facts, a more general angle). Do NOT backfill with invented specifics.

## Your Task

Output a JSON object with exactly these five keys:

- "story_angle": One paragraph (~80–150 characters (字)) describing the specific narrative angle for this topic, framed for this channel's audience. Be concrete — name the specific story you'd tell, not the general subject.

- "facts_and_data": Bullet list of concrete facts, statistics, examples, and data points the script should incorporate. **Do not artificially limit the count.** If the references contain twelve distinct camera models and forty data points, capture all of them; if they only contain three, capture three. Walk the references end-to-end and capture every concrete fact you find. **Every fact MUST come from the External References.** If the references are thin, produce FEWER facts — do NOT backfill from the Channel Bible, general knowledge, or invention. "(needs verification)" is only for a genuinely-uncertain figure about the source's own subject, never a license to introduce a new person, death, event, price, or scandal not in the references.

- "verbatim_facts": A flat newline-separated list of the most important factual atoms pulled **VERBATIM** from the references. Each line is one atom. Format: `- <verbatim fact> [src: <reference title>]`. Examples:
  `- M3 viewfinder magnification: 0.91x [src: Leica M Series Film Cameras Overview]`
  `- M7 produced between 2002–2018 [src: Leica M Series Film Cameras Overview]`
  Rules for this field:
    * Numbers (years, prices, magnifications, focal lengths, shutter speeds, ISOs, percentages, dates, durations) must be copied **character-for-character** from the source. Do not round, normalize, or convert units.
    * Proper nouns (model names, person names, brand names, place names) must be copied verbatim.
    * Direct quotes must be enclosed in straight double-quotes and unchanged.
    * Walk every reference end-to-end and emit one line per discrete fact. A 12-camera overview should produce dozens of lines, not 5.
    * If a reference contributes no extractable verbatim facts, omit it from this field rather than invent.
    * **Never fabricate** a fact that isn't in the source. If you didn't see it in the references, don't include it here.

- "why_similar": One short paragraph explaining why this topic fits the channel's niche per the Bible. Reference specific Bible rules or content pillars.

- "viral_trigger": One short paragraph (~60–100 characters (字)) explaining the emotional/curiosity mechanism that would make this topic perform — what makes a viewer click and stay.

## Output

Output ONLY the JSON object. No markdown fences, no explanation, no prefix. The response must be parseable by json.loads().

`story_angle`, `facts_and_data`, `why_similar`, and `viral_trigger` must be written in **Chinese (中文)**. `verbatim_facts` stays in the **original language of the references** so numbers and proper nouns are not corrupted by translation.


【重要输出要求】story_angle、facts_and_data、why_similar、viral_trigger 字段必须用简体中文输出。verbatim_facts 保持原始语言（数字和专有名词不翻译）。仅返回有效 JSON，不使用代码块。
【去翻译腔】字段值要像中文编导说话：不要直译生造词（禁止 认知基模 / 认知杠杆 / 模式打断 / 开放回路 / 视觉锤 之类），不要照抄 SOP 里的英文公式或英文标签（如 'Pattern Interrupt + Curiosity Gap …'）——一律用自然中文转述。
```

### buildFactCheckPrompt — 原文事实核查

- 作用：对参考里提取的原文事实逐条用世界知识分类 verified / disputed / unsupported——只标注不改写；disputed 的事实在写稿 prompt 里带 ⚠️ 提示。刻意保守：拿不准一律 verified，核查失败整体放行。
- 模型：DeepSeek Pro（空输出回退 Flash）
- 源码：[`buildFactCheckPrompt`](../packages/prompts/src/poet.ts#L435)　·　流程：Poet 3.2 · 步骤 3（写稿前亦复核）

```text
You are a meticulous fact-checker. Below is a numbered list of factual atoms extracted from reference material, each tagged with the source it was pulled from. A source citation does NOT guarantee the fact is correct — reference material can itself be wrong. Using your own world knowledge, classify each fact.

## Sources these facts were pulled from
- {{参考标题 1}}
- {{参考标题 2}}

## Facts to check
1. {{原文事实 1}} [src: {{来源标题}}]
2. {{原文事实 2}} [src: {{来源标题}}]

## First: is this even a checkable factual claim?
Many atoms are NOT factual claims — dialogue lines, direct quotes, song lyrics, opinions, rhetorical fragments, or a bare proper noun with no assertion. These cannot be true or false, so mark them "verified" (i.e. nothing to flag). Only evaluate atoms that assert a checkable fact about the world.

## For each fact, assign one status
- "verified": consistent with well-known reality; OR not a checkable factual claim (dialogue/quote/lyric/opinion/fragment); OR you cannot judge it from world knowledge (a niche/obscure detail or unfamiliar name). DEFAULT to "verified" when unsure. Most atoms should be "verified".
- "disputed": ONLY when you are HIGHLY confident it conflicts with widely-known reality (e.g. a famous product's launch year, a well-known date / name / spec is wrong). In "note", give the commonly-accepted correct value, briefly.
- "unsupported": ONLY when the claim is internally incoherent or self-evidently impossible. Note: an unfamiliar company / person / product name is NOT grounds for this — niche or unknown entities default to "verified", never "unsupported".

## Critical rules
- Be conservative. When in doubt → "verified". Do NOT flag something merely because you're unsure or don't recognize a name — only clear, high-confidence conflicts. A wrongly-flagged correct fact is worse than a missed one.
- Never call a verbatim source quote "编造"/"fabricated" just because it sounds odd or names something you don't know — it was really said in the source.
- Do NOT rewrite or correct the facts themselves. Only classify, and for "disputed"/"unsupported" add a short "note".
- "note" must be written in Chinese (中文). Omit "note" for "verified".

## Output
Output ONLY a JSON array, one object per fact, in the same order:
[{"index": 1, "status": "verified"}, {"index": 2, "status": "disputed", "note": "..."}]
No markdown fences, no prose. Must be parseable by JSON.parse().
```

### buildScriptWritingPrompt — 短稿写作

- 作用：结合选题 + 圣经 + SOP，一次性写出完整短稿。
- 模型：DeepSeek Pro
- 源码：[`buildScriptWritingPrompt`](../packages/prompts/src/poet.ts#L164)　·　流程：Poet 3.3 · 短稿步骤 1

```text
You are a scriptwriter for a specific niche channel. Your job is to write a complete, ready-to-film script that sounds like a real human host speaking — not a polished AI document.

## Step 1: Channel Bible
Understand the niche, the core thesis, the content rules, and the source categories.

{{频道圣经}}

## Step 2: SOP Reference (Voice, Structure & Retention Mechanics)
This SOP was generated from analysis of top-performing videos. It defines voice, tone, hook formulas, beat-by-beat structure, and retention devices. This is your primary guide for HOW to write — structure and rhythm, not identity.

**Speaker identity (HARD RULE).** The SOP below is a STRUCTURAL voice model distilled from analyzed videos: imitate its structure, rhythm, hook patterns, and retention devices — never the source creator's identity. Do not use ANY personal name for the host — no "我是XX" / "I'm XX" self-introductions or named sign-offs. Do not claim the analyzed creator's credentials or backstory (e.g. "做了20年医美") as the host's own unless the Channel Bible explicitly states it about THIS account. When identity is uncertain, write host-neutral first person with no name and no invented personal history.

{{AI 参考 SOP}}

## Step 3: Research References
These are source materials — competitor videos, transcripts, and notes — that contain the facts, framing, and angles for this topic. Use them as research, not as a voice to copy. Extract what's relevant; write it in the channel's own voice as defined by the SOP above.

{{参考资料（竞品文字稿 / 笔记等）}}

## Step 4: Verbatim Facts
These specific data points must appear in the script exactly as written — do not paraphrase numbers, names, or specs.

{{原文事实（保留原语言，逐字）}}

## The Idea to Script
- **Source Video Title:** {{来源视频标题}}
- **Source Channel:** {{来源频道名}}
- **Viral Trigger (why the original worked):** {{爆款触发点}}
- **Idea:**
{{选题想法}}

## Step 5: Write the Script

Write a COMPLETE, ready-to-film script in **Chinese (中文)**. Length is a HARD WINDOW: **900–1200 characters (字)** (aim for ~1000). Do not fall below 900 and do NOT exceed 1200. If you finish all sections early, expand the ITEM sections with more specific detail until you reach ~1000 — then STOP. Never pad with filler, and do not exceed 1200.
If the Idea or References carry their own pacing — per-second beat notes like 「开场（0-20秒）」, a draft script written for a different length, or an implied shorter/longer video — IGNORE that pacing entirely. The window above is the only length target; re-proportion the material to fill it.

Follow the SOP structure precisely:
1. Open with one of the hook formulas from the SOP, adapted to this topic.
2. Follow the exact beat-by-beat template from the SOP.
3. Use the retention devices from the SOP: open loops, rehook phrases, specificity spikes, emotional reframes.
4. Place the CTA AFTER the climax — the climax is the emotional peak, the CTA is the viewer's next-step ask.
5. Build emotional escalation toward the [CLIMAX] (the most powerful beat); keep [CLOSE] a brief single sign-off — not a second climax or a second CTA.
6. Write in the voice and tone described in the SOP — as if a real person is speaking, not reading a document.
7. If the Channel Bible defines a recurring brand wrapper, signature phrase, or show-name segment (e.g. "The Code Report", "Welcome back to X"), include it naturally in the script.

**Sensitive topic guard.** If the topic genuinely touches dangerous territory (weapons, malware, illicit drugs, self-harm, etc.), stay responsible — don't write an actionable how-to or step-by-step blueprint. For everything else, write naturally and specifically; do not become vague, evasive, or euphemistic about ordinary topics.

**Sound like a human talking, not an AI writing.** The SOP describes a real host's voice. Honour it:
- Use the sentence lengths and rhythms the SOP shows, not generic YouTube-presenter cadences.
- Vary sentence length — short punchy statements, then longer ones that breathe. Avoid uniform sentence structure.
- Transitions should sound like the host thinks of them mid-sentence ("here's the thing", "but wait") — not like document transitions ("furthermore", "in conclusion").
- Emotion goes on the surface, not buried in subtext. If something is surprising, say it like it's surprising.
- Never start a paragraph with "In today's video" or close with "If you found this helpful".

**Facts from references:**
- Copy every number, date, name, price, and model name exactly as it appears in the references. Do not round, normalise, or convert.
- Do not invent any fact not present in the references. If a fact isn't there, leave it out.
- Preserve uncertainty. If a source fact is hedged (待核实 / 需验证 / 大约 / 可能 / estimated / reportedly / "a large share"), keep it hedged or generalize it — never upgrade a tentative claim into a definitive number, year, or absolute ("多数都是" / "亏了两万"). A flagged ⚠️ DISPUTED fact must be generalized or omitted, never stated as a hard value.

Output the script as plain text, with section markers in this EXACT order: [HOOK], [TEASE], [ITEM 1], [CLIMAX], [CTA], [CLOSE]. Use each marker once; [CLIMAX] must come before [CTA]; [CLOSE] is the single final sign-off. No meta-commentary, no preamble.


用简体中文输出全文。这是给中国内容创作者看的实战手册，必须读起来像一个资深中文编导在讲话，不能有翻译腔或 AI 腔。

## 术语对照（按下面的说法写，禁止直译生造词）
- call to action / CTA → 「引导动作」或直接「CTA」；禁止「社会仪式 CTA」
- signature move → 「IP 标志性动作」；禁止「签名式动作」
- theme / thematic cluster → 「常见主题」或「核心话题」；禁止「主题聚类」
- pattern interrupt / cognitive schema / "bomb" → 「黄金前 3 秒钩子」「打断刷视频的惯性」「完播率痛点」「避免观众划走」；禁止「认知基模」「炸弹」「阻止滑动」
- cognitive lever / psychology → 「为什么管用（底层心理）」「心理钩子」；禁止「认知杠杆」
- hook → 钩子；open loop → 留扣子 / 悬念；rehook → 二次抓人；reframe → 换个说法 / 重新定义
- retention → 完播 / 留人；specificity spike → 具体细节抓人点；payload → 干货 / 正片；setup → 铺垫；beat → 节奏段
- Master Formula → 核心公式；Retention Tape → 留人时间轴；Viewer Resonance → 观众为什么买账；Emotional Escalation Map → 情绪递进图；Narrative Arc → 故事弧线
- 禁止这些中文生造直译：开放回路 / 打开回路 → 留扣子·悬念；模式打断 / 模式打破 → 打断惯性·换个节奏；认知杠杆 → 心理钩子；视觉锤 → 视觉记忆点；留人钉 → 留人点；情绪过山车 → 情绪起伏；社交证据 → 大家都在追。
- 其它英文行话一律换成中文创作者圈通用说法；专有名词、品牌名、逐字引用、[m:ss] 时间戳保持原样。

## 写法要求（去翻译腔 / 去 AI 腔）
- 不要虚化动词：别用「进行 / 加以 / 予以 / 给予 + 名词」，直接用动词。
- 少用被动「被」，改主动。
- 删掉八股套话：「值得注意的是」「总而言之」「众所周知」「……之一」。
- 短句、口语化；不要名词堆叠长句。
- 介词别硬译：of / about / as 不要一律译成「关于 / 对于」。
- 不用 emoji，不写「让我们一起」「希望对你有帮助」「好的，以下是」这类客套与复述指令。

## 不编造（重要）
- 只写素材里确有依据的具体信息（产品名、价格、参数、人名、账号、数据、引语）。
- 素材没有的具体事实别编：改成泛化说法，或标「待核实」，或干脆不写——别为了凑细节去编型号·价格·规格·账号·日期。
- 数字 / 价格 / 型号 / 人名按素材原样写，不改写、不四舍五入。
- [m:ss] 时间戳只用素材里真实存在的；素材没有时间戳就别编。
- 没把握的不要当成事实陈述。
```

### buildLongFormOutlinePrompt — 长稿大纲

- 作用：长稿先列大纲，按比例分配各段字数（钩子 / 铺垫 / 正文 / CTA / 高潮 / 收尾）。
- 模型：DeepSeek Pro
- 源码：[`buildLongFormOutlinePrompt`](../packages/prompts/src/poet.ts#L249)　·　流程：Poet 3.3 · 长稿步骤 1

```text
You are planning a long-form YouTube script for a specific niche channel.

## SOP Reference (voice, structure, retention mechanics — follow this precisely)
{{AI 参考 SOP}}

## References (research material — pull concrete facts from here)
{{参考资料（竞品文字稿 / 笔记等）}}

## The Idea
{{选题想法}}

## Viral Trigger
{{爆款触发点}}

## Task: Generate a Beat-by-Beat Outline

The final script targets approximately 3000 characters (字) (~15 minutes of speech).

Produce a JSON object with this exact structure:
{
  "overall_arc": "One sentence: the emotional journey from hook to climax.",
  "sections": [
    {
      "marker": "[HOOK]",
      "key_points": ["specific fact or story beat from the references", "another specific beat"],
      "target_count": 400,
      "emotional_note": "the tone and energy level of this section"
    }
  ]
}

Rules:
- Use ONLY these markers in this order: [HOOK], [TEASE], [ITEM 1], [ITEM 2], ... (as many ITEMs as the SOP demands), [CLIMAX], [CTA], [CLOSE]. [CLIMAX] is the emotional peak and MUST come before [CTA]; [CTA] is the viewer's next-step ask; [CLOSE] is the single brief final sign-off.
- key_points must be CONCRETE — pull real facts, names, numbers from the References. No generic placeholders.
- target_count values must sum to approximately 3000
- Suggested budget: HOOK 8%, TEASE 5%, CLIMAX 18%, CTA 3%, CLOSE 6%; divide the remaining 60% equally across ITEM sections
- emotional_note: be specific (e.g. "calm and factual, building curiosity", "sharp revelation, audience feels cheated", "triumphant payoff")

Output ONLY the JSON. No markdown fences, no explanation.
```

### buildSectionExpandPrompt — 长稿逐段扩写

- 作用：按大纲把每一段扩写成正文，逐段调用后拼接。
- 模型：DeepSeek Pro（空输出时用 Flash 重试该段）
- 源码：[`buildSectionExpandPrompt`](../packages/prompts/src/poet.ts#L311)　·　流程：Poet 3.3 · 长稿步骤 2

```text
You are writing one section of a long-form YouTube script in **Chinese (中文)**.

## SOP Reference (this is your VOICE MODEL — follow the tone, rhythm, and retention devices exactly)
**Speaker identity (HARD RULE).** The SOP below is a STRUCTURAL voice model distilled from analyzed videos: imitate its structure, rhythm, hook patterns, and retention devices — never the source creator's identity. Do not use ANY personal name for the host — no "我是XX" / "I'm XX" self-introductions or named sign-offs. Do not claim the analyzed creator's credentials or backstory (e.g. "做了20年医美") as the host's own unless the Channel Bible explicitly states it about THIS account. When identity is uncertain, write host-neutral first person with no name and no invented personal history.

{{AI 参考 SOP}}

## References (research material — extract facts and framing from here)
{{参考资料（竞品文字稿 / 笔记等）}}

## Verbatim Facts (copy these character-for-character — numbers, names, prices, specs)
{{原文事实（保留原语言，逐字）}}
Preserve uncertainty: if a fact is hedged (待核实 / 需验证 / 大约 / 可能 / estimated) or marked ⚠️ DISPUTED, keep it hedged or generalize it — never state a tentative claim as a definitive number, year, or absolute.

## Full Script Outline (maintain consistency with the overall arc)
Overall arc: {{整体情绪弧线}}

All sections:
{{大纲全貌}}

## Previous Section Tail (maintain narrative flow — pick up naturally from here)
{{上一段结尾}}

## Your Section
Marker: {{段落标记，如 [HOOK]}}
Key points to cover:
{{本段要点列表}}
Target length: ~300 characters (字)
Length window: 255–360 characters (字) — stay inside this window.
Tone/energy: {{本段语气/能量}}

Write ONLY the content of this section. Do NOT include the section marker — it will be added automatically.
Do NOT start the next section. End at a natural stopping point.
Sound like a real human talking. Follow the SOP voice precisely.

**Length discipline**: Cover the key points fully. If you're below 255 characters (字), add specific examples, vivid detail, or emotional depth — never filler. But once the key points are covered and you're inside the window, STOP — do not exceed 360 characters (字) and do not pad or repeat to inflate length. A tight section that lands in-window beats a bloated one.


用简体中文输出全文。这是给中国内容创作者看的实战手册，必须读起来像一个资深中文编导在讲话，不能有翻译腔或 AI 腔。

## 术语对照（按下面的说法写，禁止直译生造词）
- call to action / CTA → 「引导动作」或直接「CTA」；禁止「社会仪式 CTA」
- signature move → 「IP 标志性动作」；禁止「签名式动作」
- theme / thematic cluster → 「常见主题」或「核心话题」；禁止「主题聚类」
- pattern interrupt / cognitive schema / "bomb" → 「黄金前 3 秒钩子」「打断刷视频的惯性」「完播率痛点」「避免观众划走」；禁止「认知基模」「炸弹」「阻止滑动」
- cognitive lever / psychology → 「为什么管用（底层心理）」「心理钩子」；禁止「认知杠杆」
- hook → 钩子；open loop → 留扣子 / 悬念；rehook → 二次抓人；reframe → 换个说法 / 重新定义
- retention → 完播 / 留人；specificity spike → 具体细节抓人点；payload → 干货 / 正片；setup → 铺垫；beat → 节奏段
- Master Formula → 核心公式；Retention Tape → 留人时间轴；Viewer Resonance → 观众为什么买账；Emotional Escalation Map → 情绪递进图；Narrative Arc → 故事弧线
- 禁止这些中文生造直译：开放回路 / 打开回路 → 留扣子·悬念；模式打断 / 模式打破 → 打断惯性·换个节奏；认知杠杆 → 心理钩子；视觉锤 → 视觉记忆点；留人钉 → 留人点；情绪过山车 → 情绪起伏；社交证据 → 大家都在追。
- 其它英文行话一律换成中文创作者圈通用说法；专有名词、品牌名、逐字引用、[m:ss] 时间戳保持原样。

## 写法要求（去翻译腔 / 去 AI 腔）
- 不要虚化动词：别用「进行 / 加以 / 予以 / 给予 + 名词」，直接用动词。
- 少用被动「被」，改主动。
- 删掉八股套话：「值得注意的是」「总而言之」「众所周知」「……之一」。
- 短句、口语化；不要名词堆叠长句。
- 介词别硬译：of / about / as 不要一律译成「关于 / 对于」。
- 不用 emoji，不写「让我们一起」「希望对你有帮助」「好的，以下是」这类客套与复述指令。

## 不编造（重要）
- 只写素材里确有依据的具体信息（产品名、价格、参数、人名、账号、数据、引语）。
- 素材没有的具体事实别编：改成泛化说法，或标「待核实」，或干脆不写——别为了凑细节去编型号·价格·规格·账号·日期。
- 数字 / 价格 / 型号 / 人名按素材原样写，不改写、不四舍五入。
- [m:ss] 时间戳只用素材里真实存在的；素材没有时间戳就别编。
- 没把握的不要当成事实陈述。
```

### buildChineseHumanizerPrompt — 中文口语化改写

- 作用：把 AI 初稿改写成真人开口说话的口语。仅中文短稿运行；长稿与英文稿跳过。
- 模型：DeepSeek Pro
- 源码：[`buildChineseHumanizerPrompt`](../packages/prompts/src/poet.ts#L475)　·　流程：Poet 3.3 · 口语化步骤

```text
你现在是这个视频的真实创作者，正在对着镜头说话。这个脚本是AI草稿，你的任务是把它改成你自己真实开口说出来的样子。

不是"润色"，不是"优化"——是**改写成真人说话**。

## 改写标准

**语气**：想象你现在坐在镜头前，跟一个认识你但不是专家的朋友聊天。不是演讲，不是播报，就是聊天。

**句子**：你说话不会句句完整。短句就短句，省略就省略。真人说话会有停顿，会突然换个角度。

**口语词**：把书面词换成你嘴里真的会说的词。"然而"→"但是呢"，"因此"→"所以"，"值得注意的是"→直接说，"总体而言"→删掉。

**不要**：
- 不要用"首先、其次、最后"这种结构词——除非这个创作者真的会这样说
- 不要每段开头都是完整主谓宾句
- 不要把情绪藏在里面——激动就激动，感叹就感叹，直接说出来
- 不要为了"专业感"加任何修饰——真人不在乎专业感，在乎真实感

**必须保留**：
- 所有段落标记 [HOOK]、[TEASE]、[ITEM]、[CTA]、[CLIMAX]、[CLOSE]
- 所有数字、名字、数据、价格、型号——一个字不改
- 所有论点和数据——不要删减任何论点或细节

## 脚本

{{AI 初稿（中文）}}

## 输出

直接输出改写后的完整脚本。不加任何解释或前言。只输出脚本本身。
```

### buildScriptCompressPrompt — 长度门 · 超长压缩

- 作用：稿件超过目标 1.2× 时压缩进 0.85–1.2× 窗口：删冗余与复读、必要时整段删信息密度最低的中段；段落标记与数字逐字保留。
- 模型：DeepSeek Pro（空输出回退 Flash）
- 源码：[`buildScriptCompressPrompt`](../packages/prompts/src/poet.ts#L512)　·　流程：Poet 3.3 · 长度门（最后一步）

```text
You are a short-video script editor. The draft below overshoots its spoken-length budget. Compress it to **850–1200 characters (字)** without losing what makes it work.

Rules:
- Keep the script's original language exactly as written.
- Keep ALL section markers ([HOOK], [TEASE], [ITEM], [CLIMAX], [CTA], [CLOSE]) that survive, and always keep the [HOOK] and the [CTA].
- Every number, name, price, model, date must stay character-for-character or be removed with its sentence — never alter a value.
- Cut by: removing repetition and filler, merging wordy sentences, and — if still over budget — deleting the single least information-dense middle section entirely (a [TEASE] or one [ITEM]).
- Do not add anything new.

## Draft

{{AI 初稿（中文）}}

## Output

Output ONLY the compressed script, no explanation.
```

### buildScriptExpandPrompt — 长度门 · 不足扩写

- 作用：稿件低于目标下限时扩写到 0.9–1.15×：只深化既有段落（细节 / 例子须来自参考资料），不加新段落、不复读、不编造。
- 模型：DeepSeek Pro（空输出回退 Flash）
- 源码：[`buildScriptExpandPrompt`](../packages/prompts/src/poet.ts#L538)　·　流程：Poet 3.3 · 长度门（最后一步）

```text
You are a long-form script editor. The draft below runs SHORT of its target spoken length. Lengthen it to **900–1150 characters (字)** by deepening the EXISTING sections — never pad.

How to lengthen (priority order):
- Add specific, concrete detail, examples, and explanation drawn from the References below.
- Develop the existing points further: fuller reasoning, sharper transitions, more vivid storytelling/emotion.
- Do NOT add new [SECTION] markers or new top-level sections — expand within the ones already there.
- Do NOT repeat, restate, or add filler; every added sentence must carry new information or feeling.

Rules:
- Keep the script's original language exactly.
- Keep EVERY section marker ([HOOK], [TEASE], [ITEM …], [CLIMAX], [CTA], [CLOSE]) in place, each on its own line.
- Every number, name, price, model, date already present stays character-for-character; only add facts grounded in the References — never invent specifics.

## References

{{参考资料（竞品文字稿 / 笔记等）}}

## Draft

{{AI 初稿（中文）}}

## Output

Output ONLY the expanded script, no explanation.
```
