// Short-form path of archive backend/app/services/script_writer.py.
// Long-form (outline → expand) deferred to W6.

import { generateText } from "ai";

import { llm } from "../../clients/llm";
import { buildScriptWritingPrompt } from "../../prompts/poet";

const MAX_REFERENCE_CHARS = 24000;

export type ScriptReference = {
  type?: string;
  title?: string;
  url?: string;
  content?: string;
  error?: string;
};

export function formatReferencesBlock(
  references: ScriptReference[] | null | undefined,
  maxChars = MAX_REFERENCE_CHARS,
): string {
  if (!references || references.length === 0) {
    return "(No external references attached.)";
  }
  const parts: string[] = [];
  for (let i = 0; i < references.length; i++) {
    const ref = references[i]!;
    const refType = ref.type ?? "unknown";
    const title = ref.title || `Reference ${i + 1}`;
    const url = ref.url ?? "";
    const original = ref.content ?? "";
    const urlLine = url ? `\n- URL: ${url}` : "";
    if (!original.trim()) {
      const errorMsg = ref.error ?? "transcript unavailable";
      parts.push(
        `### Reference ${i + 1} (${refType}): ${title}${urlLine}\n\n[FETCH FAILED — ${errorMsg}. Do not invent content for this reference.]\n`,
      );
      continue;
    }
    const content =
      original.length > maxChars
        ? `${original.slice(0, maxChars)}\n…[truncated — original was ${original.length} chars]`
        : original;
    parts.push(
      `### Reference ${i + 1} (${refType}): ${title}${urlLine}\n\n${content}\n`,
    );
  }
  return parts.join("\n");
}

export function formatVerbatimFacts(verbatimFacts: string | null | undefined): string {
  const text = (verbatimFacts ?? "").trim();
  if (!text) {
    return "(No verbatim facts extracted. Pull all specific data directly from the References above and copy exactly.)";
  }
  return text;
}

export type IdeaInput = {
  storyAngle: string;
  factsAndData: string;
  whySimilar: string;
  viralTrigger: string;
  sourceTitle: string;
  sourceChannel: string;
};

export type WriteScriptArgs = {
  idea: IdeaInput;
  sopText: string;
  bibleText: string;
  language: "zh" | "en";
  references?: ScriptReference[] | null;
  targetWordCount: number;
  verbatimFacts?: string | null;
};

export type ScriptResult = {
  scriptText: string;
  wordCount: number;
};

export async function writeScriptShort(args: WriteScriptArgs): Promise<ScriptResult> {
  const ideaText =
    `Story Angle: ${args.idea.storyAngle}\n\n` +
    `Facts & Data: ${args.idea.factsAndData}\n\n` +
    `Why Similar: ${args.idea.whySimilar}`;

  const prompt = buildScriptWritingPrompt({
    channelBible: args.bibleText,
    sopReference: args.sopText,
    referencesContext: formatReferencesBlock(args.references),
    verbatimFactsContext: formatVerbatimFacts(args.verbatimFacts),
    sourceTitle: args.idea.sourceTitle,
    sourceChannel: args.idea.sourceChannel,
    viralTrigger: args.idea.viralTrigger,
    ideaText,
    language: args.language,
    targetWordCount: args.targetWordCount,
  });

  const result = await generateText({
    model: llm("pro"),
    prompt,
    temperature: 0.5,
    maxOutputTokens: 8192,
    maxRetries: 2,
  });

  const scriptText = result.text;
  const wordCount =
    args.language === "zh" ? scriptText.length : scriptText.trim().split(/\s+/).length;

  return { scriptText, wordCount };
}
