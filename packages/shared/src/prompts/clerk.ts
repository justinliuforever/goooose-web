/**
 * Clerk prompts — 1:1 port from archive `backend/app/prompts/clerk_prompts.py`.
 * Preserves original wording. Core IP.
 *
 * Functions take typed args and return the fully-formatted prompt string.
 */

export const XHS_IMAGE_PREAMBLE = `NOTE: This is a Xiaohongshu (小红书) IMAGE post, not a video. Adapt your analysis:
- "thumbnail_description" → describe the cover image composition and visual hook
- "opening_hook" → the title and first line of text that hooks the reader
- "opening_hook_type" → classify the text hook type (e.g., "Question", "Bold Claim", "List Preview")
- "hooks_throughout" → text hooks, section breaks, and emotional pivots in the post body (no timestamps — use section numbers)
- "script_structure" → text structure: intro → body sections → conclusion/CTA
- "duration_sec" is not applicable; focus on text flow and reading engagement
- The "transcript" below is the post's full text content (title + description)
- "Views" shown is actually a weighted engagement score (likes + collects + comments + shares)
`;

export const XHS_VIDEO_PREAMBLE = `NOTE: This is a Xiaohongshu (小红书) short video post, not a YouTube video.
- The engagement metric shown as "Views" is a weighted engagement score (likes + collects + comments + shares), not actual view count
- XHS videos are typically short-form (30s-3min). Analyze hooks and retention for short-form content
- The "transcript" may include both the post description text and a Whisper-transcribed audio track
- The transcript has NO timestamps — estimate timing based on word count and duration_sec, but clearly mark estimates as approximate (e.g., "~0-10s")
- Do NOT fabricate specific timestamps that are not in the transcript
`;

export const CHINESE_WRAPPER = (innerPrompt: string) =>
  `IMPORTANT: Write the ENTIRE response in Simplified Chinese (简体中文). All section titles, analysis, explanations, templates, and examples must be in Chinese. Keep proper nouns and technical terms in their original language where appropriate.

${innerPrompt}`;

type VideoAnalysisArgs = {
  title: string;
  views: number | null;
  durationSec: number | null;
  thumbnailUrl: string | null;
  transcript: string | null;
  contentType?: "video" | "xhs_image" | "xhs_video";
  language?: "en" | "zh";
};

const NO_TRANSCRIPT_PLACEHOLDER = "[No transcript available — analyze based on title and thumbnail only]";

export function buildVideoAnalysisPrompt(args: VideoAnalysisArgs): string {
  const contentType = args.contentType ?? "video";
  const language = args.language ?? "en";

  const preamble =
    contentType === "xhs_image"
      ? XHS_IMAGE_PREAMBLE
      : contentType === "xhs_video"
        ? XHS_VIDEO_PREAMBLE
        : "";

  const body = `You are an expert content analyst. Analyze this content and extract structured data about its scripting techniques.

## Video Information
- **Title:** ${args.title}
- **Views:** ${args.views?.toLocaleString("en-US") ?? "unknown"}
- **Duration:** ${args.durationSec ?? "unknown"} seconds
- **Thumbnail URL:** ${args.thumbnailUrl ?? "unknown"}

## Full Transcript
${args.transcript ?? NO_TRANSCRIPT_PLACEHOLDER}

## Instructions

Analyze this video and return a JSON object with these exact keys:

1. **thumbnail_description**: Based on the title and transcript, infer what the thumbnail/cover image likely contains. Note: you cannot see the image, so describe what an effective thumbnail for this content would include.
2. **thumbnail_why_it_works**: Based on the title's hook and topic, analyze what visual elements would make a thumbnail effective for this content.
3. **opening_hook**: Detailed breakdown of the opening hook (first 10-15 seconds).
4. **opening_hook_type**: Classify the opening hook type.
5. **hooks_throughout**: Identify ALL hooks used throughout the ENTIRE video. For EACH: "[Timestamp] [Hook Name] ([Hook Type]): [Exact text] — [Explanation]".
6. **all_hook_types**: List ALL distinct hook types used, separated by commas.
7. **text_hook**: Templatized version of the opening hook with [PLACEHOLDER] variables.
8. **framework**: The overall content framework used.
9. **opening_structure**: First 30 seconds structure.
10. **script_structure**: Full beat-by-beat breakdown with timing.
11. **storytelling_framework**: The primary storytelling technique.
12. **rehooks_used**: List specific re-hook phrases used throughout.
13. **retention_pattern**: How the video maintains viewer retention.
14. **cta_placement**: Where and how CTAs appear.
15. **key_takeaways**: 3-5 bullet points on what makes this video's script effective.

Return ONLY valid JSON. No markdown code fences.
`;

  const composed = preamble + body;
  return language === "zh" ? CHINESE_WRAPPER(composed) : composed;
}

type SopArgs = {
  channelName: string;
  videoCount: number;
  totalViews: number;
  date: string;
  videosData: string;
  language?: "en" | "zh";
};

export function buildHumanSopPrompt(args: SopArgs): string {
  const inner = `You are an expert YouTube content strategist. Based on the analysis of the top ${args.videoCount} most-viewed videos from the channel "${args.channelName}" (total views analyzed: ${args.totalViews.toLocaleString("en-US")}), create a comprehensive Scriptwriting Standard Operating Procedure.

## Analyzed Videos Data
${args.videosData}

## Instructions

Create a detailed SOP document with the following sections:

**Title:** "${args.channelName} Scriptwriting Standard Operating Procedure"
**Subtitle:** "Based on analysis of Top ${args.videoCount} most-viewed videos | Total views: ${args.totalViews.toLocaleString("en-US")} | Generated: ${args.date}"

**Section 1: Content Formula** - Core content formula.
**Section 2: Common Themes** - Recurring themes.
**Section 3: Thumbnail Essential Elements** - Common thumbnail patterns + checklist.
**Section 4: Hook Playbook** - 3-5 hook formulas with templates, examples, and psychology.
**Section 5: Script Structure Blueprint** - Beat-by-beat template table + per-item template + emotional escalation map.
**Section 6: Storytelling Frameworks** - Primary/secondary frameworks + narrative arc.
**Section 7: Retention Mechanics** - Open loops, rehook phrases, specificity spikes, emotional reframes.

Format as clean markdown.
`;
  return args.language === "zh" ? CHINESE_WRAPPER(inner) : inner;
}

export function buildAiSopReferencePrompt(args: SopArgs): string {
  return `You are creating an AI-optimized reference document for an automated scriptwriting agent. Based on the analysis of "${args.channelName}", create a structured reference.

## Analyzed Videos Data
${args.videosData}

## Instructions

Create a structured reference with sections: CONTENT_FORMULA, THEMES, THUMBNAIL_ESSENTIALS, HOOK_TEMPLATES (with TYPE/TEMPLATE/EXAMPLE_TITLES/USE_WHEN), SCRIPT_STRUCTURE (BEAT_TEMPLATE table + ITEM_TEMPLATE), STORYTELLING (frameworks + arcs), RETENTION_MECHANICS (open loops, rehook phrases, specificity patterns, signature reframes), RULES.

# CHANNEL REFERENCE: ${args.channelName}
# Generated: ${args.date}
# Videos Analyzed: ${args.videoCount}
# Total Views: ${args.totalViews}

Return ONLY the document content.
`;
}

type HottestArgs = {
  channelName: string;
  title: string;
  views: number;
  durationSec: number;
  url: string;
  transcript: string;
  analysisSummary: string;
  language?: "en" | "zh";
};

export function buildHottestSopPrompt(args: HottestArgs): string {
  const inner = `You are an expert YouTube content analyst performing a deep structural breakdown of the #1 most-viewed video from "${args.channelName}".

## Video Information
- **Title:** ${args.title}
- **Views:** ${args.views.toLocaleString("en-US")}
- **Duration:** ${args.durationSec} seconds
- **URL:** ${args.url}

## Full Transcript
${args.transcript}

## Video Analysis Summary
${args.analysisSummary}

## Instructions

Create a time-segmented structural breakdown. Break the video into 5-8 Parts, each with:
- **Core Argument**
- **Specific Examples Used**
- **How it Works (Psychology)**
- **Hooks in this Section** (with timestamps and types)

Format as clean markdown.
`;
  return args.language === "zh" ? CHINESE_WRAPPER(inner) : inner;
}
