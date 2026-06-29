import { generateText } from "ai";

import { generateTextWithFallback, llm } from "@singularity/integrations/clients/llm";
import { parseLlmJson } from "@singularity/integrations/utils";
import { redactUngrounded } from "../grounding";
import {
  buildLongFormOutlinePrompt,
  buildScriptCompressPrompt,
  buildScriptWritingPrompt,
  buildSectionExpandPrompt,
} from "@singularity/prompts/poet";
import { isLongForm } from "../../schemas/poet";
import type { CheckedFact } from "./factCheck";
import { humanizeChinese } from "./humanizer";

const MAX_REFERENCE_CHARS = 24000;
const MAX_SECTION_REFERENCE_CHARS = 10000;
const PREV_TAIL_CHARS = 400;
// Scripts may run up to 20% over the spoken-duration target before the budget gate
// compresses them — a single window that holds for both paths and both languages.
const OVERSHOOT_LIMIT = 1.2;

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

export function formatVerbatimFacts(
  verbatimFacts: string | null | undefined,
  factChecks?: CheckedFact[] | null,
): string {
  // When fact-check flagged disputed/unsupported atoms, rebuild the list from the
  // structured facts so each flagged one carries an inline caution the writer must heed.
  const flagged = (factChecks ?? []).filter((f) => f.status !== "verified");
  if (flagged.length > 0) {
    return (factChecks ?? [])
      .map((f) => {
        const base = `- ${f.fact}${f.src ? ` [src: ${f.src}]` : ""}`;
        if (f.status === "verified") return base;
        const why = f.note?.trim() || "conflicts with well-known facts";
        return `${base}  ⚠️ DISPUTED — ${why}; do NOT state this specific value as fact (generalize it or omit the number/year)`;
      })
      .join("\n");
  }
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
  factChecks?: CheckedFact[] | null;
};

export type ScriptResult = {
  scriptText: string;
  wordCount: number;
};

export type OutlineSection = {
  marker: string;
  key_points: string[];
  target_count: number;
  emotional_note: string;
};

export type Outline = {
  overall_arc: string;
  sections: OutlineSection[];
};


function normalizeOutline(parsed: unknown, fallbackTargetCount: number, targetTotal: number): Outline | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const rawSections = obj.sections;
  if (!Array.isArray(rawSections) || rawSections.length === 0) return null;
  const sections: OutlineSection[] = [];
  for (const s of rawSections) {
    if (!s || typeof s !== "object") continue;
    const sec = s as Record<string, unknown>;
    const marker = typeof sec.marker === "string" ? sec.marker : null;
    if (!marker) continue;
    const keyPointsRaw = Array.isArray(sec.key_points) ? sec.key_points : [];
    const keyPoints = keyPointsRaw.map((p) => String(p));
    const targetCount =
      typeof sec.target_count === "number" && sec.target_count > 0
        ? Math.round(sec.target_count)
        : fallbackTargetCount;
    const emotionalNote = typeof sec.emotional_note === "string" ? sec.emotional_note : "";
    sections.push({
      marker,
      key_points: keyPoints,
      target_count: targetCount,
      emotional_note: emotionalNote,
    });
  }
  if (sections.length === 0) return null;
  // Keep the section budgets near the requested total in BOTH directions: an
  // under-budgeted outline silently yields a short script, an over-budgeted one
  // drives the per-section overshoot the long path used to have no guard against.
  const sum = sections.reduce((a, s) => a + s.target_count, 0);
  if (sum > 0 && (sum < targetTotal * 0.8 || sum > targetTotal * OVERSHOOT_LIMIT)) {
    const scale = targetTotal / sum;
    for (const s of sections) s.target_count = Math.round(s.target_count * scale);
  }
  return {
    overall_arc: typeof obj.overall_arc === "string" ? obj.overall_arc : "",
    sections,
  };
}

export type LongFormHooks = {
  onOutlineDone?: (outline: Outline) => void | Promise<void>;
  onSectionStart?: (info: { index: number; total: number; marker: string }) => void | Promise<void>;
  onSectionDone?: (info: { index: number; total: number; marker: string; chars: number }) => void | Promise<void>;
  onHumanizeStart?: () => void | Promise<void>;
};

async function writeScriptLong(
  args: WriteScriptArgs,
  hooks: LongFormHooks = {},
): Promise<ScriptResult | null> {
  const language = args.language;
  const targetWordCount = args.targetWordCount;
  const ideaText =
    `Story Angle: ${args.idea.storyAngle}\n\n` +
    `Facts & Data: ${args.idea.factsAndData}\n\n` +
    `Why Similar: ${args.idea.whySimilar}`;
  const refsBlockFull = formatReferencesBlock(args.references, MAX_REFERENCE_CHARS);
  const refsBlockSection = formatReferencesBlock(args.references, MAX_SECTION_REFERENCE_CHARS);
  const verbatimBlock = formatVerbatimFacts(args.verbatimFacts, args.factChecks);

  const outlinePrompt = buildLongFormOutlinePrompt({
    sopReference: args.sopText,
    referencesContext: refsBlockFull,
    ideaText,
    viralTrigger: args.idea.viralTrigger,
    targetWordCount,
    language,
  });

  const outlineResult = await generateText({
    model: llm("pro"),
    prompt: outlinePrompt,
    temperature: 0.5,
    maxOutputTokens: 8192,
    maxRetries: 2,
  });

  const lengthUnit = language === "zh" ? "characters (字)" : "words";
  const outline = normalizeOutline(
    await parseLlmJson(outlineResult.text),
    Math.max(200, Math.round(targetWordCount / 5)),
    targetWordCount,
  );
  if (!outline) {
    // eslint-disable-next-line no-console
    console.warn(
      "[poet:long-form] outline parse failed, falling back to short-form. Head:",
      outlineResult.text.slice(0, 300),
    );
    return null;
  }

  await hooks.onOutlineDone?.(outline);

  const outlineSummary = outline.sections
    .map(
      (s) =>
        `  ${s.marker}: ${(s.key_points.slice(0, 2).join("; ") || "(see arc)").trim()} (~${s.target_count} ${lengthUnit})`,
    )
    .join("\n");

  const charsPerToken = language === "zh" ? 1.5 : 0.75;
  const scriptParts: string[] = [];
  let prevTail = "(This is the opening section — start strong.)";
  let emptyCount = 0;

  for (let idx = 0; idx < outline.sections.length; idx++) {
    const section = outline.sections[idx]!;
    await hooks.onSectionStart?.({
      index: idx,
      total: outline.sections.length,
      marker: section.marker,
    });

    const keyPointsBlock =
      section.key_points.length > 0
        ? section.key_points.map((p) => `- ${p}`).join("\n")
        : "- (follow the outline arc)";

    // 3000-token floor: short sections (HOOK/CTA/CLOSE) returned empty when reasoning ate the budget.
    const sectionMaxTokens = Math.max(
      3000,
      Math.min(Math.round((section.target_count / charsPerToken) * 2.0) + 500, 6144),
    );

    const expandPrompt = buildSectionExpandPrompt({
      language,
      sopReference: args.sopText,
      referencesContext: refsBlockSection,
      verbatimFactsContext: verbatimBlock,
      overallArc: outline.overall_arc,
      outlineSummary,
      prevTail,
      marker: section.marker,
      keyPoints: keyPointsBlock,
      targetCount: section.target_count,
      emotionalNote: section.emotional_note,
    });

    let sectionText = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const sectionResult = await generateText({
        model: llm("pro"),
        prompt: expandPrompt,
        temperature: 0.5,
        maxOutputTokens: sectionMaxTokens,
        maxRetries: 2,
      });
      sectionText = sectionResult.text.trim();
      if (sectionText.length > 0) break;
      // eslint-disable-next-line no-console
      console.warn(
        `[poet:long-form] empty section ${section.marker} on attempt ${attempt + 1}, retrying`,
      );
    }
    if (sectionText.length === 0) {
      // Pro intermittently empties a section (reasoning ate the budget); Flash usually fills it.
      const flash = await generateText({
        model: llm("flash"),
        prompt: expandPrompt,
        temperature: 0.5,
        maxOutputTokens: sectionMaxTokens,
        maxRetries: 2,
      });
      sectionText = flash.text.trim();
    }

    if (sectionText.length === 0) {
      // eslint-disable-next-line no-console
      console.warn(`[poet:long-form] section ${section.marker} empty after Pro+Flash`);
      // The opening sets up the whole script — without it, fall back to single-call. Otherwise
      // SKIP this one section and keep the assembled long script: collapsing a large target to a
      // single short-call undershoots badly (a stuck [CTA] dropped a 4000-char target to 0.53x).
      if (idx === 0) return null;
      emptyCount++;
      if (emptyCount > Math.ceil(outline.sections.length / 3)) {
        // eslint-disable-next-line no-console
        console.warn(`[poet:long-form] ${emptyCount} empty sections; falling back to single-call`);
        return null;
      }
      continue;
    }

    scriptParts.push(`${section.marker}\n${sectionText}`);
    prevTail = sectionText.length > PREV_TAIL_CHARS ? sectionText.slice(-PREV_TAIL_CHARS) : sectionText;

    await hooks.onSectionDone?.({
      index: idx,
      total: outline.sections.length,
      marker: section.marker,
      chars: sectionText.length,
    });
  }

  const scriptText = scriptParts.join("\n\n");
  const wordCount =
    language === "zh" ? scriptText.length : scriptText.trim().split(/\s+/).length;
  return { scriptText, wordCount };
}

export async function writeScript(
  args: WriteScriptArgs,
  hooks: LongFormHooks = {},
): Promise<ScriptResult & { path: "short" | "long"; humanized: boolean }> {
  let result: ScriptResult & { path: "short" | "long" };
  if (isLongForm(args.targetWordCount, args.language)) {
    const long = await writeScriptLong(args, hooks);
    if (long) result = { ...long, path: "long" };
    else {
      const short = await writeScriptShort(args);
      result = { ...short, path: "short" };
    }
  } else {
    const short = await writeScriptShort(args);
    result = { ...short, path: "short" };
  }

  // Brand wrapper stays a soft prompt guideline; post-hoc Bible-quote injection was removed (it forced irrelevant lines into the hook).

  // Grounding pass (script mode: generalize, never insert tags — it's read aloud).
  // Include the bible so the channel/host identity counts as grounded.
  const source = [
    args.bibleText,
    formatReferencesBlock(args.references),
    formatVerbatimFacts(args.verbatimFacts, args.factChecks),
    args.idea.factsAndData,
  ].join("\n\n");
  const grounded = await redactUngrounded({
    draft: result.scriptText,
    source,
    language: args.language,
    mode: "script",
    tier: "fallback", // Pro-first: catches factual errors (e.g. wrong product year) a script asserts.
  });
  if (grounded && grounded !== result.scriptText) {
    result = {
      ...result,
      scriptText: grounded,
      wordCount: args.language === "zh" ? grounded.length : grounded.trim().split(/\s+/).length,
    };
  }

  // Humanize (zh short) runs on the writer's natural overshoot so its own colloquial trim
  // lands near target; THEN one budget gate squeezes whatever still exceeds the window.
  // Order matters: compressing BEFORE humanize shrinks the draft, and humanize's ~30% trim
  // then undershoots — so length enforcement is the single last step, never before humanize.
  let humanized = false;
  if (args.language === "zh" && result.path === "short") {
    await hooks.onHumanizeStart?.();
    const rewritten = (
      await humanizeChinese(result.scriptText, Math.round(args.targetWordCount * OVERSHOOT_LIMIT))
    ).trim();
    if (rewritten && rewritten !== result.scriptText) {
      result = { ...result, scriptText: rewritten, wordCount: rewritten.length };
    }
    humanized = true;
  }

  result = await enforceBudget(result, args);

  return { ...result, humanized };
}

async function enforceBudget(
  result: ScriptResult & { path: "short" | "long" },
  args: Pick<WriteScriptArgs, "language" | "targetWordCount">,
): Promise<ScriptResult & { path: "short" | "long" }> {
  if (result.wordCount <= args.targetWordCount * OVERSHOOT_LIMIT) return result;
  const squeezed = await compressToBudget(result.scriptText, result.wordCount, args);
  return { ...result, ...squeezed };
}

export async function writeScriptShort(args: WriteScriptArgs): Promise<ScriptResult> {
  const ideaText =
    `Story Angle: ${args.idea.storyAngle}\n\n` +
    `Facts & Data: ${args.idea.factsAndData}\n\n` +
    `Why Similar: ${args.idea.whySimilar}`;

  const prompt = buildScriptWritingPrompt({
    channelBible: args.bibleText,
    sopReference: args.sopText,
    referencesContext: formatReferencesBlock(args.references),
    verbatimFactsContext: formatVerbatimFacts(args.verbatimFacts, args.factChecks),
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
    // 16384 so the short path (and the long-form fallback that reuses it) doesn't
    // truncate larger targets; reasoning tokens also draw from this budget.
    maxOutputTokens: 16384,
    maxRetries: 2,
  });

  const scriptText = result.text;
  const wordCount =
    args.language === "zh" ? scriptText.length : scriptText.trim().split(/\s+/).length;

  return { scriptText, wordCount };
}

// Duration is a product promise (a 30s script must be speakable in ~30s, a 5-min one in
// ~5 min). The prompt window alone gets ignored often enough that overshoots get up to
// three compress passes. Keeps the shortest valid version even when it misses the window —
// rejecting a 1.4× compress in favor of the 1.8× draft helps nobody.
async function compressToBudget(
  scriptText: string,
  wordCount: number,
  args: Pick<WriteScriptArgs, "language" | "targetWordCount">,
): Promise<ScriptResult> {
  const ceiling = Math.round(args.targetWordCount * OVERSHOOT_LIMIT);
  const floor = Math.round(args.targetWordCount * 0.5);
  let bestText = scriptText;
  let bestCount = wordCount;
  for (let attempt = 0; attempt < 3 && bestCount > ceiling; attempt++) {
    // Pro→Flash fallback: Pro's reasoning intermittently burns the whole budget and
    // returns empty, which silently skipped compression entirely.
    const compressed = await generateTextWithFallback({
      prompt: buildScriptCompressPrompt({
        scriptText: bestText,
        language: args.language,
        targetWordCount: args.targetWordCount,
      }),
      temperature: 0.3,
      maxOutputTokens: 16384,
      maxRetries: 2,
    });
    const ct = compressed.text.trim();
    const cc = args.language === "zh" ? ct.length : ct.split(/\s+/).length;
    if (!ct || compressed.finishReason === "length" || cc < floor || cc >= bestCount) {
      // eslint-disable-next-line no-console
      console.warn(
        `[poet:compress] attempt ${attempt + 1} rejected (tier=${compressed.usedTier}, finish=${compressed.finishReason}, count=${cc}/${bestCount})`,
      );
      break;
    }
    bestText = ct;
    bestCount = cc;
  }
  return { scriptText: bestText, wordCount: bestCount };
}
