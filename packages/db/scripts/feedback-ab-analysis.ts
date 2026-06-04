// A/B: per-video analysis (buildVideoAnalysisPrompt) Pro vs Flash, on real
// transcripts (English YouTube + Chinese XHS). Validates JSON parseability,
// 15-key completeness, timestamp-citation fidelity, latency — gate for
// downgrading analysis to Flash. Run:
// pnpm --filter @singularity/db exec tsx scripts/feedback-ab-analysis.ts
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { generateText } from "ai";
import { and, eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { buildVideoAnalysisPrompt } from "@singularity/shared/prompts/clerk";
import { llm } from "@singularity/shared/clients/llm";
import { channels, clerkVideos } from "../src/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);

const KEYS = ["thumbnail_description", "thumbnail_why_it_works", "opening_hook", "opening_hook_type", "hooks_throughout", "all_hook_types", "text_hook", "framework", "opening_structure", "script_structure", "storytelling_framework", "rehooks_used", "retention_pattern", "cta_placement", "key_takeaways"];

function parseAnalysis(text: string): Record<string, unknown> | null {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch {}
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) { try { return JSON.parse(t.slice(start, end + 1)); } catch {} }
  return null;
}
const tsCount = (s: string) => (s.match(/\[\d+:\d{2}\]/g) ?? []).length;

async function run(label: string, tier: "pro" | "flash", maxOut: number, prompt: string) {
  const t0 = Date.now();
  let text = "", finish = "";
  try {
    const r = await generateText({ model: llm(tier), prompt, maxOutputTokens: maxOut, temperature: 0.3, maxRetries: 1 });
    text = r.text; finish = r.finishReason ?? "";
  } catch (e) { finish = "ERR:" + (e as Error).message.slice(0, 50); }
  const sec = Math.round((Date.now() - t0) / 1000);
  const parsed = parseAnalysis(text);
  const present = parsed ? KEYS.filter((k) => parsed[k] && String(parsed[k]).trim().length > 0).length : 0;
  const hooks = parsed?.hooks_throughout ? tsCount(String(parsed.hooks_throughout)) : 0;
  const allTs = tsCount(text);
  console.log(`  ${label.padEnd(14)} | ${String(sec).padStart(3)}s | parse=${parsed ? "OK " : "FAIL"} | keys=${present}/15 | hookTS=${hooks} | totalTS=${allTs} | chars=${text.length} | finish=${finish}`);
  writeFileSync(`/tmp/ana_${label}.json`, text);
  return { label, sec, parseOk: !!parsed, present, hooks, allTs, chars: text.length };
}

async function testTranscript(name: string, transcript: string, contentType: "video" | "xhs_video", durationSec: number, title: string) {
  const prompt = buildVideoAnalysisPrompt({ title, views: 1_000_000, durationSec, thumbnailUrl: null, transcript, contentType, language: "zh" });
  console.log(`\n==== ${name} (${transcript.length} chars, ${contentType}) ====`);
  const rows = [];
  rows.push(await run(`${name}_pro8192`, "pro", 8192, prompt));
  rows.push(await run(`${name}_flash8192`, "flash", 8192, prompt));
  rows.push(await run(`${name}_flash4096`, "flash", 4096, prompt));
  return rows;
}

try {
  // English YouTube transcript (has [m:ss] markers)
  const yt = readFileSync("/tmp/ab_transcript.txt", "utf8").slice(0, 12000);
  // real Chinese XHS transcript
  const [xhsChan] = await db.select().from(channels).where(eq(channels.platform, "xhs")).limit(1);
  const xhsVids = xhsChan
    ? await db.select().from(clerkVideos).where(and(eq(clerkVideos.channelId, xhsChan.id), isNotNull(clerkVideos.transcript)))
    : [];
  const xhs = xhsVids.map((v) => v.transcript!).filter((t) => t.length > 300).sort((a, b) => b.length - a.length)[0] ?? "";

  console.log("legend: parse=JSON ok | keys=non-empty of 15 | hookTS=#timestamps in hooks_throughout | totalTS=#timestamps overall");
  await testTranscript("YT", yt, "video", 600, "Every operating system concept in one video");
  if (xhs) await testTranscript("XHS", xhs, "xhs_video", 180, "小红书爆款笔记");
  else console.log("\n(no XHS transcript found)");
} finally {
  await client.end();
}
