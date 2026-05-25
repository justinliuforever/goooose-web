// One-shot: creates a pipeline_runs row then prints the runId so we can
// trigger detect-channel-series via MCP with a real runId payload.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { pipelineRuns } from "../src/schema/runs";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const channelId = process.argv[2];
const agent = (process.argv[3] ?? "clerk") as "clerk" | "muse" | "poet";
const command = process.argv[4] ?? "detect-series";

if (!channelId) {
  console.error("Usage: tsx trigger-detect-series.ts <channelId> [agent] [command]");
  process.exit(1);
}

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);

try {
  const [run] = await db
    .insert(pipelineRuns)
    .values({ channelId, agent, command, status: "pending" })
    .returning({ id: pipelineRuns.id });
  console.log(run!.id);
} finally {
  await client.end();
}
