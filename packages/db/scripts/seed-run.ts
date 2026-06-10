// Seed a pipeline_runs row so a directly-triggered job can satisfy its run_id FKs,
// mirroring what the tRPC layer does before triggering. Prints the run id.
// Run: pnpm --filter @singularity/db exec tsx scripts/seed-run.ts <channelId> <agent> <command>
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const [channelId, agent, command] = process.argv.slice(2);
if (!channelId || !agent || !command) {
  console.error("usage: seed-run.ts <channelId> <agent> <command>");
  process.exit(1);
}
try {
  const [run] = await sql<{ id: string }[]>`
    INSERT INTO pipeline_runs (channel_id, agent, command, status)
    VALUES (${channelId}, ${agent}, ${command}, 'pending') RETURNING id`;
  console.log(run!.id);
} finally {
  await sql.end();
}
