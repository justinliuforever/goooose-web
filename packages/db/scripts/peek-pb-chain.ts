// Read-only: P-B chain recon for a project — its topics, current primary SOP
// binding, and a target competitor's SOP ids.
// Run: pnpm --filter @singularity/db exec tsx scripts/peek-pb-chain.ts <projectId> <competitorAccountId>
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const [projectId, compId] = process.argv.slice(2);
try {
  const topics = await sql`
    SELECT id, topic, status, language, duration_seconds FROM poet_custom_topics
    WHERE channel_id = ${projectId!} ORDER BY created_at DESC LIMIT 6`;
  console.log("topics:");
  for (const t of topics)
    console.log(`  ${t.id}  [${t.status}] ${t.language}/${t.duration_seconds}s ${t.topic}`);

  const bindings = await sql`
    SELECT ps.sop_id, ps.role, cs.sop_type, coalesce(ch.name, ca.name) AS source
    FROM project_sops ps
    JOIN clerk_sops cs ON cs.id = ps.sop_id
    LEFT JOIN channels ch ON ch.id = cs.channel_id
    LEFT JOIN competitor_accounts ca ON ca.id = cs.competitor_account_id
    WHERE ps.project_id = ${projectId!}`;
  console.log("project_sops bindings:");
  for (const b of bindings) console.log(`  ${b.sop_id}  role=${b.role} type=${b.sop_type} source=${b.source}`);
  if (bindings.length === 0) console.log("  (none — resolver falls back to own ai_reference)");

  if (compId) {
    const sops = await sql`
      SELECT id, sop_type, generated_at FROM clerk_sops WHERE competitor_account_id = ${compId}`;
    console.log("competitor SOPs:");
    for (const s of sops) console.log(`  ${s.id}  ${s.sop_type}  ${s.generated_at}`);
  }
} finally {
  await sql.end();
}
