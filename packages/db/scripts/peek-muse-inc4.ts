// Verify INC4 owner cols on muse_monitor_videos + muse_ideas for a run.
// Run: pnpm --filter @singularity/db exec tsx scripts/peek-muse-inc4.ts <channelId> <runId>
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const ch = process.argv[2];
const run = process.argv[3];
try {
  const v = await sql<
    { id: string; project_id: string | null; competitor_account_id: string | null; title: string | null; relevant: boolean }[]
  >`SELECT id, project_id, competitor_account_id, title, relevant FROM muse_monitor_videos WHERE run_id=${run} ORDER BY id`;
  console.log(`muse_monitor_videos (run): ${v.length} rows`);
  for (const r of v) {
    console.log(
      `  proj==ch=${r.project_id === ch} competitor=${r.competitor_account_id ? r.competitor_account_id.slice(0, 8) : "NULL"} relevant=${r.relevant} ${(r.title ?? "").slice(0, 40)}`,
    );
  }
  const [ideas] = await sql<{ n: number; pj: number }[]>`
    SELECT count(*)::int n, count(*) FILTER (WHERE project_id=${ch})::int pj FROM muse_ideas WHERE run_id=${run}`;
  console.log(`muse_ideas (run): ${ideas!.n} rows, project_id==ch: ${ideas!.pj}`);
  // distinct competitor_account_id set on this run's monitor videos
  const distinct = [...new Set(v.map((r) => r.competitor_account_id))];
  console.log(`distinct competitor_account_id on run: ${distinct.map((d) => (d ? d.slice(0, 8) : "NULL")).join(", ")}`);
} finally {
  await sql.end();
}
