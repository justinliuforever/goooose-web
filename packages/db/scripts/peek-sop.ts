// READ-ONLY: latest SOPs for 表叔王寂 XHS to check grounding didn't gut grounded content.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
const rows = await sql`SELECT DISTINCT ON (sop_type) sop_type, content_md, updated_at FROM clerk_sops WHERE channel_id='115a3d60-162f-4482-a121-fb52e883966b' ORDER BY sop_type, updated_at DESC`;
for (const r of rows) console.log(`===${r.sop_type} (${(r.content_md ?? "").length} chars, ${r.updated_at})===`);
const ai = rows.find((r) => r.sop_type === "ai_reference");
console.log("\n--- ai_reference head ---\n" + (ai?.content_md ?? "").slice(0, 700));
await sql.end();
