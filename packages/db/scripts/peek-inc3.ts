// Dump INC3 owner-column + project_sops state for one channel/project (id is shared).
// Run: pnpm --filter @singularity/db exec tsx scripts/peek-inc3.ts <channelId>
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const id = process.argv[2];
if (!id) {
  console.error("usage: peek-inc3.ts <channelId>");
  process.exit(1);
}
const ok = (n: number, total: number) => (n === total ? "✓" : "✗");
try {
  const [v] = await sql<{ total: number; owned: number; self: number }[]>`
    SELECT count(*)::int total, count(own_account_id)::int owned,
      count(*) FILTER (WHERE own_account_id = ${id})::int self FROM clerk_videos WHERE channel_id=${id}`;
  console.log(`clerk_videos:  total=${v!.total} own_account_id set=${v!.owned} ${ok(v!.owned, v!.total)}  ==channel:${v!.self} ${ok(v!.self, v!.total)}`);

  const sops = await sql<{ sop_type: string; id: string; owned: boolean; run_id: string | null; gen: string }[]>`
    SELECT sop_type, id, (own_account_id = ${id}) owned, run_id, to_char(generated_at,'MM-DD HH24:MI') gen
    FROM clerk_sops WHERE channel_id=${id} ORDER BY sop_type, generated_at DESC`;
  console.log(`clerk_sops: ${sops.length} rows`);
  for (const s of sops) console.log(`  ${s.sop_type.padEnd(13)} id=${s.id.slice(0, 8)} own✓=${s.owned} run=${s.run_id ? s.run_id.slice(0, 8) : "NULL"} @${s.gen}`);

  const ps = await sql<{ role: string; sop_id: string; sop_type: string | null }[]>`
    SELECT ps.role, ps.sop_id, cs.sop_type
    FROM project_sops ps LEFT JOIN clerk_sops cs ON cs.id = ps.sop_id
    WHERE ps.project_id=${id} ORDER BY ps.role`;
  const primary = ps.filter((r) => r.role === "primary");
  console.log(`project_sops: ${ps.length} bindings, primary=${primary.length} ${ok(primary.length, 1)} (expect 1)`);
  for (const r of ps) console.log(`  ${r.role.padEnd(9)} -> ${r.sop_id.slice(0, 8)} (${r.sop_type ?? "DANGLING!"})`);

  const [b] = await sql<{ total: number; owned: number }[]>`
    SELECT count(*)::int total, count(*) FILTER (WHERE own_account_id=${id})::int owned FROM poet_bible WHERE channel_id=${id}`;
  console.log(`poet_bible:    total=${b!.total} own==channel=${b!.owned}`);

  const [t] = await sql<{ total: number; owned: number }[]>`
    SELECT count(*)::int total, count(*) FILTER (WHERE project_id=${id})::int owned FROM poet_custom_topics WHERE channel_id=${id}`;
  console.log(`custom_topics: total=${t!.total} project_id==channel=${t!.owned}`);

  const scripts = await sql<{ id: string; project_id: string | null; sop_id: string | null; bible_id: string | null; words: number | null; gen: string }[]>`
    SELECT id, project_id, sop_id, bible_id, word_count words, to_char(generated_at,'MM-DD HH24:MI') gen
    FROM poet_scripts WHERE channel_id=${id} ORDER BY generated_at DESC LIMIT 3`;
  console.log(`poet_scripts (latest ${scripts.length}):`);
  for (const s of scripts) console.log(`  id=${s.id.slice(0, 8)} proj=${s.project_id ? s.project_id.slice(0, 8) : "NULL"} sop=${s.sop_id ? s.sop_id.slice(0, 8) : "NULL"} bible=${s.bible_id ? s.bible_id.slice(0, 8) : "NULL"} words=${s.words} @${s.gen}`);
} finally {
  await sql.end();
}
