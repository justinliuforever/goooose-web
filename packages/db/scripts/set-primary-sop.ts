// Mirrors sops.setPrimary (routers.ts): delete the project's current primary
// binding, upsert the new one. Used to drive the P-B chain test headlessly.
// Run: pnpm --filter @singularity/db exec tsx scripts/set-primary-sop.ts <projectId> <sopId>
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const [projectId, sopId] = process.argv.slice(2);
if (!projectId || !sopId) {
  console.error("usage: set-primary-sop.ts <projectId> <sopId>");
  process.exit(1);
}
try {
  await sql.begin(async (tx) => {
    await tx`DELETE FROM project_sops WHERE project_id = ${projectId} AND role = 'primary'`;
    await tx`
      INSERT INTO project_sops (project_id, sop_id, role)
      VALUES (${projectId}, ${sopId}, 'primary')
      ON CONFLICT (project_id, sop_id) DO UPDATE SET role = 'primary'`;
  });
  const [resolved] = await sql<{ id: string }[]>`
    SELECT cs.id FROM project_sops ps
    JOIN clerk_sops cs ON cs.id = ps.sop_id
    WHERE ps.project_id = ${projectId} AND ps.role = 'primary'
    ORDER BY cs.generated_at DESC, cs.id DESC LIMIT 1`;
  console.log(`primary now: ${resolved?.id}`);
} finally {
  await sql.end();
}
