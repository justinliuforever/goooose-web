// Read-only INC1 verification: 5 new tables, 13 new (nullable) columns, the 0010 index,
// existing data intact, new tables empty. No writes.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

try {
  const newTables = ["own_accounts", "competitor_accounts", "projects", "project_competitors", "project_sops"];
  const t = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY(${newTables}) ORDER BY table_name`;
  console.log(`new tables: ${t.length}/5 — ${t.map((r) => r.table_name).join(", ")}`);

  const cols = await sql`
    SELECT table_name, column_name, is_nullable FROM information_schema.columns
    WHERE table_schema='public' AND (
      (table_name='poet_bible' AND column_name='own_account_id') OR
      (table_name='poet_custom_topics' AND column_name='project_id') OR
      (table_name='poet_scripts' AND column_name='project_id') OR
      (table_name='poet_drift_events' AND column_name='own_account_id') OR
      (table_name='clerk_videos' AND column_name='own_account_id') OR
      (table_name='clerk_sops' AND column_name IN ('own_account_id','competitor_account_id')) OR
      (table_name='muse_monitor_videos' AND column_name IN ('project_id','competitor_account_id')) OR
      (table_name='muse_ideas' AND column_name='project_id') OR
      (table_name='channel_series' AND column_name='own_account_id') OR
      (table_name='pipeline_runs' AND column_name IN ('project_id','own_account_id'))
    ) ORDER BY table_name, column_name`;
  console.log(`new columns: ${cols.length}/13 (all nullable: ${cols.every((c) => c.is_nullable === "YES")})`);
  for (const c of cols) console.log(`  ${c.table_name}.${c.column_name}`);

  const idx = await sql`SELECT indexname FROM pg_indexes WHERE indexname='poet_bible_one_active_per_channel'`;
  console.log(`0010 index present: ${idx.length === 1}`);

  const [ch] = await sql`SELECT count(*)::int n FROM channels`;
  const [bib] = await sql`SELECT count(*)::int n FROM poet_bible`;
  const [vid] = await sql`SELECT count(*)::int n FROM clerk_videos`;
  const [oa] = await sql`SELECT count(*)::int n FROM own_accounts`;
  const [ca] = await sql`SELECT count(*)::int n FROM competitor_accounts`;
  const [pr] = await sql`SELECT count(*)::int n FROM projects`;
  console.log(`data intact — channels=${ch.n} poet_bible=${bib.n} clerk_videos=${vid.n}`);
  console.log(`new tables empty — own_accounts=${oa.n} competitor_accounts=${ca.n} projects=${pr.n} (expect 0/0/0)`);
} finally {
  await sql.end();
}
