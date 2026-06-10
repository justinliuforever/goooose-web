// READ-ONLY: does the script's SOURCE assert the M4 year?
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
const [t] = await sql`SELECT topic, story_angle, facts_and_data, verbatim_facts FROM poet_custom_topics WHERE id='01cb1702-1467-485d-8467-780cd6ccf1b3'`;
console.log("TOPIC:", t?.topic);
const blob = [t?.facts_and_data, t?.verbatim_facts, t?.story_angle].filter(Boolean).join("\n");
console.log("SOURCE lines mentioning M4 / Leica / 196x:");
for (const l of String(blob).split(/\n|。|；/)) if (/(M4|徕卡|莱卡|Leica|196\d)/.test(l)) console.log("  »", l.trim().slice(0, 160));
await sql.end();
