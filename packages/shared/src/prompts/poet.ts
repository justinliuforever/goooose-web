import { CHINESE_WRAPPER, ZH_STYLE_GUIDE } from "./clerk";

// Poet prompts stay English-instruction (better structure adherence); zh output gets the glossary appended so the final script avoids 翻译腔.
function withZhStyle(prompt: string, language: "en" | "zh"): string {
  return language === "zh" ? `${prompt}\n\n${ZH_STYLE_GUIDE}` : prompt;
}

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
  const maxWordCount = Math.round(args.targetWordCount * 1.2);
  const isShort = args.targetWordCount < 300;

  return withZhStyle(`You are a scriptwriter for a specific niche channel. Your job is to write a complete, ready-to-film script that sounds like a real human host speaking — not a polished AI document.

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

Write a COMPLETE, ready-to-film script in **${languageName}**. Length is a HARD WINDOW: **${minWordCount}–${maxWordCount} ${lengthUnit}** (aim for ~${args.targetWordCount}). Do not fall below ${minWordCount} and do NOT exceed ${maxWordCount}.${isShort ? " This is a SHORT video — keep every section to 1-2 sentences, front-load the hook, and cut anything that doesn't earn its place. Do not pad to reach a higher count." : " If you finish all sections early, expand the ITEM sections with more specific detail until you reach the target — never pad with filler."}

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

Output the script as plain text, with section markers in this EXACT order: [HOOK], [TEASE], [ITEM 1], [CLIMAX], [CTA], [CLOSE]. Use each marker once; [CLIMAX] must come before [CTA]; [CLOSE] is the single final sign-off. No meta-commentary, no preamble.
`, args.language);
}

type OutlineArgs = {
  sopReference: string;
  referencesContext: string;
  ideaText: string;
  viralTrigger: string;
  targetWordCount: number;
  language: "en" | "zh";
};

export function buildLongFormOutlinePrompt(args: OutlineArgs): string {
  const lengthUnit = args.language === "zh" ? "characters (字)" : "words";
  const rate = args.language === "zh" ? 200 : 150;
  const durationApprox = Math.round(args.targetWordCount / rate);
  return `You are planning a long-form YouTube script for a specific niche channel.

## SOP Reference (voice, structure, retention mechanics — follow this precisely)
${args.sopReference}

## References (research material — pull concrete facts from here)
${args.referencesContext}

## The Idea
${args.ideaText}

## Viral Trigger
${args.viralTrigger}

## Task: Generate a Beat-by-Beat Outline

The final script targets approximately ${args.targetWordCount} ${lengthUnit} (~${durationApprox} minutes of speech).

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
- Use ONLY these markers in this order: [HOOK], [TEASE], [ITEM 1], [ITEM 2], ... (as many ITEMs as the SOP demands), [CTA], [CLIMAX], [CLOSE]
- key_points must be CONCRETE — pull real facts, names, numbers from the References. No generic placeholders.
- target_count values must sum to approximately ${args.targetWordCount}
- Suggested budget: HOOK 8%, TEASE 5%, CTA 3%, CLIMAX 18%, CLOSE 6%; divide the remaining 60% equally across ITEM sections
- emotional_note: be specific (e.g. "calm and factual, building curiosity", "sharp revelation, audience feels cheated", "triumphant payoff")

Output ONLY the JSON. No markdown fences, no explanation.
`;
}

type SectionExpandArgs = {
  language: "en" | "zh";
  sopReference: string;
  referencesContext: string;
  verbatimFactsContext: string;
  overallArc: string;
  outlineSummary: string;
  prevTail: string;
  marker: string;
  keyPoints: string;
  targetCount: number;
  emotionalNote: string;
};

export function buildSectionExpandPrompt(args: SectionExpandArgs): string {
  const languageName = args.language === "zh" ? "Chinese (中文)" : "English";
  const lengthUnit = args.language === "zh" ? "characters (字)" : "words";
  const minCount = Math.round(args.targetCount * 0.85);
  return withZhStyle(`You are writing one section of a long-form YouTube script in **${languageName}**.

## SOP Reference (this is your VOICE MODEL — follow the tone, rhythm, and retention devices exactly)
${args.sopReference}

## References (research material — extract facts and framing from here)
${args.referencesContext}

## Verbatim Facts (copy these character-for-character — numbers, names, prices, specs)
${args.verbatimFactsContext}

## Full Script Outline (maintain consistency with the overall arc)
Overall arc: ${args.overallArc}

All sections:
${args.outlineSummary}

## Previous Section Tail (maintain narrative flow — pick up naturally from here)
${args.prevTail}

## Your Section
Marker: ${args.marker}
Key points to cover:
${args.keyPoints}
Target length: ${args.targetCount} ${lengthUnit}
Minimum length: ${minCount} ${lengthUnit} — you MUST reach this before stopping
Tone/energy: ${args.emotionalNote}

Write ONLY the content of this section. Do NOT include the section marker — it will be added automatically.
Do NOT start the next section. End at a natural stopping point.
Sound like a real human talking. Follow the SOP voice precisely.

**LENGTH IS NON-NEGOTIABLE**: If you finish covering the key points but haven't reached ${minCount} ${lengthUnit}, keep going — add more specific examples, vivid detail, emotional depth, or a relevant story beat. Do not end early.
`, args.language);
}

type TopicAnalysisArgs = {
  channelBible: string;
  sopReference: string;
  topic: string;
  referencesContext: string;
  language: "en" | "zh";
};

export function buildTopicAnalysisPrompt(args: TopicAnalysisArgs): string {
  const languageName = args.language === "zh" ? "Chinese (中文)" : "English";
  const lengthUnit = args.language === "zh" ? "characters (字)" : "words";
  const base = `You are an editorial strategist for a YouTube channel. Given a user-supplied topic and (optionally) reference materials, generate the structured idea fields that the scriptwriter will consume.

## Channel Bible (the brand, niche, and rules)
${args.channelBible}

## SOP Reference (the channel's voice and viral mechanics)
${args.sopReference}

## User Topic
${args.topic}

## External References
${args.referencesContext}

## Your Task

Output a JSON object with exactly these five keys:

- "story_angle": One paragraph (~80–150 ${lengthUnit}) describing the specific narrative angle for this topic, framed for this channel's audience. Be concrete — name the specific story you'd tell, not the general subject.

- "facts_and_data": Bullet list of concrete facts, statistics, examples, and data points the script should incorporate. **Do not artificially limit the count.** If the references contain twelve distinct camera models and forty data points, capture all of them; if they only contain three, capture three. Walk the references end-to-end and capture every concrete fact you find. Prefer facts grounded in the External References. If the references are thin or missing, you may add plausible, verifiable-by-the-user facts — but label any such addition with "(needs verification)" so the user can review.

- "verbatim_facts": A flat newline-separated list of the most important factual atoms pulled **VERBATIM** from the references. Each line is one atom. Format: \`- <verbatim fact> [src: <reference title>]\`. Examples:
  \`- M3 viewfinder magnification: 0.91x [src: Leica M Series Film Cameras Overview]\`
  \`- M7 produced between 2002–2018 [src: Leica M Series Film Cameras Overview]\`
  Rules for this field:
    * Numbers (years, prices, magnifications, focal lengths, shutter speeds, ISOs, percentages, dates, durations) must be copied **character-for-character** from the source. Do not round, normalize, or convert units.
    * Proper nouns (model names, person names, brand names, place names) must be copied verbatim.
    * Direct quotes must be enclosed in straight double-quotes and unchanged.
    * Walk every reference end-to-end and emit one line per discrete fact. A 12-camera overview should produce dozens of lines, not 5.
    * If a reference contributes no extractable verbatim facts, omit it from this field rather than invent.
    * **Never fabricate** a fact that isn't in the source. If you didn't see it in the references, don't include it here.

- "why_similar": One short paragraph explaining why this topic fits the channel's niche per the Bible. Reference specific Bible rules or content pillars.

- "viral_trigger": One short paragraph (~60–100 ${lengthUnit}) explaining the emotional/curiosity mechanism that would make this topic perform — what makes a viewer click and stay.

## Output

Output ONLY the JSON object. No markdown fences, no explanation, no prefix. The response must be parseable by json.loads().

\`story_angle\`, \`facts_and_data\`, \`why_similar\`, and \`viral_trigger\` must be written in **${languageName}**. \`verbatim_facts\` stays in the **original language of the references** so numbers and proper nouns are not corrupted by translation.
`;
  if (args.language !== "zh") return base;
  return (
    base +
    "\n\n【重要输出要求】story_angle、facts_and_data、why_similar、viral_trigger 字段必须用简体中文输出。verbatim_facts 保持原始语言（数字和专有名词不翻译）。仅返回有效 JSON，不使用代码块。\n【去翻译腔】字段值要像中文编导说话：不要直译生造词（禁止 认知基模 / 认知杠杆 / 模式打断 / 开放回路 / 视觉锤 之类），不要照抄 SOP 里的英文公式或英文标签（如 'Pattern Interrupt + Curiosity Gap …'）——一律用自然中文转述。"
  );
}

export type FactCheckItem = { index: number; fact: string; src: string };

// Verify each extracted fact against world knowledge. A source citation does NOT make a
// fact correct (reference material can be wrong, e.g. a famous product's launch year).
// Deliberately conservative: default to "verified" — a false flag is worse than a miss.
export function buildFactCheckPrompt(args: {
  items: FactCheckItem[];
  referenceTitles: string[];
  language: "en" | "zh";
}): string {
  const noteLang = args.language === "zh" ? "Chinese (中文)" : "English";
  const list = args.items
    .map((it) => `${it.index}. ${it.fact}${it.src ? ` [src: ${it.src}]` : ""}`)
    .join("\n");
  const sources = args.referenceTitles.length
    ? args.referenceTitles.map((t) => `- ${t}`).join("\n")
    : "(no reference titles provided)";
  return `You are a meticulous fact-checker. Below is a numbered list of factual atoms extracted from reference material, each tagged with the source it was pulled from. A source citation does NOT guarantee the fact is correct — reference material can itself be wrong. Using your own world knowledge, classify each fact.

## Sources these facts were pulled from
${sources}

## Facts to check
${list}

## For each fact, assign one status
- "verified": consistent with well-known reality, OR you cannot judge it from world knowledge (a niche/obscure detail) — DEFAULT to "verified" when unsure. Most facts should be "verified".
- "disputed": ONLY when you are HIGHLY confident it conflicts with widely-known reality (e.g. a famous product's launch year, a well-known date / name / spec is wrong). In "note", give the commonly-accepted correct value, briefly.
- "unsupported": the claim is internally incoherent or clearly fabricated nonsense.

## Critical rules
- Be conservative. When in doubt → "verified". Do NOT flag something merely because you're unsure — only clear, high-confidence conflicts. A wrongly-flagged correct fact is worse than a missed one.
- Do NOT rewrite or correct the facts themselves. Only classify, and for "disputed"/"unsupported" add a short "note".
- "note" must be written in ${noteLang}. Omit "note" for "verified".

## Output
Output ONLY a JSON array, one object per fact, in the same order:
[{"index": 1, "status": "verified"}, {"index": 2, "status": "disputed", "note": "..."}]
No markdown fences, no prose. Must be parseable by JSON.parse().`;
}

export function buildChineseHumanizerPrompt(scriptText: string, maxChars?: number): string {
  const lengthBlock = maxChars
    ? `\n**长度硬上限**：改写后全文不得超过 ${maxChars} 字（含标点）。口语化不等于变长——不要把一句话拆成三句，不要新增论点，不要补充原稿没有的解释。脚本是按秒计费的口播，超出上限即失败。\n`
    : "";
  return `你现在是这个视频的真实创作者，正在对着镜头说话。这个脚本是AI草稿，你的任务是把它改成你自己真实开口说出来的样子。

不是"润色"，不是"优化"——是**改写成真人说话**。

## 改写标准
${lengthBlock}
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
- 所有论点和数据${maxChars ? "（在长度上限内保留——靠删冗余词达标，不靠删信息）" : "——不要删减任何论点或细节"}

## 脚本

${scriptText}

## 输出

直接输出改写后的完整脚本。不加任何解释或前言。只输出脚本本身。
`;
}

export function buildScriptCompressPrompt(args: {
  scriptText: string;
  language: "zh" | "en";
  targetWordCount: number;
}): string {
  const lengthUnit = args.language === "zh" ? "characters (字)" : "words";
  const maxCount = Math.round(args.targetWordCount * 1.2);
  const minCount = Math.round(args.targetWordCount * 0.85);
  return `You are a short-video script editor. The draft below overshoots its spoken-length budget. Compress it to **${minCount}–${maxCount} ${lengthUnit}** without losing what makes it work.

Rules:
- Keep the script's original language exactly as written.
- Keep ALL section markers ([HOOK], [TEASE], [ITEM], [CLIMAX], [CTA], [CLOSE]) that survive, and always keep the [HOOK] and the [CTA].
- Every number, name, price, model, date must stay character-for-character or be removed with its sentence — never alter a value.
- Cut by: removing repetition and filler, merging wordy sentences, and — if still over budget — deleting the single least information-dense middle section entirely (a [TEASE] or one [ITEM]).
- Do not add anything new.

## Draft

${args.scriptText}

## Output

Output ONLY the compressed script, no explanation.`;
}
