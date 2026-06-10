// One-off: enforce single active bible per channel (#9). Dedupe existing
// duplicate-active rows (keep most recent), then add the partial unique index.
// Idempotent. Run: pnpm --filter @singularity/db exec tsx scripts/apply-bible-active-index.ts
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

try {
  const before = await sql`SELECT channel_id, count(*) AS n FROM poet_bible WHERE is_active GROUP BY channel_id HAVING count(*) > 1`;
  console.log(`channels with >1 active (before): ${before.length}`);
  const d = await sql`
    WITH ranked AS (
      SELECT id, row_number() OVER (PARTITION BY channel_id ORDER BY updated_at DESC, generated_at DESC) AS rn
      FROM poet_bible WHERE is_active
    )
    UPDATE poet_bible SET is_active = false
    WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
  `;
  console.log(`deactivated ${d.count} duplicate-active bibles`);
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS poet_bible_one_active_per_channel ON poet_bible (channel_id) WHERE is_active`;
  const after = await sql`SELECT channel_id, count(*) AS n FROM poet_bible WHERE is_active GROUP BY channel_id HAVING count(*) > 1`;
  console.log(`channels with >1 active (after): ${after.length} (expect 0); index created ✓`);
} finally {
  await sql.end();
}
