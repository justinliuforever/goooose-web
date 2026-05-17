// 1:1 port of archive backend/app/services/bible_generator.py.
// Drift heuristics: lexical overlap + AI bias marker substitution.

import { generateText } from "ai";

import { llm } from "../../clients/llm";
import { buildChannelBiblePrompt } from "../../prompts/poet";
import type { DriftWarning } from "../../schemas/poet";

const BIAS_MARKERS = [
  "AI",
  "LLM",
  "ChatGPT",
  "Midjourney",
  "Runway",
  "machine learning",
  "人工智能",
  "大模型",
] as const;

const STOPWORDS = new Set([
  // English
  "a", "an", "the", "and", "or", "but", "of", "for", "to", "from", "in",
  "on", "at", "with", "by", "is", "are", "was", "were", "be", "been",
  "being", "this", "that", "these", "those", "it", "its", "as", "i", "we",
  "you", "he", "she", "they", "my", "your", "his", "her", "their", "our",
  "channel", "video", "videos", "content", "audience", "viewer", "viewers",
  "topic", "topics", "idea", "ideas", "youtube",
  // Mandarin
  "的", "和", "与", "是", "在", "我", "你", "他", "她", "们", "也", "都",
  "了", "就", "把", "从", "到", "对", "为", "频道", "视频", "内容",
]);

function tokenize(text: string): Set<string> {
  const tokens = text.toLowerCase().match(/[\w一-鿿]+/g) ?? [];
  return new Set(tokens.filter((t) => !STOPWORDS.has(t) && t.length >= 2));
}

function extractTopicLine(content: string): string {
  const m = content.match(/^\s*TOPIC:\s*(.+?)\s*$/m);
  return m ? m[1]!.trim() : "";
}

function intersects(a: Set<string>, b: Set<string>): boolean {
  for (const t of a) if (b.has(t)) return true;
  return false;
}

function checkDrift(
  userInput: string,
  topicClaimed: string,
  content: string,
): DriftWarning | null {
  const userInputLower = userInput.toLowerCase();
  const userTokens = tokenize(userInput);
  const topicTokens = topicClaimed ? tokenize(topicClaimed) : new Set<string>();

  if (
    topicClaimed &&
    userTokens.size > 0 &&
    topicTokens.size > 0 &&
    !intersects(userTokens, topicTokens)
  ) {
    return {
      reason: "no_overlap",
      claimedTopic: topicClaimed,
      sampleUserTerms: [...userTokens].sort().slice(0, 8),
      humanMessage: `The Bible's claimed topic ("${topicClaimed}") shares no content words with what you described. The LLM may have substituted the topic.`,
    };
  }

  const userHasMarker = BIAS_MARKERS.some((m) => userInputLower.includes(m.toLowerCase()));
  if (!userHasMarker) {
    const contentLower = content.toLowerCase();
    let markerHits = 0;
    for (const m of BIAS_MARKERS) {
      const needle = m.toLowerCase();
      let from = 0;
      while (true) {
        const idx = contentLower.indexOf(needle, from);
        if (idx === -1) break;
        markerHits++;
        from = idx + needle.length;
      }
    }
    if (markerHits >= 3) {
      return {
        reason: "ai_markers",
        claimedTopic: topicClaimed,
        sampleUserTerms: [...userTokens].sort().slice(0, 8),
        markerHits,
        humanMessage: `The Bible mentions AI/LLM/ChatGPT-style topics ${markerHits} times even though you didn't ask for that. The LLM may have substituted your niche.`,
      };
    }
  }

  return null;
}

export type BibleResult = {
  content: string;
  topicClaimed: string;
  driftWarning: DriftWarning | null;
};

export type GenerateBibleArgs = {
  ideaText: string;
  channelDescription: string;
  language?: "en" | "zh";
};

export async function generateChannelBible(args: GenerateBibleArgs): Promise<BibleResult> {
  const prompt = buildChannelBiblePrompt({
    ideaText: args.ideaText,
    channelDescription: args.channelDescription,
    language: args.language,
  });
  const result = await generateText({
    model: llm("pro"),
    prompt,
    temperature: 0.4,
    maxOutputTokens: 4096,
    maxRetries: 2,
  });
  const content = result.text;
  const topicClaimed = extractTopicLine(content);
  const driftWarning = checkDrift(
    `${args.ideaText}\n${args.channelDescription}`,
    topicClaimed,
    content,
  );
  return { content, topicClaimed, driftWarning };
}

export { BIAS_MARKERS, STOPWORDS, tokenize, extractTopicLine, checkDrift };
