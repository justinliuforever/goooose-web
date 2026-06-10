import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });

try {
  console.log("█ SOP sample (AI红发魔女 human SOP, today)");
  const [sop] = await client`
    select sop_type, language, left(content_md, 2600) head, length(content_md) len
    from clerk_sops where run_id = '533f408e-8f0d-4b05-bc01-4b4e92af4a4d' and sop_type = 'human' limit 1`;
  console.log(`[${sop?.sop_type} ${sop?.language} ${sop?.len}c]\n${sop?.head}\n…\n`);

  console.log("█ Muse ideas sample (jz XHS, today, 3 of 36)");
  const ideas = await client`
    select idea_number, story_angle, left(facts_and_data, 220) facts, left(why_similar, 180) why,
      suggested_hook_type, left(risk_factors, 120) risk
    from muse_ideas where run_id = '9d52d6b7-739e-4c91-8715-4950506a1a57' order by random() limit 3`;
  for (const i of ideas) {
    console.log(`--- #${i.idea_number} ${i.story_angle}\n  facts: ${i.facts}\n  why: ${i.why}\n  hook: ${i.suggested_hook_type} | risk: ${i.risk}\n`);
  }

  console.log("█ Latest Poet script (most recent, head 1500c)");
  const [s] = await client`
    select s.script_text, s.language, s.word_count, s.duration_seconds, s.generated_at, c.name cname
    from poet_scripts s join channels c on c.id = s.channel_id
    order by s.generated_at desc limit 1`;
  console.log(`[${s?.cname} ${s?.language} words=${s?.word_count} dur=${s?.duration_seconds}s @${s?.generated_at}]\n${String(s?.script_text).slice(0, 1500)}\n…`);
} finally {
  await client.end();
}
