import { z } from "zod";

export const classificationSchema = z.object({
  relevant: z.boolean(),
  topic_classification: z.string().default(""),
  rejection_reason: z.string().default(""),
});

export type Classification = z.infer<typeof classificationSchema>;

export const ideaSchema = z.object({
  story_angle: z.string().default(""),
  facts_and_data: z.string().default(""),
  why_similar: z.string().default(""),
});

export const ideasResponseSchema = z.object({
  ideas: z.array(ideaSchema),
});

export type Idea = z.infer<typeof ideaSchema>;

export const MIN_REAL_TRANSCRIPT_CHARS = 200;

const WARNING_MARKERS = [
  "[WARNING: Video transcription failed",
  "[WARNING: VIDEO post but",
  "[WARNING: Video transcription",
];

export function isRealTranscript(text: string | null | undefined): boolean {
  if (!text) return false;
  if (WARNING_MARKERS.some((m) => text.includes(m))) return false;
  return text.trim().length >= MIN_REAL_TRANSCRIPT_CHARS;
}
