import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { proxySessions } from "../src/schema/proxy";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const provider = process.argv[2] ?? "wealthproxies";
const out = process.argv[3] ?? `proxy-backup-${provider}-${Date.now()}.txt`;

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);

try {
  const rows = await db
    .select()
    .from(proxySessions)
    .where(and(eq(proxySessions.provider, provider), eq(proxySessions.enabled, true)));

  const lines = rows.map(
    (r) => `${r.host}:${r.port}:${r.username}:${r.password}`,
  );
  writeFileSync(out, lines.join("\n") + "\n");
  console.log(`✓ Dumped ${lines.length} enabled sessions to ${out}`);
} finally {
  await client.end();
}
