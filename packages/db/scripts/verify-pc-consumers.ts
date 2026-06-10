// Read-only: mirrors the P-C consumer read paths (dashboard activity feed,
// global runs indicator listActiveAll) to prove competitor runs are visible
// with a resolvable target name and deep-link fields.
// Run: pnpm --filter @singularity/db exec tsx scripts/verify-pc-consumers.ts
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

try {
  // Activity-feed mirror: latest 10 clerk/poet/muse runs with coalesced target.
  const rows = await sql<
    {
      id: string;
      agent: string;
      status: string;
      target_name: string | null;
      channel_slug: string | null;
      competitor_account_id: string | null;
    }[]
  >`SELECT pr.id, pr.agent, pr.status,
      coalesce(ch.name, ca.name, ca.url) AS target_name,
      ch.slug AS channel_slug, pr.competitor_account_id
    FROM pipeline_runs pr
    LEFT JOIN channels ch ON ch.id = pr.channel_id
    LEFT JOIN competitor_accounts ca ON ca.id = pr.competitor_account_id
    ORDER BY pr.started_at DESC LIMIT 10`;
  console.log("latest runs:");
  for (const r of rows)
    console.log(
      `  ${r.id.slice(0, 8)} [${r.agent}/${r.status}] target=${r.target_name} ${r.competitor_account_id ? `competitor=${r.competitor_account_id.slice(0, 8)}` : `slug=${r.channel_slug}`}`,
    );

  check(
    "every recent run resolves a target name",
    rows.every((r) => !!r.target_name),
    `${rows.filter((r) => !r.target_name).length} unresolved`,
  );
  const compRuns = rows.filter((r) => r.competitor_account_id != null);
  check(
    "competitor runs present and carry deep-link id (no channel slug)",
    compRuns.length > 0 && compRuns.every((r) => r.channel_slug === null),
    `${compRuns.length} competitor runs in latest 10`,
  );

  // Orphan scan: any run header pointing at a deleted owner would vanish from
  // every consumer — the exact "隐身" bug class P-C §4 guards against.
  const [orphans] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM pipeline_runs pr
    LEFT JOIN channels ch ON ch.id = pr.channel_id
    LEFT JOIN competitor_accounts ca ON ca.id = pr.competitor_account_id
    WHERE ch.id IS NULL AND ca.id IS NULL`;
  check("0 runs with unresolvable owner", orphans!.n === 0, `${orphans!.n} orphaned`);

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
} finally {
  await sql.end();
}
