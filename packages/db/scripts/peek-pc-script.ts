// Read-only: confirm a generated script's SOP linkage (P-B chain: competitor
// SOP followed by Poet) and dump its text for quality review.
// Run: pnpm --filter @singularity/db exec tsx scripts/peek-pc-script.ts <scriptId>
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const scriptId = process.argv[2];
try {
  const [s] = await sql<
    {
      id: string;
      sop_id: string | null;
      sop_owner: string | null;
      word_count: number | null;
      duration_seconds: number | null;
      script_text: string;
    }[]
  >`SELECT ps.id, ps.sop_id,
      CASE WHEN cs.competitor_account_id IS NOT NULL THEN 'competitor:' || ca.name
           WHEN cs.channel_id IS NOT NULL THEN 'own:' || ch.name END AS sop_owner,
      ps.word_count, ps.duration_seconds, ps.script_text
    FROM poet_scripts ps
    LEFT JOIN clerk_sops cs ON cs.id = ps.sop_id
    LEFT JOIN channels ch ON ch.id = cs.channel_id
    LEFT JOIN competitor_accounts ca ON ca.id = cs.competitor_account_id
    WHERE ps.id = ${scriptId!}`;
  if (!s) throw new Error("script not found");
  console.log(`sop_id: ${s.sop_id}\nsop_owner: ${s.sop_owner}\nwords: ${s.word_count} duration: ${s.duration_seconds}s`);
  console.log("--- script ---");
  console.log(s.script_text);
} finally {
  await sql.end();
}
