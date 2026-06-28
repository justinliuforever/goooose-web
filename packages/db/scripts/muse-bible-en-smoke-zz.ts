/**
 * LIVE English-path Bible-adherence test for Muse idea generation.
 * READ-ONLY: SELECTs a REAL English source video (no CJK, has transcript), runs the real
 * analyzeViralTrigger in English, then generateIdeas TWICE with language:"en"
 * (without vs with a realistic English account Bible). No DB writes.
 * Run: pnpm --filter @singularity/db exec tsx scripts/muse-bible-en-smoke-zz.ts
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { and, desc, isNotNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { clerkVideos } from "../src/schema/clerk";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const { generateIdeas, analyzeViralTrigger } = await import("@singularity/domain/services/muse");

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);

function cjk(s: string) {
  return (s.match(/[一-鿿]/g) ?? []).length;
}

function printIdeas(label: string, ideas: Array<Record<string, string>>) {
  console.log(`\n======== ${label} (${ideas.length} ideas) ========`);
  ideas.forEach((idea, i) => {
    console.log(`\n  [${i + 1}] story_angle: ${idea.story_angle}`);
    console.log(`      facts_and_data: ${idea.facts_and_data}`);
    console.log(`      why_similar: ${idea.why_similar}`);
    console.log(`      viral_trigger: ${idea.viral_trigger}`);
    console.log(`      cover_concept: ${idea.cover_concept}`);
    console.log(`      suggested_hook_type: ${idea.suggested_hook_type}`);
    console.log(`      risk_factors: ${idea.risk_factors}`);
    const all = Object.values(idea).join(" ");
    console.log(`      [cjk chars in this idea: ${cjk(all)}]`);
  });
}

try {
  // Real English source video: high-view competitor row, has transcript, no CJK.
  const srcRows = await db
    .select({
      title: clerkVideos.title,
      views: clerkVideos.views,
      durationSec: clerkVideos.durationSec,
      sourceChannelName: clerkVideos.sourceChannelName,
      transcript: clerkVideos.transcript,
    })
    .from(clerkVideos)
    .where(
      and(
        isNotNull(clerkVideos.competitorAccountId),
        sql`length(coalesce(${clerkVideos.transcript},'')) > 800`,
        sql`${clerkVideos.transcript} !~ '[一-鿿]'`,
        sql`${clerkVideos.transcript} ~ '[A-Za-z]{4,} [A-Za-z]{4,} [A-Za-z]{4,}'`,
      ),
    )
    .orderBy(desc(clerkVideos.views))
    .limit(1);

  if (srcRows.length === 0) {
    console.error("No English source video found.");
    process.exit(1);
  }
  const s = srcRows[0];
  const title = s.title;
  const channelName = s.sourceChannelName ?? "(unknown)";
  const views = s.views ?? 1_000_000;
  const durationSec = s.durationSec ?? 300;
  const transcript = s.transcript ?? "";

  console.log(`SOURCE VIDEO (REAL clerk_videos row):`);
  console.log(`  title: ${title}`);
  console.log(`  channel: ${channelName} | views: ${views.toLocaleString("en-US")} | dur: ${durationSec}s`);
  console.log(`  transcript length: ${transcript.length} chars (cjk=${cjk(transcript)})`);

  // Target channel: realistic English tech-explainer creator (mirrors a real niche).
  const channelDescription =
    "A short-form tech-explainer channel for software developers. Fast-paced, dry-humor breakdowns of programming news, frameworks, and AI tooling. Audience: working engineers and CS students who want the signal in under 5 minutes.";

  // REAL viral-trigger analysis, English path.
  console.log(`\nRunning analyzeViralTrigger (language:"en")…`);
  const viralTrigger = await analyzeViralTrigger({
    channelDescription,
    title,
    channelName,
    views,
    durationSec,
    transcript,
    language: "en",
  });
  console.log(`\nVIRAL TRIGGER (en, ${viralTrigger.length} chars, cjk=${cjk(viralTrigger)}):\n${viralTrigger}\n`);

  // A realistic English account Bible (positioning block) — the kind the worker passes in.
  const englishBible = `# Channel Bible — "DevSignal"

## Positioning
DevSignal is the developer's 4-minute briefing on what actually changed this week in software. We translate hype into engineering reality. We are NOT a hype channel and NOT a beginner tutorial channel.

## Target Audience
Mid-to-senior software engineers (3+ years), tech leads, and CS upperclassmen. They are skeptical, time-poor, and allergic to marketing language. They watch to decide what to adopt, ignore, or worry about.

## Voice & Tone
Dry, fast, confident. One joke per minute, never more. We mock hype, never people. Sentences are short. We say "this is probably overblown" when it is.

## Content Direction (do)
- Engineering deep-dives on a single new tool/framework/model
- Myth-busting: "everyone says X, here's what the benchmarks show"
- Migration / adoption decisions ("should you switch to X")
- Post-mortems of outages and security incidents, with the actual root cause

## Out of bounds (drop the idea)
- Career/lifestyle/productivity vlog content
- Crypto price speculation, growth-hacking, personal-brand advice
- Anything that requires inventing benchmark numbers we cannot cite

## Hook Formulas (use the exact names)
- "The Receipt" — open with a concrete leaked/benchmarked artifact, then explain it
- "The Reality Check" — state the hype claim, then immediately undercut it with data
- "The Autopsy" — open at the moment something broke, then trace backwards`;

  const common = {
    channelDescription,
    title,
    channelName,
    views,
    viralTrigger,
    numIdeas: 5,
    language: "en" as const,
  };

  console.log("Running A (en, WITHOUT biblePositioning)…");
  const a = await generateIdeas({ ...common });
  console.log("Running B (en, WITH biblePositioning)…");
  const bRun = await generateIdeas({ ...common, biblePositioning: englishBible });

  if (a.ideas.length === 0) console.log(`  A produced 0 ideas. parseErrorSample: ${a.parseErrorSample} | raw: ${a.rawSample}`);
  if (bRun.ideas.length === 0) console.log(`  B produced 0 ideas. parseErrorSample: ${bRun.parseErrorSample} | raw: ${bRun.rawSample}`);

  printIdeas("RUN A — NO BIBLE (en)", a.ideas as Array<Record<string, string>>);
  printIdeas("RUN B — WITH BIBLE (en)", bRun.ideas as Array<Record<string, string>>);

  // Quick adherence signals: do B ideas reference the Bible's hook names?
  const hookNames = ["The Receipt", "The Reality Check", "The Autopsy"];
  const bHookHits = (bRun.ideas as Array<Record<string, string>>).filter((i) =>
    hookNames.some((h) => (i.suggested_hook_type ?? "").includes(h)),
  ).length;
  console.log(`\n[ADHERENCE] B ideas using a Bible hook name: ${bHookHits}/${bRun.ideas.length}`);
} finally {
  await client.end();
}
