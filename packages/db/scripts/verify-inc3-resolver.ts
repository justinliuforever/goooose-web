// INC3 read-only logic gate: resolvePrimarySop must equal the legacy ai_reference
// query for every project, and project_sops must hold <=1 primary per project.
// Run: pnpm --filter @singularity/db exec tsx scripts/verify-inc3-resolver.ts
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, desc, eq } from "drizzle-orm";
import { clerkSops } from "../src/schema/clerk";
import { projects } from "../src/schema/project";
import { resolvePrimarySop } from "../src/queries/sop";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);

try {
  const allProjects = await db.select({ id: projects.id, name: projects.name }).from(projects);
  let match = 0, bothNull = 0, mismatch = 0, resolverOnly = 0, legacyOnly = 0;
  const problems: string[] = [];
  for (const p of allProjects) {
    const resolved = await resolvePrimarySop(db, p.id);
    const [legacy] = await db
      .select({ id: clerkSops.id })
      .from(clerkSops)
      .where(and(eq(clerkSops.channelId, p.id), eq(clerkSops.sopType, "ai_reference")))
      .orderBy(desc(clerkSops.generatedAt))
      .limit(1);
    const r = resolved?.id ?? null;
    const l = legacy?.id ?? null;
    if (r === l) {
      if (r === null) bothNull++;
      else match++;
    } else {
      mismatch++;
      if (r && !l) resolverOnly++;
      if (!r && l) legacyOnly++;
      problems.push(`  ${p.name}: resolver=${r?.slice(0, 8) ?? "null"} legacy=${l?.slice(0, 8) ?? "null"}`);
    }
  }
  console.log(`projects=${allProjects.length} match=${match} bothNull=${bothNull} mismatch=${mismatch} (resolverOnly=${resolverOnly}, legacyOnly=${legacyOnly})`);
  if (problems.length) console.log("MISMATCHES:\n" + problems.join("\n"));

  const dupPrimary = await client`
    SELECT project_id, count(*) AS n FROM project_sops WHERE role='primary' GROUP BY project_id HAVING count(*) > 1`;
  const [summ] = await client<{ total: number; primary: number; reference: number }[]>`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE role='primary')::int AS primary,
           count(*) FILTER (WHERE role='reference')::int AS reference
    FROM project_sops`;
  console.log(`project_sops: total=${summ!.total} primary=${summ!.primary} reference=${summ!.reference}; projects with >1 primary=${dupPrimary.length} (expect 0)`);
} finally {
  await client.end();
}
