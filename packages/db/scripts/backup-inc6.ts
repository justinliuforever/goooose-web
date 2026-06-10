import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });

try {
  const out = {
    exportedAt: new Date().toISOString(),
    channelsCompetitors: await client`select id, slug, competitors from channels`,
    projectCompetitors: await client`select * from project_competitors`,
    competitorAccounts: await client`select * from competitor_accounts`,
    poetTopicsDuration: await client`select id, duration_minutes, duration_seconds from poet_custom_topics`,
    poetScriptsDuration: await client`select id, duration_minutes, duration_seconds from poet_scripts`,
  };
  const dir = resolve(__dirname, "../backups");
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `inc6-pre-contract-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(`✓ surgical backup written: ${file}`);
  console.log(
    `  channels=${out.channelsCompetitors.length} pc=${out.projectCompetitors.length} ca=${out.competitorAccounts.length} topics=${out.poetTopicsDuration.length} scripts=${out.poetScriptsDuration.length}`,
  );
} finally {
  await client.end();
}
