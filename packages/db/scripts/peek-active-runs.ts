import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
try {
  const r = await client`select id, command, status, started_at from pipeline_runs where status in ('pending','running') order by started_at desc`;
  console.log(r.length === 0 ? "no active runs" : JSON.stringify(r, null, 1));
} finally {
  await client.end();
}
