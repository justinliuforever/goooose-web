import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });

const JOBS: Record<string, string[]> = {
  "clerk.analyze": ["analyze-channel", "clerk-analyze-channel"],
  "muse.monitor": ["monitor-competitors", "muse-monitor-competitors"],
  "poet.script": ["generate-script", "poet-generate-script"],
  "poet.bible": ["generate-bible", "poet-generate-bible"],
};

try {
  console.log("=== raw command breakdown (status=done) — shows fragmentation ===");
  const raw = await client`
    select command, count(*)::int n,
      coalesce(round(percentile_cont(0.5) within group (order by extract(epoch from (completed_at-started_at)))),0)::int p50
    from pipeline_runs where status='done' and completed_at is not null
    group by command order by n desc`;
  console.table(raw);

  console.log("\n=== etaHints per jobKey (deduped + outlier 5..14400s) ===");
  for (const [key, cmds] of Object.entries(JOBS)) {
    const [row] = await client`
      select count(*)::int n,
        coalesce(round(percentile_cont(0.5) within group (order by extract(epoch from (completed_at-started_at)))),0)::int p50,
        coalesce(round(percentile_cont(0.9) within group (order by extract(epoch from (completed_at-started_at)))),0)::int p90
      from pipeline_runs
      where command in ${client(cmds)} and status='done' and completed_at is not null
        and extract(epoch from (completed_at-started_at)) between 5 and 14400`;
    const mins = (s: number) => (s / 60).toFixed(1);
    console.log(
      `${key.padEnd(14)} n=${String(row.n).padStart(3)}  p50=${String(row.p50).padStart(5)}s (${mins(row.p50)}m)  p90=${String(row.p90).padStart(5)}s (${mins(row.p90)}m)  → ${row.n >= 5 ? "USES HISTORY" : "cold-start fallback"}`,
    );
  }
} finally {
  await client.end();
}
