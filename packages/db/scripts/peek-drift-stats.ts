import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
try {
  const byReason = await client`
    select reason, count(*)::int n from poet_drift_events group by reason order by n desc`;
  console.log("drift events by reason:", JSON.stringify(byReason));
  const [bibles] = await client`
    select count(*)::int total,
      count(*) filter (where exists (select 1 from poet_drift_events d where d.bible_id = b.id and d.reason = 'no_overlap'))::int flagged
    from poet_bible b`;
  console.log(`bibles: ${bibles!.total} total, ${bibles!.flagged} flagged no_overlap`);
  const recent = await client`
    select d.reason, left(d.human_message, 90) msg, b.name, b.language
    from poet_drift_events d join poet_bible b on b.id = d.bible_id
    order by d.detected_at desc limit 5`;
  for (const r of recent) console.log(`- [${r.reason}] ${r.name} (${r.language ?? "?"})`);
} finally {
  await client.end();
}
