import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, ilike } from "drizzle-orm";

import { channels } from "../src/schema/channels";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const filter = process.argv[2];

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);

try {
  const rows = await db.select({
    id: channels.id, name: channels.name, slug: channels.slug, platformUrl: channels.platformUrl,
  }).from(channels).where(
    filter ? ilike(channels.platformUrl, `%${filter}%`) : eq(channels.platform, "youtube")
  ).limit(20);
  for (const r of rows) console.log(`${r.id}  ${r.name}  ${r.platformUrl}`);
} finally {
  await client.end();
}
