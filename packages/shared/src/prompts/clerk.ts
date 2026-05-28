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

type SponsorChapterArg = {
  start_time: number;
  end_time: number;
  category: string;
};

type ChapterArg = {
  start_time: number;
  end_time: number;
  title: string;
};

type VideoAnalysisArgs = {
  title: string;
  views: number | null;
  durationSec: number | null;
  thumbnailUrl: string | null;
  transcript: string | null;
  chapters?: ChapterArg[];
  sponsorChapters?: SponsorChapterArg[];
  contentType?: 'video' | 'xhs_image' | 'xhs_video';
  language?: 'en' | 'zh';
};

const NO_TRANSCRIPT_PLACEHOLDER =
  '[No transcript available — analyze based on title and thumbnail only]';

function fmtTs(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `[${m}:${s.toString().padStart(2, '0')}]`;
}

export function buildVideoAnalysisPrompt(args: VideoAnalysisArgs): string {
  const contentType = args.contentType ?? 'video';
  const language = args.language ?? 'en';

  const preamble =
    contentType === 'xhs_image'
      ? XHS_IMAGE_PREAMBLE
      : contentType === 'xhs_video'
        ? XHS_VIDEO_PREAMBLE
        : '';

  const isVideo = contentType === 'video';
  const timestampInstruction = isVideo
    ? `

## Critical: timestamp citations
The transcript above contains [m:ss] markers every ~6 seconds. EVERY hook, structural beat, and rehook MUST quote the exact [m:ss] marker present in the transcript. Format: \`[m:ss] "exact quoted line"\`. Do NOT invent timestamps that are not in the transcript. Do NOT use percentages or relative positions ("intro", "midpoint") — use the [m:ss] anchor.`
    : '';

  // Creator-authored chapters: only ~33% of videos have these but when present
  // they're ground truth for the video's structural intent.
  const chaptersBlock =
    isVideo && args.chapters && args.chapters.length > 0
      ? `\n\n## Chapters (creator-defined — these are ground-truth structural intent)\n${args.chapters
          .map((c) => `${fmtTs(c.start_time)}-${fmtTs(c.end_time)} ${c.title}`)
          .join(
            '\n',
          )}\n\nWhen these chapters exist, ALIGN your \`opening_structure\` and \`script_structure\` to the chapter boundaries. Quote or paraphrase the chapter titles — they are the creator's own intent labels.`
      : '';

  // SponsorBlock segments: authoritative timestamps for intro/hook/sponsor/etc.
  // sponsor/selfpromo words have already been stripped from the transcript so
  // the LLM shouldn't see them, but reference them here so it knows the bounds.
  const sponsorBlock =
    isVideo && args.sponsorChapters && args.sponsorChapters.length > 0
      ? `\n\n## SponsorBlock markers (authoritative timestamps; sponsor/selfpromo content already removed from transcript)\n${args.sponsorChapters
          .map(
            (c) =>
              `${fmtTs(c.start_time)}-${fmtTs(c.end_time)} [${c.category}]`,
          )
          .join(
            '\n',
          )}\n\nWhen \`hook\`/\`intro\` markers exist, use those as the opening_hook boundary. When \`interaction\`/\`outro\` markers exist, use them for cta_placement. Do NOT infer hook/CTA from spans labeled \`sponsor\` or \`selfpromo\` — those are ads, not content.`
      : '';

  const body = `You are an expert content analyst. Analyze this content and extract structured data about its scripting techniques.

## Video Information
- **Title:** ${args.title}
- **Views:** ${args.views?.toLocaleString('en-US') ?? 'unknown'}
- **Duration:** ${args.durationSec ?? 'unknown'} seconds
- **Thumbnail URL:** ${args.thumbnailUrl ?? 'unknown'}
${chaptersBlock}${sponsorBlock}

## Full Transcript
${args.transcript ?? NO_TRANSCRIPT_PLACEHOLDER}
${timestampInstruction}

## Instructions

Analyze this video and return a JSON object with these exact keys:

1. **thumbnail_description**: Based on the title and transcript, infer what the thumbnail/cover image likely contains. Note: you cannot see the image, so describe what an effective thumbnail for this content would include.
2. **thumbnail_why_it_works**: Based on the title's hook and topic, analyze what visual elements would make a thumbnail effective for this content.
3. **opening_hook**: Detailed breakdown of the opening hook (first 10-15 seconds). Quote the exact opening text with [0:00]-[0:15] timestamp anchors.
4. **opening_hook_type**: Classify the opening hook type.
5. **hooks_throughout**: Identify ALL hooks used throughout the ENTIRE video. For EACH: \`[m:ss] [Hook Name] ([Hook Type]): "exact quoted text" — [Explanation of why this hook works at this moment]\`. Aim for 4-8 hooks across the duration.
6. **all_hook_types**: List ALL distinct hook types used, separated by commas.
7. **text_hook**: Templatized version of the opening hook with [PLACEHOLDER] variables — abstract the structural pattern, not the literal words.
8. **framework**: The overall content framework used (e.g. "Problem → Agitate → Solve", "Listicle", "Tutorial", "Story-driven explainer").
9. **opening_structure**: First 30 seconds beat-by-beat with timestamps. Each beat: \`[m:ss-m:ss] [Beat Name]: what happens\`.
10. **script_structure**: Full beat-by-beat breakdown for the WHOLE video. Each beat: \`[m:ss-m:ss] [Beat Name]: what happens\`. Aim for 6-12 beats. Do NOT use percentages.
11. **storytelling_framework**: The primary storytelling technique. Include: (a) framework name, (b) narrative arc shape, (c) main story beats with timestamps, (d) signature emotional moves.
12. **rehooks_used**: List the specific re-hook phrases used. For each: \`[m:ss] "exact phrase"\`. These are the recurring "stay tuned for X" / "but here's the crazy part" lines.
13. **retention_pattern**: How the video maintains retention. Include: (a) open loops opened + when closed (with timestamps), (b) specificity spikes (concrete numbers/names/dates) with timestamps, (c) pattern breaks with timestamps, (d) recap/preview moments.
14. **cta_placement**: Where and how CTAs appear, with timestamps.
15. **key_takeaways**: 3-5 bullet points on what makes this video's script effective. Cite at least one timestamped example per takeaway.

Return ONLY valid JSON. No markdown code fences.
`;

  const composed = preamble + body;
  if (language !== 'zh') return composed;
  return (
    CHINESE_WRAPPER(composed) +
    '\n\nIMPORTANT: JSON keys must remain in English (thumbnail_description, opening_hook, framework, …). Only the VALUES (the strings on the right side) should be in Simplified Chinese.'
  );
}

type SopArgs = {
  channelName: string;
  videoCount: number;
  totalViews: number | null;
  date: string;
  videosData: string;
  language?: 'en' | 'zh';
};

export function buildHumanSopPrompt(args: SopArgs): string {
  const viewsClause =
    args.totalViews && args.totalViews > 0
      ? `total views analyzed: ${args.totalViews.toLocaleString('en-US')}`
      : 'view counts unavailable for these videos';
  const subtitleViews =
    args.totalViews && args.totalViews > 0
      ? `Total views: ${args.totalViews.toLocaleString('en-US')}`
      : 'View counts unavailable';
  const inner = `You are an expert YouTube content strategist. Based on the analysis of the top ${args.videoCount} most-viewed videos from the channel "${args.channelName}" (${viewsClause}), create a comprehensive Scriptwriting Standard Operating Procedure that a writer could pick up and use to produce a new video in this channel's voice.

## Analyzed Videos Data
${args.videosData}

## Output requirements

**Title:** "${args.channelName} Scriptwriting Standard Operating Procedure"
**Subtitle:** "Based on analysis of Top ${args.videoCount} most-viewed videos | ${subtitleViews} | Generated: ${args.date}"

**Table of Contents** (required): markdown bullet list linking to all numbered sections AND both appendices by name. Include sub-headings (e.g. 5.1, 6.1, 6.5, 7.5, Appendix A, Appendix B).

**Section 1: Master Formula**
1A. Express the channel's content formula as a one-line equation, e.g. \`Hook (specific claim) → Setup (origin / stakes) → Payload (3-5 demonstrations) → Reframe (lesson) → CTA\`. Then break each variable down with a short paragraph and concrete examples from the analyzed videos. Cite at least two video titles per variable. This is the single most important section.

1B. **Content Pillars** sub-section: cluster the analyzed videos into 3-5 content pillars by purpose (e.g. "Beginner Guides", "Gear Philosophy", "News Reactions"). For each pillar list 2-4 example video titles with their view counts.

**Section 2: Common Themes & Brand Voice**
2A. Cluster the analyzed videos into 3-6 recurring themes. For each theme: name, ratio of videos that hit it (e.g. "4/10"), why it works for this audience, and one concrete title example.

2B. **Brand Voice** sub-section: 4-6 voice traits (e.g. "Conversational", "Self-deprecating", "Authority-flexing") — each with a one-line definition and a verbatim quoted phrase from the analyzed transcripts as proof.

**Section 3: Cover / Thumbnail Playbook**
- Visual pattern checklist (composition, color, faces, text overlays, props)
- Diagnostic table: For each analyzed video, one line: \`Title — Cover element X works because Y\`
- Title-line patterns that pair with the visual style

**Section 4: Hook Playbook**
For each of the 3-5 distinct hook formulas used by the channel, write a Hook Card:
- **Name + Type**
- **Template**: with [PLACEHOLDER] variables
- **How it works (Psychology)**: 2-3 sentences on the cognitive lever
- **Examples**: quote 2-3 verbatim hook lines with their [m:ss] timestamps from analyzed videos
- **When to use**: situations where this hook fits

**Section 5: Script Structure Blueprint**
- **5.1 Beat Template** table: Beat # | Beat Name | Time Range (sec-to-sec, e.g. "0-15s" not percentages) | Purpose | Signature Move
- **5.2 Item / Demonstration Template** (if the channel uses recurring item-by-item segments): per-item internal structure — Setup phrase → Reveal → Reaction line → Transition phrase, with verbatim phrasings from analyzed videos as examples
- **5.3 Emotional Escalation Map**: chart how energy/stakes shift over the runtime with cited \`[m:ss]\` peaks

**Section 6: Storytelling Frameworks**
Break this into FIVE explicit sub-sections:
- **6.1 Primary Framework**: name + 2-3 sentence definition + one full example video walk-through citing \`[m:ss]\` beats
- **6.2 Secondary Frameworks**: 1-2 alternative shapes used when the primary doesn't fit
- **6.3 Narrative Arc Shape**: the emotional arc plotted as a sequence (e.g. "calm → tension → reveal → relief → punchline") with timestamped examples
- **6.4 Signature Moves**: 3-5 recurring narrative devices unique to this creator (catchphrases, structural tics, recurring sound-bites) with quoted examples
- **6.5 Viewer Journey** (NEW): markdown table with columns \`Stage | Viewer feeling | Script section that triggers it | Cited [m:ss] example\` covering 5-7 stages from "scrolling past" → "took action".

**Section 7: Retention Mechanics**
- **7.1 Open Loops**: 3-5 specific open-loop phrases the channel uses with \`[m:ss]\` of where opened and where closed
- **7.2 Rehook Phrases**: verbatim list of every "stay with me / here's the crazy part / wait until you see this" line found across the analyzed videos, each with \`[m:ss]\`
- **7.3 Specificity Spikes**: concrete numbers, names, dates, dollar amounts that re-grab attention, each with \`[m:ss]\`
- **7.4 Pattern Breaks**: tone shifts, B-roll cuts, recap interludes, with timestamps
- **7.5 Emotional Reframes** (NEW): markdown table with columns \`Negative framing the audience expects | How this creator reframes it | Verbatim example + [m:ss]\` — 3-5 rows showing how the creator turns negatives (failures, cheap gear, common mistakes) into positives.

**Appendix A: Pre-Writing Checklist**
Translate the SOP into a 10-15-bullet actionable checklist a writer can tick before publishing (hook chosen, opening loop set, 2-3 rehooks placed, signature move included, specificity spike per minute, CTA tone, etc.).

**Appendix B: Optimal Video Spec**
2-column table (Element / Target) covering: ideal duration, hook duration, sponsor placement, sections count, visual-reveal cadence, anecdote count, CTA style — calibrated to the channel's top performers.

Format as clean markdown. Cite \`[m:ss]\` timestamps from the analyzed transcripts wherever quoting a line — do NOT invent timestamps.
`;
  return args.language === 'zh' ? CHINESE_WRAPPER(inner) : inner;
}

export function buildAiSopReferencePrompt(args: SopArgs): string {
  const viewsLine =
    args.totalViews && args.totalViews > 0
      ? `# Total Views: ${args.totalViews.toLocaleString('en-US')}`
      : '# Total Views: unavailable';
  const inner = `You are creating an AI-optimized reference document for an automated scriptwriting agent. Based on the analysis of "${args.channelName}", create a structured reference.

Write the ENTIRE document in English (it is read by an AI scriptwriter, not an end user). Keep verbatim quotes and example lines in their original language, but all headers, definitions, and explanations must be English.

## Analyzed Videos Data
${args.videosData}

## Output schema (use these exact section headers)

# CHANNEL REFERENCE: ${args.channelName}
# Generated: ${args.date}
# Videos Analyzed: ${args.videoCount}
${viewsLine}

## CONTENT_FORMULA
A one-line equation, e.g. \`Hook → Setup → Payload(3-5) → Reframe → CTA\`. Followed by 4-6 lines: each variable with its definition.

## THEMES
List 3-6 themes; per theme one line: \`THEME_NAME | hit_ratio | one-sentence definition\`.

## THUMBNAIL_ESSENTIALS
Bulleted list of visual + text-overlay patterns. Then a one-line per-video diagnostic.

## HOOK_TEMPLATES
For each hook type used by the channel:
\`\`\`
TYPE: <hook type name>
TEMPLATE: <template with [PLACEHOLDER] variables>
EXAMPLE_TITLES: <2-3 example titles from analyzed videos>
EXAMPLE_OPENING: <verbatim opening line + [m:ss] from one analyzed video>
USE_WHEN: <one-sentence trigger condition>
PSYCHOLOGY: <one-sentence cognitive lever>
\`\`\`

## SCRIPT_STRUCTURE

### BEAT_TEMPLATE
A markdown table: | Beat # | Beat Name | Time Range (sec-to-sec) | Purpose | Required Elements |

### ITEM_TEMPLATE
The internal structure of one demonstration / item / segment (if the channel uses repeated items):
\`\`\`
SETUP: <verbatim phrasing pattern>
HOOK_LINE: <verbatim phrasing pattern, [m:ss] cited example>
REVEAL: <verbatim phrasing pattern>
REACTION: <verbatim phrasing pattern>
TRANSITION: <verbatim phrasing pattern>
DURATION_RANGE: <sec-to-sec range typical for one item>
\`\`\`

## STORYTELLING
### PRIMARY_FRAMEWORK
Name + 2-sentence definition.
### NARRATIVE_ARC
Sequence of emotional states with \`[m:ss]\` from an analyzed video.
### SIGNATURE_MOVES
3-5 verbatim recurring devices with \`[m:ss]\` examples.

## RETENTION_MECHANICS

### OPEN_LOOPS
List 3-5 specific phrases with \`[m:ss]\` opened/closed pairs.

### REHOOK_PHRASES
Bulleted list of verbatim rehook lines with \`[m:ss]\`.

### SPECIFICITY_PATTERNS
Types of concrete details used (numbers / names / dates) with \`[m:ss]\` examples.

### SIGNATURE_REFRAMES
Recurring meaning-shift moves with verbatim examples + \`[m:ss]\`.

## RULES
Bulleted list of writing constraints the channel respects (e.g. "Never use rhetorical 'imagine' opener", "Always close with a question").

Return ONLY the document content above. No preface. No code fences around the whole document.
`;

  return inner;
}

type HottestArgs = {
  channelName: string;
  title: string;
  views: number | null;
  durationSec: number;
  url: string;
  transcript: string;
  analysisSummary: string;
  commentsSummary?: string | null;
  language?: 'en' | 'zh';
};

export function buildHottestSopPrompt(args: HottestArgs): string {
  const viewsStr =
    args.views && args.views > 0
      ? args.views.toLocaleString('en-US')
      : 'unavailable';
  const commentsBlock = args.commentsSummary
    ? `\n\n## What viewers actually say (top comments — sorted by likes)\n${args.commentsSummary}`
    : '';

  const commentsInstruction = args.commentsSummary
    ? `

After the Retention Tape, append a **Viewer Resonance** section: synthesize the comments above into a one-paragraph answer to "why DID this video go viral?" Cross-reference specific \`[m:ss]\` moments from the transcript with the themes viewers raised. Quote 1-2 comments verbatim if they directly explain a structural choice.`
    : '';

  const inner = `You are an expert YouTube content analyst performing a deep structural breakdown of the #1 most-viewed video from "${args.channelName}".

## Video Information
- **Title:** ${args.title}
- **Views:** ${viewsStr}
- **Duration:** ${args.durationSec} seconds
- **URL:** ${args.url}

## Full Transcript (contains [m:ss] markers — use them in citations)
${args.transcript}

## Video Analysis Summary
${args.analysisSummary}${commentsBlock}

## Instructions

Create a time-segmented structural breakdown. Break the video into 5-8 Parts. Each Part header MUST include the sec-to-sec range (e.g. "Part 2: [1:35-2:48] — Setup"). Within each Part:
- **Core Argument**: 1-2 sentences
- **Specific Examples Used**: quote 1-2 verbatim lines with their \`[m:ss]\` markers from the transcript
- **How it Works (Psychology)**: 2-3 sentences on the cognitive lever
- **Hooks in this Section**: each as \`[m:ss] [Hook Type]: "verbatim line"\`

After the Parts, append a **Retention Tape** section: a single chronological list of every retention move (open loop, rehook, specificity spike, pattern break) with its \`[m:ss]\` and a 5-word description.${commentsInstruction}

Format as clean markdown. NEVER invent timestamps — only use markers that are present in the transcript above.
`;
  return args.language === 'zh' ? CHINESE_WRAPPER(inner) : inner;
}
