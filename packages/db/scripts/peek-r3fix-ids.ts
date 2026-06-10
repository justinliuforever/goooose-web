import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
try {
  const [ch] = await client`select id, slug from channels where slug = 'ch-4o4i1u'`;
  const [idea] = await client`
    select id, left(story_angle, 80) angle from muse_ideas
    where channel_id = ${ch!.id} and approved and not scripted
    order by generated_at asc limit 1`;
  console.log(JSON.stringify({ channelId: ch!.id, ideaId: idea?.id, angle: idea?.angle }));
} finally {
  await client.end();
}
