// A/B test for #1 (translationese). Same SOP-generation input, only the
// Chinese wrapper differs: V0 = current CHINESE_WRAPPER, V1 = improved wrapper
// with a terminology glossary + anti-translationese / anti-AI-tone directives.
// Run: pnpm --filter @singularity/db exec tsx scripts/feedback-ab-translationese.ts
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { buildHottestSopPrompt } from "@singularity/shared/prompts/clerk";
import { generateTextWithFallback } from "@singularity/shared/clients/llm";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

// ---- candidate improved wrapper (the deliverable artifact for #1) ----
const IMPROVED_WRAPPER = (inner: string) => `用简体中文输出全文。这是给中国内容创作者看的实战手册，必须读起来像一个资深中文编导在讲话，不能有翻译腔或 AI 腔。

## 术语对照（按下面的说法写，禁止直译生造词）
- call to action / CTA → 写「引导动作」或直接写「CTA」；禁止写「社会仪式 CTA」
- signature move → 「IP 标志性动作」；禁止写「签名式动作」
- theme / thematic cluster → 「常见主题」或「核心话题」；禁止写「主题聚类」
- pattern interrupt / cognitive schema / "bomb" → 用「黄金前 3 秒钩子」「打断刷视频的惯性」「完播率痛点」「避免观众划走」；禁止写「认知基模」「炸弹」「阻止滑动」
- hook → 钩子；open loop → 留扣子 / 悬念；rehook → 二次抓人 / 再钩一下；reframe → 换个说法 / 重新定义
- retention → 完播 / 留人；specificity spike → 具体细节抓人点；payload → 干货 / 正片；setup → 铺垫；beat → 节奏段
- 其它英文行话也一律换成中文创作者圈子里的通用说法；专有名词、品牌名、逐字引用、[m:ss] 时间戳保持原样。

## 写法要求（去翻译腔 / 去 AI 腔）
- 不要虚化动词：别用「进行 / 加以 / 予以 / 给予 + 名词」，直接用动词（写「分析」不写「进行分析」）。
- 少用被动「被」，改成主动句。
- 删掉八股套话：不要「值得注意的是」「总而言之」「众所周知」「在当今……的时代」「……之一」。
- 短句、口语化，像人说话；不要把多个名词堆成长定语长句。
- 介词别硬译：英文的 of / about / as 不要一律译成「关于 / 对于」。
- 不用 emoji，不写「让我们一起」「希望对你有帮助」这类客套。

${inner}`;

const transcript = readFileSync("/tmp/ab_transcript.txt", "utf8").slice(0, 12000);

const baseArgs = {
  channelName: "Fireship",
  title: "Every operating system concept in one video",
  views: 1_500_000,
  durationSec: 600,
  url: "https://youtube.com/watch?v=demo",
  transcript,
  analysisSummary:
    "高密度技术科普，开场用一句反差断言抓人，全程快节奏、术语口语化、靠具体例子和梗维持完播，结尾引导关注。",
  commentsSummary: null,
};

const v0Prompt = buildHottestSopPrompt({ ...baseArgs, language: "zh" });
const innerEn = buildHottestSopPrompt({ ...baseArgs, language: "en" });
const v1Prompt = IMPROVED_WRAPPER(innerEn);

const FLAGGED = ["社会仪式", "签名式", "认知基模", "基模", "主题聚类", "炸弹", "阻止滑动"];
const TRANSLATIONESE = ["进行了", "加以", "予以", "给予", "值得注意的是", "总而言之", "众所周知", "之一", "对于"];
function count(text: string, markers: string[]) {
  const out: Record<string, number> = {};
  let total = 0;
  for (const m of markers) {
    const n = text.split(m).length - 1;
    if (n > 0) { out[m] = n; total += n; }
  }
  return { out, total };
}

async function gen(label: string, prompt: string) {
  const t0 = Date.now();
  const r = await generateTextWithFallback({ prompt, maxOutputTokens: 4096, temperature: 0.4, maxRetries: 2 });
  const sec = Math.round((Date.now() - t0) / 1000);
  const text = r.text;
  const flagged = count(text, FLAGGED);
  const trans = count(text, TRANSLATIONESE);
  console.log(`\n==== ${label} ====`);
  console.log(`chars=${text.length} time=${sec}s tier=${r.usedTier} finish=${r.finishReason}`);
  console.log(`FLAGGED coinages total=${flagged.total}`, JSON.stringify(flagged.out));
  console.log(`translationese total=${trans.total}`, JSON.stringify(trans.out));
  writeFileSync(`/tmp/ab_${label}.md`, text);
  console.log(`-> /tmp/ab_${label}.md`);
  return { text, sec, flagged, trans };
}

const v0 = await gen("V0_current", v0Prompt);
const v1 = await gen("V1_improved", v1Prompt);

console.log("\n==== SUMMARY ====");
console.log(`coinages:   V0=${v0.flagged.total}  ->  V1=${v1.flagged.total}`);
console.log(`translationese: V0=${v0.trans.total}  ->  V1=${v1.trans.total}`);
console.log(`length: V0=${v0.text.length}  V1=${v1.text.length}`);
console.log(`time:   V0=${v0.sec}s  V1=${v1.sec}s`);
console.log("\nV0 head:\n" + v0.text.slice(0, 700));
console.log("\nV1 head:\n" + v1.text.slice(0, 700));
