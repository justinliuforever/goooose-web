// READ-ONLY: inspect fact_checks for the Leica topic.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

type CF = { fact: string; src: string; status: string; note?: string };
const [t] = await sql`SELECT fact_checks FROM poet_custom_topics WHERE id='01cb1702-1467-485d-8467-780cd6ccf1b3'`;
const fc: CF[] = (t?.fact_checks as CF[]) ?? [];
console.log(`total facts: ${fc.length}`);
const byStatus = fc.reduce<Record<string, number>>((a, f) => ((a[f.status] = (a[f.status] ?? 0) + 1), a), {});
console.log("by status:", JSON.stringify(byStatus));

console.log("\n=== FLAGGED (disputed / unsupported) ===");
for (const f of fc.filter((f) => f.status !== "verified")) {
  console.log(`[${f.status}] ${f.fact}\n   src: ${f.src}\n   note: ${f.note ?? "(none)"}`);
}

console.log("\n=== M-series / year facts (check M4 flagged + M3/M7 not false-flagged) ===");
for (const f of fc) {
  if (/\bM\d|196\d|197\d|198\d|199\d|200\d|201\d/.test(f.fact)) {
    const mark = f.status === "verified" ? "✓" : f.status === "disputed" ? "⚠" : "✗";
    console.log(`${mark} ${f.fact}${f.note ? `  → ${f.note}` : ""}`);
  }
}
await sql.end();
