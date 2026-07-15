// Read-only COGS report: real per-run variable cost from usage_events telemetry,
// proxy bytes, run mix, and content volumes. Written for the pricing analysis.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const PRICE_PER_GB: Record<string, number> = { wealthproxies: 6.0 };

function h(title: string) {
  console.log(`\n\n========== ${title} ==========`);
}

async function safe(title: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    console.log(`\n[!] ${title} failed: ${(e as Error).message.slice(0, 200)}`);
  }
}

try {
  await safe("0. usage_events coverage", async () => {
    h("0. usage_events coverage");
    const rows = await sql`
      select count(*)::int as events,
             count(distinct run_id)::int as runs,
             count(distinct user_id)::int as users,
             min(created_at) as first,
             max(created_at) as last,
             string_agg(distinct price_version, ', ') as price_versions
      from usage_events`;
    console.log(rows[0]);
  });

  await safe("1. per-run cost by feature", async () => {
    h("1. per-run cost by feature (USD, real telemetry)");
    const rows = await sql`
      with per_run as (
        select run_id, coalesce(feature,'(null)') as feature,
               sum(estimated_cost_usd) as cost,
               sum(coalesce(input_tokens,0)) as in_tok,
               sum(coalesce(cached_input_tokens,0)) as cached_tok,
               sum(coalesce(output_tokens,0)) as out_tok,
               sum(coalesce(audio_seconds,0)) as audio_s,
               sum(coalesce(api_calls,0)) as calls
        from usage_events
        where run_id is not null
        group by run_id, coalesce(feature,'(null)')
      )
      select feature,
             count(*)::int as runs,
             round(avg(cost)::numeric, 4) as avg_usd,
             round((percentile_cont(0.5) within group (order by cost))::numeric, 4) as p50_usd,
             round((percentile_cont(0.9) within group (order by cost))::numeric, 4) as p90_usd,
             round(max(cost)::numeric, 4) as max_usd,
             round(avg(in_tok)::numeric, 0) as avg_in_tok,
             round(avg(cached_tok)::numeric, 0) as avg_cached_tok,
             round(avg(out_tok)::numeric, 0) as avg_out_tok,
             round(avg(audio_s)::numeric, 1) as avg_audio_s,
             round(avg(calls)::numeric, 1) as avg_calls
      from per_run
      group by feature
      order by count(*) desc`;
    console.table(rows);
  });

  await safe("2. cost split by feature x resource_type", async () => {
    h("2. cost split by feature x resource_type");
    const rows = await sql`
      select coalesce(feature,'(null)') as feature, resource_type,
             count(*)::int as events,
             count(distinct run_id)::int as runs,
             round(sum(estimated_cost_usd)::numeric, 4) as total_usd,
             round((sum(estimated_cost_usd) / nullif(count(distinct run_id),0))::numeric, 4) as usd_per_run
      from usage_events
      group by coalesce(feature,'(null)'), resource_type
      order by feature, total_usd desc`;
    console.table(rows);
  });

  await safe("3. cost by provider/model", async () => {
    h("3. cost by provider/model (all-time totals)");
    const rows = await sql`
      select resource_type, provider, coalesce(model,'-') as model,
             count(*)::int as events,
             round(sum(estimated_cost_usd)::numeric, 4) as total_usd,
             sum(coalesce(input_tokens,0))::bigint as in_tok,
             sum(coalesce(output_tokens,0))::bigint as out_tok,
             round(sum(coalesce(audio_seconds,0))::numeric/60, 1) as audio_min
      from usage_events
      group by resource_type, provider, coalesce(model,'-')
      order by total_usd desc`;
    console.table(rows);
  });

  await safe("4. pipeline_runs mix + duration + quota", async () => {
    h("4. pipeline_runs: mix, duration, quota charged");
    const rows = await sql`
      select agent, command, status,
             count(*)::int as n,
             round(avg(quota_charged)::numeric,1) as avg_quota_min,
             round(avg(extract(epoch from (completed_at - started_at)))::numeric/60, 1) as avg_dur_min,
             round((percentile_cont(0.9) within group (
               order by extract(epoch from (completed_at - started_at))))::numeric/60, 1) as p90_dur_min
      from pipeline_runs
      group by agent, command, status
      order by agent, command, status`;
    console.table(rows);
  });

  await safe("5. proxy bytes -> USD", async () => {
    h("5. proxy_sessions bytes -> USD");
    const rows = await sql`
      select provider,
             count(*)::int as sessions,
             coalesce(sum(total_bytes),0)::bigint as bytes,
             coalesce(sum(total_ok),0)::int as ok,
             coalesce(sum(total_err),0)::int as err
      from proxy_sessions group by provider`;
    for (const r of rows) {
      const gb = Number(r.bytes) / 1e9;
      const usd = gb * (PRICE_PER_GB[r.provider as string] ?? 0);
      console.log(
        `[${r.provider}] sessions=${r.sessions} ok=${r.ok} err=${r.err} bytes=${gb.toFixed(3)}GB ≈ $${usd.toFixed(2)}`,
      );
    }
  });

  await safe("6. content volumes", async () => {
    h("6. content volumes (context)");
    const clerk = await sql`
      select count(*)::int as videos,
             round(avg(duration_sec)::numeric,0) as avg_dur_sec,
             round(avg(length(transcript))::numeric,0) as avg_transcript_chars,
             count(*) filter (where transcript_source ilike '%caption%' or transcript_source ilike '%youtube%')::int as captioned,
             count(*) filter (where transcript_source ilike '%deepgram%' or transcript_source ilike '%qwen%' or transcript_source ilike '%asr%' or transcript_source ilike '%groq%')::int as asr
      from clerk_videos`;
    console.log("clerk_videos:", clerk[0]);
    const srcs = await sql`select coalesce(transcript_source,'(null)') as src, count(*)::int as n from clerk_videos group by transcript_source order by n desc`;
    console.log("clerk transcript_source dist:", srcs);
    const sops = await sql`select count(*)::int as sops, round(avg(length(content_md))::numeric,0) as avg_chars from clerk_sops`;
    console.log("clerk_sops:", sops[0]);
    const ideas = await sql`select count(*)::int as ideas from muse_ideas`;
    console.log("muse_ideas:", ideas[0]);
    const mv = await sql`select count(*)::int as monitor_videos, round(avg(duration_sec)::numeric,0) as avg_dur_sec from muse_monitor_videos`;
    console.log("muse_monitor_videos:", mv[0]);
    const scripts = await sql`select count(*)::int as scripts, round(avg(duration_seconds)::numeric,0) as avg_target_sec, round(avg(word_count)::numeric,0) as avg_words, round(avg(length(script_text))::numeric,0) as avg_chars from poet_scripts`;
    console.log("poet_scripts:", scripts[0]);
    const bibles = await sql`select count(*)::int as bibles from poet_bible`;
    console.log("poet_bible:", bibles[0]);
    const imports = await sql`select count(*)::int as import_files from bible_import_files`;
    console.log("bible_import_files:", imports[0]);
  });
} finally {
  await sql.end();
}
