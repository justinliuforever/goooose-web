// Mirrors channelsMaintenance.convertToCompetitor (routers.ts) statement-for-statement
// to exercise the P-C conversion against prod: 5-table guard, active-run guard, key
// resolution, reuse-or-create, clerk re-owning, explicit spine deletes (no FK cascade).
// Dry-run by default; --execute performs the transaction.
// Run: pnpm --filter @singularity/db exec tsx scripts/convert-pc-test.ts <channelId> [--execute]
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";
import { provisionalCompetitorKey } from "@singularity/shared/services/competitors";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const channelId = process.argv[2];
const execute = process.argv.includes("--execute");
if (!channelId) {
  console.error("usage: convert-pc-test.ts <channelId> [--execute]");
  process.exit(1);
}

try {
  const [channel] = await sql<
    { id: string; user_id: string; name: string; platform: "youtube" | "xhs"; platform_url: string }[]
  >`SELECT id, user_id, name, platform, platform_url FROM channels WHERE id = ${channelId}`;
  if (!channel) throw new Error("Channel not found");
  console.log(`channel: ${channel.name} [${channel.platform}] ${channel.platform_url}`);

  const [guard] = await sql<
    { bibles: number; scripts: number; topics: number; ideas: number; monitored: number }[]
  >`SELECT
      (SELECT count(*)::int FROM poet_bible b WHERE b.channel_id = ${channel.id}) AS bibles,
      (SELECT count(*)::int FROM poet_scripts s WHERE s.channel_id = ${channel.id}) AS scripts,
      (SELECT count(*)::int FROM poet_custom_topics t WHERE t.channel_id = ${channel.id}) AS topics,
      (SELECT count(*)::int FROM muse_ideas i WHERE i.channel_id = ${channel.id}) AS ideas,
      (SELECT count(*)::int FROM muse_monitor_videos m WHERE m.channel_id = ${channel.id}) AS monitored`;
  const blockers: string[] = [];
  if (guard!.bibles > 0) blockers.push(`${guard!.bibles} 本圣经`);
  if (guard!.scripts > 0) blockers.push(`${guard!.scripts} 篇脚本`);
  if (guard!.topics > 0) blockers.push(`${guard!.topics} 个自定义选题`);
  if (guard!.ideas > 0) blockers.push(`${guard!.ideas} 个选题`);
  if (guard!.monitored > 0) blockers.push(`${guard!.monitored} 条巡视记录`);
  if (blockers.length > 0) {
    console.log(`GUARD REFUSED (expected for non-pure accounts): ${blockers.join("、")}`);
    process.exit(2);
  }
  console.log("guard: pure study target, convertible");

  const active = await sql<{ id: string; started_at: Date }[]>`
    SELECT id, started_at FROM pipeline_runs
    WHERE channel_id = ${channel.id} AND agent = 'clerk' AND status IN ('pending','running')
    ORDER BY started_at DESC LIMIT 1`;
  if (active[0] && active[0].started_at > new Date(Date.now() - 30 * 60 * 1000)) {
    throw new Error("active clerk run — refuse");
  }

  const keyInfo = provisionalCompetitorKey(channel.platform, channel.platform_url);
  if (!keyInfo) throw new Error("cannot derive competitor key from platform_url");
  console.log(`key: ${keyInfo.key} needsResolution=${keyInfo.needsResolution}`);

  const [existing] = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM competitor_accounts
    WHERE user_id = ${channel.user_id} AND platform = ${channel.platform}
      AND platform_key = ${keyInfo.key} AND deleted_at IS NULL LIMIT 1`;
  console.log(existing ? `will REUSE competitor ${existing.id} (${existing.name})` : "will CREATE new competitor");

  const [counts] = await sql<{ videos: number; sops: number; runs: number }[]>`
    SELECT
      (SELECT count(*)::int FROM clerk_videos WHERE channel_id = ${channel.id}) AS videos,
      (SELECT count(*)::int FROM clerk_sops WHERE channel_id = ${channel.id}) AS sops,
      (SELECT count(*)::int FROM pipeline_runs WHERE channel_id = ${channel.id} AND agent = 'clerk') AS runs`;
  console.log(`to re-own: ${counts!.videos} videos, ${counts!.sops} sops, ${counts!.runs} clerk runs`);

  if (!execute) {
    console.log("dry-run only (pass --execute to convert)");
    process.exit(0);
  }

  const compId = await sql.begin(async (tx) => {
    let id = existing?.id;
    if (!id) {
      const [created] = await tx<{ id: string }[]>`
        INSERT INTO competitor_accounts (user_id, platform, platform_key, url, name, needs_resolution)
        VALUES (${channel.user_id}, ${channel.platform}, ${keyInfo.key}, ${channel.platform_url}, ${channel.name}, ${keyInfo.needsResolution})
        RETURNING id`;
      id = created!.id;
    }
    await tx`UPDATE clerk_videos SET competitor_account_id = ${id}, channel_id = NULL, own_account_id = NULL WHERE channel_id = ${channel.id}`;
    await tx`UPDATE clerk_sops SET competitor_account_id = ${id}, channel_id = NULL, own_account_id = NULL WHERE channel_id = ${channel.id}`;
    await tx`UPDATE pipeline_runs SET competitor_account_id = ${id}, channel_id = NULL WHERE channel_id = ${channel.id} AND agent = 'clerk'`;
    await tx`DELETE FROM projects WHERE id = ${channel.id}`;
    await tx`DELETE FROM own_accounts WHERE id = ${channel.id}`;
    await tx`DELETE FROM channels WHERE id = ${channel.id}`;
    return id;
  });
  console.log(`CONVERTED → competitor_account ${compId}`);
} finally {
  await sql.end();
}
