import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { proxySessions } from "../src/schema/proxy";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const provider = process.argv[2] ?? "wealthproxies";
const file = process.argv[3];
if (!file) {
  console.error("Usage: tsx scripts/seed-proxy-sessions.ts <provider> <file.txt>");
  console.error("File format: host:port:user:pass per line");
  process.exit(1);
}

const text = readFileSync(resolve(process.cwd(), file), "utf-8");
const rows = text
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean)
  .map((line) => {
    const [host, port, username, password] = line.split(":");
    if (!host || !port || !username || !password) {
      throw new Error(`Bad line: ${line.slice(0, 60)}`);
    }
    return {
      provider,
      host,
      port: Number(port),
      username,
      password,
      geo: "US",
      notes: `Batch ${new Date().toISOString().slice(0, 10)}, ${file.split("/").pop()}`,
    };
  });

console.log(`Parsed ${rows.length} sessions for provider=${provider}`);

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);

try {
  // ON CONFLICT DO NOTHING via the (provider, password) unique constraint
  const inserted = await db.insert(proxySessions).values(rows).onConflictDoNothing().returning({
    id: proxySessions.id,
  });
  console.log(`✓ Inserted ${inserted.length} new sessions (${rows.length - inserted.length} dupes skipped)`);
} finally {
  await client.end();
}
