import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { loadProxyPool } from "../src/proxy-helpers";
import { getVideoMetadataYtdlp } from "@singularity/shared/clients/ytdlp";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const videoId = process.argv[2];
if (!videoId) {
  console.error("Usage: tsx scripts/inspect-video-metadata.ts <videoId>");
  process.exit(1);
}

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);

try {
  const pool = await loadProxyPool(db, { provider: "wealthproxies" });
  const session = pool.checkout();
  console.log(`Fetching ${videoId} via wealthproxies…\n`);
  const meta = await getVideoMetadataYtdlp(videoId, session.url);
  console.log(`Title: ${meta.title}`);
  console.log(`Duration: ${meta.duration_sec}s`);
  console.log(`Channel: ${meta.channel_name}`);
  console.log(`Views: ${meta.views.toLocaleString()}`);
  console.log(`\n=== Chapters (creator): ${meta.chapters.length} ===`);
  for (const c of meta.chapters) {
    console.log(`  [${Math.floor(c.start_time)}-${Math.floor(c.end_time)}s] ${c.title}`);
  }
  console.log(`\n=== Sponsor chapters: ${meta.sponsor_chapters.length} ===`);
  for (const c of meta.sponsor_chapters) {
    console.log(
      `  [${c.start_time.toFixed(1)}-${c.end_time.toFixed(1)}s] ${c.category} (${c.type})`,
    );
  }
} finally {
  await client.end();
}
