// Read-only P-C test recon: competitor accounts, own channels, and which
// pseudo-accounts pass the 5-table conversion guard.
// Run: pnpm --filter @singularity/db exec tsx scripts/peek-pc-targets.ts
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

try {
  const competitors = await sql`
    SELECT ca.id, ca.name, ca.platform, ca.url, ca.deleted_at,
      (SELECT count(*)::int FROM clerk_videos cv WHERE cv.competitor_account_id = ca.id) AS videos,
      (SELECT count(*)::int FROM clerk_sops cs WHERE cs.competitor_account_id = ca.id) AS sops,
      (SELECT count(*)::int FROM project_competitors pc WHERE pc.competitor_account_id = ca.id) AS bound_projects
    FROM competitor_accounts ca
    ORDER BY ca.created_at`;
  console.log("=== competitor_accounts ===");
  for (const c of competitors) {
    console.log(
      `${c.id}  [${c.platform}] ${c.name ?? "(unnamed)"}  videos=${c.videos} sops=${c.sops} projects=${c.bound_projects}${c.deleted_at ? " DELETED" : ""}`,
    );
    console.log(`  ${c.url}`);
  }

  const channels = await sql`
    SELECT ch.id, ch.slug, ch.name, ch.platform,
      (SELECT count(*)::int FROM clerk_videos cv WHERE cv.channel_id = ch.id) AS clerk_videos,
      (SELECT count(*)::int FROM clerk_sops cs WHERE cs.channel_id = ch.id) AS sops,
      (SELECT count(*)::int FROM poet_bible pb WHERE pb.channel_id = ch.id) AS bibles,
      (SELECT count(*)::int FROM poet_scripts ps WHERE ps.channel_id = ch.id) AS scripts,
      (SELECT count(*)::int FROM poet_custom_topics pt WHERE pt.channel_id = ch.id) AS topics,
      (SELECT count(*)::int FROM muse_ideas mi WHERE mi.channel_id = ch.id) AS ideas,
      (SELECT count(*)::int FROM muse_monitor_videos mm WHERE mm.channel_id = ch.id) AS monitor
    FROM channels ch
    ORDER BY ch.created_at`;
  console.log("\n=== channels (own accounts) ===");
  for (const ch of channels) {
    const convertible =
      ch.bibles === 0 && ch.scripts === 0 && ch.topics === 0 && ch.ideas === 0 && ch.monitor === 0;
    console.log(
      `${ch.id}  [${ch.platform}] ${ch.slug} "${ch.name}"  clerk=${ch.clerk_videos}/${ch.sops}sop bible=${ch.bibles} script=${ch.scripts} topic=${ch.topics} idea=${ch.ideas} monitor=${ch.monitor}${convertible ? "  << CONVERTIBLE" : ""}`,
    );
  }
} finally {
  await sql.end();
}
