// Dump current state of the hackbearterry channel: videos + transcript sources + SOPs.
// Used to verify whether the ASR-retry / single-resolver fixes are recoverable
// after an overwrite re-run.

import { config } from "dotenv";
config({ path: new URL("../../../.env.local", import.meta.url) });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, desc, eq } from "drizzle-orm";

import { channels, clerkSops, clerkVideos } from "@singularity/db";

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(client);
  try {
    const all = await db.select().from(channels);
    const found = all.find((c) => c.name.toLowerCase().includes("hackbear"));
    console.log(`\nall ${all.length} channels:`);
    for (const c of all) {
      console.log(`  ${c.name} (slug=${c.slug}, platform=${c.platform})`);
    }
    console.log();
    if (!found) {
      console.log("hackbearterry channel not found");
      return;
    }
    console.log(`channel: ${found.name} (slug=${found.slug}, id=${found.id})`);
    console.log(`platform: ${found.platform} | url: ${found.platformUrl}`);

    const videos = await db
      .select()
      .from(clerkVideos)
      .where(eq(clerkVideos.channelId, found.id))
      .orderBy(desc(clerkVideos.views));
    console.log(`\nvideos: ${videos.length}`);
    for (const v of videos) {
      const titleShown = v.title.length > 45 ? v.title.slice(0, 45) + "..." : v.title;
      console.log(
        `  [${v.platformVideoId}] "${titleShown}" — views=${v.views ?? "—"} dur=${v.durationSec ?? "—"}s tsrc=${v.transcriptSource ?? "—"} transcript=${v.transcript ? v.transcript.length + " chars" : "NULL"}`,
      );
    }

    const sops = await db
      .select({
        sopType: clerkSops.sopType,
        language: clerkSops.language,
        contentLen: clerkSops.contentMd,
        generatedAt: clerkSops.generatedAt,
      })
      .from(clerkSops)
      .where(eq(clerkSops.channelId, found.id));
    console.log(`\nSOPs: ${sops.length}`);
    for (const s of sops) {
      console.log(
        `  ${s.sopType} (${s.language}) — ${s.contentLen.length} chars, ${s.generatedAt.toISOString()}`,
      );
    }

    const topVideo = videos[0];
    if (topVideo) {
      console.log(`\ntop video by views: "${topVideo.title}" (${topVideo.views})`);
      console.log(`  → has transcript? ${topVideo.transcript ? "yes (" + topVideo.transcript.length + " chars)" : "NO — hottest SOP will be skipped"}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
