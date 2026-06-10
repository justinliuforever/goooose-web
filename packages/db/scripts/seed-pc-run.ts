// Seed a competitor-owned pipeline_runs row mirroring tRPC startAnalysis (P-C),
// so a directly-triggered clerk-analyze-channel job can satisfy its run_id FK.
// Run: pnpm --filter @singularity/db exec tsx scripts/seed-pc-run.ts <competitorAccountId> <limit> <language> <mode> <source>
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const [competitorAccountId, limit = "3", language = "zh", mode = "overwrite", source = "popular"] =
  process.argv.slice(2);
if (!competitorAccountId) {
  console.error("usage: seed-pc-run.ts <competitorAccountId> [limit] [language] [mode] [source]");
  process.exit(1);
}
try {
  const config = { limit: Number(limit), language, mode, source };
  const [run] = await sql<{ id: string }[]>`
    INSERT INTO pipeline_runs (competitor_account_id, agent, command, status, config_json)
    VALUES (${competitorAccountId}, 'clerk', 'clerk-analyze-channel', 'pending', ${sql.json(config)})
    RETURNING id`;
  console.log(run!.id);
} finally {
  await sql.end();
}
