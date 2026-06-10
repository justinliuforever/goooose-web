import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
try {
  const chans = await client`
    select slug, id, name, description from channels
    where slug in ('jomaclips', 'jz', 'hackbearterry', 'ch-j2tku6')`;
  for (const c of chans) {
    console.log(JSON.stringify({ slug: c.slug, id: c.id, desc: (c.description ?? "").slice(0, 120) }));
  }
  const jz = chans.find((c) => c.slug === "jz");
  if (jz) {
    const [idea] = await client`
      select id, idea_number, left(story_angle, 100) angle from muse_ideas
      where channel_id = ${jz.id} and approved and not scripted
      order by generated_at asc limit 1`;
    console.log(JSON.stringify({ jzIdea: idea?.id, n: idea?.idea_number, angle: idea?.angle }));
  }
} finally {
  await client.end();
}
