// Muse pipeline services — 1:1 port from archive
// (classifier.py / viral_analyzer.py / idea_generator.py).
// Same temperatures and token caps as the archive.

import { generateText } from "ai";

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
  const result = await generateText({
    model: llm("flash"),
    prompt,
    temperature: 0.2,
    maxOutputTokens: 512,
    maxRetries: 2,
  });
  const parsed = parseLenientJson(result.text);
  const valid = classificationSchema.safeParse(parsed);
  if (valid.success) return valid.data;
  // Defaulting to relevant matches the archive's anti-false-negative bias.
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
  const result = await generateText({
    model: llm("pro"),
    prompt,
    temperature: 0.4,
    maxOutputTokens: 2048,
    maxRetries: 2,
  });
  return result.text.trim();
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

export async function generateIdeas(args: GenerateIdeasArgs): Promise<Idea[]> {
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
  const result = await generateText({
    model: llm("pro"),
    prompt,
    temperature: 0.7,
    maxOutputTokens: 4096,
    maxRetries: 2,
  });
  const parsed = parseLenientJson(result.text);
  const valid = ideasResponseSchema.safeParse(parsed);
  if (!valid.success) return [];
  return valid.data.ideas.slice(0, numIdeas);
}
