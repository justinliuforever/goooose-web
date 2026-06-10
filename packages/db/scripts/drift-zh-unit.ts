import { checkDrift } from "@singularity/shared/services/poet/bible";

type Case = { name: string; user: string; topic: string; content?: string; expectDrift: boolean };

const CASES: Case[] = [
  {
    name: "joma 真实误报案例（高度重合，不应 drift）",
    user: "程序员科技幽默短视频频道：用剪辑片段拆解大厂程序员的日常、面试与职场梗，节奏快、自嘲式幽默",
    topic: "程序员科技幽默短视频：大厂程序员日常与职场梗",
    expectDrift: false,
  },
  {
    name: "zh 部分重合（徕卡相机 → 相机口播，不应 drift）",
    user: "二手徕卡相机评测与购买攻略",
    topic: "徕卡相机口播频道",
    expectDrift: false,
  },
  {
    name: "zh 真 drift（美食 → 加密货币，应 drift）",
    user: "家常菜做饭教程，厨房新手友好",
    topic: "加密货币投资策略解析",
    expectDrift: true,
  },
  {
    name: "zh 真 drift（旅行 → 编程教学，应 drift）",
    user: "小众城市旅行攻略与人文故事",
    topic: "零基础学编程入门课",
    expectDrift: true,
  },
  {
    name: "en 重合回归（不应 drift）",
    user: "camera reviews and photography tips for beginners",
    topic: "Beginner Photography & Camera Review Channel",
    expectDrift: false,
  },
  {
    name: "en 真 drift（应 drift）",
    user: "vintage camera restoration stories",
    topic: "Crypto Trading Strategies",
    expectDrift: true,
  },
  {
    name: "zh 停用词噪音不应救场（的/了 bigram 被滤，应 drift）",
    user: "猫咪的日常生活记录",
    topic: "汽车的改装知识讲解",
    expectDrift: true,
  },
];

let pass = 0;
for (const c of CASES) {
  const warning = checkDrift(c.user, c.topic, c.content ?? "");
  const drifted = warning?.reason === "no_overlap";
  const ok = drifted === c.expectDrift;
  console.log(`${ok ? "✓" : "✗"} ${c.name} → drift=${drifted}${ok ? "" : ` (expected ${c.expectDrift})`}`);
  if (ok) pass++;
}
console.log(`\n${pass}/${CASES.length} pass`);
process.exit(pass === CASES.length ? 0 : 1);
