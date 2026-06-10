// C4 Muse idea-gen verify: 6-field population + facts depth at the new 8192 budget.
// Run: pnpm --filter @singularity/db exec tsx scripts/feedback-muse-verify.ts
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { desc, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { generateIdeas } from "@singularity/shared/services/muse";
import { channels, museMonitorVideos } from "../src/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const db = drizzle(postgres(process.env.DATABASE_URL!, { prepare: false }));

const FIELDS = ["story_angle", "facts_and_data", "why_similar", "cover_concept", "suggested_hook_type", "risk_factors"] as const;

async function main() {
  const [chan] = await db.select().from(channels).where(isNotNull(channels.description)).limit(1);
  const [mv] = await db.select().from(museMonitorVideos).where(isNotNull(museMonitorVideos.title)).orderBy(desc(museMonitorVideos.publishedAt)).limit(1);
  if (!chan || !mv) { console.log("(no channel/monitor video)"); return; }

  console.log(`==== C4 Muse generateIdeas (8192 budget) — channel "${chan.name}", source "${mv.title.slice(0, 40)}" ====`);
  const t0 = Date.now();
  const res = await generateIdeas({
    channelDescription: chan.description!,
    title: mv.title,
    channelName: mv.sourceChannelName ?? "competitor",
    views: 500000,
    viralTrigger: "高信息密度 + 反差钩子让观众停留并转发。",
    numIdeas: 3,
    language: "zh",
  });
  const sec = Math.round((Date.now() - t0) / 1000);
  console.log(`  ${sec}s | ideas=${res.ideas.length}${res.rawSample ? " (PARSE FAIL: " + res.parseErrorSample + ")" : ""}`);
  res.ideas.forEach((idea, i) => {
    const filled = FIELDS.filter((k) => String(idea[k] ?? "").trim().length > 0).length;
    console.log(`  idea ${i + 1}: fields=${filled}/6 | facts_len=${idea.facts_and_data.length} | angle="${idea.story_angle.slice(0, 44)}"`);
    console.log(`           facts head: ${idea.facts_and_data.slice(0, 120).replace(/\n/g, " ")}`);
  });
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
