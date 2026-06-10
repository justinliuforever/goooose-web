// Focused re-gen of the steps the WF-2 judge failed/flagged (kai-w): clerk-analysis
// (anti-fab guard), clerk-hottest-sop (calque glossary), poet-topic-analysis
// (anti-English-echo). Writes /tmp/eval/regen/*.txt for a quick re-judge.
// Run: pnpm --filter @singularity/db exec tsx scripts/eval-regen.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { generateText } from "ai";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { llm } from "@singularity/shared/clients/llm";
import { buildVideoAnalysisPrompt, buildHottestSopPrompt } from "@singularity/shared/prompts/clerk";
import { analyzeTopic } from "@singularity/shared/services/poet/topic-analyzer";
import { channels, clerkSops, clerkVideos, poetBible } from "../src/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);
const OUT = "/tmp/eval/regen";
mkdirSync(OUT, { recursive: true });

const CALQUES = ["开放回路", "打开回路", "模式打断", "模式打破", "认知杠杆", "视觉锤", "留人钉", "情绪过山车", "社交证据", "好奇心缺口", "帧理审判", "Pattern Interrupt", "Curiosity Gap", "Expectation vs Reality"];
function scan(label: string, text: string) {
  const hits = CALQUES.filter((c) => text.includes(c));
  writeFileSync(`${OUT}/${label}.txt`, text);
  console.log(`  ${label.padEnd(20)} ${text.length} chars | calques: ${hits.length ? hits.join(", ") : "0 ✓"}`);
}

try {
  const [ch] = await db.select().from(channels).where(eq(channels.name, "kai-w")).limit(1);
  if (!ch) throw new Error("kai-w not found");
  const [sop] = await db.select().from(clerkSops).where(and(eq(clerkSops.channelId, ch.id), eq(clerkSops.sopType, "ai_reference"))).orderBy(desc(clerkSops.generatedAt)).limit(1);
  const [bible] = await db.select().from(poetBible).where(and(eq(poetBible.channelId, ch.id), eq(poetBible.isActive, true))).limit(1);
  const vids = await db.select().from(clerkVideos).where(and(eq(clerkVideos.channelId, ch.id), isNotNull(clerkVideos.transcript))).orderBy(desc(clerkVideos.views)).limit(12);
  const top = vids[0]!;
  const transcript = vids.find((v) => (v.transcript ?? "").length > 300)?.transcript ?? top.transcript ?? "";
  const chDesc = ch.description || ch.name;

  console.log("Re-gen for kai-w (transcript " + transcript.length + " chars):");

  // 1. clerk-analysis (anti-fab guard) — same thin transcript, should now be honest not fabricated
  {
    const t0 = Date.now();
    const prompt = buildVideoAnalysisPrompt({ title: top.title, views: top.views, durationSec: top.durationSec, thumbnailUrl: top.thumbnailUrl, transcript, contentType: "video", language: "zh" });
    const r = await generateText({ model: llm("flash"), prompt, maxOutputTokens: 16384, temperature: 0.3, maxRetries: 2 });
    console.log(`  (analysis ${Math.round((Date.now() - t0) / 1000)}s)`);
    scan("clerk-analysis", r.text);
  }
  // 2. clerk-hottest-sop (glossary additions)
  {
    const t0 = Date.now();
    const prompt = buildHottestSopPrompt({ channelName: ch.name, title: top.title, views: top.views, durationSec: top.durationSec ?? 60, url: top.url ?? "", transcript, analysisSummary: `framework: ${top.framework ?? ""}; hooks: ${(top.hooksThroughout ?? "").slice(0, 300)}`, language: "zh" });
    const r = await generateText({ model: llm("pro"), prompt, maxOutputTokens: 12000, temperature: 0.4, maxRetries: 2 });
    console.log(`  (hottest-sop ${Math.round((Date.now() - t0) / 1000)}s)`);
    scan("clerk-hottest-sop", r.text);
  }
  // 3. poet-topic-analysis (anti-English-echo + anti-calque)
  {
    const t0 = Date.now();
    const a = await analyzeTopic({ topic: `围绕「${chDesc.slice(0, 40)}」最近的一个争议点或反差话题`, references: null, bibleText: bible?.content ?? "", sopText: sop?.contentMd ?? "", language: "zh" });
    console.log(`  (topic-analysis ${Math.round((Date.now() - t0) / 1000)}s)`);
    scan("poet-topic-analysis", `STORY: ${a.storyAngle}\n\nFACTS: ${a.factsAndData}\n\nWHY: ${a.whySimilar}\n\nVIRAL: ${a.viralTrigger}`);
  }
  console.log("\nDONE → " + OUT);
} finally {
  await client.end();
}
