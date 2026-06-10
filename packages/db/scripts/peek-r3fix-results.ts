import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
try {
  console.log("█ V1 bible: drift events for new bible?");
  const drifts = await client`
    select count(*)::int n from poet_drift_events where bible_id = '2e4814bd-0c55-4a43-b33e-2ba9efbf7886'`;
  console.log(`drift events: ${drifts[0]!.n} (expect 0)`);

  console.log("\n█ V2 script (60s, 纽约野富美) — full text");
  const [s] = await client`
    select word_count, script_text from poet_scripts where id = '9be84da4-edc9-40d5-b6f9-5dc69cf2b872'`;
  console.log(`[${s?.word_count} 字]\n${s?.script_text}`);

  console.log("\n█ V3 muse ideas (jomaclips, 10) — angles only");
  const ideas = await client`
    select idea_number, left(story_angle, 80) angle from muse_ideas
    where run_id = '339850eb-4de9-4e07-a8dc-51d40b687d4f' order by idea_number`;
  for (const i of ideas) console.log(`#${i.idea_number} ${i.angle}`);

  console.log("\n█ started_at fix check (V3 run: insert→exec gap should be gone)");
  const [r] = await client`
    select round(extract(epoch from (completed_at - started_at)))::int dur from pipeline_runs
    where id = '339850eb-4de9-4e07-a8dc-51d40b687d4f'`;
  console.log(`muse run recorded duration: ${r?.dur}s (trigger wall ≈ 533s; pre-fix would include ~5min prep gap)`);
} finally {
  await client.end();
}
