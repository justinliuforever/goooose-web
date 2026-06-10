// AUTHORIZED test setup: inject a known Leica reference (with the wrong M4 year, 1964
// vs the accepted 1967) as a text reference so the fact-check layer has real input to
// validate end-to-end. Test topic only.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const leicaText = `Leica M Series Film Cameras Overview

- The Leica M mount was first introduced in 1954 at Photokina in Germany.
- M3: produced 1954 to 1966; viewfinder magnification 0.91x; framelines 50, 90, 135mm; required a separate take-up spool.
- M2: produced 1957 to 1968; viewfinder 0.72x; framelines 35, 50, 90mm.
- M1: produced 1959 to 1964; no rangefinder; for scientific and medical use.
- M4: produced between 1964 to 1975; introduced a faster film loading system that no longer requires a separate take-up spool; framelines 35/135 paired, 50, 90.
- M5: 1971; first M with built-in TTL metering; viewfinder 0.72x; largest shutter speed dial in the M system.
- M4-2: produced 1978 to 1980; production moved to Canada; no self-timer.
- M4-P: produced 1980 to 1987; introduced six framelines in pairs 28/90, 35/135, 50/75.
- M6: produced 1984 to 2002; viewfinder 0.72 in the classic, also 0.58 and 0.85 available.
- M7: produced 2002 to 2018; added aperture priority; electronic shutter; first film Leica to support DX encoding.
- MP: introduced 2003 and still in production today.
- M-A: introduced 2014; no exposure meter, no battery, no electronics, no red dot.
- All Leica M film cameras take only 35mm film and have a maximum shutter speed of 1/1000s.`;

const refs = [{ kind: "text", title: "Leica M Series Film Cameras Overview", text: leicaText }];
await sql`UPDATE poet_custom_topics SET "references" = ${sql.json(refs)}, status = 'draft', updated_at = now() WHERE id = '01cb1702-1467-485d-8467-780cd6ccf1b3'`;
const [r] = await sql`SELECT jsonb_array_length("references") AS reflen, status FROM poet_custom_topics WHERE id = '01cb1702-1467-485d-8467-780cd6ccf1b3'`;
console.log("after inject:", JSON.stringify(r));
await sql.end();
