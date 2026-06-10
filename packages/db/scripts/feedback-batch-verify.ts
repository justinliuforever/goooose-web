// Post-implementation verification of the shipped services (batches A/B/C):
//  1. Bible: generateChannelBible (now Flash + stream) — latency + completeness
//  2. Translationese: buildHumanSopPrompt with the upgraded CHINESE_WRAPPER — coined-term count
//  3. Muse: generateIdeas (8192 budget) — 6-field population + facts depth
//  4. Duration (#6): computeTargetWordCount / formatDurationLabel / isLongForm
// Run: pnpm --filter @singularity/db exec tsx scripts/feedback-batch-verify.ts
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { generateText } from "ai";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { buildHumanSopPrompt } from "@singularity/shared/prompts/clerk";
import { llm } from "@singularity/shared/clients/llm";
import { generateChannelBible } from "@singularity/shared/services/poet/bible";
import { generateIdeas } from "@singularity/shared/services/muse";
import {
  computeTargetWordCount,
  formatDurationLabel,
  isLongForm,
} from "@singularity/shared/schemas/poet";
import { channels, clerkVideos, museMonitorVideos } from "../src/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const db = drizzle(postgres(process.env.DATABASE_URL!, { prepare: false }));

const COINED = ["社会仪式", "签名式", "认知基模", "主题聚类", "炸弹", "阻止滑动"];
const CLICHE = ["值得注意的是", "总而言之", "众所周知", "好的，以下", "希望对你有帮助", "让我们一起"];
const countHits = (text: string, needles: string[]) =>
  needles.map((n) => [n, (text.split(n).length - 1)] as const).filter(([, c]) => c > 0);

async function main() {
  // ---- 4. Duration math (pure, instant) ----
  console.log("==== #6 duration math ====");
  for (const sec of [30, 60, 180, 300, 600, 1200]) {
    const zh = computeTargetWordCount(sec, "zh");
    console.log(`  ${String(sec).padStart(4)}s → zh ${String(zh).padStart(4)} 字 | long=${isLongForm(zh, "zh")} | label="${formatDurationLabel(sec)}"`);
  }
  console.log(`  labels: 45s="${formatDurationLabel(45)}" 90s="${formatDurationLabel(90)}" 3600s="${formatDurationLabel(3600)}"`);

  // pick a channel with analyzed videos
  const vids = await db
    .select()
    .from(clerkVideos)
    .where(isNotNull(clerkVideos.framework))
    .limit(12);
  const chanId = vids[0]?.channelId;
  const [chan] = chanId
    ? await db.select().from(channels).where(eq(channels.id, chanId)).limit(1)
    : [];

  // ---- 1. Bible: Flash + stream ----
  if (chan) {
    console.log(`\n==== #4b Bible (Flash+stream) — channel "${chan.name}" ====`);
    const t0 = Date.now();
    let ticks = 0;
    const bible = await generateChannelBible(
      { ideaText: chan.description || chan.name, channelDescription: chan.description || chan.name, language: "zh" },
      () => { ticks++; },
    );
    const sec = Math.round((Date.now() - t0) / 1000);
    const coined = countHits(bible.content, COINED);
    console.log(`  ${sec}s | ${bible.content.length} 字 | streamTicks=${ticks} | topic="${bible.topicClaimed.slice(0, 40)}" | drift=${bible.driftWarning?.reason ?? "none"}`);
    console.log(`  coined terms in Bible: ${coined.length ? coined.map(([n, c]) => `${n}×${c}`).join(", ") : "0 ✓"}`);
    console.log(`  head: ${bible.content.slice(0, 160).replace(/\n/g, " ")}`);
  }

  // ---- 2. Translationese: human SOP with new wrapper ----
  if (chan && vids.length >= 3) {
    console.log(`\n==== #1 translationese — human SOP (new wrapper) ====`);
    const videosData = vids
      .map((v, i) => `${i + 1}. ${v.title}\n   framework: ${v.framework ?? ""}\n   hooks: ${(v.hooksThroughout ?? "").slice(0, 200)}`)
      .join("\n");
    const prompt = buildHumanSopPrompt({
      channelName: chan.name,
      videoCount: vids.length,
      totalViews: null,
      date: "2026-06-04",
      videosData,
      language: "zh",
    });
    const t0 = Date.now();
    const r = await generateText({ model: llm("pro"), prompt, maxOutputTokens: 16384, temperature: 0.3, maxRetries: 2 });
    const sec = Math.round((Date.now() - t0) / 1000);
    const coined = countHits(r.text, COINED);
    const cliche = countHits(r.text, CLICHE);
    console.log(`  ${sec}s | ${r.text.length} 字`);
    console.log(`  coined terms: ${coined.length ? coined.map(([n, c]) => `${n}×${c}`).join(", ") : "0 ✓"}`);
    console.log(`  AI cliché:    ${cliche.length ? cliche.map(([n, c]) => `${n}×${c}`).join(", ") : "0 ✓"}`);
    console.log(`  head: ${r.text.slice(0, 160).replace(/\n/g, " ")}`);
  }

  // ---- 3. Muse ideas: 6 fields + facts depth ----
  const [mv] = await db
    .select()
    .from(museMonitorVideos)
    .where(isNotNull(museMonitorVideos.title))
    .orderBy(desc(museMonitorVideos.publishedAt))
    .limit(1);
  if (chan && mv) {
    console.log(`\n==== C4 Muse generateIdeas (8192 budget) ====`);
    const t0 = Date.now();
    const res = await generateIdeas({
      channelDescription: chan.description || chan.name,
      title: mv.title,
      channelName: mv.sourceChannelName ?? "competitor",
      views: 100000,
      viralTrigger: "高信息密度 + 反差钩子让观众停留并转发。",
      numIdeas: 3,
      language: "zh",
    });
    const sec = Math.round((Date.now() - t0) / 1000);
    console.log(`  ${sec}s | ideas=${res.ideas.length}${res.rawSample ? " (PARSE FAIL)" : ""}`);
    res.ideas.forEach((idea, i) => {
      const filled = ["story_angle", "facts_and_data", "why_similar", "cover_concept", "suggested_hook_type", "risk_factors"]
        .filter((k) => String((idea as Record<string, unknown>)[k] ?? "").trim().length > 0).length;
      console.log(`  idea ${i + 1}: fields=${filled}/6 | facts_len=${idea.facts_and_data.length} | angle="${idea.story_angle.slice(0, 40)}"`);
    });
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
