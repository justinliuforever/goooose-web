// READ-ONLY: quantify the two edge-case fixes on the v11 re-runs.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const TS = /\[\d{1,2}:\d{2}(?::\d{2})?\]/g;
const DISCLOSE = /(无(音频|字幕|转写|语音)|未(获取|取得|拿到).{0,6}(转写|字幕|音频)|仅(有|凭|能).{0,8}(标题|封面|缩略|画面)|缺(少|乏).{0,6}(转写|字幕|音频)|没有.{0,6}(转写|字幕|音频)|transcript|caption)/g;

const fg = await sql`SELECT DISTINCT ON (sop_type) sop_type, length(content_md) AS len, content_md
  FROM clerk_sops WHERE channel_id='ba2ed94c-2081-46ff-932e-b04073d8c04d'
  ORDER BY sop_type, updated_at DESC`;
console.log("=== 梵高 SOPs (1/4 videos have transcript) ===");
for (const r of fg) {
  const md: string = r.content_md ?? "";
  const tsCount = (md.match(TS) ?? []).length;
  const discl = (md.match(DISCLOSE) ?? []).length;
  console.log(`\n[${r.sop_type}] ${r.len} chars | [m:ss] timestamps: ${tsCount} | transcript-limitation mentions: ${discl}`);
  // show any line that cites a timestamp, to see which video they attach to
  const tsLines = md.split("\n").filter((l) => TS.test(l)).slice(0, 12);
  if (tsLines.length) console.log("  timestamp lines:\n" + tsLines.map((l) => "   " + l.trim().slice(0, 110)).join("\n"));
  // show the opening (where disclosure should live)
  console.log("  --- opening 700 chars ---\n" + md.slice(0, 700).split("\n").map((l) => "   " + l).join("\n"));
}

const [sl] = await sql`SELECT script_text FROM poet_scripts
  WHERE channel_id='48d98f95-7bdd-4259-8e10-1750123abdd5' ORDER BY generated_at DESC LIMIT 1`;
const t: string = sl?.script_text ?? "";
console.log("\n\n=== script_long (Leica M4 fact-check) ===");
console.log(`length: ${t.length} chars`);
for (const l of t.split("\n")) {
  if (/(徕卡|莱卡|Leica|M4|M3|M6|196\d|195\d|197\d)/.test(l)) console.log("  » " + l.trim().slice(0, 160));
}
await sql.end();
