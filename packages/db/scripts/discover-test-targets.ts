// READ-ONLY: enumerate prod channels + which test features each can exercise.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

try {
  const rows = await sql`
    SELECT c.name, c.platform, c.slug,
      coalesce(jsonb_array_length(c.competitors), 0) AS competitors,
      (SELECT count(*) FROM clerk_videos v WHERE v.channel_id = c.id) AS videos,
      (SELECT count(*) FROM clerk_sops s WHERE s.channel_id = c.id AND s.sop_type = 'ai_reference') AS ai_sops,
      (SELECT count(*) FROM poet_bible b WHERE b.channel_id = c.id AND b.is_active) AS active_bibles,
      (SELECT count(*) FROM muse_ideas i WHERE i.channel_id = c.id) AS ideas,
      (SELECT count(*) FROM poet_custom_topics t WHERE t.channel_id = c.id) AS topics,
      (SELECT count(*) FROM poet_custom_topics t WHERE t.channel_id = c.id AND t.status IN ('analyzed','scripted')) AS topics_ready,
      c.id
    FROM channels c
    ORDER BY c.platform, c.name`;
  console.log(`channels: ${rows.length}\n`);
  for (const r of rows) {
    console.log(
      `[${r.platform}] ${r.name}  (slug=${r.slug})\n` +
      `   id=${r.id}\n` +
      `   videos=${r.videos}  competitors=${r.competitors}  ai_sop=${r.ai_sops}  activeBible=${r.active_bibles}  ideas=${r.ideas}  topics=${r.topics}(ready=${r.topics_ready})`,
    );
  }
} finally {
  await sql.end();
}
