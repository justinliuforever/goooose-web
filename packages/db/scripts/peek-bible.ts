// READ-ONLY: print the latest bible for 暴打咸鱼传家宝 to check grounding-pass redaction.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
const [r] = await sql`SELECT content FROM poet_bible WHERE channel_id='660c0a3d-0e7f-40ec-b0bf-da11216ac7df' ORDER BY generated_at DESC LIMIT 1`;
console.log(r?.content ?? "(none)");
await sql.end();
