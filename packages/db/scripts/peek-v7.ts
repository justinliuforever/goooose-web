// READ-ONLY: latest script + custom-topic facts to check grounding-pass redaction.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
const [s] = await sql`SELECT script_text FROM poet_scripts WHERE channel_id='890a4752-d79f-4419-b941-e932d6ddab96' ORDER BY generated_at DESC LIMIT 1`;
const [t] = await sql`SELECT facts_and_data FROM poet_custom_topics WHERE id='3c73da4c-2dae-48a4-a54f-8440021d0de0'`;
console.log("===SCRIPT===");
console.log(s?.script_text ?? "(none)");
console.log("===TOPIC_FACTS===");
console.log(t?.facts_and_data ?? "(none)");
await sql.end();
