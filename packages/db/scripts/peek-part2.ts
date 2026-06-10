// READ-ONLY: validate Part-2 fixes (no-transcript guard, garble cleanup, fact-fix).
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
const fg = await sql`SELECT DISTINCT ON (sop_type) sop_type, content_md FROM clerk_sops WHERE channel_id='ba2ed94c-2081-46ff-932e-b04073d8c04d' ORDER BY sop_type, updated_at DESC`;
console.log("===FANGAO_SOPS===");
for (const r of fg) console.log(`<<${r.sop_type}>>\n${r.content_md}`);
const ts = await sql`SELECT content_md FROM clerk_sops WHERE channel_id='115a3d60-162f-4482-a121-fb52e883966b' ORDER BY updated_at DESC LIMIT 3`;
console.log("===BIAOSHU_SOPS===");
console.log(ts.map((r) => r.content_md).join("\n\n"));
const [sl] = await sql`SELECT script_text FROM poet_scripts WHERE channel_id='48d98f95-7bdd-4259-8e10-1750123abdd5' ORDER BY generated_at DESC LIMIT 1`;
console.log("===SCRIPT_LONG===");
console.log(sl?.script_text ?? "(none)");
await sql.end();
