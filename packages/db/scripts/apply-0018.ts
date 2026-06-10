import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

// Applies 0018 statement-by-statement; idempotent-ish (skips "already exists"/"does not
// exist" classes so a partial prior run can be resumed safely).
const sqlText = readFileSync(resolve(__dirname, "../drizzle/0018_pc_clerk_competitor_expand.sql"), "utf8");
const statements = sqlText
  .split(/;\s*\n/)
  .map((s) => s.replace(/^--.*$/gm, "").trim())
  .filter((s) => s.length > 0);

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
try {
  for (const stmt of statements) {
    const head = stmt.replace(/\s+/g, " ").slice(0, 90);
    try {
      await client.unsafe(stmt);
      console.log(`✓ ${head}`);
    } catch (err) {
      const msg = (err as Error).message;
      if (/already exists|does not exist|multiple primary keys/i.test(msg) && !/column/i.test(stmt.slice(0, 30))) {
        console.log(`↷ skip (${msg.slice(0, 60)}): ${head}`);
        continue;
      }
      // ADD COLUMN duplicates are also resumable
      if (/already exists/i.test(msg)) {
        console.log(`↷ skip (${msg.slice(0, 60)}): ${head}`);
        continue;
      }
      console.error(`✗ FAILED: ${head}\n  ${msg}`);
      process.exit(1);
    }
  }
  console.log("0018 applied");
} finally {
  await client.end();
}
