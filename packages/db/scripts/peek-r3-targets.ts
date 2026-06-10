import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
try {
  // Spine invariant powering all new deep links: every channel must have a same-slug project.
  const broken = await client`
    select c.slug from channels c
    left join projects p on p.own_account_id = c.id and p.slug = c.slug
    where p.id is null`;
  console.log(broken.length === 0 ? "✓ spine slug invariant holds for all channels" : `✗ BROKEN spine: ${broken.map((r) => r.slug).join(", ")}`);

  const rows = await client`
    select c.slug, c.name, c.platform,
      (select count(*)::int from clerk_videos v where v.channel_id = c.id) videos,
      (select count(*)::int from clerk_sops s where s.channel_id = c.id) sops,
      (select count(*)::int from poet_bible b where b.channel_id = c.id and b.is_active) active_bible,
      (select count(*)::int from project_competitors pc
         join competitor_accounts ca on ca.id = pc.competitor_account_id and ca.deleted_at is null
         where pc.project_id = c.id) bound,
      (select count(*)::int from muse_ideas i where i.channel_id = c.id and i.approved and not i.scripted) approved_ideas,
      (select count(*)::int from poet_scripts ps where ps.channel_id = c.id) scripts
    from channels c order by c.created_at desc`;
  console.table(rows.map((r) => ({ ...r })));
} finally {
  await client.end();
}
