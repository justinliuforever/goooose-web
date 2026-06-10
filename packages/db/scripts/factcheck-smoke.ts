// Real-LLM smoke for the fact-check layer: runs analyzeTopic (verbatim extraction +
// grounding + fact-check) on a Leica reference seeded with TWO known errors —
// M4 "1964" (accepted 1967) and a wrong film format — and checks they're flagged
// disputed while correct facts (M3 0.91x, M7 DX) stay verified. No DB writes.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { analyzeTopic } from "@singularity/shared/services/poet/topic-analyzer";
import { formatVerbatimFacts } from "@singularity/shared/services/poet/script-writer";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const leicaText = `Leica M Series Film Cameras Overview

- The Leica M mount was first introduced in 1954 at Photokina in Germany.
- M3: produced 1954 to 1966; viewfinder magnification 0.91x; framelines 50, 90, 135mm.
- M2: produced 1957 to 1968; viewfinder 0.72x; framelines 35, 50, 90mm.
- M4: produced between 1964 to 1975; introduced a faster film loading system; framelines 35/135 paired, 50, 90.
- M5: 1971; first M with built-in TTL metering.
- M6: produced 1984 to 2002; viewfinder 0.72 in the classic, also 0.58 and 0.85.
- M7: produced 2002 to 2018; first film Leica to support DX encoding.
- MP: introduced 2003 and still in production today.
- M-A: introduced 2014; no meter, no battery, no electronics.
- All Leica M film cameras use 120 medium format film and have a maximum shutter speed of 1/1000s.`;

const t0 = Date.now();
const analysis = await analyzeTopic({
  topic: "徕卡 M 系列胶片机全解析：从 M3 到 M-A",
  references: [{ type: "text", title: "Leica M Series Film Cameras Overview", content: leicaText }],
  bibleText: "频道定位：面向摄影爱好者的器材深度解析，讲历史、参数与二手行情，语气专业但不端着。",
  sopText: "[No SOP reference available]",
  language: "zh",
});
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`\nanalyzeTopic (verbatim + grounding + fact-check) took ${elapsed}s`);
console.log(`verbatim lines: ${analysis.verbatimFacts.split("\n").filter(Boolean).length}`);
console.log(`fact_checks: ${analysis.factChecks.length}`);
const counts = analysis.factChecks.reduce<Record<string, number>>((a, f) => ((a[f.status] = (a[f.status] ?? 0) + 1), a), {});
console.log("by status:", JSON.stringify(counts));

console.log("\n=== FLAGGED (expect M4 year + 120-format) ===");
for (const f of analysis.factChecks.filter((f) => f.status !== "verified")) {
  console.log(`[${f.status}] ${f.fact}\n   → ${f.note ?? "(no note)"}`);
}
console.log("\n=== sample VERIFIED (expect M3 0.91x / M7 DX, no false flags) ===");
for (const f of analysis.factChecks.filter((f) => f.status === "verified").slice(0, 8)) {
  console.log(`[verified] ${f.fact}`);
}
console.log("\n=== writer view (formatVerbatimFacts) — disputed lines carry caution ===");
console.log(
  formatVerbatimFacts(analysis.verbatimFacts, analysis.factChecks)
    .split("\n")
    .filter((l) => /DISPUTED/.test(l))
    .join("\n") || "(no disputed lines surfaced)",
);
