import { generateTextWithFallback } from "../clients/llm";

// Anti-fabrication grounding pass: a second LLM checks every specific claim in a
// generated draft against the source material and redacts the ones the source does
// not support (generalize / drop false precision / tag 待核实). The generators tend
// to invent prices, specs, stats, handles, and quotes when the source is thin — this
// is the backstop. Returns the original draft on empty/error (never breaks the run).
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
  const prompt = `You are a strict fact-checker and redactor. You are given SOURCE MATERIAL (the ONLY ground truth) and a DRAFT generated from it. Your job is to remove fabricated specifics — NOT to rewrite or improve the draft.

Go through the DRAFT. For every SPECIFIC factual claim — price, number, percentage, statistic, measurement or spec, model / product / brand name, person name, social handle, date or year, and any line presented as a verbatim quote — decide:
- SOURCE supports it → keep it exactly.
- SOURCE does NOT support it → ${fixRule} A quoted line not found in the SOURCE must not be presented as a real quote. Never leave an unsupported specific stated as fact.

Always allowed (never redact these): the channel's own name, the host's name, and the channel/show brand — they identify the deliverable, not a factual claim.

Hard rules:
- Preserve the DRAFT's language, structure, section headers, voice, and every grounded sentence unchanged. Only touch unsupported specifics.
- Do NOT add new facts, sections, analysis, or commentary. Do NOT explain your edits or wrap the output in code fences.
- ${emptyRule}
- Output ONLY the corrected document.

## SOURCE MATERIAL
${args.source?.trim() || "(none provided — treat ALL specific figures, specs, names, and quotes in the draft as unsupported)"}

## DRAFT
${draft}`;
  try {
    const { text } = await generateTextWithFallback({
      prompt,
      maxOutputTokens: args.maxOutputTokens ?? 16384,
      temperature: 0.2,
    });
    const out = text.trim();
    if (!out) {
      args.logger?.warn?.("grounding pass returned empty; keeping draft");
      return args.draft;
    }
    args.logger?.info?.(`grounding pass: ${draft.length} → ${out.length} chars`);
    return out;
  } catch (err) {
    args.logger?.warn?.(`grounding pass failed: ${(err as Error).message?.slice(0, 120)}; keeping draft`);
    return args.draft;
  }
}
