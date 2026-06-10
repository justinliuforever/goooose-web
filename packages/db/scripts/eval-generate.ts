// WF-2 step 1: generation harness. Runs every generation step on representative
// channels with REAL existing inputs (transcripts/SOPs/bibles), capturing latency
// + output. Writes /tmp/eval/results.json for the judge workflow to score.
// Run: pnpm --filter @singularity/db exec tsx scripts/eval-generate.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { generateText } from "ai";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { llm } from "@singularity/shared/clients/llm";
import { buildVideoAnalysisPrompt, buildHumanSopPrompt, buildHottestSopPrompt } from "@singularity/shared/prompts/clerk";
import { generateChannelBible } from "@singularity/shared/services/poet/bible";
import { analyzeViralTrigger, generateIdeas } from "@singularity/shared/services/muse";
import { analyzeTopic } from "@singularity/shared/services/poet/topic-analyzer";
import { writeScript, writeScriptShort } from "@singularity/shared/services/poet/script-writer";
import { humanizeChinese } from "@singularity/shared/services/poet/humanizer";
import { channels, clerkSops, clerkVideos, poetBible } from "../src/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);

const OUT_DIR = "/tmp/eval";
mkdirSync(OUT_DIR, { recursive: true });
const results: Array<Record<string, unknown>> = [];
let idCounter = 0;

async function step(
  name: string,
  channel: string,
  lang: string,
  context: string,
  fn: () => Promise<{ output: string; extra?: Record<string, unknown> }>,
) {
  const id = `${++idCounter}`;
  const t0 = Date.now();
  try {
    const { output, extra } = await fn();
    const latencyMs = Date.now() - t0;
    const entry = {
      id, step: name, channel, lang, latencyMs,
      chars: output.length,
      head: output.slice(0, 7000),
      tail: output.length > 7000 ? output.slice(-700) : "",
      context,
      ...extra,
    };
    results.push(entry);
    console.log(`  ✓ ${name.padEnd(16)} ${String(Math.round(latencyMs / 1000)).padStart(3)}s | ${output.length} chars`);
  } catch (err) {
    results.push({ id, step: name, channel, lang, latencyMs: Date.now() - t0, error: (err as Error).message?.slice(0, 300), context });
    console.log(`  ✗ ${name.padEnd(16)} ERROR: ${(err as Error).message?.slice(0, 80)}`);
  }
  writeFileSync(`${OUT_DIR}/results.json`, JSON.stringify(results, null, 2));
}

async function evalChannel(ch: typeof channels.$inferSelect, sopText: string, bibleText: string) {
  const lang = ch.platform === "xhs" ? "zh" : "zh"; // product target is zh creators
  const chDesc = ch.description || ch.name;
  const vids = await db
    .select()
    .from(clerkVideos)
    .where(and(eq(clerkVideos.channelId, ch.id), isNotNull(clerkVideos.transcript)))
    .orderBy(desc(clerkVideos.views))
    .limit(12);
  const top = vids[0];
  const transcript = vids.find((v) => (v.transcript ?? "").length > 300)?.transcript ?? top?.transcript ?? "";
  const videosData = vids
    .map((v, i) => `${i + 1}. ${v.title}\n   framework: ${v.framework ?? ""}\n   hooks: ${(v.hooksThroughout ?? "").slice(0, 200)}`)
    .join("\n");

  console.log(`\n#### channel "${ch.name}" (${ch.platform}) ####`);

  // ---- Clerk ----
  if (transcript && top) {
    await step("clerk-analysis", ch.name, lang, `video: ${top.title}`, async () => {
      const prompt = buildVideoAnalysisPrompt({
        title: top.title, views: top.views, durationSec: top.durationSec,
        thumbnailUrl: top.thumbnailUrl, transcript,
        contentType: ch.platform === "xhs" ? "xhs_video" : "video", language: "zh",
      });
      const r = await generateText({ model: llm("flash"), prompt, maxOutputTokens: 16384, temperature: 0.3, maxRetries: 2 });
      return { output: r.text, extra: { finishReason: r.finishReason } };
    });
  }
  if (vids.length >= 3) {
    await step("clerk-human-sop", ch.name, lang, `${vids.length} videos`, async () => {
      const prompt = buildHumanSopPrompt({ channelName: ch.name, videoCount: vids.length, totalViews: null, date: "2026-06-06", videosData, language: "zh" });
      const r = await generateText({ model: llm("pro"), prompt, maxOutputTokens: 12000, temperature: 0.4, maxRetries: 2 });
      return { output: r.text, extra: { finishReason: r.finishReason } };
    });
  }
  if (top && transcript) {
    await step("clerk-hottest-sop", ch.name, lang, `top: ${top.title}`, async () => {
      const prompt = buildHottestSopPrompt({
        channelName: ch.name, title: top.title, views: top.views, durationSec: top.durationSec ?? 60,
        url: top.url ?? "", transcript, analysisSummary: `framework: ${top.framework ?? ""}; hooks: ${(top.hooksThroughout ?? "").slice(0, 300)}`,
        language: "zh",
      });
      const r = await generateText({ model: llm("pro"), prompt, maxOutputTokens: 12000, temperature: 0.4, maxRetries: 2 });
      return { output: r.text, extra: { finishReason: r.finishReason } };
    });
  }

  // ---- Muse ----
  let viral = "";
  if (transcript && top) {
    await step("muse-viral-trigger", ch.name, lang, `video: ${top.title}`, async () => {
      viral = await analyzeViralTrigger({ channelDescription: chDesc, title: top.title, channelName: ch.name, views: top.views ?? 100000, durationSec: top.durationSec ?? 60, transcript, language: "zh" });
      return { output: viral };
    });
  }
  let ideaForScript: { storyAngle: string; factsAndData: string; whySimilar: string; viralTrigger: string; sourceTitle: string; sourceChannel: string } | null = null;
  if (top) {
    await step("muse-idea-gen", ch.name, lang, `viral: ${viral.slice(0, 60)}`, async () => {
      const res = await generateIdeas({ channelDescription: chDesc, title: top.title, channelName: ch.name, views: top.views ?? 100000, viralTrigger: viral || "高信息密度 + 反差钩子", numIdeas: 3, language: "zh" });
      const i0 = res.ideas[0];
      if (i0) ideaForScript = { storyAngle: i0.story_angle, factsAndData: i0.facts_and_data, whySimilar: i0.why_similar, viralTrigger: viral || "反差钩子", sourceTitle: top.title, sourceChannel: ch.name };
      return { output: JSON.stringify(res.ideas, null, 2), extra: { ideaCount: res.ideas.length, parseError: res.parseErrorSample } };
    });
  }

  // ---- Poet ----
  await step("poet-bible", ch.name, lang, `desc: ${chDesc.slice(0, 60)}`, async () => {
    const b = await generateChannelBible({ ideaText: chDesc, channelDescription: chDesc, language: "zh" });
    return { output: b.content, extra: { topicClaimed: b.topicClaimed, drift: b.driftWarning?.reason ?? null } };
  });
  await step("poet-topic-analysis", ch.name, lang, "topic: 这个领域最近的一个争议点", async () => {
    const a = await analyzeTopic({ topic: `围绕「${chDesc.slice(0, 40)}」最近的一个争议点或反差话题`, references: null, bibleText, sopText, language: "zh" });
    return { output: `STORY: ${a.storyAngle}\n\nFACTS: ${a.factsAndData}\n\nWHY: ${a.whySimilar}\n\nVIRAL: ${a.viralTrigger}`, extra: { factsLen: a.factsAndData.length } };
  });

  const idea = ideaForScript ?? { storyAngle: `关于${ch.name}领域的一个反差选题`, factsAndData: "（无）", whySimilar: "契合频道", viralTrigger: "反差钩子", sourceTitle: top?.title ?? "对标", sourceChannel: ch.name };
  await step("poet-script-short", ch.name, lang, `target 1000字`, async () => {
    const r = await writeScriptShort({ idea, sopText, bibleText, language: "zh", targetWordCount: 1000 });
    return { output: r.scriptText, extra: { wordCount: r.wordCount, targetWordCount: 1000 } };
  });
  let longScript = "";
  await step("poet-script-long", ch.name, lang, `target 3000字 (long path)`, async () => {
    const r = await writeScript({ idea, sopText, bibleText, language: "zh", targetWordCount: 3000 });
    longScript = r.scriptText;
    return { output: r.scriptText, extra: { wordCount: r.wordCount, targetWordCount: 3000, path: r.path } };
  });
  if (longScript) {
    await step("poet-humanizer", ch.name, lang, `humanize the long script (truncation guard)`, async () => {
      const before = longScript.length;
      const out = await humanizeChinese(longScript);
      return { output: out, extra: { beforeChars: before, afterChars: out.length, changed: out !== longScript, ratio: (out.length / before).toFixed(2) } };
    });
  }
}

try {
  // Channels with full prerequisites: active bible + ai_reference SOP + transcribed videos.
  const candidates = await db.select().from(channels).limit(50);
  const picked: Array<{ ch: typeof channels.$inferSelect; sop: string; bible: string }> = [];
  for (const ch of candidates) {
    const [sop] = await db.select().from(clerkSops).where(and(eq(clerkSops.channelId, ch.id), eq(clerkSops.sopType, "ai_reference"))).orderBy(desc(clerkSops.generatedAt)).limit(1);
    const [bible] = await db.select().from(poetBible).where(and(eq(poetBible.channelId, ch.id), eq(poetBible.isActive, true))).limit(1);
    const [vid] = await db.select({ id: clerkVideos.id }).from(clerkVideos).where(and(eq(clerkVideos.channelId, ch.id), isNotNull(clerkVideos.transcript))).limit(1);
    if (sop?.contentMd && bible?.content && vid) {
      picked.push({ ch, sop: sop.contentMd, bible: bible.content });
    }
    if (picked.length >= 2) break;
  }
  console.log(`Eval channels: ${picked.map((p) => p.ch.name).join(", ") || "(none with full prereqs)"}`);
  for (const p of picked) await evalChannel(p.ch, p.sop, p.bible);
  console.log(`\nDONE — ${results.length} step results → ${OUT_DIR}/results.json`);
} finally {
  await client.end();
}
