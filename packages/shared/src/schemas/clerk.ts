import { z } from "zod";

/**
 * Clerk video analysis structured output schema.
 * Matches archive's `analyze_video()` return shape (15 string fields).
 * Maps 1:1 to the analysis columns on the `clerk_videos` table.
 */
export const clerkAnalysisSchema = z.object({
  thumbnail_description: z.string(),
  thumbnail_why_it_works: z.string(),
  opening_hook: z.string(),
  opening_hook_type: z.string(),
  hooks_throughout: z.string(),
  all_hook_types: z.string(),
  text_hook: z.string(),
  framework: z.string(),
  opening_structure: z.string(),
  script_structure: z.string(),
  storytelling_framework: z.string(),
  rehooks_used: z.string(),
  retention_pattern: z.string(),
  cta_placement: z.string(),
  key_takeaways: z.string(),
});

export type ClerkAnalysis = z.infer<typeof clerkAnalysisSchema>;

/**
 * Maps the snake_case LLM JSON output to the camelCase Drizzle column names
 * on the `clerk_videos` table.
 */
export function clerkAnalysisToDbRow(a: ClerkAnalysis) {
  return {
    thumbnailDescription: a.thumbnail_description,
    thumbnailWhyItWorks: a.thumbnail_why_it_works,
    openingHook: a.opening_hook,
    openingHookType: a.opening_hook_type,
    hooksThroughout: a.hooks_throughout,
    allHookTypes: a.all_hook_types,
    textHook: a.text_hook,
    framework: a.framework,
    openingStructure: a.opening_structure,
    scriptStructure: a.script_structure,
    storytellingFramework: a.storytelling_framework,
    rehooksUsed: a.rehooks_used,
    retentionPattern: a.retention_pattern,
    ctaPlacement: a.cta_placement,
    keyTakeaways: a.key_takeaways,
  };
}
