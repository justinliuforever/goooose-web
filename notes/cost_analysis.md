# Goooose 运行成本测算

> 数据快照：2026-05-31（单价逐家查证 + 生产库真实用量）。此后的两处口径变化尚未回填进下文数字：备用 ASR 已由 Groq Whisper 换成 Qwen3-ASR-Flash（DashScope，中文 / 小红书优先走 Qwen）；SOP 生成改为 map-reduce（每视频多一次 Flash 小结调用，Flash 单价低，影响很小）。成本大头（住宅代理 / ASR / vision）的结论不受影响，beta 流量打开后整体回填。

## Summary

- 固定月费：约 $55（Trigger.dev $10 + Vercel $20 + Supabase $25；Logto 免费档 $0，TikHub 按请求计无月费）。
- 单次按量成本：Clerk-YouTube 20 视频 ≈ $1.0、Clerk-小红书 20 笔记 ≈ $0.85、Muse 巡视（3×10）≈ $1.05、Poet 短稿 ≈ $0.05 / 长稿 ≈ $0.12。
- 单次最大头是住宅代理 + 语音转写（固定开销，与 LLM 价无关），DeepSeek token 反而较小。

---

## 一、固定订阅（月费，与用量无关）

| 服务        | 档位              | 月费                   | 来源                                    |
| ----------- | ----------------- | ---------------------- | --------------------------------------- |
| Trigger.dev | Hobby             | $10（含 $10 用量额度） | [pricing](https://trigger.dev/pricing)  |
| Vercel      | Pro               | $20 /席                | [pricing](https://vercel.com/pricing)   |
| Supabase    | Pro               | $25（含 $10 compute）  | [pricing](https://supabase.com/pricing) |
| Logto       | Free（≤5 万 MAU） | $0                     | [pricing](https://logto.io/pricing)     |
| TikHub      | Pay-as-you-go     | 无月费（见第二节）     | [pricing](https://tikhub.io/pricing)    |
| 小计        |                   | ≈ $55                  |                                         |

---

## 二、按量单价

| 服务                  | 用途                      | 单价                                                     | 来源                                                                |
| --------------------- | ------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------- |
| DeepSeek V4 Pro       | 视频拆解 / SOP / 写稿     | $0.435 in，$0.87 out（/百万 token；缓存命中 in $0.0036） | [pricing](https://api-docs.deepseek.com/quick_start/pricing)        |
| DeepSeek V4 Flash     | 评论总结 / 相关性判断     | $0.14 in，$0.28 out                                      | 同上                                                                |
| Claude Sonnet 4.6     | 封面 / 封图视觉           | $3 in，$15 out                                           | [pricing](https://platform.claude.com/docs/en/about-claude/pricing) |
| Deepgram Nova-3       | 语音转写（主）            | $0.0043 /分钟                                            | [pricing](https://deepgram.com/pricing)                             |
| Groq Whisper v3 Turbo | 语音转写（备）            | $0.04 /小时                                              | [pricing](https://groq.com/pricing)                                 |
| wealthproxies         | YouTube 住宅代理          | $6 /GB                                                   | `proxy-stats.ts`                                                    |
| TikHub                | 小红书 / YouTube 数据请求 | $0.001–0.01 /请求                                        | [pricing](https://tikhub.io/pricing)                                |
| YouTube Data API      | 播放量 / 日期补齐         | 免费（10K/天）                                           | —                                                                   |
| Trigger.dev compute   | 任务机器时间              | $0.017–0.26 /次（实测）                                  | dashboard                                                           |

> 实测：小红书音频 Deepgram 常返空、回退 Groq（近乎免费），ASR 实际开销低于按 Deepgram 全量估算。Trigger compute YouTube run 实测多为 $0.03–0.14，仅 XHS 大任务到 $0.26。

---

## 三、用量数据（取自生产库 + Trigger.dev）

| 指标               | 真实值                                        | 来源                   |
| ------------------ | --------------------------------------------- | ---------------------- |
| YouTube 字幕文字稿 | 平均 5,579 字符（n=14）                       | `clerk_videos` caption |
| YouTube ASR 文字稿 | 平均 3,055 字符（n=6）                        | `clerk_videos` asr     |
| YouTube 需转写比例 | 约 30%（14 字幕 / 6 ASR）                     | `transcript_source`    |
| 小红书 ASR 文字稿  | 平均 696 字符（n=48）                         | xhs_asr                |
| SOP 输出           | 真人版 8,422 / AI参考 6,040 / 爆款 2,306 字符 | `clerk_sops`           |
| Muse 单条选题      | 352 字符（核心字段）                          | `muse_ideas` (n=197)   |
| 单次 run compute   | $0.26（XHS 20 笔记）/ $0.03–0.14（YouTube）   | Trigger 记录           |
| 代理累计流量       | 0.836 GB / ~13 次运行                         | `proxy_sessions`       |

> token 换算：英文 ~4 字符/token、中文 ~1.7 字符/token。输入 token 由真实字符数换算（较可靠）；输出 token 无法从 Trigger trace 验真，按真实输出大小折中估计（±30%）。要钉死真实花费，以 DeepSeek 控制台账单为准。

---

## 四、单次运行明细

### 4.1 Clerk · 20 条 YouTube 视频

| 步骤                    | 模型          | 成本   |
| ----------------------- | ------------- | ------ |
| 逐条拆解 ×20            | Pro           | $0.08  |
| 3 份 SOP                | Pro           | $0.07  |
| 评论总结 ×1             | Flash         | ~$0    |
| 封面视觉 ×20            | Claude        | $0.20  |
| 语音转写（~6 条无字幕） | Deepgram/Groq | $0.20  |
| 住宅代理                | wealthproxies | $0.35  |
| Trigger compute         | —             | $0.08  |
| 合计                    |               | ≈ $1.0 |

> 最大头是住宅代理（$0.35）+ ASR（$0.20）+ 视觉（$0.20）；DeepSeek 三项加起来才 $0.15。

### 4.2 Clerk · 20 篇小红书笔记

| 步骤                            | 成本         |
| ------------------------------- | ------------ |
| 逐条拆解 ×20（Pro，文字稿短）   | $0.05        |
| 3 份 SOP（Pro）                 | $0.02        |
| 封图视觉 ×20（Claude，含多图）  | $0.30        |
| 语音转写（全无字幕，多走 Groq） | $0.10        |
| 住宅代理                        | $0（走 CDN） |
| TikHub 请求（~21 次）           | $0.10        |
| Trigger compute                 | $0.26        |
| 合计                            | ≈ $0.85      |

### 4.3 Muse · 巡视（3 竞品 × 10 视频，YouTube）

| 步骤                    | 成本    |
| ----------------------- | ------- |
| 相关性判断 ×30（Flash） | $0.01   |
| 爆款触发器 ×~15（Pro）  | $0.03   |
| 选题生成 ×~15（Pro）    | $0.04   |
| 语音转写（~9 条）       | $0.50   |
| 住宅代理                | $0.30   |
| Trigger compute         | $0.15   |
| 合计                    | ≈ $1.05 |

> 最大头是 ASR（$0.50）+ 代理（$0.30）。竞品若是小红书则不用代理、改产生 TikHub 请求费。

### 4.4 Poet · 写一篇稿

| 类型                 | 构成                              | 成本       |
| -------------------- | --------------------------------- | ---------- |
| 短稿（中文 <2000字） | 写稿 Pro + 口语化 Pro             | $0.03–0.06 |
| 长稿（中文 ≥2000字） | 大纲 + 逐段 ×N + 口语化（均 Pro） | $0.10–0.15 |

> Poet 几乎全是 DeepSeek。长稿贵在 SOP + 参考随每段重复进 prompt。

---

## 五、用户场景月度成本（假设，待调整）

| 档位 | 每月使用                    | 变动 | + 固定 | 总计 |
| ---- | --------------------------- | ---- | ------ | ---- |
| 轻度 | 4 Clerk + 4 Muse + 10 短稿  | $9   | $55    | $64  |
| 中度 | 12 Clerk + 12 Muse + 40 稿  | $28  | $55    | $83  |
| 重度 | 30 Clerk + 30 Muse + 100 稿 | $70  | $55    | $125 |

> Clerk 按 YouTube $1.0、Muse $1.05、短稿 $0.05、长稿 $0.12 估。单位成本：一套 SOP（3 份）≈ $1.0、一篇脚本 $0.05–0.15。频率为假设，按真实用户调整。

---

## 六、成本大头与优化方向

| 成本项             | 占单次比 | 优化方向（详见 pipeline_flow）              |
| ------------------ | -------- | ------------------------------------------- |
| 住宅代理           | ~35%     | 与 R9（IDC IP 被封）绑定，必要开销          |
| 语音转写 ASR       | ~20%     | 仅 30% 视频需要，且多走 Groq，空间有限      |
| Claude 视觉        | ~20%     | 可评估只对 top 视频做视觉                   |
| DeepSeek Pro token | ~15%     | 价已极低；逐条拆解 Pro→Flash 仍可再省       |
| Trigger compute    | ~8%      | 自托管 SG 可降跨大洲延迟（见 architecture） |

---

## 来源

[DeepSeek](https://api-docs.deepseek.com/quick_start/pricing) · [Claude](https://platform.claude.com/docs/en/about-claude/pricing) · [Deepgram](https://deepgram.com/pricing) · [Groq](https://groq.com/pricing) · [Trigger.dev](https://trigger.dev/pricing) · [Vercel](https://vercel.com/pricing) · [Supabase](https://supabase.com/pricing) · [Logto](https://logto.io/pricing) · [TikHub](https://tikhub.io/pricing)

真实用量：生产库 `clerk_videos` / `clerk_sops` / `muse_ideas` / `proxy_sessions` + Trigger.dev 运行记录（2026-05-31）。
