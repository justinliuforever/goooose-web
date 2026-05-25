import { generateText } from "ai";
import { jsonrepair } from "jsonrepair";

import { llm } from "../clients/llm";
import {
  buildClassificationPrompt,
  buildIdeaGenerationPrompt,
  buildViralTriggerPrompt,
} from "../prompts/muse";
import {
  type Classification,
  classificationSchema,
  type Idea,
  ideasResponseSchema,
} from "../schemas/muse";

const TRANSCRIPT_PREVIEW_CHARS = 2000;

// DeepSeek V4 Pro reasoning preamble sometimes emits trailing commas or
// unescaped " inside Chinese values — jsonrepair recovers without losing data.
function parseLenientJson(rawText: string): unknown {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) return null;
  const slice = cleaned.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(slice);
  } catch {
    try {
      return JSON.parse(jsonrepair(slice));
    } catch {
      return null;
    }
  }
}

export type ClassifyArgs = {
  channelDescription: string;
  title: string;
  channelName: string;
  views: number;
  durationSec: number;
  transcript: string | null;
  language?: "en" | "zh";
};

export async function classifyVideo(args: ClassifyArgs): Promise<Classification> {
  const transcriptPreview = args.transcript
    ? args.transcript.slice(0, TRANSCRIPT_PREVIEW_CHARS)
    : null;
  const prompt = buildClassificationPrompt({
    channelDescription: args.channelDescription,
    title: args.title,
    channelName: args.channelName,
    views: args.views,
    durationSec: args.durationSec,
    transcriptPreview,
    language: args.language,
  });
  // 1500-token floor leaves room for V4 reasoning preamble; 512 starved Chinese prompts.
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await generateText({
      model: llm("flash"),
      prompt,
      temperature: 0.2,
      maxOutputTokens: 1500,
      maxRetries: 2,
    });
    const parsed = parseLenientJson(result.text);
    const valid = classificationSchema.safeParse(parsed);
    if (valid.success) return valid.data;
  }
  // Default to relevant — sloppy model output is more likely than truly irrelevant content.
  return { relevant: true, topic_classification: "", rejection_reason: "" };
}

export type ViralTriggerArgs = {
  channelDescription: string;
  title: string;
  channelName: string;
  views: number;
  durationSec: number;
  transcript: string;
  language?: "en" | "zh";
};

export async function analyzeViralTrigger(args: ViralTriggerArgs): Promise<string> {
  const prompt = buildViralTriggerPrompt(args);
  // 4096 budget: 2048 was starving the answer when reasoning ran long.
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await generateText({
      model: llm("pro"),
      prompt,
      temperature: 0.4,
      maxOutputTokens: 4096,
      maxRetries: 2,
    });
    const text = result.text.trim();
    if (text.length > 0) return text;
  }
  return "";
}

export type GenerateIdeasArgs = {
  channelDescription: string;
  title: string;
  channelName: string;
  views: number;
  viralTrigger: string;
  numIdeas?: number;
  language?: "en" | "zh";
};

export type GenerateIdeasResult = {
  ideas: Idea[];
  rawSample: string | null;
  parseErrorSample: string | null;
};

export async function generateIdeas(args: GenerateIdeasArgs): Promise<GenerateIdeasResult> {
  const numIdeas = args.numIdeas ?? 5;
  const prompt = buildIdeaGenerationPrompt({
    channelDescription: args.channelDescription,
    title: args.title,
    channelName: args.channelName,
    views: args.views,
    viralTrigger: args.viralTrigger,
    numIdeas,
    language: args.language,
  });

  // Retry once on parse failure — single bad LLM response shouldn't drop the video.
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await generateText({
      model: llm("pro"),
      prompt,
      temperature: 0.7,
      maxOutputTokens: 4096,
      maxRetries: 2,
    });
    const parsed = parseLenientJson(result.text);
    const valid = ideasResponseSchema.safeParse(parsed);
    if (valid.success) {
      return { ideas: valid.data.ideas.slice(0, numIdeas), rawSample: null, parseErrorSample: null };
    }
    if (attempt === 1) {
      return {
        ideas: [],
        rawSample: result.text.slice(0, 600),
        parseErrorSample: JSON.stringify(valid.error.issues.slice(0, 3)).slice(0, 400),
      };
    }
  }
  return { ideas: [], rawSample: null, parseErrorSample: "loop exited unexpectedly" };
}
