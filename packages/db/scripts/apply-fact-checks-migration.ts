// AUTHORIZED additive migration: add poet_custom_topics.fact_checks (idempotent).
// Applies ONLY 0011 — does not touch the deferred 0010 bible index.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

try {
  await sql`ALTER TABLE poet_custom_topics ADD COLUMN IF NOT EXISTS fact_checks jsonb NOT NULL DEFAULT '[]'::jsonb`;
  const [chk] = await sql`
    SELECT data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'poet_custom_topics' AND column_name = 'fact_checks'`;
  console.log("fact_checks column:", chk ? `present (${chk.data_type}, default ${chk.column_default})` : "MISSING");
} finally {
  await sql.end();
}
