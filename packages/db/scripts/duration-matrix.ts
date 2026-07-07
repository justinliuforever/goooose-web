// Offline duration+persona matrix: real-LLM writeScript against a real bible/SOP/topic, no DB writes.
import { dirname, resolve } from "node:path"; import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import dotenv from "dotenv"; import postgres from "postgres"; import { drizzle } from "drizzle-orm/postgres-js";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const { poetBible, poetCustomTopics, clerkSops } = await import("@singularity/db");
const { eq, and, desc } = await import("drizzle-orm");
const { writeScript } = await import("@singularity/domain/services/poet/script-writer");
const { computeTargetWordCount, countWords } = await import("@singularity/domain/schemas/poet");
const client = postgres(process.env.DATABASE_URL!, { prepare: false }); const db = drizzle(client);

const CH = "efabd08a-4949-46b8-8791-f8c0ca5db4c9"; // 小羽毛 — SOP carries 孟娇 persona
const [bible] = await db.select().from(poetBible).where(and(eq(poetBible.channelId, CH), eq(poetBible.isActive, true))).limit(1);
const [sop] = await db.select().from(clerkSops).where(and(eq(clerkSops.channelId, CH), eq(clerkSops.sopType, "ai_reference"))).orderBy(desc(clerkSops.generatedAt)).limit(1);
const [topic] = await db.select().from(poetCustomTopics).where(eq(poetCustomTopics.channelId, CH)).orderBy(desc(poetCustomTopics.updatedAt)).limit(1);
if (!bible || !sop || !topic) { console.log("missing inputs", { bible: !!bible, sop: !!sop, topic: !!topic }); process.exit(1); }
console.log(`inputs: bible=${(bible as any).content.length}ch sop=${sop.contentMd.length}ch topic="${(topic as any).topic?.slice(0, 40)}"`);
console.log(`SOP mentions 孟娇? ${/孟娇/.test(sop.contentMd)} | bible mentions 孟娇? ${/孟娇/.test((bible as any).content)}`);

const t: any = topic;
const idea = {
  storyAngle: t.storyAngle ?? "", factsAndData: t.factsAndData ?? "", whySimilar: t.whySimilar ?? "",
  viralTrigger: t.viralTrigger ?? "", sourceTitle: t.topic, sourceChannel: "Custom topic",
};
const references = ((t.references as any[]) ?? []).map((r) => ({ type: r.kind, title: r.title ?? "Reference", url: r.url, content: r.text ?? "" })).filter((r) => r.content.trim());

const CASES: Array<{ label: string; dur: number }> = [
  { label: "R5-300s", dur: 300 }, { label: "R5-600s", dur: 600 },
  { label: "R5-1200s", dur: 1200 },
];
mkdirSync("/tmp/duration-matrix", { recursive: true });

async function runCase(c: { label: string; dur: number }) {
  const target = computeTargetWordCount(c.dur, "zh");
  const started = Date.now();
  try {
    const r = await writeScript({
      idea, sopText: sop!.contentMd, bibleText: (bible as any).content, language: "zh",
      references, targetWordCount: target, verbatimFacts: t.verbatimFacts, factChecks: t.factChecks,
      channelName: "小羽毛",
    });
    const spoken = countWords(r.scriptText, "zh");
    const ratio = spoken / target;
    const persona = /孟娇/.test(r.scriptText);
    const selfIntro = /我是[^\s，。,]{1,6}[，。,]/.test(r.scriptText);
    writeFileSync(`/tmp/duration-matrix/${c.label}.md`, `dur=${c.dur} target=${target} spoken=${spoken} ratio=${ratio.toFixed(2)} path=${r.path} 孟娇=${persona}\n\n${r.scriptText}`);
    return { label: c.label, dur: c.dur, target, spoken, ratio: +ratio.toFixed(2), path: r.path, inWindow: ratio >= 0.8 && ratio <= 1.25, persona孟娇: persona, selfIntro, secs: Math.round((Date.now() - started) / 1000) };
  } catch (e) {
    return { label: c.label, dur: c.dur, target, error: (e as Error).message.slice(0, 100), secs: Math.round((Date.now() - started) / 1000) } as any;
  }
}

// concurrency 3
const results: any[] = [];
for (let i = 0; i < CASES.length; i += 3) {
  const batch = CASES.slice(i, i + 3);
  console.log(`\n[batch ${i / 3 + 1}] ${batch.map((b) => b.label).join(", ")} ...`);
  const rs = await Promise.all(batch.map(runCase));
  for (const r of rs) { results.push(r); console.log("  ", JSON.stringify(r)); }
}

console.log("\n===== SUMMARY =====");
for (const r of results) console.log(`  ${r.label}: ${r.error ? "ERROR " + r.error : `ratio=${r.ratio} path=${r.path} inWindow=${r.inWindow ? "YES" : "NO"} 孟娇=${r.persona孟娇}`}`);
const ok = results.filter((r) => r.inWindow).length;
const leak = results.filter((r) => r.persona孟娇).length;
console.log(`\nin-window: ${ok}/${results.length} | persona leaks: ${leak}/${results.length}`);
await client.end();
