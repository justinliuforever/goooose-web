import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const runIds = process.argv.slice(2);

try {
  for (const runId of runIds) {
    const [run] = await client`
      select status, command, started_at, completed_at,
        extract(epoch from (completed_at - started_at))::int as dur
      from pipeline_runs where id = ${runId}`;
    const [ideas] = await client`select count(*)::int n from muse_ideas where run_id = ${runId}`;
    const [mon] = await client`select count(*)::int n from muse_monitor_videos where run_id = ${runId}`;
    console.log(`\n=== run ${runId.slice(0, 8)} | ${run?.command} | status=${run?.status} | dur=${run?.dur ?? "—"}s | ideas=${ideas.n} | monitored=${mon.n}`);
    const sampleIdeas = await client`
      select story_angle, left(facts_and_data, 90) facts from muse_ideas where run_id = ${runId} limit 2`;
    for (const it of sampleIdeas) console.log(`   idea: ${String(it.story_angle).slice(0, 80)}`);
    // ASR / transcript quality spot-check (esp. XHS Chinese garble residual)
    const tx = await client`
      select left(title,30) title, length(transcript) len, left(transcript, 140) head
      from muse_monitor_videos where run_id = ${runId} and transcript is not null limit 3`;
    for (const t of tx) console.log(`   tx[${t.len}c] ${t.title}: ${String(t.head).replace(/\n/g, " ")}`);
  }
} finally {
  await client.end();
}
