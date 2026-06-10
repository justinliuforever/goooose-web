// INC2a deterministic backfill (idempotent, transactional). own_accounts.id == projects.id
// == channels.id (D3 spine), so every owner column is a trivial self-copy. Competitor
// extraction (Stage A/B) is a separate script (needs the URL helpers / network).
// Run: pnpm --filter @singularity/db exec tsx scripts/backfill-inc2.ts
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

try {
  await sql.begin(async (tx) => {
    // 1) own_accounts: one per channel, same id (preserve channel timestamps).
    await tx`INSERT INTO own_accounts (id, user_id, name, slug, platform, platform_url, platform_channel_id, description, created_at, updated_at)
      SELECT id, user_id, name, slug, platform, platform_url, platform_channel_id, description, created_at, updated_at FROM channels
      ON CONFLICT (id) DO NOTHING`;

    // 2) projects: one default per channel, same id; own_account_id = same id; seed
    //    target duration from the channel's most-common existing duration (fallback 300);
    //    pin the active Bible (<=1 guaranteed by the 0010 index).
    await tx`INSERT INTO projects (id, own_account_id, user_id, name, slug, platform, target_duration_seconds, active_bible_id, created_at, updated_at)
      SELECT c.id, c.id, c.user_id, c.name, c.slug, c.platform,
        COALESCE((
          SELECT d FROM (
            SELECT duration_seconds AS d, generated_at AS ts FROM poet_scripts WHERE channel_id = c.id AND duration_seconds IS NOT NULL
            UNION ALL
            SELECT duration_seconds AS d, updated_at AS ts FROM poet_custom_topics WHERE channel_id = c.id AND duration_seconds IS NOT NULL
          ) u GROUP BY d ORDER BY count(*) DESC, max(ts) DESC LIMIT 1
        ), 300),
        (SELECT b.id FROM poet_bible b WHERE b.channel_id = c.id AND b.is_active LIMIT 1),
        now(), now()
      FROM channels c ON CONFLICT (id) DO NOTHING`;

    // 3) owner self-copies (fill NULLs only -> idempotent).
    await tx`UPDATE poet_bible SET own_account_id = channel_id WHERE own_account_id IS NULL`;
    await tx`UPDATE poet_drift_events SET own_account_id = channel_id WHERE own_account_id IS NULL`;
    await tx`UPDATE clerk_videos SET own_account_id = channel_id WHERE own_account_id IS NULL`;
    await tx`UPDATE channel_series SET own_account_id = channel_id WHERE own_account_id IS NULL`;
    await tx`UPDATE clerk_sops SET own_account_id = channel_id WHERE own_account_id IS NULL`;
    await tx`UPDATE poet_custom_topics SET project_id = channel_id WHERE project_id IS NULL`;
    await tx`UPDATE poet_scripts SET project_id = channel_id WHERE project_id IS NULL`;
    await tx`UPDATE muse_monitor_videos SET project_id = channel_id WHERE project_id IS NULL`;
    await tx`UPDATE muse_ideas SET project_id = channel_id WHERE project_id IS NULL`;
    await tx`UPDATE pipeline_runs SET project_id = channel_id, own_account_id = channel_id WHERE project_id IS NULL`;

    // 4) project_sops: bind each channel's SOPs to its default project; ai_reference = primary.
    await tx`INSERT INTO project_sops (project_id, sop_id, role)
      SELECT channel_id, id, (CASE WHEN sop_type = 'ai_reference' THEN 'primary' ELSE 'reference' END)::project_sop_role FROM clerk_sops
      ON CONFLICT (project_id, sop_id) DO NOTHING`;

    // Keep a single primary SOP per project: demote older duplicate ai_reference rows
    // (historical pre-atomic-swap leftovers) to 'reference', keeping the most recent.
    await tx`UPDATE project_sops ps SET role = 'reference'
      WHERE ps.role = 'primary' AND (ps.project_id, ps.sop_id) IN (
        SELECT project_id, sop_id FROM (
          SELECT p.project_id, p.sop_id, row_number() OVER (PARTITION BY p.project_id ORDER BY cs.generated_at DESC, cs.id DESC) AS rn
          FROM project_sops p JOIN clerk_sops cs ON cs.id = p.sop_id WHERE p.role = 'primary'
        ) r WHERE r.rn > 1
      )`;
  });

  // ---- VERIFY ----
  const [ch] = await sql`SELECT count(*)::int n FROM channels`;
  const [oa] = await sql`SELECT count(*)::int n FROM own_accounts`;
  const [pr] = await sql`SELECT count(*)::int n FROM projects`;
  console.log(`own_accounts=${oa.n} projects=${pr.n} (expect == channels=${ch.n})`);

  const nulls = await sql`
    SELECT 'poet_bible' AS t, count(*) FILTER (WHERE own_account_id IS NULL)::int AS n FROM poet_bible
    UNION ALL SELECT 'clerk_videos', count(*) FILTER (WHERE own_account_id IS NULL)::int FROM clerk_videos
    UNION ALL SELECT 'clerk_sops', count(*) FILTER (WHERE own_account_id IS NULL)::int FROM clerk_sops
    UNION ALL SELECT 'channel_series', count(*) FILTER (WHERE own_account_id IS NULL)::int FROM channel_series
    UNION ALL SELECT 'poet_drift_events', count(*) FILTER (WHERE own_account_id IS NULL)::int FROM poet_drift_events
    UNION ALL SELECT 'poet_custom_topics', count(*) FILTER (WHERE project_id IS NULL)::int FROM poet_custom_topics
    UNION ALL SELECT 'poet_scripts', count(*) FILTER (WHERE project_id IS NULL)::int FROM poet_scripts
    UNION ALL SELECT 'muse_monitor_videos', count(*) FILTER (WHERE project_id IS NULL)::int FROM muse_monitor_videos
    UNION ALL SELECT 'muse_ideas', count(*) FILTER (WHERE project_id IS NULL)::int FROM muse_ideas
    UNION ALL SELECT 'pipeline_runs', count(*) FILTER (WHERE project_id IS NULL)::int FROM pipeline_runs`;
  const bad = nulls.filter((r) => r.n > 0);
  console.log(`owner-col NULLs remaining: ${bad.length === 0 ? "0 (all backfilled ✓)" : JSON.stringify(bad)}`);

  const [pinned] = await sql`SELECT count(*) FILTER (WHERE active_bible_id IS NOT NULL)::int AS withbible, count(*)::int AS total FROM projects`;
  console.log(`projects with active_bible pinned: ${pinned.withbible}/${pinned.total}`);
  const dur = await sql`SELECT target_duration_seconds AS d, count(*)::int AS n FROM projects GROUP BY d ORDER BY n DESC`;
  console.log(`project durations: ${dur.map((r) => `${r.d}s×${r.n}`).join(", ")}`);

  const [ps] = await sql`SELECT count(*) FILTER (WHERE role='primary')::int AS prim, count(*)::int AS total FROM project_sops`;
  const [sopcount] = await sql`SELECT count(*)::int n FROM clerk_sops`;
  console.log(`project_sops: ${ps.total} bindings (${ps.prim} primary) from ${sopcount.n} SOPs`);

  const [xor] = await sql`SELECT count(*)::int n FROM poet_scripts WHERE (idea_id IS NULL) = (custom_topic_id IS NULL)`;
  console.log(`poet_scripts XOR violations: ${xor.n} (expect 0)`);
} finally {
  await sql.end();
}
