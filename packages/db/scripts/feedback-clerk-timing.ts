// Root-cause timing for Clerk analyze runs (#perf). Pulls real run durations,
// per-video averages, and transcript-source mix (caption vs ASR) per run.
// Run: pnpm --filter @singularity/db exec tsx scripts/feedback-clerk-timing.ts
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { pipelineRuns, clerkVideos } from "../src/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);

try {
  const runs = await db.select().from(pipelineRuns).where(eq(pipelineRuns.agent, "clerk")).orderBy(desc(pipelineRuns.startedAt)).limit(25);
  console.log(`clerk runs: ${runs.length}\n`);
  console.log("status   | total | dur(s) | per-vid(s) | command | config");
  for (const r of runs) {
    const dur = r.completedAt && r.startedAt ? Math.round((+r.completedAt - +r.startedAt) / 1000) : null;
    const total = r.total ?? 0;
    const perVid = dur && total ? (dur / total).toFixed(0) : "-";
    const cfg = r.configJson ? JSON.stringify(r.configJson).slice(0, 70) : "";
    console.log(`${(r.status ?? "").padEnd(8)} | ${String(total).padStart(5)} | ${String(dur ?? "-").padStart(6)} | ${String(perVid).padStart(9)} | ${(r.command ?? "").slice(0, 22).padEnd(22)} | ${cfg}`);
  }

  // transcript-source mix per recent run (caption fast vs asr slow)
  const done = runs.filter((r) => r.status === "done" && r.total && r.completedAt);
  const slow = done.sort((a, b) => ((+b.completedAt! - +b.startedAt) / (b.total || 1)) - ((+a.completedAt! - +a.startedAt) / (a.total || 1)))[0];
  if (slow) {
    const vids = await db.select().from(clerkVideos).where(eq(clerkVideos.runId, slow.id));
    const bySrc = new Map<string, number>();
    let asrChars = 0, capChars = 0, asrN = 0, capN = 0;
    for (const v of vids) {
      const src = v.transcriptSource ?? "none";
      bySrc.set(src, (bySrc.get(src) ?? 0) + 1);
      if (/asr|deepgram|groq|whisper/i.test(src)) { asrN++; asrChars += v.transcript?.length ?? 0; }
      else if (/caption|subtitle/i.test(src)) { capN++; capChars += v.transcript?.length ?? 0; }
    }
    const dur = Math.round((+slow.completedAt! - +slow.startedAt) / 1000);
    console.log(`\n=== slowest run drill (per-vid ${(dur / (slow.total || 1)).toFixed(0)}s, ${slow.total} vids, ${dur}s total) ===`);
    console.log("transcript_source mix:", JSON.stringify(Object.fromEntries(bySrc)));
    console.log(`ASR videos: ${asrN} (avg ${asrN ? Math.round(asrChars / asrN) : 0} chars) | caption videos: ${capN} (avg ${capN ? Math.round(capChars / capN) : 0} chars)`);
    const durs = vids.map((v) => v.durationSec).filter((d): d is number => !!d).sort((a, b) => a - b);
    if (durs.length) console.log(`video durations(s): min ${durs[0]} median ${durs[Math.floor(durs.length / 2)]} max ${durs[durs.length - 1]}`);
  }
} finally {
  await client.end();
}
