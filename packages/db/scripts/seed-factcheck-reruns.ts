// AUTHORIZED one-off: seed analyze-custom-topic + generate-script runs to validate
// the fact-check layer on the Leica topic (M4 year). Additive pipeline_runs only.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

try {
  const chan = "48d98f95-7bdd-4259-8e10-1750123abdd5";
  const topicId = "01cb1702-1467-485d-8467-780cd6ccf1b3";

  const analyzeCfg = { kind: "analyze", language: "zh" };
  const [a] = await sql`
    INSERT INTO pipeline_runs (channel_id, agent, command, status, config_json)
    VALUES (${chan}, 'poet', 'poet-analyze-custom-topic', 'pending', ${sql.json(analyzeCfg)})
    RETURNING id`;

  const scriptCfg = { kind: "script", language: "zh", durationSeconds: 900, customTopicId: topicId };
  const [s] = await sql`
    INSERT INTO pipeline_runs (channel_id, agent, command, status, config_json)
    VALUES (${chan}, 'poet', 'poet-generate-script', 'pending', ${sql.json(scriptCfg)})
    RETURNING id`;

  console.log(JSON.stringify({
    analyze: { taskId: "poet-analyze-custom-topic", payload: { channelId: chan, runId: a.id, topicId, language: "zh" } },
    script: { taskId: "poet-generate-script", payload: { channelId: chan, runId: s.id, language: "zh", durationSeconds: 900, customTopicId: topicId } },
  }, null, 2));
} finally {
  await sql.end();
}
