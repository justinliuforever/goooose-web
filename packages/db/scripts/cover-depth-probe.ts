import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { eq, isNotNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { clerkVideos } from "../src/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);

const COMPETITOR = process.argv[2] ?? "56c1b58f-406d-4fa4-a18f-c3285d10c9dd";

// DeepSeek is told "you cannot see the image" — its guesses hedge. Vision states facts.
const HEDGE = /可能|应该|大概|推测|通常|一般会|预计|想必|estimated|likely|probably|presumably|would (?:likely )?(?:include|feature|show)|typical/gi;

function tell(s: string | null): string {
  if (!s) return "—";
  const hits = s.match(HEDGE);
  return hits ? `HEDGED(${hits.length}): ${[...new Set(hits)].join(",")}` : "assertive";
}

try {
  const vids = await db
    .select({
      id: clerkVideos.platformVideoId,
      title: clerkVideos.title,
      thumbUrl: clerkVideos.thumbnailUrl,
      desc: clerkVideos.thumbnailDescription,
      why: clerkVideos.thumbnailWhyItWorks,
      diag: clerkVideos.coverDiagnosis,
      map: clerkVideos.sopMapSummary,
      contentType: clerkVideos.contentType,
    })
    .from(clerkVideos)
    .where(eq(clerkVideos.competitorAccountId, COMPETITOR));

  console.log(`=== competitor ${COMPETITOR}: ${vids.length} notes ===\n`);
  for (const [i, v] of vids.entries()) {
    console.log(`■ [${i + 1}] ${v.title?.slice(0, 40)}  <${v.contentType}>`);
    console.log(`  thumb_url : ${v.thumbUrl ? "yes" : "NO"}`);
    console.log(`  desc      : ${v.desc?.length ?? 0} chars | ${tell(v.desc)}`);
    console.log(`              ${v.desc?.slice(0, 220) ?? "—"}`);
    console.log(`  why       : ${v.why?.length ?? 0} chars | ${tell(v.why)}`);
    console.log(`              ${v.why?.slice(0, 220) ?? "—"}`);
    console.log(`  diagnosis : ${v.diag?.length ?? 0} chars`);
    console.log(`              ${v.diag ?? "—"}`);
    console.log(`  map cover?: ${v.map ? (/Cover|封面/i.test(v.map) ? "YES" : "no") : "(no map)"}`);
    console.log();
  }

  const stats = await db
    .select({
      contentType: clerkVideos.contentType,
      n: sql<number>`count(*)::int`,
      withThumb: sql<number>`count(*) filter (where ${clerkVideos.thumbnailUrl} is not null)::int`,
      withDesc: sql<number>`count(*) filter (where ${clerkVideos.thumbnailDescription} is not null)::int`,
      withDiag: sql<number>`count(*) filter (where ${clerkVideos.coverDiagnosis} is not null)::int`,
      avgDesc: sql<number>`coalesce(avg(length(${clerkVideos.thumbnailDescription})), 0)::int`,
      avgDiag: sql<number>`coalesce(avg(length(${clerkVideos.coverDiagnosis})), 0)::int`,
    })
    .from(clerkVideos)
    .groupBy(clerkVideos.contentType);

  console.log("=== db-wide by content_type ===");
  console.table(stats);

  // If desc length differs sharply by diagnosis presence, diagnosis is a usable provenance proxy.
  const split = await db
    .select({
      hasDiag: sql<boolean>`${clerkVideos.coverDiagnosis} is not null`,
      n: sql<number>`count(*)::int`,
      avgDesc: sql<number>`coalesce(avg(length(${clerkVideos.thumbnailDescription})), 0)::int`,
      minDesc: sql<number>`coalesce(min(length(${clerkVideos.thumbnailDescription})), 0)::int`,
      maxDesc: sql<number>`coalesce(max(length(${clerkVideos.thumbnailDescription})), 0)::int`,
    })
    .from(clerkVideos)
    .where(isNotNull(clerkVideos.thumbnailDescription))
    .groupBy(sql`${clerkVideos.coverDiagnosis} is not null`);

  console.log("=== desc length vs diagnosis presence (provenance proxy?) ===");
  console.table(split);
} finally {
  await client.end();
}
