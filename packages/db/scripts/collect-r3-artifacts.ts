import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
try {
  const [bible] = await client`
    select name, content from poet_bible where id = '7e5e258c-dfb1-4958-9280-4b40a2ddf27a'`;
  console.log(`===== BIBLE (joma_clips, zh, 目标:程序员科技幽默短视频) =====\n${bible?.content}\n`);

  const [script] = await client`
    select script_text from poet_scripts where id = '014fa894-2472-4688-a16e-5b2e57e94cf0'`;
  console.log(`===== SCRIPT (jz, 60s 目标 / 200 字预算, 实际 573 字) =====\n${script?.script_text}\n`);

  const [sop] = await client`
    select content_md from clerk_sops
    where run_id = '3c3ded9f-a3ad-4bb5-8b27-eec92ce65b51' and sop_type = 'human' limit 1`;
  console.log(`===== HUMAN SOP (亢岳 XHS 汽车号, 4 笔记新分析) =====\n${(sop?.content_md ?? "").slice(0, 6000)}\n…(截断)\n`);

  const ideas = await client`
    select idea_number, story_angle, facts_and_data, why_similar, suggested_hook_type, risk_factors
    from muse_ideas where run_id = '4fb68bd4-3f42-4aa1-8cf0-33b61e0fb997' order by idea_number`;
  console.log(`===== MUSE IDEAS (hackbearterry YT, ${ideas.length} 条) =====`);
  for (const i of ideas) {
    console.log(`--- #${i.idea_number} ${i.story_angle}\nfacts: ${(i.facts_and_data ?? "").slice(0, 400)}\nwhy: ${(i.why_similar ?? "").slice(0, 200)}\nhook: ${i.suggested_hook_type}\nrisk: ${(i.risk_factors ?? "").slice(0, 150)}\n`);
  }
} finally {
  await client.end();
}
