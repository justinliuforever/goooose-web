// READ-ONLY: diagnose topic state after re-analyze.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
const [t] = await sql`
  SELECT updated_at, status,
    coalesce(length(verbatim_facts),0) AS vlen,
    coalesce(length(facts_and_data),0) AS flen,
    jsonb_array_length(fact_checks) AS fclen,
    jsonb_array_length("references") AS reflen
  FROM poet_custom_topics WHERE id='01cb1702-1467-485d-8467-780cd6ccf1b3'`;
console.log(JSON.stringify(t, null, 2));
const [r] = await sql`SELECT "references", left(verbatim_facts, 500) AS vhead FROM poet_custom_topics WHERE id='01cb1702-1467-485d-8467-780cd6ccf1b3'`;
console.log("\nreferences:", JSON.stringify((r?.references as unknown[])?.map((x: any) => ({ kind: x.kind, title: x.title, textLen: (x.text ?? "").length, url: x.url })), null, 2));
console.log("\nverbatim head:\n", r?.vhead ?? "(empty)");
await sql.end();
