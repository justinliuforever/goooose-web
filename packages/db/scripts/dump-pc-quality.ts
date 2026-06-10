// Read-only: dump a competitor's SOPs + a script to /tmp for quality review.
// Run: pnpm --filter @singularity/db exec tsx scripts/dump-pc-quality.ts <competitorAccountId> [scriptId]
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const [compId, scriptId] = process.argv.slice(2);
try {
  const sops = await sql<{ sop_type: string; content_md: string }[]>`
    SELECT sop_type, content_md FROM clerk_sops WHERE competitor_account_id = ${compId!}`;
  for (const s of sops) writeFileSync(`/tmp/pc-sop-${s.sop_type}.md`, s.content_md);
  if (scriptId) {
    const [script] = await sql<{ script_text: string }[]>`
      SELECT script_text FROM poet_scripts WHERE id = ${scriptId}`;
    if (script) writeFileSync("/tmp/pc-test-script.md", script.script_text);
  }
  console.log("dumped:", sops.map((s) => s.sop_type).join(", "), scriptId ? "+ script" : "");
} finally {
  await sql.end();
}
