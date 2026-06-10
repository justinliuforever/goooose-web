// INC4 museIdeas.project_id verification helper: give a relevant-but-not-yet-ideated monitor
// video a real (>=200 char) transcript so the monitor's orphan-recovery path generates ideas
// for it, letting us confirm NEW muse_ideas rows are stamped with project_id. Throwaway.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const ch = "890a4752-d79f-4419-b941-e932d6ddab96";
const transcript =
  "大家好，今天聊聊很多人关心的房价问题。过去十年，一线城市的房子几乎只涨不跌，买到就是赚到，" +
  "这个逻辑深入人心。但我跟几位做了二十年地产的朋友聊完，发现风向真的变了。第一，人口结构在变，" +
  "新出生人口连续下降，未来接盘的年轻人变少，需求端的底层支撑没那么硬了。第二，租金回报率长期偏低，" +
  "很多城市核心地段的房子，租金回报还不到百分之二，靠租金根本覆盖不了房贷利息，这意味着房子的金融属性" +
  "正在被重新定价。第三，地方财政对土地的依赖也在调整，供地节奏和保障房政策都会影响二手房的流动性。" +
  "所以我的建议是，如果你是刚需自住，看中了就买，不用太纠结短期波动；但如果你是想靠加杠杆炒房博增值，" +
  "现在的风险收益比已经很不划算了。把现金流管理好，比赌一个方向更重要。";

try {
  const [pj] = await sql<{ total: number; set: number }[]>`
    SELECT count(*)::int total, count(*) FILTER (WHERE project_id IS NOT NULL)::int set
    FROM muse_ideas WHERE channel_id=${ch}`;
  console.log(`EXISTING muse_ideas=${pj!.total} project_id_set=${pj!.set}`);

  const [v] = await sql<{ id: string; title: string | null }[]>`
    SELECT id, title FROM muse_monitor_videos
    WHERE channel_id=${ch} AND relevant=true
      AND id NOT IN (SELECT source_video_id FROM muse_ideas WHERE source_video_id IS NOT NULL)
    ORDER BY id LIMIT 1`;
  if (!v) {
    console.log("no un-ideated relevant monitor video found");
  } else {
    await sql`UPDATE muse_monitor_videos SET transcript=${transcript} WHERE id=${v.id}`;
    console.log(`DOCTORED video=${v.id} (${(v.title ?? "").slice(0, 30)}) transcript_len=${transcript.length}`);
  }
  const [run] = await sql<{ id: string }[]>`
    INSERT INTO pipeline_runs (channel_id,agent,command,status)
    VALUES (${ch},'muse','muse-monitor-competitors','pending') RETURNING id`;
  console.log(`ORPHAN_MONITOR_RUN=${run!.id}`);
} finally {
  await sql.end();
}
