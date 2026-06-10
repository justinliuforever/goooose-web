// End-to-end: real XHS user -> getXhsUserNotes (fresh h265 streams) ->
// transcribeFromStreams (now Qwen3-ASR primary). Confirms Qwen handles the actual
// XHS h265 video/mp4 container + Chinese quality; provider field = qwen vs groq.
// Run: pnpm --filter @singularity/db exec tsx scripts/qwen-xhs-e2e.ts
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { and, eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getXhsUserNotes } from "@singularity/shared/clients/xhs";
import { transcribeFromStreams } from "@singularity/shared/clients/asr";
import { clerkVideos } from "../src/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);

try {
  const rows = await db
    .select({ uid: clerkVideos.sourceChannelId })
    .from(clerkVideos)
    .where(and(eq(clerkVideos.contentType, "xhs_video"), isNotNull(clerkVideos.sourceChannelId)))
    .limit(40);
  const uids = [...new Set(rows.map((r) => r.uid).filter(Boolean))] as string[];
  console.log(`Trying ${uids.length} XHS user ids via getXhsUserNotes…`);

  let done = false;
  for (const uid of uids) {
    if (done) break;
    let notes;
    try {
      notes = await getXhsUserNotes(uid, 10);
    } catch (e) {
      console.log(`  ${uid}: ${(e as Error).message.slice(0, 90)}`);
      continue;
    }
    const vnote = notes.find((n) => n.type === "video" && n.videoStreams.length > 0);
    if (!vnote) {
      console.log(`  ${uid}: ${notes.length} notes, none video-with-streams`);
      continue;
    }
    const streams = vnote.videoStreams.map((s) => ({
      url: s.masterUrl,
      mimeType: "video/mp4",
      sizeHint: s.size,
      label: `${s.codec} ${s.width}x${s.height}`,
    }));
    console.log(`\n==== ${vnote.title.slice(0, 40)} (codecs: ${vnote.videoStreams.map((s) => s.codec).join("/")}, dur=${vnote.durationSec ?? "?"}s) ====`);
    const t0 = Date.now();
    const result = await transcribeFromStreams(streams, {
      logger: { info: (m) => console.log(`  [info] ${m}`), warn: (m) => console.log(`  [warn] ${m}`) },
      durationSec: vnote.durationSec ?? undefined,
      tag: `XHS ${vnote.noteId}`,
    });
    const sec = Math.round((Date.now() - t0) / 1000);
    if (result) {
      console.log(`  → provider=${result.provider} | ${sec}s | ${result.text.length} chars | lang=${result.detectedLanguage ?? "?"}`);
      console.log(`  → head: ${JSON.stringify(result.text.slice(0, 240))}`);
    } else {
      console.log(`  → null (all providers failed) | ${sec}s`);
    }
    done = true;
  }
  if (!done) console.log("\n(no XHS user returned a video note with fresh streams)");
} finally {
  await client.end();
}
