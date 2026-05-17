// 1:1 port of archive backend/app/prompts/poet_prompts.py — wording preserved.
// LONG_FORM_OUTLINE / SECTION_EXPAND / TOPIC_ANALYSIS deferred to W6.

import { CHINESE_WRAPPER } from "./clerk";

type ChannelBibleArgs = {
  ideaText: string;
  channelDescription: string;
  language?: "en" | "zh";
};

export function buildChannelBiblePrompt(args: ChannelBibleArgs): string {
  const inner = `You are a content strategist producing a Channel Bible — a strategic brief for a specific social-media channel.

## Step 0: Topic Extraction
Read the Channel Idea and Channel Description below carefully. In one short sentence (max ~12 words), identify the channel's actual subject matter — the concrete niche the user described. Examples of well-formed topic sentences:
- "Leica cameras and photography gear for collectors and serious hobbyists"
- "Italian regional home cooking with a focus on Sicily"
- "Stoic philosophy applied to startup founders"
- "Park-walking and slow-life vlogs for office workers in Beijing"

Use this exact subject as the SUBJECT throughout your entire output. Echo it back in every section heading (e.g. \`## 1. CHANNEL DESCRIPTION — <topic>\`).

**ABSOLUTE RULE — do not substitute the topic.** Do NOT extend, pivot, or "bend" the channel into a different subject. Specifically, do NOT default to AI, LLMs, ChatGPT, productivity tools, tech startups, or any topic the user did not name. If the user describes a camera channel, the Bible is about cameras — not "AI for photographers". If the user describes a cooking channel, the Bible is about cooking — not "AI recipe generators". Stay strictly inside the niche the user actually wrote.

## Inputs

**Channel Idea:** ${args.ideaText}

**Channel Description:** ${args.channelDescription}

## Output Format

Begin your response with a single machine-parseable line:
\`\`\`
TOPIC: <the one-sentence topic from Step 0>
\`\`\`

Then produce the following sections.

## 1. CHANNEL DESCRIPTION — <topic>
- What the channel is about (core topic, tone, format, audience)
- What makes this channel distinct in its niche
- Specific products, brands, sub-topics, or recurring concepts this channel covers (name them — e.g. for a Leica channel, name actual lens models / camera bodies / film stocks)
- Content pillars (3-5 recurring formats)
- The typical viewer and why they watch

## 2. INFORMATION SOURCES — <topic>
Where to find content for this channel:
- Primary research sources for THIS specific topic (name the actual sites, communities, publications, or marketplaces — not generic platforms)
- How to find fresh topics consistently
- What signals to watch for high-performing ideas in this niche

## 3. TOPIC GENERATION FRAMEWORK — <topic>
How to consistently come up with new video topics that fit this channel:
- The structural pattern to follow when generating an idea
- What makes a topic on-brand vs. off-brand for this channel
- 3 concrete sample topics this channel could publish next week. Each must be specific to the niche named in Step 0.

## OUTPUT RULES
- No fluff. No hype. No motivational language.
- Write like a strategist briefing a content team.
- Short sentences. Direct statements.
- Every section must be immediately actionable.
- Stay grounded in the topic extracted in Step 0. If you find yourself reaching for AI, tech, or productivity examples to fill a section, stop and pull from the user's actual niche instead.
`;
  if (args.language !== "zh") return inner;
  return (
    CHINESE_WRAPPER(inner) +
    '\n\nIMPORTANT: 第一行的 TOPIC: 标记必须保留英文前缀（TOPIC:），后面跟一句简体中文话题。章节标号与英文 SECTION 锚点保留（CHANNEL DESCRIPTION / INFORMATION SOURCES / TOPIC GENERATION FRAMEWORK），但描述内容全部使用简体中文。'
  );
}

type ScriptWritingArgs = {
  channelBible: string;
  sopReference: string;
  referencesContext: string;
  verbatimFactsContext: string;
  sourceTitle: string;
  sourceChannel: string;
  viralTrigger: string;
  ideaText: string;
  language: "en" | "zh";
  targetWordCount: number;
};

export function buildScriptWritingPrompt(args: ScriptWritingArgs): string {
  const languageName = args.language === "zh" ? "Chinese (中文)" : "English";
  const lengthUnit = args.language === "zh" ? "characters (字)" : "words";
  const minWordCount = Math.round(args.targetWordCount * 0.9);

  // Script-writing prompt is intentionally English-instruction even for Chinese
  // output — the LLM follows English structure better. The `language_name`
  // variable controls the actual output language.
  return `You are a scriptwriter for a specific niche channel. Your job is to write a complete, ready-to-film script that sounds like a real human host speaking — not a polished AI document.

## Step 1: Channel Bible
Understand the niche, the core thesis, the content rules, and the source categories.

${args.channelBible}

## Step 2: SOP Reference (Voice, Structure & Retention Mechanics)
This SOP was generated from analysis of the channel's top-performing videos. It defines the host's actual voice, tone, hook formulas, beat-by-beat structure, and retention devices. This is your primary guide for HOW to write.

${args.sopReference}

## Step 3: Research References
These are source materials — competitor videos, transcripts, and notes — that contain the facts, framing, and angles for this topic. Use them as research, not as a voice to copy. Extract what's relevant; write it in the channel's own voice as defined by the SOP above.

${args.referencesContext}

## Step 4: Verbatim Facts
These specific data points must appear in the script exactly as written — do not paraphrase numbers, names, or specs.

${args.verbatimFactsContext}

## The Idea to Script
- **Source Video Title:** ${args.sourceTitle}
- **Source Channel:** ${args.sourceChannel}
- **Viral Trigger (why the original worked):** ${args.viralTrigger}
- **Idea:**
${args.ideaText}

## Step 5: Write the Script

Write a COMPLETE, ready-to-film script in **${languageName}**. Target **${args.targetWordCount} ${lengthUnit}** — this is not a suggestion, it is the required output length. Do not end the script before reaching at least 90% of this count (${minWordCount} ${lengthUnit}). If you finish all sections early, expand the ITEM sections with more specific examples, detail, and emotional beats until you reach the minimum.

Follow the SOP structure precisely:
1. Open with one of the hook formulas from the SOP, adapted to this topic.
2. Follow the exact beat-by-beat template from the SOP.
3. Use the retention devices from the SOP: open loops, rehook phrases, specificity spikes, emotional reframes.
4. Place the CTA according to the SOP rules.
5. Build emotional escalation — the final beat must be the most powerful.
6. Write in the voice and tone described in the SOP — as if a real person is speaking, not reading a document.

**Sound like a human talking, not an AI writing.** The SOP describes a real host's voice. Honour it:
- Use the sentence lengths and rhythms the SOP shows, not generic YouTube-presenter cadences.
- Vary sentence length — short punchy statements, then longer ones that breathe. Avoid uniform sentence structure.
- Transitions should sound like the host thinks of them mid-sentence ("here's the thing", "but wait") — not like document transitions ("furthermore", "in conclusion").
- Emotion goes on the surface, not buried in subtext. If something is surprising, say it like it's surprising.
- Never start a paragraph with "In today's video" or close with "If you found this helpful".

**Facts from references:**
- Copy every number, date, name, price, and model name exactly as it appears in the references. Do not round, normalise, or convert.
- Do not invent any fact not present in the references. If a fact isn't there, leave it out.

Output the script as plain text. Include section markers [HOOK], [TEASE], [ITEM 1], [CTA], [CLIMAX], [CLOSE]. No meta-commentary, no preamble.
`;
}

export function buildChineseHumanizerPrompt(scriptText: string): string {
  return `你现在是这个视频的真实创作者，正在对着镜头说话。这个脚本是AI草稿，你的任务是把它改成你自己真实开口说出来的样子。

不是"润色"，不是"优化"——是**改写成真人说话**。

## 改写标准

**语气**：想象你现在坐在镜头前，跟一个认识你但不是专家的朋友聊天。不是演讲，不是播报，就是聊天。

**句子**：你说话不会句句完整。短句就短句，省略就省略，重复就重复。真人说话会有停顿，会绕回去补一句，会突然换个角度。

**口语词**：把书面词换成你嘴里真的会说的词。"然而"→"但是呢"，"因此"→"所以"，"值得注意的是"→直接说，"总体而言"→删掉。

**不要**：
- 不要用"首先、其次、最后"这种结构词——除非这个创作者真的会这样说
- 不要每段开头都是完整主谓宾句
- 不要把情绪藏在里面——激动就激动，感叹就感叹，直接说出来
- 不要为了"专业感"加任何修饰——真人不在乎专业感，在乎真实感

**必须保留**：
- 所有段落标记 [HOOK]、[TEASE]、[ITEM]、[CTA]、[CLIMAX]、[CLOSE]
- 所有数字、名字、数据、价格、型号——一个字不改
- 所有内容和信息量——不要删减任何论点或细节

## 脚本

${scriptText}

## 输出

直接输出改写后的完整脚本。不加任何解释或前言。只输出脚本本身。
`;
}
