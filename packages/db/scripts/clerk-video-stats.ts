import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { clerkVideos } from "../src/schema/clerk";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const channelId = process.argv[2];
if (!channelId) {
  console.error("Usage: tsx scripts/clerk-video-stats.ts <channelId>");
  process.exit(1);
}

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);

try {
  const rows = await db
    .select({
      id: clerkVideos.platformVideoId,
      title: clerkVideos.title,
      durationSec: clerkVideos.durationSec,
      transcriptSource: clerkVideos.transcriptSource,
      transcriptLen: clerkVideos.transcript,
      chapters: clerkVideos.chapters,
      sponsorChapters: clerkVideos.sponsorChapters,
      coverDiagnosis: clerkVideos.coverDiagnosis,
      coverTitleSuggestions: clerkVideos.coverTitleSuggestions,
    })
    .from(clerkVideos)
    .where(eq(clerkVideos.channelId, channelId))
    .orderBy(desc(clerkVideos.analyzedAt))
    .limit(10);

  for (const v of rows) {
    console.log(`\n■ ${v.title} [${v.id}] (${v.durationSec}s)`);
    console.log(`  transcript: ${v.transcriptSource ?? "—"} (${v.transcriptLen?.length ?? 0} chars)`);
    console.log(`  chapters: ${v.chapters ? `${v.chapters.length} items` : "null"}`);
    if (v.chapters && v.chapters.length > 0) {
      for (const c of v.chapters.slice(0, 3))
        console.log(`    [${Math.floor(c.start_time)}s-${Math.floor(c.end_time)}s] ${c.title}`);
    }
    console.log(`  sponsor_chapters: ${v.sponsorChapters ? `${v.sponsorChapters.length} items` : "null"}`);
    if (v.sponsorChapters && v.sponsorChapters.length > 0) {
      for (const c of v.sponsorChapters.slice(0, 3))
        console.log(`    [${Math.floor(c.start_time)}s-${Math.floor(c.end_time)}s] ${c.category}`);
    }
    console.log(`  cover_diagnosis: ${v.coverDiagnosis ? "yes" : "—"}`);
    console.log(
      `  title_suggestions: ${v.coverTitleSuggestions ? `${v.coverTitleSuggestions.length} items` : "—"}`,
    );
  }
} finally {
  await client.end();
}
