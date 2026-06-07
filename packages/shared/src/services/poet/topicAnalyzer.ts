import { generateTextWithFallback } from "../../clients/llm";
import { redactUngrounded } from "../grounding";
import { buildTopicAnalysisPrompt } from "../../prompts/poet";
import { factCheckVerbatim, type CheckedFact } from "./factCheck";
import { formatReferencesBlock, type ScriptReference } from "./scriptWriter";

export type TopicAnalysis = {
  storyAngle: string;
  factsAndData: string;
  verbatimFacts: string;
  whySimilar: string;
  viralTrigger: string;
  factChecks: CheckedFact[];
};

export type AnalyzeTopicArgs = {
  topic: string;
  references: ScriptReference[] | null | undefined;
  bibleText: string;
  sopText: string;
  language: "en" | "zh";
};

function parseLenientJson(rawText: string): unknown {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) return null;
  try {
    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
}

function toText(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter((s) => s.length > 0)
      .map((s) => (s.startsWith("- ") ? s : `- ${s}`))
      .join("\n");
  }
  return String(value).trim();
}

export async function analyzeTopic(args: AnalyzeTopicArgs): Promise<TopicAnalysis> {
  const prompt = buildTopicAnalysisPrompt({
    channelBible: args.bibleText,
    sopReference: args.sopText,
    topic: args.topic,
    referencesContext: formatReferencesBlock(args.references ?? null),
    language: args.language,
  });

  let data: Record<string, unknown> = {};
  for (let attempt = 0; attempt < 2; attempt++) {
    // Pro-first, auto-downgrade to Flash on empty so reasoning-budget burn doesn't
    // yield an empty (but "successful") analysis.
    const result = await generateTextWithFallback({
      prompt,
      temperature: 0.6,
      maxOutputTokens: 6144,
      maxRetries: 2,
    });
    const parsed = parseLenientJson(result.text);
    if (parsed && typeof parsed === "object") {
      data = parsed as Record<string, unknown>;
      break;
    }
  }

  const analysis: TopicAnalysis = {
    storyAngle: toText(data.story_angle),
    factsAndData: toText(data.facts_and_data),
    verbatimFacts: toText(data.verbatim_facts),
    whySimilar: toText(data.why_similar),
    viralTrigger: toText(data.viral_trigger),
    factChecks: [],
  };
  // Don't pass a content-less analysis off as success — the caller marks the topic
  // 'analyzed' and feeds it to script generation. Fail loudly so the run retries.
  if (!analysis.storyAngle && !analysis.factsAndData) {
    throw new Error(
      "Topic analysis produced no usable content (story_angle + facts_and_data empty)",
    );
  }
  // Grounding pass on the data-heavy field: drop specs/stats the references don't support.
  analysis.factsAndData = await redactUngrounded({
    draft: analysis.factsAndData,
    source: formatReferencesBlock(args.references ?? null),
    language: args.language,
    maxOutputTokens: 4096,
  });
  // Verify extracted verbatim facts against world knowledge — catches sourced-but-wrong
  // claims the grounding pass keeps (it trusts cited sources). Marks only, never edits.
  analysis.factChecks = await factCheckVerbatim({
    verbatimFacts: analysis.verbatimFacts,
    referenceTitles: (args.references ?? [])
      .map((r) => r.title)
      .filter((t): t is string => !!t),
    language: args.language,
  });
  return analysis;
}
