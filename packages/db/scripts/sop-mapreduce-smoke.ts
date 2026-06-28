/**
 * LIVE quality + context-bound proof for the SOP map-reduce path.
 * READ-ONLY: SELECTs clerk_videos for an own account, runs MAP (summarizeVideoForSop,
 * Flash) over up to 8 videos, then REDUCE (buildAiSopReferencePrompt → Pro). No DB writes.
 * Run: pnpm --filter @singularity/db exec tsx scripts/sop-mapreduce-smoke.ts
 *
 * Budget / hierarchical-reduce knobs (mirror analyze-channel.ts; default = production 80k):
 *   REDUCE_CHAR_BUDGET=12000  → forces the hierarchical (partial-reduce) path on a small
 *                               account so the no-loss path can be exercised. Leave UNSET
 *                               for normal single-reduce runs.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { generateText } from "ai";

import { clerkVideos } from "../src/schema/clerk";
import { channels } from "../src/schema/channels";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const { summarizeVideoForSop } = await import("@singularity/domain/services/clerk-map");
const { buildAiSopReferencePrompt, buildSopPartialReducePrompt } = await import(
  "@singularity/prompts/clerk"
);
const { llm } = await import("@singularity/integrations/clients/llm");

// Optional channel-name override: argv[2] or CHANNEL_NAME selects an own (channel_id-bearing)
// channel by exact name instead of the auto-pick (most clerk_videos). Reusable harness.
const CHANNEL_NAME_OVERRIDE = process.argv[2] ?? process.env.CHANNEL_NAME ?? null;
// When targeting a specific channel, map all its videos (stress the context-blowup case);
// otherwise keep the gentle 8-video cap for the auto-pick.
const MAX_MAP = CHANNEL_NAME_OVERRIDE ? 100 : 8;

// Mirror analyze-channel.ts budget logic. Default = production 80k; override via env to force
// the hierarchical path on small accounts. No env → identical to production single-reduce.
// REDUCE_CHUNK_BUDGET is also env-overridable (harness only) so the multi-chunk no-loss path
// can be forced below production's 20k chunk floor; default mirrors production (~0.69×, ≥20k).
const REDUCE_CHAR_BUDGET = Number(process.env.REDUCE_CHAR_BUDGET) || 80_000;
const REDUCE_CHUNK_BUDGET =
  Number(process.env.REDUCE_CHUNK_BUDGET) ||
  Math.max(20_000, Math.round(REDUCE_CHAR_BUDGET * 0.69));

// Mirror of apps/worker/trigger/analyze-channel.ts renderVideoAnalysisFields — the
// `analysis` arg the MAP prompt expects.
function renderVideoAnalysisFields(v: typeof clerkVideos.$inferSelect): string {
  const fields: Array<[string, string | null]> = [
    ["opening_hook_type", v.openingHookType],
    ["opening_hook", v.openingHook],
    ["hooks_throughout", v.hooksThroughout],
    ["all_hook_types", v.allHookTypes],
    ["text_hook", v.textHook],
    ["framework", v.framework],
    ["opening_structure", v.openingStructure],
    ["script_structure", v.scriptStructure],
    ["storytelling_framework", v.storytellingFramework],
    ["rehooks_used", v.rehooksUsed],
    ["retention_pattern", v.retentionPattern],
    ["cta_placement", v.ctaPlacement],
    ["key_takeaways", v.keyTakeaways],
    ["cover_diagnosis", v.coverDiagnosis],
  ];
  const lines = fields.filter(([, val]) => val).map(([k, val]) => `- ${k}: ${val}`);
  if (v.coverTitleSuggestions && v.coverTitleSuggestions.length > 0) {
    lines.push(`- cover_title_suggestions: ${v.coverTitleSuggestions.join(" | ")}`);
  }
  return lines.join("\n");
}

// Mirror of analyze-channel.ts VIDEOS_SUMMARY_NOTE + renderVideoSummaryBlock, REDUCE side.
const VIDEOS_SUMMARY_NOTE =
  `GROUNDING — write the SOP only from the per-video pattern summaries below. Each summary already distills one video's grounded techniques; never quote lines, cite [m:ss], invent a beat-by-beat structure, or assert per-video frequency counts beyond what the summaries state. If a video has no pattern summary, infer only from its title and label it inference. If most videos lack spoken detail, say so plainly and keep the SOP at the title/cover-pattern level instead of fabricating depth.\n\n`;

function renderVideoSummaryBlock(
  v: typeof clerkVideos.$inferSelect,
  summaries: Map<string, string>,
  index: number,
): string {
  const lines: string[] = [];
  lines.push(`### Video ${index}: "${v.title || "(untitled)"}"`);
  lines.push(`- Views: ${v.views?.toLocaleString("en-US") ?? "unknown"}`);
  lines.push(`- Duration: ${v.durationSec ?? "unknown"}s`);
  lines.push(`- Transcript source: ${v.transcriptSource ?? "none"}`);
  const summary = summaries.get(v.id);
  lines.push(summary ? `\n${summary}` : "- (no pattern summary available for this video)");
  return lines.join("\n");
}

function packBlocksIntoChunks(blocks: string[], chunkBudget: number): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let currentLen = 0;
  for (const block of blocks) {
    const blockLen = block.length + 2;
    if (current.length > 0 && currentLen + blockLen > chunkBudget) {
      chunks.push(current);
      current = [];
      currentLen = 0;
    }
    current.push(block);
    currentLen += blockLen;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

// Mirror of analyze-channel.ts reduceOneChunk (concurrency is not stressed in the harness).
async function reduceOneChunk(chunkText: string, label: string): Promise<string> {
  try {
    const prompt = buildSopPartialReducePrompt({ videosData: chunkText, language: "zh" });
    const result = await generateText({
      model: llm("pro"),
      prompt,
      maxOutputTokens: 4096,
      temperature: 0.4,
      maxRetries: 2,
    });
    const cleaned = result.text.trim();
    if (cleaned) return cleaned;
    console.log(`    ⚠ partial reduce ${label}: empty — raw fallback`);
  } catch (err) {
    console.log(`    ⚠ partial reduce ${label} failed: ${(err as Error).message?.slice(0, 100)} — raw fallback`);
  }
  return chunkText;
}

// Mirror of analyze-channel.ts buildReducedVideosData (single vs hierarchical, no loss).
async function buildReducedVideosData(
  blocks: string[],
  videoCount: number,
  depth = 0,
): Promise<{ videosData: string; chunkInfo: string[] }> {
  const joined = blocks.join("\n\n");
  if (VIDEOS_SUMMARY_NOTE.length + joined.length <= REDUCE_CHAR_BUDGET) {
    return { videosData: VIDEOS_SUMMARY_NOTE + joined, chunkInfo: [] };
  }
  if (depth >= 2) {
    console.log(`  ⚠ recursion cap hit at ${blocks.length} blocks — pass-through (no truncation)`);
    return { videosData: VIDEOS_SUMMARY_NOTE + joined, chunkInfo: [] };
  }
  const chunks = packBlocksIntoChunks(blocks, REDUCE_CHUNK_BUDGET);
  console.log(
    `  HIERARCHICAL L${depth + 1}: ${blocks.length} blocks (${joined.length} chars) → ${chunks.length} chunks`,
  );
  const partials: string[] = [];
  const chunkInfo: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunkText = VIDEOS_SUMMARY_NOTE + chunks[i].join("\n\n");
    const p = await reduceOneChunk(chunkText, `L${depth + 1} chunk ${i + 1}/${chunks.length}`);
    partials.push(p);
    const info = `    chunk ${i + 1}: ${chunks[i].length} blocks, ${chunkText.length} chars in → ${p.length} chars partial`;
    console.log(info);
    chunkInfo.push(info);
  }
  const partialBlocks = partials.map(
    (p, i) => `### Partial pattern set ${i + 1} of ${partials.length}\n\n${p}`,
  );
  const partialsChars = partialBlocks.join("\n\n").length;
  console.log(
    `  Hierarchical SOP reduce: ${videoCount} videos → ${chunks.length} chunks → partials (${partialsChars} chars) → ${
      VIDEOS_SUMMARY_NOTE.length + partialsChars <= REDUCE_CHAR_BUDGET ? "final SOP" : "recurse"
    } (level ${depth + 1})`,
  );
  const nested = await buildReducedVideosData(partialBlocks, videoCount, depth + 1);
  return { videosData: nested.videosData, chunkInfo };
}

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);

try {
  let chosenChannelId: string;
  let channelName: string;
  let channelPlatform: string | null;

  if (CHANNEL_NAME_OVERRIDE) {
    // Override: select an own (channel_id-bearing) channel by exact name.
    const chan = await db
      .select({ id: channels.id, name: channels.name, platform: channels.platform })
      .from(channels)
      .where(eq(channels.name, CHANNEL_NAME_OVERRIDE))
      .limit(1);
    if (chan.length === 0) {
      console.error(`No channel found with name "${CHANNEL_NAME_OVERRIDE}".`);
      process.exit(1);
    }
    chosenChannelId = chan[0].id;
    channelName = chan[0].name;
    channelPlatform = chan[0].platform;
    console.log(`OVERRIDE: selecting channel by name "${CHANNEL_NAME_OVERRIDE}"`);
  } else {
    // 1. Own channel with the most clerk_videos. Own rows carry channel_id (XOR with competitor).
    const counts = await db
      .select({
        channelId: clerkVideos.channelId,
        n: sql<number>`count(*)::int`,
      })
      .from(clerkVideos)
      .where(sql`${clerkVideos.channelId} is not null`)
      .groupBy(clerkVideos.channelId)
      .orderBy(desc(sql`count(*)`))
      .limit(5);

    if (counts.length === 0) {
      console.error("No own-account clerk_videos found (channel_id is null everywhere).");
      process.exit(1);
    }

    console.log("Top own channels by clerk_videos count:");
    for (const c of counts) console.log(`  ${c.channelId} → ${c.n} videos`);

    const chosen = counts[0];
    const chan = await db
      .select({ name: channels.name, platform: channels.platform })
      .from(channels)
      .where(eq(channels.id, chosen.channelId!))
      .limit(1);
    chosenChannelId = chosen.channelId!;
    channelName = chan[0]?.name ?? "(unknown channel)";
    channelPlatform = chan[0]?.platform ?? null;
  }

  console.log(`\nCHOSEN: "${channelName}" (${channelPlatform ?? "?"})`);

  // 2. Load all videos for that owner, views DESC.
  const videos = await db
    .select()
    .from(clerkVideos)
    .where(eq(clerkVideos.channelId, chosenChannelId))
    .orderBy(desc(clerkVideos.views));

  console.log(`Loaded ${videos.length} videos.`);

  // 3. Context-bound proof. OLD = sum min(len(transcript), 8000); NEW = sum map-summary lens.
  const oldContextChars = videos.reduce(
    (acc, v) => acc + Math.min(v.transcript?.length ?? 0, 8000),
    0,
  );
  const withTranscript = videos.filter((v) => (v.transcript?.length ?? 0) > 0).length;
  console.log(
    `\nOLD per-video transcript-excerpt context = ${oldContextChars.toLocaleString("en-US")} chars (across ${videos.length} videos, ${withTranscript} with transcript)`,
  );

  // 4. MAP up to MAX_MAP videos (sequential to stay gentle on rate limits).
  const mapTargets = videos.slice(0, MAX_MAP);
  console.log(`\nMAP: summarizing ${mapTargets.length} of ${videos.length} videos…`);
  const summaries = new Map<string, string>();
  let flashClean = 0;
  let proRetry = 0;
  let mapFailed = 0;
  for (const v of mapTargets) {
    let retried = false;
    try {
      const summary = await summarizeVideoForSop({
        title: v.title,
        views: v.views,
        durationSec: v.durationSec,
        contentType: (v.contentType as "video" | "xhs_image" | "xhs_video") ?? "video",
        transcript: v.transcript,
        analysis: renderVideoAnalysisFields(v),
        language: "zh",
        logger: {
          warn: (m: string) => {
            retried = true;
            console.log(`    ⤷ ${m}`);
          },
        },
      });
      summaries.set(v.id, summary);
      if (retried) proRetry++;
      else flashClean++;
      const tlen = v.transcript?.length ?? 0;
      console.log(
        `  ✓ ${v.title.slice(0, 48)} → ${summary.length} chars [${retried ? "PRO-retry" : "flash"}, transcript=${tlen}]`,
      );
    } catch (err) {
      mapFailed++;
      console.log(`  ✗ ${v.title.slice(0, 48)} → MAP FAILED: ${(err as Error).message}`);
    }
  }
  console.log(
    `\nMAP reliability: ${flashClean} clean on flash, ${proRetry} needed pro-retry, ${mapFailed} failed (min-length throw).`,
  );

  const newContextChars = [...summaries.values()].reduce((a, s) => a + s.length, 0);
  console.log(
    `\nNEW map-summary context (over ${summaries.size} mapped videos) = ${newContextChars.toLocaleString("en-US")} chars`,
  );
  // Scale OLD down to the same mapped subset for an apples-to-apples ratio.
  const oldForMapped = mapTargets.reduce(
    (acc, v) => acc + Math.min(v.transcript?.length ?? 0, 8000),
    0,
  );
  console.log(
    `OLD (same ${mapTargets.length} mapped videos) = ${oldForMapped.toLocaleString("en-US")} chars`,
  );
  if (newContextChars > 0) {
    console.log(`CONTEXT RATIO (old/new, mapped subset) = ${(oldForMapped / newContextChars).toFixed(1)}×`);
  }

  // Print 2 full example summaries.
  const examples = mapTargets.filter((v) => summaries.has(v.id)).slice(0, 2);
  for (const v of examples) {
    console.log(`\n──────── MAP SUMMARY: "${v.title}" ────────`);
    console.log(summaries.get(v.id));
  }

  // 5. REDUCE → AI-reference SOP. Single if videosData ≤ budget; else hierarchical
  // (partial-reduce per chunk) so no video is dropped. Budget knob: REDUCE_CHAR_BUDGET.
  const totalViews = videos.reduce((a, v) => a + (v.views ?? 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const reduceBlocks = mapTargets.map((v, i) => renderVideoSummaryBlock(v, summaries, i + 1));
  const fullChars = VIDEOS_SUMMARY_NOTE.length + reduceBlocks.join("\n\n").length;
  console.log(
    `\nREDUCE budget=${REDUCE_CHAR_BUDGET.toLocaleString("en-US")} chars, chunk=${REDUCE_CHUNK_BUDGET.toLocaleString("en-US")}; full videosData = ${fullChars.toLocaleString("en-US")} chars → ${
      fullChars <= REDUCE_CHAR_BUDGET ? "SINGLE reduce" : "HIERARCHICAL reduce"
    }`,
  );
  const { videosData } = await buildReducedVideosData(reduceBlocks, mapTargets.length);

  // If hierarchical fired, print the partial pattern sets so they can be inspected.
  if (fullChars > REDUCE_CHAR_BUDGET) {
    console.log(`\n──────── REDUCED videosData (partials, ${videosData.length} chars) ────────`);
    console.log(videosData);
    console.log("──────── END REDUCED videosData ────────");
  }

  console.log(`\nREDUCE: building AI-reference SOP (videosData = ${videosData.length} chars)…`);
  const prompt = buildAiSopReferencePrompt({
    channelName,
    videoCount: videos.length,
    totalViews,
    date: today,
    videosData,
    transcriptCount: withTranscript,
  });

  const sop = await generateText({
    model: llm("pro"),
    prompt,
    maxOutputTokens: 16384,
    temperature: 0.4,
  });

  console.log(`\n════════ AI-REFERENCE SOP (${sop.text.length} chars, finish=${sop.finishReason}) ════════\n`);
  console.log(sop.text);
  console.log("\n════════ END SOP ════════");
} finally {
  await client.end();
}
