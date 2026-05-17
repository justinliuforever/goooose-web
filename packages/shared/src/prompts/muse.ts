// 1:1 port of archive backend/app/prompts/muse_prompts.py — wording preserved.

import { CHINESE_WRAPPER } from "./clerk";

const NO_TRANSCRIPT_PLACEHOLDER = "[No transcript — classify based on title only]";

type ClassificationArgs = {
  channelDescription: string;
  title: string;
  channelName: string;
  views: number;
  durationSec: number;
  transcriptPreview: string | null;
  language?: "en" | "zh";
};

export function buildClassificationPrompt(args: ClassificationArgs): string {
  const inner = `You are a content strategist specializing in cross-niche adaptation. The user has INTENTIONALLY chosen this competitor channel to study — your job is to identify what viral mechanisms can be extracted and adapted, NOT to judge whether the content topics match.

## Target Channel Description
${args.channelDescription}

## Competitor Video
- **Title:** ${args.title}
- **Channel:** ${args.channelName}
- **Views:** ${args.views.toLocaleString("en-US")}
- **Duration:** ${args.durationSec} seconds

## Transcript (excerpt)
${args.transcriptPreview ?? NO_TRANSCRIPT_PLACEHOLDER}

## Instructions

Determine whether this video contains a TRANSFERABLE viral mechanism:
1. "Relevant" means: the video has an identifiable viral MECHANISM (hook structure, emotional arc, narrative technique, audience psychology) that could be adapted to the target channel — even if the surface-level topic, tone, or audience is completely different.
2. A comedy video IS relevant to an educational channel if it uses a great curiosity gap. A kids' show IS relevant to an adult channel if it uses effective escalation. Focus on the MECHANISM, not the content.
3. Default to RELEVANT. Only mark as irrelevant if the video is truly low-effort filler (e.g., channel trailer, behind-the-scenes vlog, compilation with no structure, or very short clips under 30 seconds with no hook).

Return a JSON object:
- "relevant": true or false
- "topic_classification": short label describing the video's format/mechanism (e.g., "Myth-Busting", "Escalating Satire", "Ranking/Listicle", "Character Study", "Holiday Special")
- "rejection_reason": if false, explain why in one sentence. If true, leave as "".

Return ONLY valid JSON.
`;
  if (args.language !== "zh") return inner;
  return (
    CHINESE_WRAPPER(inner) +
    '\n\nIMPORTANT: JSON keys must remain in English (relevant, topic_classification, rejection_reason). Only the rejection_reason string and topic_classification label should be in Simplified Chinese.'
  );
}

type ViralTriggerArgs = {
  channelDescription: string;
  title: string;
  channelName: string;
  views: number;
  durationSec: number;
  transcript: string;
  language?: "en" | "zh";
};

export function buildViralTriggerPrompt(args: ViralTriggerArgs): string {
  const inner = `You are a viral content analyst. Analyze WHY this content performed well.

## Target Channel (for adaptation context)
${args.channelDescription}

## Source Video
- **Title:** ${args.title}
- **Channel:** ${args.channelName}
- **Views:** ${args.views.toLocaleString("en-US")}
- **Duration:** ${args.durationSec} seconds

## Full Transcript
${args.transcript}

## Instructions

Identify the VIRAL TRIGGER:
1. **Click Trigger**: What made people click?
2. **Watch Trigger**: What kept them watching?
3. **Share Trigger**: What would make someone share this?

Synthesize into 2-3 sentences:
"This video works because [CLICK]. Viewers stay because [WATCH]. It spreads because [SHARE]. The core viral mechanism is: [ONE-LINE SUMMARY]."

Return ONLY plain text (not JSON).
`;
  return args.language === "zh" ? CHINESE_WRAPPER(inner) : inner;
}

type IdeaGenerationArgs = {
  channelDescription: string;
  title: string;
  channelName: string;
  views: number;
  viralTrigger: string;
  numIdeas: number;
  language?: "en" | "zh";
};

export function buildIdeaGenerationPrompt(args: IdeaGenerationArgs): string {
  const inner = `You are a creative content strategist specializing in "Script Bending" — taking proven viral concepts and adapting them to a different niche.

## Target Channel
${args.channelDescription}

## Source Video That Went Viral
- **Title:** ${args.title}
- **Channel:** ${args.channelName}
- **Views:** ${args.views.toLocaleString("en-US")}

## Viral Trigger Analysis
${args.viralTrigger}

## Instructions

Generate exactly ${args.numIdeas} UNIQUE content ideas for the target channel using the SAME viral trigger.

Rules:
1. Each idea must be a DIFFERENT topic.
2. Same viral MECHANISM but applied to the target niche.
3. Specific enough to start scripting immediately.
4. Include real facts, data points, or researchable claims.
5. Feel native to the target channel.

Return JSON:
{
  "ideas": [
    {
      "story_angle": "Compelling working title capturing the viral hook.",
      "facts_and_data": "2-3 specific facts, statistics, or data points.",
      "why_similar": "One sentence on how this uses the same viral trigger."
    }
  ]
}

Return ONLY valid JSON. Generate exactly ${args.numIdeas} ideas.
`;
  if (args.language !== "zh") return inner;
  return (
    CHINESE_WRAPPER(inner) +
    '\n\nIMPORTANT: JSON keys must remain in English (ideas, story_angle, facts_and_data, why_similar). Only the VALUES should be in Simplified Chinese.'
  );
}
