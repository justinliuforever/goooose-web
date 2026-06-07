import { generateText } from "ai";

import { llm } from "../clients/llm";

// Anti-fabrication / fact-safety pass: a second LLM compares a generated draft to its
// source and (1) redacts specifics the source doesn't support, (2) cleans garbled ASR
// quotes the source contains, and (3) fixes clear factual errors about well-known
// entities. Generators invent prices/specs/quotes when the source is thin, surface raw
// ASR garble as fact, and occasionally state a wrong date for a real product. Returns
// the original draft on empty / truncation / error (never breaks the run).
export async function redactUngrounded(args: {
  draft: string;
  source: string;
  language?: "en" | "zh";
  mode?: "doc" | "script";
  maxOutputTokens?: number;
  logger?: { info?: (m: string) => void; warn?: (m: string) => void };
}): Promise<string> {
  const draft = (args.draft ?? "").trim();
  if (!draft) return args.draft;
  const tag = (args.language ?? "zh") === "zh" ? "「待核实」" : "[unverified]";
  const isScript = args.mode === "script";
  const fixRule = isScript
    ? `rewrite it into natural, general spoken wording, or drop it. This text is READ ALOUD — do NOT insert ${tag} or any bracketed note; the result must be speakable.`
    : `make the smallest fix: replace the exact figure/name with a general phrasing, drop the false precision, or mark it ${tag}.`;
  const emptyRule = isScript
    ? `If the SOURCE is empty or has no concrete data, the DRAFT must end up with NO specific prices / specs / stats / named products / fabricated quotes — generalize them into natural spoken wording (never insert ${tag}).`
    : `If the SOURCE is empty or has no concrete data, the DRAFT must end up with NO specific prices / specs / stats / named products / quotes — generalize or ${tag} all of them (strategy-level wording is fine).`;
  const prompt = `You are a strict fact-checker and copy-cleaner. You are given SOURCE MATERIAL (the ground truth) and a DRAFT generated from it. Your job is to make the DRAFT factually safe — remove fabricated specifics, clean garbled source quotes, and fix clear factual errors — WITHOUT rewriting its structure, voice, or grounded content.

Go through the DRAFT. For every SPECIFIC factual claim — price, number, percentage, statistic, measurement or spec, model / product / brand name, person name, social handle, date or year, and any line presented as a verbatim quote — decide:
- SOURCE supports it → keep it exactly.
- SOURCE does NOT support it → ${fixRule} A quoted line not found in the SOURCE must not be presented as a real quote. Never leave an unsupported specific stated as fact.
- GARBLED ASR in the SOURCE → never reproduce a nonsensical garbled quote / number / name (e.g. "六年两百九十三个零件", "新一4.4百币"); correct it from context if the intent is clear, otherwise drop it${isScript ? "" : ` or mark ${tag}`}.
- CLEAR FACTUAL ERROR about a real, widely-known entity (e.g. a wrong launch year for a famous product, a misattributed quote) → if you are HIGHLY confident of the correct value, fix it to the correct value; if unsure, do not guess${isScript ? ", soften to safe general wording" : ` — mark it ${tag}`}.

Always allowed (never redact these): the channel's own name, the host's name, and the channel/show brand — they identify the deliverable, not a factual claim.

Hard rules:
- Preserve the DRAFT's language, structure, section headers, voice, and every grounded sentence unchanged. Touch ONLY unsupported specifics, garbled source quotes, and clear factual errors.
- Do NOT add new facts, sections, analysis, or commentary. Do NOT explain your edits or wrap the output in code fences.
- ${emptyRule}
- Output ONLY the corrected document.

## SOURCE MATERIAL
${args.source?.trim() || "(none provided — treat ALL specific figures, specs, names, and quotes in the draft as unsupported)"}

## DRAFT
${draft}`;
  try {
    // Flash, not Pro: redaction is mechanical (copy-with-edits), and a reasoning
    // model burns the output budget on long docs and truncates the result.
    const result = await generateText({
      model: llm("flash"),
      prompt,
      maxOutputTokens: args.maxOutputTokens ?? 16384,
      temperature: 0.2,
      maxRetries: 2,
    });
    const out = result.text.trim();
    if (!out) {
      args.logger?.warn?.("grounding pass returned empty; keeping draft");
      return args.draft;
    }
    // If the redaction itself hit the length cap, ship the original — an un-redacted
    // but complete doc beats a truncated one.
    if (result.finishReason === "length") {
      args.logger?.warn?.(`grounding pass truncated (length cap); keeping original draft`);
      return args.draft;
    }
    args.logger?.info?.(`grounding pass: ${draft.length} → ${out.length} chars`);
    return out;
  } catch (err) {
    args.logger?.warn?.(`grounding pass failed: ${(err as Error).message?.slice(0, 120)}; keeping draft`);
    return args.draft;
  }
}
