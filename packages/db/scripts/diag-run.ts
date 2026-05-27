import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { clerkSops, clerkVideos, pipelineRuns } from "../src/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);

try {
  const runs = await db
    .select()
    .from(pipelineRuns)
    .where(eq(pipelineRuns.agent, "clerk"))
    .orderBy(desc(pipelineRuns.startedAt))
    .limit(3);

  console.log("=== Recent clerk runs ===");
  for (const r of runs) {
    console.log(`\n${r.id}`);
    console.log(`  started: ${r.startedAt} | done: ${r.completedAt} | status: ${r.status}`);
    console.log(`  progress: ${r.progress}/${r.total}`);
    console.log(`  err: ${r.errorMessage?.slice(0, 200) ?? "—"}`);
    console.log(`  config: ${JSON.stringify(r.configJson).slice(0, 300)}`);

    const vids = await db
      .select({
        id: clerkVideos.platformVideoId,
        title: clerkVideos.title,
        transcriptSource: clerkVideos.transcriptSource,
        transcript: clerkVideos.transcript,
        framework: clerkVideos.framework,
      })
      .from(clerkVideos)
      .where(eq(clerkVideos.runId, r.id));
    console.log(`  videos in DB: ${vids.length}`);
    for (const v of vids) {
      console.log(
        `    - ${v.id} | ${v.title?.slice(0, 60)} | src=${v.transcriptSource} | tlen=${v.transcript?.length ?? 0} | analyzed=${v.framework ? "Y" : "N"}`,
      );
    }

    const sops = await db
      .select({ type: clerkSops.sopType, len: clerkSops.contentMd })
      .from(clerkSops)
      .where(eq(clerkSops.runId, r.id));
    console.log(`  sops in DB: ${sops.length}`);
    for (const s of sops) console.log(`    - ${s.type} | ${s.len?.length ?? 0} chars`);
  }
} finally {
  await client.end();
}
