// INC5a logic gate: a re-import of any existing competitor must dedup — i.e. the two-stage
// key (provisional + Stage B resolveChannelId for YouTube handles) must equal the stored
// platform_key. Also confirms the D3 spine covers every channel. Read-only except none.
// Run: pnpm --filter @singularity/db exec tsx scripts/verify-inc5a-dedup.ts
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";
import { provisionalCompetitorKey } from "@singularity/shared/services/competitors";
import { resolveChannelId } from "@singularity/shared/clients/tikhub";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

try {
  const comps = await sql<
    { id: string; platform: "youtube" | "xhs"; url: string; platform_key: string }[]
  >`SELECT id, platform, url, platform_key FROM competitor_accounts WHERE deleted_at IS NULL`;
  let match = 0;
  const bad: string[] = [];
  for (const c of comps) {
    const pk = provisionalCompetitorKey(c.platform, c.url);
    if (!pk) { bad.push(`null-key ${c.platform} ${c.url}`); continue; }
    let key = pk.key;
    if (pk.needsResolution) {
      try { const uc = await resolveChannelId(c.url); if (uc?.startsWith("UC")) key = uc; }
      catch { /* leave provisional */ }
    }
    if (key === c.platform_key) match++;
    else bad.push(`${c.platform} stored=${c.platform_key.slice(0, 16)} computed=${key.slice(0, 16)} (${c.url.slice(0, 40)})`);
  }
  console.log(`competitor re-import dedup: ${match}/${comps.length} keys match stored (mismatch=${bad.length})`);
  if (bad.length) console.log("  " + bad.join("\n  "));

  const [spine] = await sql<{ ch: number; oa: number; pj: number; spine: number }[]>`
    SELECT (SELECT count(*)::int FROM channels) ch,
           (SELECT count(*)::int FROM own_accounts) oa,
           (SELECT count(*)::int FROM projects) pj,
           (SELECT count(*)::int FROM channels c WHERE EXISTS (SELECT 1 FROM projects p WHERE p.id=c.id) AND EXISTS (SELECT 1 FROM own_accounts o WHERE o.id=c.id)) spine`;
  console.log(`spine: channels=${spine!.ch} own_accounts=${spine!.oa} projects=${spine!.pj}; channels with full spine=${spine!.spine}/${spine!.ch}`);
} finally {
  await sql.end();
}
