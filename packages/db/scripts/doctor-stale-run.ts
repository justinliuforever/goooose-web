import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const STALE_ID = "2a3b3c4c-6876-4b45-bcd9-abfb174c9130";

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
try {
  const [row] = await client`
    select r.id, r.command, r.status, r.started_at, c.slug, c.name
    from pipeline_runs r join channels c on c.id = r.channel_id
    where r.id = ${STALE_ID}`;
  console.log(JSON.stringify(row));
  if (process.argv[2] === "--fix" && row && row.status === "pending") {
    await client`
      update pipeline_runs
      set status = 'failed', error_message = 'Stale orphan run (never started), cleaned by maintenance', completed_at = now()
      where id = ${STALE_ID} and status = 'pending'`;
    console.log("✓ marked failed");
  }
} finally {
  await client.end();
}
