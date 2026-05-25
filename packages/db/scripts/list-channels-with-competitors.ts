import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";

import { channels } from "../src/schema/channels";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);

try {
  const rows = await db.select({
    id: channels.id,
    name: channels.name,
    platform: channels.platform,
    competitors: channels.competitors,
  }).from(channels).where(sql`jsonb_array_length(${channels.competitors}) > 0`).limit(10);
  for (const r of rows) {
    const cs = (r.competitors as Array<{platform: string; url: string}>) ?? [];
    const yt = cs.filter(c => c.platform === "youtube");
    console.log(`${r.name}  (id=${r.id})  [${r.platform}]  ${yt.length} YT comp / ${cs.length} total`);
    for (const c of yt.slice(0, 3)) console.log(`  - ${c.url}`);
  }
} finally {
  await client.end();
}
