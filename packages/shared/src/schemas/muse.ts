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
  viral_trigger: z.string().default(""),
  cover_concept: z.string().default(""),
  suggested_hook_type: z.string().default(""),
  risk_factors: z.string().default(""),
});

export const ideasResponseSchema = z.object({
  ideas: z.array(ideaSchema),
});

export type Idea = z.infer<typeof ideaSchema>;

// Gate exists to keep viral_trigger from running on empty/fake transcripts
// (the LLM otherwise fabricates). YouTube transcripts ≥200 chars are
// reasonable; XHS image-post "transcripts" are title+desc (real authored
// content, typically 80-300 chars) — a 50-char floor still catches empty
// posts without rejecting legitimate short captions.
export const MIN_REAL_TRANSCRIPT_CHARS = 200;
export const MIN_REAL_TRANSCRIPT_CHARS_XHS_IMAGE = 50;

const WARNING_MARKERS = [
  "[WARNING: Video transcription failed",
  "[WARNING: VIDEO post but",
  "[WARNING: Video transcription",
];

export function isRealTranscript(
  text: string | null | undefined,
  contentType: "video" | "xhs_video" | "xhs_image" = "video",
): boolean {
  if (!text) return false;
  if (WARNING_MARKERS.some((m) => text.includes(m))) return false;
  const floor =
    contentType === "xhs_image"
      ? MIN_REAL_TRANSCRIPT_CHARS_XHS_IMAGE
      : MIN_REAL_TRANSCRIPT_CHARS;
  return text.trim().length >= floor;
}
