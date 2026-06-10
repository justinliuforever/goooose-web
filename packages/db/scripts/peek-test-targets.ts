import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });

try {
  console.log("=== channels: platform, slug, videos, bound competitors, ideas, active bible ===");
  const rows = await client`
    select
      c.id, c.slug, c.platform, c.name,
      (select count(*)::int from clerk_videos v where v.channel_id = c.id) as videos,
      (select count(*)::int from project_competitors pc
         join competitor_accounts ca on ca.id = pc.competitor_account_id
         where pc.project_id = c.id and ca.deleted_at is null) as competitors,
      (select count(*)::int from muse_ideas mi where mi.channel_id = c.id) as ideas,
      (select count(*)::int from poet_bible b where b.channel_id = c.id and b.is_active) as active_bible
    from channels c
    order by c.platform, competitors desc, videos desc`;
  console.table(rows.map((r) => ({ ...r, id: String(r.id).slice(0, 8) })));
} finally {
  await client.end();
}
