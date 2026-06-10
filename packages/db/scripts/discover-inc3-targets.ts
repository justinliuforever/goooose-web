// Find good INC3 real-machine test targets.
// Run: pnpm --filter @singularity/db exec tsx scripts/discover-inc3-targets.ts
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

try {
  const rows = await sql<
    { id: string; name: string; platform: string; videos: number; ai_sops: number; active_bible: number; topics: number }[]
  >`
    SELECT c.id, c.name, c.platform,
      (SELECT count(*)::int FROM clerk_videos v WHERE v.channel_id=c.id) AS videos,
      (SELECT count(*)::int FROM clerk_sops s WHERE s.channel_id=c.id AND s.sop_type='ai_reference') AS ai_sops,
      (SELECT count(*)::int FROM poet_bible b WHERE b.channel_id=c.id AND b.is_active) AS active_bible,
      (SELECT count(*)::int FROM poet_custom_topics t WHERE t.channel_id=c.id AND t.status IN ('analyzed','scripted')) AS topics
    FROM channels c ORDER BY videos ASC`;
  console.log("ALL CHANNELS (by videos asc):");
  for (const r of rows) {
    console.log(`  ${r.id.slice(0, 8)} ${r.platform.padEnd(7)} v=${String(r.videos).padStart(3)} aiSop=${r.ai_sops} bible=${r.active_bible} topics=${r.topics}  ${r.name.slice(0, 40)}`);
  }

  // Best analyze-channel target: smallest video count WITH ai_sop + active_bible.
  const analyzeTarget = rows.filter((r) => r.videos > 0 && r.ai_sops > 0 && r.active_bible > 0).sort((a, b) => a.videos - b.videos)[0];
  console.log(`\nANALYZE-CHANNEL target: ${analyzeTarget ? `${analyzeTarget.id} (${analyzeTarget.name}, ${analyzeTarget.platform}, v=${analyzeTarget.videos})` : "none"}`);

  // Topic targets for analyze/script.
  const topicRows = await sql<
    { id: string; channel_id: string; topic: string; status: string; project_id: string | null; has_fc: boolean }[]
  >`
    SELECT t.id, t.channel_id, t.topic, t.status, t.project_id, (jsonb_array_length(t.fact_checks) > 0) AS has_fc
    FROM poet_custom_topics t WHERE t.status IN ('analyzed','scripted')
    ORDER BY t.updated_at DESC LIMIT 12`;
  console.log("\nRECENT ANALYZED TOPICS:");
  for (const t of topicRows) {
    console.log(`  topic=${t.id.slice(0, 8)} ch=${t.channel_id.slice(0, 8)} status=${t.status} proj=${t.project_id ? t.project_id.slice(0, 8) : "NULL"} fc=${t.has_fc}  ${t.topic.slice(0, 45)}`);
  }
} finally {
  await sql.end();
}
