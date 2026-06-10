// INC5d: reconcile project.active_bible_id to each channel's currently-active bible
// (project.id == channel.id during the expand phase) so the hard-pin read path can't
// hit a null pin where an active bible exists. Idempotent. Authorized prod DML.
// Run: pnpm --filter @singularity/db exec tsx scripts/reconcile-bible-pin.ts
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

try {
  const updated = await sql`
    UPDATE projects p SET active_bible_id = b.id, updated_at = now()
    FROM poet_bible b
    WHERE b.channel_id = p.id AND b.is_active = true
      AND (p.active_bible_id IS NULL OR p.active_bible_id <> b.id)`;
  console.log(`reconciled pins: ${updated.count}`);

  // VERIFY 1: every project that has an active bible must be pinned to it.
  const missing = await sql`
    SELECT p.id FROM projects p
    JOIN poet_bible b ON b.channel_id = p.id AND b.is_active = true
    WHERE p.active_bible_id IS NULL OR p.active_bible_id <> b.id`;
  // VERIFY 2: no pin may point to a missing / inactive / wrong-channel bible.
  const dangling = await sql`
    SELECT p.id, p.active_bible_id FROM projects p
    WHERE p.active_bible_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM poet_bible b
        WHERE b.id = p.active_bible_id AND b.channel_id = p.id AND b.is_active = true)`;
  const [counts] = await sql<{ projects: number; pinned: number; with_active: number }[]>`
    SELECT (SELECT count(*)::int FROM projects) projects,
           (SELECT count(*)::int FROM projects WHERE active_bible_id IS NOT NULL) pinned,
           (SELECT count(DISTINCT channel_id)::int FROM poet_bible WHERE is_active = true) with_active`;
  console.log(`projects=${counts!.projects} pinned=${counts!.pinned} channels_with_active_bible=${counts!.with_active}`);
  console.log(`VERIFY active-but-unpinned=${missing.length} (expect 0); dangling/stale pins=${dangling.length} (expect 0)`);
  if (missing.length) console.log("  unpinned: " + missing.map((r) => (r as { id: string }).id.slice(0, 8)).join(", "));
  if (dangling.length) console.log("  dangling: " + dangling.map((r) => (r as { id: string }).id.slice(0, 8)).join(", "));
} finally {
  await sql.end();
}
