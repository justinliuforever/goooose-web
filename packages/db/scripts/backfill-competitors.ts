// INC2b/c competitor backfill — two-stage, idempotent.
//   Stage A (no network): parse channels.competitors with the real URL helpers,
//     insert competitor_accounts (provisional key for YouTube handles) + project_competitors.
//   Stage B (network): resolve handle/legacy -> canonical UC, merge collisions.
//   Metadata (network, best-effort): names / subs / avatar.
//   Historical: best-effort muse_monitor_videos.competitor_account_id by source-name match.
// platform_key policy: XHS id and YouTube @handle are lowercased; canonical YouTube UC ids
// keep exact case (globally unique + case-sensitive, and usable directly as channel_id).
// Run: pnpm --filter @singularity/db exec tsx scripts/backfill-competitors.ts
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";
import { extractXhsUserId, resolveXhsUser } from "@singularity/shared/clients/xhs";
import { parseYoutubeChannelUrl } from "@singularity/shared/clients/youtube-data";
import { getChannelInfo, resolveChannelId } from "@singularity/shared/clients/tikhub";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

type Comp = { platform: "youtube" | "xhs"; url: string };

function provisionalKey(c: Comp): { key: string; needsResolution: boolean } | null {
  const url = (c.url || "").trim();
  if (c.platform === "xhs") {
    const id = extractXhsUserId(url);
    return id ? { key: id.toLowerCase(), needsResolution: false } : null;
  }
  const parsed = parseYoutubeChannelUrl(url);
  if (!parsed) return null;
  if (parsed.type === "id") return { key: parsed.channelId, needsResolution: false }; // exact-case UC
  if (parsed.type === "handle") return { key: `@${parsed.handle.toLowerCase()}`, needsResolution: true };
  return { key: url.toLowerCase(), needsResolution: true }; // legacy /c/ /user/
}

const keyOf = (u: string, p: string, k: string) => `${u}|${p}|${k}`;

try {
  const channels = await sql<{ id: string; user_id: string; competitors: Comp[] }[]>`
    SELECT id, user_id, competitors FROM channels WHERE jsonb_array_length(competitors) > 0`;
  const existing = await sql<{ id: string; user_id: string; platform: string; platform_key: string; url: string }[]>`
    SELECT id, user_id, platform, platform_key, url FROM competitor_accounts`;
  const map = new Map<string, string>();
  const byUrl = new Map<string, string>(); // re-run idempotency: a resolved row keeps its original url
  for (const e of existing) {
    map.set(keyOf(e.user_id, e.platform, e.platform_key), e.id);
    byUrl.set(keyOf(e.user_id, e.platform, (e.url || "").trim().toLowerCase()), e.id);
  }

  // ---- Stage A ----
  let inserted = 0, links = 0; const bad: string[] = [];
  for (const ch of channels) {
    for (const c of ch.competitors ?? []) {
      const pk = provisionalKey(c);
      if (!pk) { bad.push(`${c.platform}:${c.url}`); continue; }
      const mk = keyOf(ch.user_id, c.platform, pk.key);
      const urlk = keyOf(ch.user_id, c.platform, (c.url || "").trim().toLowerCase());
      let compId = map.get(mk) ?? byUrl.get(urlk);
      if (!compId) {
        const [row] = await sql<{ id: string }[]>`
          INSERT INTO competitor_accounts (user_id, platform, platform_key, url, needs_resolution)
          VALUES (${ch.user_id}, ${c.platform}, ${pk.key}, ${c.url}, ${pk.needsResolution}) RETURNING id`;
        compId = row!.id; map.set(mk, compId); byUrl.set(urlk, compId); inserted++;
      }
      const r = await sql`INSERT INTO project_competitors (project_id, competitor_account_id)
        VALUES (${ch.id}, ${compId}) ON CONFLICT DO NOTHING`;
      links += r.count;
    }
  }
  console.log(`Stage A: +${inserted} competitor_accounts, +${links} project links, ${bad.length} bad${bad.length ? " (" + bad.join(", ") + ")" : ""}`);

  // ---- Stage B: resolve -> UC, merge collisions ----
  const pending = await sql<{ id: string; user_id: string; platform: string; url: string }[]>`
    SELECT id, user_id, platform, url FROM competitor_accounts WHERE needs_resolution = true AND deleted_at IS NULL`;
  let resolved = 0, merged = 0, failed = 0;
  for (const row of pending) {
    let uc: string;
    try { uc = await resolveChannelId(row.url); }
    catch (e) { failed++; console.log(`  resolve fail ${row.url}: ${(e as Error).message.slice(0, 70)}`); continue; }
    if (!uc || !uc.startsWith("UC")) { failed++; console.log(`  non-UC for ${row.url}: ${uc}`); continue; }
    const [dup] = await sql<{ id: string }[]>`
      SELECT id FROM competitor_accounts WHERE user_id=${row.user_id} AND platform=${row.platform}
        AND platform_key=${uc} AND id <> ${row.id} AND deleted_at IS NULL LIMIT 1`;
    if (dup) {
      await sql`INSERT INTO project_competitors (project_id, competitor_account_id)
        SELECT project_id, ${dup.id} FROM project_competitors WHERE competitor_account_id=${row.id} ON CONFLICT DO NOTHING`;
      await sql`DELETE FROM project_competitors WHERE competitor_account_id=${row.id}`;
      await sql`UPDATE clerk_sops SET competitor_account_id=${dup.id} WHERE competitor_account_id=${row.id}`;
      await sql`UPDATE muse_monitor_videos SET competitor_account_id=${dup.id} WHERE competitor_account_id=${row.id}`;
      await sql`DELETE FROM competitor_accounts WHERE id=${row.id}`;
      merged++;
    } else {
      await sql`UPDATE competitor_accounts SET platform_key=${uc}, needs_resolution=false, updated_at=now() WHERE id=${row.id}`;
      resolved++;
    }
  }
  console.log(`Stage B: resolved ${resolved}, merged ${merged}, failed ${failed}`);

  // ---- Metadata (best-effort) ----
  const noName = await sql<{ id: string; platform: string; url: string; platform_key: string }[]>`
    SELECT id, platform, url, platform_key FROM competitor_accounts WHERE name IS NULL AND deleted_at IS NULL AND needs_resolution = false`;
  let named = 0, nameFail = 0;
  for (const row of noName) {
    try {
      if (row.platform === "xhs") {
        const u = await resolveXhsUser(row.url);
        await sql`UPDATE competitor_accounts SET name=${u.nickname || null}, subscriber_count=${u.fansCount || null}, avatar_url=${u.avatarUrl || null}, last_verified_at=now(), updated_at=now() WHERE id=${row.id}`;
      } else {
        const info = await getChannelInfo(row.platform_key);
        await sql`UPDATE competitor_accounts SET name=${info.channel_name || null}, subscriber_count=${info.subscriberCount}, avatar_url=${info.thumbnail_url}, last_verified_at=now(), updated_at=now() WHERE id=${row.id}`;
      }
      named++;
    } catch { nameFail++; }
  }
  console.log(`Metadata: named ${named}, failed ${nameFail}`);

  // ---- Historical muse provenance (best-effort, by source name) ----
  const histo = await sql`
    UPDATE muse_monitor_videos m SET competitor_account_id = ca.id
    FROM competitor_accounts ca, channels c
    WHERE m.competitor_account_id IS NULL AND m.channel_id = c.id
      AND ca.user_id = c.user_id AND ca.deleted_at IS NULL AND ca.name IS NOT NULL
      AND lower(m.source_channel_name) = lower(ca.name)`;
  console.log(`Historical muse provenance: ${histo.count} rows`);

  // ---- VERIFY ----
  const dups = await sql`SELECT user_id, platform, platform_key, count(*) AS n FROM competitor_accounts WHERE deleted_at IS NULL GROUP BY 1,2,3 HAVING count(*) > 1`;
  const [tot] = await sql<{ n: number; unresolved: number; named: number }[]>`
    SELECT count(*)::int AS n, count(*) FILTER (WHERE needs_resolution)::int AS unresolved, count(*) FILTER (WHERE name IS NOT NULL)::int AS named
    FROM competitor_accounts WHERE deleted_at IS NULL`;
  const [pl] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM project_competitors`;
  console.log(`competitor_accounts=${tot!.n} (unresolved=${tot!.unresolved}, named=${tot!.named}), project_competitors=${pl!.n}, dup-keys=${dups.length} (expect 0)`);
} finally {
  await sql.end();
}
