import { generateTextWithFallback } from "../../clients/llm";
import { buildFactCheckPrompt, type FactCheckItem } from "../../prompts/poet";

// Mirror of @singularity/db CheckedFact (this repo keeps equivalent types per package
// rather than cross-importing; see ScriptReference vs CustomTopicReference).
export type CheckedFact = {
  fact: string;
  src: string;
  status: "verified" | "disputed" | "unsupported";
  note?: string;
};

// Split "- <fact> [src: <title>]" lines into {fact, src}.
function parseVerbatim(verbatimFacts: string): { fact: string; src: string }[] {
  const out: { fact: string; src: string }[] = [];
  for (const raw of (verbatimFacts ?? "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const body = line.replace(/^[-*]\s*/, "");
    const m = body.match(/^(.*?)\s*\[src:\s*([^\]]*)\]\s*$/i);
    if (m) out.push({ fact: m[1]!.trim(), src: m[2]!.trim() });
    else out.push({ fact: body, src: "" });
  }
  return out;
}

function parseJsonArray(text: string): unknown[] | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1) return null;
  try {
    const v = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

// Per-fact verification at topic-analysis time. Catches "sourced but wrong" facts that
// the grounding pass keeps (it trusts cited sources). Marks only — never edits the fact.
// Any failure path returns everything "verified": this must never block analysis or
// false-flag a correct fact.
export async function factCheckVerbatim(args: {
  verbatimFacts: string;
  referenceTitles: string[];
  language?: "en" | "zh";
  logger?: { info?: (m: string) => void; warn?: (m: string) => void };
}): Promise<CheckedFact[]> {
  const parsed = parseVerbatim(args.verbatimFacts);
  if (parsed.length === 0) return [];
  const fallback = (): CheckedFact[] =>
    parsed.map((p) => ({ fact: p.fact, src: p.src, status: "verified" as const }));
  try {
    const items: FactCheckItem[] = parsed.map((p, i) => ({ index: i + 1, fact: p.fact, src: p.src }));
    const prompt = buildFactCheckPrompt({
      items,
      referenceTitles: args.referenceTitles,
      language: args.language ?? "zh",
    });
    const { text, finishReason } = await generateTextWithFallback({
      prompt,
      temperature: 0.1,
      maxOutputTokens: 4096,
      maxRetries: 2,
    });
    if (finishReason === "length") {
      args.logger?.warn?.("fact-check truncated (length cap); marking all verified");
      return fallback();
    }
    const arr = parseJsonArray(text);
    if (!arr) {
      args.logger?.warn?.("fact-check output unparseable; marking all verified");
      return fallback();
    }
    const byIndex = new Map<number, { status?: string; note?: string }>();
    for (const raw of arr) {
      if (raw && typeof raw === "object") {
        const o = raw as Record<string, unknown>;
        const idx = Number(o.index);
        if (Number.isFinite(idx)) {
          byIndex.set(idx, {
            status: typeof o.status === "string" ? o.status : undefined,
            note: typeof o.note === "string" ? o.note : undefined,
          });
        }
      }
    }
    const valid = new Set(["verified", "disputed", "unsupported"]);
    const result: CheckedFact[] = parsed.map((p, i) => {
      const v = byIndex.get(i + 1);
      const status = (v && valid.has(v.status ?? "") ? v.status : "verified") as CheckedFact["status"];
      const note = status === "verified" ? undefined : v?.note?.trim() || undefined;
      return { fact: p.fact, src: p.src, status, note };
    });
    const flagged = result.filter((r) => r.status !== "verified").length;
    args.logger?.info?.(`fact-check: ${result.length} facts, ${flagged} flagged`);
    return result;
  } catch (err) {
    args.logger?.warn?.(`fact-check failed: ${(err as Error).message?.slice(0, 120)}; marking all verified`);
    return fallback();
  }
}
