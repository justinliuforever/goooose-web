// AUTHORIZED one-off: re-seed only the two edge-case validation runs (v11):
// 梵高 SOP (no-transcript reduced template) + script_long (Pro-tier fact-check).
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

try {
  const fangaoId = "ba2ed94c-2081-46ff-932e-b04073d8c04d";
  const scriptChan = "48d98f95-7bdd-4259-8e10-1750123abdd5";

  const clerkCfg = { limit: 4, language: "zh", mode: "overwrite", source: "newest" };
  const [clerkRun] = await sql`
    INSERT INTO pipeline_runs (channel_id, agent, command, status, config_json)
    VALUES (${fangaoId}, 'clerk', 'clerk-analyze-channel', 'pending', ${sql.json(clerkCfg)})
    RETURNING id`;

  const [topic] = await sql`
    SELECT id FROM poet_custom_topics
    WHERE channel_id = ${scriptChan} AND status IN ('analyzed','scripted')
    ORDER BY id LIMIT 1`;
  if (!topic) throw new Error("no analyzed custom topic for script_long channel");
  const scriptCfg = { kind: "script", language: "zh", durationSeconds: 900, customTopicId: topic.id };
  const [scriptRun] = await sql`
    INSERT INTO pipeline_runs (channel_id, agent, command, status, config_json)
    VALUES (${scriptChan}, 'poet', 'poet-generate-script', 'pending', ${sql.json(scriptCfg)})
    RETURNING id`;

  const manifest = [
    { key: "clerk_yt_cn", taskId: "clerk-analyze-channel",
      payload: { channelId: fangaoId, runId: clerkRun.id, ...clerkCfg } },
    { key: "script_long", taskId: "poet-generate-script",
      payload: { channelId: scriptChan, runId: scriptRun.id, language: "zh", durationSeconds: 900, customTopicId: topic.id } },
  ];
  console.log(JSON.stringify(manifest, null, 2));
} finally {
  await sql.end();
}
