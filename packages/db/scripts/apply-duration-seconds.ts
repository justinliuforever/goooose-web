// One-off: apply the expand step of #6 (durationSeconds) — idempotent ADD COLUMN
// + backfill from duration_minutes×60. Mirrors drizzle/0009. Run:
// pnpm --filter @singularity/db exec tsx scripts/apply-duration-seconds.ts
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

try {
  await sql`ALTER TABLE "poet_custom_topics" ADD COLUMN IF NOT EXISTS "duration_seconds" integer`;
  await sql`ALTER TABLE "poet_scripts" ADD COLUMN IF NOT EXISTS "duration_seconds" integer`;
  const t = await sql`UPDATE "poet_custom_topics" SET "duration_seconds" = "duration_minutes" * 60 WHERE "duration_seconds" IS NULL AND "duration_minutes" IS NOT NULL`;
  const s = await sql`UPDATE "poet_scripts" SET "duration_seconds" = "duration_minutes" * 60 WHERE "duration_seconds" IS NULL AND "duration_minutes" IS NOT NULL`;
  console.log(`backfilled: poet_custom_topics=${t.count} rows, poet_scripts=${s.count} rows`);

  // Verify backfill correctness: every row with a minutes value has seconds = minutes×60.
  const [check] = await sql`
    SELECT
      (SELECT count(*) FROM poet_scripts WHERE duration_minutes IS NOT NULL AND duration_seconds = duration_minutes * 60) AS scripts_ok,
      (SELECT count(*) FROM poet_scripts WHERE duration_minutes IS NOT NULL AND (duration_seconds IS NULL OR duration_seconds <> duration_minutes * 60)) AS scripts_bad,
      (SELECT count(*) FROM poet_custom_topics WHERE duration_minutes IS NOT NULL AND (duration_seconds IS NULL OR duration_seconds <> duration_minutes * 60)) AS topics_bad
  `;
  console.log(`verify: scripts_ok=${check!.scripts_ok}, scripts_bad=${check!.scripts_bad}, topics_bad=${check!.topics_bad}`);
} finally {
  await sql.end();
}
