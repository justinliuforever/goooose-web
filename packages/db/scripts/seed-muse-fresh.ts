// Insert one pipeline_runs row for a Muse run on a channel not yet processed
// (红发魔女 ch-yic805) so the viral_trigger/idea_number fix can be validated fresh.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
const CH = "02473041-fce8-4d0f-9235-6995c91d4148"; // 红发魔女 ch-yic805 (1 competitor)
try {
  const [run] = await sql`
    INSERT INTO pipeline_runs (channel_id, agent, command, status, config_json)
    VALUES (${CH}, 'muse', 'muse-monitor-competitors', 'pending',
      ${sql.json({ maxVideosPerCompetitor: 3, numIdeasPerVideo: 5, language: "zh" })})
    RETURNING id`;
  console.log(JSON.stringify({ channelId: CH, runId: run.id }));
} finally {
  await sql.end();
}
