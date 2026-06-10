import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const RUN_IDS = [
  "08ef7213-211f-4f6c-963e-84c09ad7ebad", // T1 clerk joma
  "3c3ded9f-a3ad-4bb5-8b27-eec92ce65b51", // T2 clerk 亢岳
  "56f7a74d-8325-4331-901e-7ef05444027c", // T3 muse jz
  "4fb68bd4-3f42-4aa1-8cf0-33b61e0fb997", // T4 muse hackbear
  "8c7ba38d-5ab5-4744-bb5d-8cf141673f0c", // T5 bible joma
  "e8bb73f6-35e5-4dcc-9bcf-895c335a217c", // T6 script jz
];

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
try {
  console.log("█ pipeline_runs status + durations");
  const runs = await client`
    select r.id, c.slug, r.command, r.status, r.progress, r.total,
      round(extract(epoch from (r.completed_at - r.started_at)))::int dur_sec, r.error_message
    from pipeline_runs r join channels c on c.id = r.channel_id
    where r.id = any(${RUN_IDS})
    order by r.started_at`;
  console.table(runs.map((r) => ({ ...r })));

  console.log("\n█ T5 bible row (drift + activation)");
  const [bible] = await client`
    select id, name, is_active, length(content) len, left(content, 300) head
    from poet_bible where id = '7e5e258c-dfb1-4958-9280-4b40a2ddf27a'`;
  console.log(JSON.stringify({ ...bible, head: bible?.head?.slice(0, 200) }, null, 1));
  const drift = await client`
    select reason, human_message from poet_drift_events
    where bible_id = '7e5e258c-dfb1-4958-9280-4b40a2ddf27a' limit 1`;
  console.log("drift event:", JSON.stringify(drift));

  console.log("\n█ T6 script (60s target)");
  const [script] = await client`
    select word_count, duration_seconds, length(script_text) chars, left(script_text, 600) head
    from poet_scripts where id = '014fa894-2472-4688-a16e-5b2e57e94cf0'`;
  console.log(JSON.stringify({ wc: script?.word_count, dur: script?.duration_seconds, chars: script?.chars }));
  console.log(script?.head);

  console.log("\n█ T2 亢岳 human SOP head");
  const [sop] = await client`
    select sop_type, length(content_md) len, left(content_md, 900) head from clerk_sops
    where run_id = '3c3ded9f-a3ad-4bb5-8b27-eec92ce65b51' and sop_type = 'human' limit 1`;
  console.log(`[${sop?.sop_type} ${sop?.len}c]\n${sop?.head}`);

  console.log("\n█ T4 hackbear ideas sample (3 of 10)");
  const ideas = await client`
    select idea_number, left(story_angle, 90) angle, left(facts_and_data, 150) facts, suggested_hook_type
    from muse_ideas where run_id = '4fb68bd4-3f42-4aa1-8cf0-33b61e0fb997' order by random() limit 3`;
  for (const i of ideas) console.log(`#${i.idea_number} ${i.angle}\n  facts: ${i.facts}\n  hook: ${i.suggested_hook_type}`);

  console.log("\n█ eta hints (clerk.analyze bucket after new runs)");
  const [eta] = await client`
    select count(*)::int n,
      round(percentile_cont(0.5) within group (order by extract(epoch from (completed_at - started_at))))::int p50,
      round(percentile_cont(0.9) within group (order by extract(epoch from (completed_at - started_at))))::int p90
    from pipeline_runs
    where command in ('clerk-analyze-channel','analyze-channel') and status = 'done'
      and completed_at is not null
      and extract(epoch from (completed_at - started_at)) between 5 and 14400`;
  console.log(JSON.stringify(eta));
} finally {
  await client.end();
}
