import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });

// args: <slug> <agent> <command>
const [slug, agent, command] = process.argv.slice(2);
if (!slug || !agent || !command) {
  console.error("Usage: tsx scripts/trigger-prep.ts <slug> <agent> <command>");
  process.exit(1);
}

try {
  const [ch] = await client`select id, platform, name from channels where slug = ${slug} limit 1`;
  if (!ch) throw new Error(`channel not found: ${slug}`);
  const [run] = await client`
    insert into pipeline_runs (channel_id, agent, command, status, config_json)
    values (${ch.id}, ${agent}, ${command}, 'pending', ${client.json({ via: "mcp-test" })})
    returning id`;
  console.log(JSON.stringify({ slug, name: ch.name, platform: ch.platform, channelId: ch.id, runId: run.id }));
} finally {
  await client.end();
}
