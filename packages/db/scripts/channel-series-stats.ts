import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { channelSeries } from "../src/schema/channel-series";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const channelId = process.argv[2];
if (!channelId) {
  console.error("Usage: tsx scripts/channel-series-stats.ts <channelId>");
  process.exit(1);
}

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);

try {
  const rows = await db
    .select()
    .from(channelSeries)
    .where(eq(channelSeries.channelId, channelId))
    .orderBy(desc(channelSeries.videoCount));

  console.log(`\n=== ${rows.length} series for channel ${channelId} ===\n`);
  for (const row of rows) {
    console.log(`■ ${row.name}  (${row.videoCount} videos)`);
    if (row.description) console.log(`  ${row.description}`);
    const samples = row.sampleVideos ?? [];
    for (const s of samples.slice(0, 5)) {
      const mins = Math.round(s.duration_sec / 60);
      console.log(`    - ${s.title} (${mins}min, ${s.views} views)`);
    }
    if (samples.length > 5) console.log(`    ...+${samples.length - 5} more`);
    console.log();
  }
} finally {
  await client.end();
}
