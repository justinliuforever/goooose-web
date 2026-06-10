import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
try {
  const cols = await client`
    select table_name, column_name from information_schema.columns
    where (table_name='channels' and column_name='competitors')
       or (table_name in ('poet_custom_topics','poet_scripts') and column_name='duration_minutes')`;
  console.log(cols.length === 0 ? "✓ legacy columns gone" : `✗ still present: ${JSON.stringify(cols)}`);
  const [ch] = await client`select count(*)::int n from channels`;
  const [pc] = await client`select count(*)::int n from project_competitors`;
  const [nn] = await client`
    select count(*)::int n from information_schema.columns
    where (table_name='clerk_videos' and column_name='own_account_id' and is_nullable='NO')
       or (table_name='muse_monitor_videos' and column_name='project_id' and is_nullable='NO')`;
  console.log(`✓ reads OK: channels=${ch!.n}, project_competitors=${pc!.n}, owner NOT NULL spot-check=${nn!.n}/2`);
} finally {
  await client.end();
}
