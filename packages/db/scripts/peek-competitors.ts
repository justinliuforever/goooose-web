// Read-only: size the channels.competitors JSONB before the two-stage backfill.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

try {
  const rows = await sql<{ id: string; user_id: string; competitors: { platform: string; url: string }[] }[]>`
    SELECT id, user_id, competitors FROM channels`;
  let total = 0, xhsValid = 0, xhsBad = 0, ytId = 0, ytHandle = 0, ytLegacy = 0, ytBad = 0;
  const withComps: number[] = [];
  const seenPerUser = new Map<string, Set<string>>();
  for (const r of rows) {
    const comps = r.competitors ?? [];
    if (comps.length) withComps.push(comps.length);
    for (const c of comps) {
      total++;
      const url = (c.url || "").trim();
      if (c.platform === "xhs") {
        if (/\/user\/profile\/[a-f0-9]{24}/i.test(url) || /^[a-f0-9]{24}$/i.test(url)) xhsValid++;
        else xhsBad++;
      } else {
        try {
          const p = new URL(url).pathname;
          if (/^\/channel\/UC[\w-]+/.test(p)) ytId++;
          else if (/^\/@[\w.-]+/.test(p)) ytHandle++;
          else if (/^\/(?:c|user)\//.test(p)) ytLegacy++;
          else ytBad++;
        } catch {
          ytBad++;
        }
      }
      const set = seenPerUser.get(r.user_id) ?? new Set();
      set.add(`${c.platform}|${url.toLowerCase()}`);
      seenPerUser.set(r.user_id, set);
    }
  }
  const distinctPerUser = [...seenPerUser.values()].reduce((a, s) => a + s.size, 0);
  console.log(`channels=${rows.length}  total competitor entries=${total}`);
  console.log(`channels with competitors=${withComps.length}  max=${Math.max(0, ...withComps)}  total distinct (per user, by raw url)=${distinctPerUser}`);
  console.log(`XHS: valid=${xhsValid} bad=${xhsBad}`);
  console.log(`YouTube: /channel/UC=${ytId}  @handle=${ytHandle}  legacy(/c,/user)=${ytLegacy}  bad=${ytBad}`);
  console.log(`Stage B (network resolve->UC) needed for ${ytHandle + ytLegacy} YouTube rows`);
} finally {
  await sql.end();
}
