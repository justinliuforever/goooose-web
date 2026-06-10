import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name} — ${detail}`);
  if (!ok) failures++;
}

try {
  // 1. 对账: every channel with legacy JSONB competitors has >= that many live project_competitors.
  const cov = await client`
    select c.slug, jsonb_array_length(c.competitors) jn,
      (select count(*)::int from project_competitors pc
        join competitor_accounts ca on ca.id = pc.competitor_account_id
        where pc.project_id = c.id and ca.deleted_at is null) pcn
    from channels c
    where jsonb_array_length(c.competitors) > 0`;
  const uncovered = cov.filter((r) => Number(r.pcn) < Number(r.jn));
  check(
    "JSONB→project_competitors coverage",
    uncovered.length === 0,
    uncovered.length === 0
      ? `${cov.length} channels with legacy competitors all covered`
      : `uncovered: ${uncovered.map((r) => `${r.slug}(json=${r.jn},live=${r.pcn})`).join(", ")} — note: live<json can be legit post-dedup; listed for manual review`,
  );

  // 2. Null counts on owner columns about to go NOT NULL.
  const cols: Array<[string, string]> = [
    ["clerk_videos", "own_account_id"],
    ["clerk_sops", "own_account_id"],
    ["poet_bible", "own_account_id"],
    ["poet_drift_events", "own_account_id"],
    ["muse_monitor_videos", "project_id"],
    ["muse_ideas", "project_id"],
    ["poet_custom_topics", "project_id"],
    ["poet_scripts", "project_id"],
  ];
  for (const [table, col] of cols) {
    const [r] = await client.unsafe(
      `select count(*)::int n from ${table} where ${col} is null`,
    );
    check(`${table}.${col} nulls`, Number(r!.n) === 0, `${r!.n} null rows`);
  }

  // 3. Owner-unique twins must not collide (expand phase: owner == channel, so 0 expected).
  const [cv] = await client`
    select count(*)::int n from (
      select own_account_id, platform_video_id from clerk_videos
      group by 1,2 having count(*) > 1) d`;
  check("clerk_videos owner-unique precheck", Number(cv!.n) === 0, `${cv!.n} duplicate groups`);
  const [mv] = await client`
    select count(*)::int n from (
      select project_id, platform_video_id from muse_monitor_videos
      group by 1,2 having count(*) > 1) d`;
  check("muse_monitor_videos owner-unique precheck", Number(mv!.n) === 0, `${mv!.n} duplicate groups`);

  // 4. §2.6 spot re-asserts: projects 1:1 channels; single active bible; XOR check.
  const [pc] = await client`
    select (select count(*)::int from channels) cn, (select count(*)::int from projects) pn`;
  check("projects 1:1 channels", Number(pc!.cn) === Number(pc!.pn), `channels=${pc!.cn} projects=${pc!.pn}`);
  const [ab] = await client`
    select count(*)::int n from (
      select channel_id from poet_bible where is_active group by 1 having count(*) > 1) d`;
  check(">1 active bible", Number(ab!.n) === 0, `${ab!.n} channels with multiple active`);
  const [xr] = await client`
    select count(*)::int n from poet_scripts where (idea_id is null) = (custom_topic_id is null)`;
  check("poet_scripts XOR source", Number(xr!.n) === 0, `${xr!.n} violations`);

  // 5. Informational: duration_minutes rows that still carry data (we drop the column; values
  //    were superseded by duration_seconds).
  const [dm1] = await client`select count(*)::int n from poet_custom_topics where duration_minutes is not null and duration_seconds is null`;
  const [dm2] = await client`select count(*)::int n from poet_scripts where duration_minutes is not null and duration_seconds is null`;
  check(
    "duration_minutes superseded",
    Number(dm1!.n) === 0 && Number(dm2!.n) === 0,
    `topics minutes-only=${dm1!.n}, scripts minutes-only=${dm2!.n} (must be 0 or needs backfill minutes*60)`,
  );

  console.log(failures === 0 ? "\nALL CHECKS PASSED — safe to migrate" : `\n${failures} CHECK(S) FAILED — fix before migrating`);
  process.exit(failures === 0 ? 0 : 1);
} finally {
  await client.end();
}
