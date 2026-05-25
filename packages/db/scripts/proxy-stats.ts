import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { proxySessions } from "../src/schema/proxy";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const PRICE_PER_GB: Record<string, number> = {
  wealthproxies: 6.0,
};

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);

try {
  const summary = await db
    .select({
      provider: proxySessions.provider,
      total: sql<number>`count(*)::int`,
      enabled: sql<number>`count(*) filter (where ${proxySessions.enabled})::int`,
      disabled: sql<number>`count(*) filter (where not ${proxySessions.enabled})::int`,
      totalOk: sql<number>`coalesce(sum(${proxySessions.totalOk}), 0)::int`,
      totalErr: sql<number>`coalesce(sum(${proxySessions.totalErr}), 0)::int`,
      totalBytes: sql<number>`coalesce(sum(${proxySessions.totalBytes}), 0)::bigint`,
    })
    .from(proxySessions)
    .groupBy(proxySessions.provider);

  console.log("\n=== Proxy pool summary ===");
  for (const s of summary) {
    const price = PRICE_PER_GB[s.provider] ?? 0;
    const gb = Number(s.totalBytes) / 1e9;
    const usd = gb * price;
    const okRate =
      s.totalOk + s.totalErr > 0
        ? ((s.totalOk / (s.totalOk + s.totalErr)) * 100).toFixed(1)
        : "—";
    console.log(
      `[${s.provider}] enabled=${s.enabled}/${s.total} disabled=${s.disabled}  ok=${s.totalOk} err=${s.totalErr} (${okRate}%)  used=${gb.toFixed(2)} GB ≈ $${usd.toFixed(2)}`,
    );
  }

  const disabledRecent = await db
    .select({
      provider: proxySessions.provider,
      disabledReason: proxySessions.disabledReason,
      count: sql<number>`count(*)::int`,
    })
    .from(proxySessions)
    .where(sql`${proxySessions.disabledAt} > now() - interval '7 days'`)
    .groupBy(proxySessions.provider, proxySessions.disabledReason);

  if (disabledRecent.length > 0) {
    console.log("\n=== Disabled in last 7 days ===");
    for (const r of disabledRecent) {
      console.log(`[${r.provider}] ${r.disabledReason ?? "(no reason)"} × ${r.count}`);
    }
  }
} finally {
  await client.end();
}
