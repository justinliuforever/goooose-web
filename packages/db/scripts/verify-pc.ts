// P-C acceptance gate (read-only): one-owner CHECKs validated, zero violating rows,
// competitor dedup index present, competitor-run stamps consistent end to end.
// Run: pnpm --filter @singularity/db exec tsx scripts/verify-pc.ts [competitorAccountId]
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✓" : "✗ FAIL"} ${label}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
}

const compId = process.argv[2];

try {
  // 1. CHECK constraints exist and are validated.
  const cons = await sql<{ conrelid: string; conname: string; convalidated: boolean }[]>`
    SELECT conrelid::regclass::text AS conrelid, conname, convalidated
    FROM pg_constraint WHERE conname IN ('clerk_videos_one_owner','clerk_sops_one_owner','pipeline_runs_one_owner')`;
  for (const t of ["clerk_videos", "clerk_sops", "pipeline_runs"]) {
    const c = cons.find((x) => x.conrelid === t);
    check(`${t}_one_owner CHECK exists + validated`, !!c && c.convalidated);
  }

  // 2. Zero rows violating exactly-one-owner (and own pairing) across all three tables.
  const [v1] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM clerk_videos
    WHERE num_nonnulls(own_account_id, competitor_account_id) != 1
       OR (own_account_id IS NULL) != (channel_id IS NULL)`;
  const [v2] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM clerk_sops
    WHERE num_nonnulls(own_account_id, competitor_account_id) != 1
       OR (own_account_id IS NULL) != (channel_id IS NULL)`;
  const [v3] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM pipeline_runs
    WHERE agent = 'clerk' AND num_nonnulls(channel_id, competitor_account_id) != 1`;
  check("clerk_videos: 0 owner violations", v1!.n === 0, `${v1!.n} bad`);
  check("clerk_sops: 0 owner violations", v2!.n === 0, `${v2!.n} bad`);
  check("pipeline_runs(clerk): 0 owner violations", v3!.n === 0, `${v3!.n} bad`);

  // Non-clerk runs must remain channel-owned only (P-C touches clerk runs only).
  const [v4] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM pipeline_runs WHERE agent != 'clerk' AND competitor_account_id IS NOT NULL`;
  check("pipeline_runs(non-clerk): no competitor stamps", v4!.n === 0, `${v4!.n} bad`);

  // 3. Competitor dedup arbiter index present (unique, partial).
  const idx = await sql<{ indexname: string; indexdef: string }[]>`
    SELECT indexname, indexdef FROM pg_indexes WHERE indexname = 'clerk_videos_competitor_video_unique'`;
  check(
    "clerk_videos_competitor_video_unique partial unique index",
    idx.length === 1 && idx[0]!.indexdef.includes("UNIQUE") && idx[0]!.indexdef.toLowerCase().includes("where"),
  );

  // 4. Competitor-side dedup: no duplicate (competitor, platform_video_id) pairs.
  const [dups] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM (
      SELECT competitor_account_id, platform_video_id FROM clerk_videos
      WHERE competitor_account_id IS NOT NULL
      GROUP BY 1, 2 HAVING count(*) > 1) d`;
  check("competitor videos: 0 dedup twins", dups!.n === 0, `${dups!.n} dup pairs`);

  if (compId) {
    // 5. Per-target reconciliation for the test run.
    const videos = await sql<
      { n: number; null_chan: number; null_own: number }[]
    >`SELECT count(*)::int AS n,
        count(*) FILTER (WHERE channel_id IS NULL)::int AS null_chan,
        count(*) FILTER (WHERE own_account_id IS NULL)::int AS null_own
      FROM clerk_videos WHERE competitor_account_id = ${compId}`;
    const v = videos[0]!;
    check(`target videos stamped competitor-only`, v.n > 0 && v.null_chan === v.n && v.null_own === v.n, `${v.n} rows`);

    const sops = await sql<{ sop_type: string; chan: string | null }[]>`
      SELECT sop_type, channel_id::text AS chan FROM clerk_sops WHERE competitor_account_id = ${compId}`;
    const types = sops.map((s) => s.sop_type).sort();
    check(
      `target SOPs present (3 types) + channel NULL`,
      types.join(",") === "ai_reference,hottest,human" && sops.every((s) => s.chan === null),
      types.join(",") || "none",
    );

    const runs = await sql<{ id: string; status: string; chan: string | null }[]>`
      SELECT id, status, channel_id::text AS chan FROM pipeline_runs
      WHERE competitor_account_id = ${compId} ORDER BY started_at DESC`;
    check(
      `target run rows competitor-owned, latest done`,
      runs.length > 0 && runs[0]!.status === "done" && runs.every((r) => r.chan === null),
      runs.map((r) => `${r.id.slice(0, 8)}=${r.status}`).join(" "),
    );

    // 6. Competitor SOPs must NOT be auto-bound to any project (own-only gate).
    const [bound] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM project_sops ps
      JOIN clerk_sops cs ON cs.id = ps.sop_id
      WHERE cs.competitor_account_id = ${compId}`;
    check("no auto project_sops binding for competitor SOPs", bound!.n === 0, `${bound!.n} bindings`);

    // 7. Picker-equivalent query (mirrors sops.pickerList): competitor SOP visible with kind.
    const picker = await sql<{ id: string; source_name: string; source_kind: string }[]>`
      SELECT cs.id, coalesce(ch.name, ca.name, ca.url, '未知来源') AS source_name,
        CASE WHEN cs.channel_id IS NOT NULL THEN 'own' ELSE 'competitor' END AS source_kind
      FROM clerk_sops cs
      LEFT JOIN channels ch ON ch.id = cs.channel_id
      LEFT JOIN competitor_accounts ca ON ca.id = cs.competitor_account_id
      WHERE cs.sop_type = 'ai_reference' AND cs.competitor_account_id = ${compId}`;
    check(
      "pickerList-equivalent surfaces competitor ai_reference SOP",
      picker.length === 1 && picker[0]!.source_kind === "competitor" && !!picker[0]!.source_name,
      picker[0] ? `${picker[0].source_name} (${picker[0].source_kind})` : "none",
    );
  }

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
} finally {
  await sql.end();
}
