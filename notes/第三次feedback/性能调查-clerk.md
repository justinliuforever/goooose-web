# Clerk 性能调查与方案（已确认）

> 反馈："20 视频 / 1 小时"。用生产库 + Trigger trace 定位 + A/B 验证。
>
> 决策已定，**尚未改代码**（待整体重构讨论后一起落地；动 `apps/jobs` 需重部署）。调查日期 2026-06-03。

## 1. Root cause

真实耗时：20 视频 = 51min、15 视频 = 48min；最慢 3 条全 ASR 长视频 = 741s/条。

Trigger trace（`run_cmpthtuma…`，表叔王寂 XHS 15 笔记 48min $0.246）：下载时间戳每条间隔 ~2.5–3min、**完全串行**。

三个原因（按影响排序）：
1. **小红书路径完全串行、没有并发** —— `analyze-channel.ts:476` 是 for 循环 + `:686` sleep；只有 YouTube 有 `:1055` 的 pLimit(4)。客户测的都是小红书 → **头号原因**。
2. **每条分析 = Pro@8192，约 2 分钟**（`:576`）。注意：这是"分析这一步的处理耗时"，**不是限制视频长度**；视频再长也喂完整转写（V4 上下文 1M）。
3. **XHS 每条先调 Deepgram、必返空、再回退 Groq**（trace 15 条无一例外；疑似 Deepgram 没从 h265 视频流取到音频）。

## 2. Flash 分析 A/B（验证过）

同一真实转写，Pro vs Flash：

| 配置 | 耗时 | JSON 解析 | 备注 |
| --- | --- | --- | --- |
| Pro@8192 | 133–144s | 长视频 **FAIL** | 推理烧光预算（非输出过长），即生产那次 "Could not parse" |
| Flash@8192 | 21–33s | OK 15/15 | 质量与 Pro 相当（钩子/时间戳/框架到位） |
| 任意 @4096 | — | FAIL | 4096 太小、截断 |

结论：Flash 快 **4–7×**、更可靠、质量相当（早前"Flash 没时间戳"是我正则没数区间 `[0:10-0:20]` 的假象）。唯一短板：复杂输入偶把字段值返回成对象 → 用 parseAnalysis 兜底即可。

## 3. 容量规划（最多 4 用户）

两个并发维度别混：
- **单 run 内 `VIDEO_CONCURRENCY`**：一台机器上同时处理几条，受机器 RAM + 外部 API 限。
- **跨 run 并发**：几个 run 同时跑，每个 = 1 台机器 + 1 个 Trigger 并发槽（`VIDEO_CONCURRENCY` 不占槽）。

4 用户 × 每人 ~2 重任务 = ~8 并发 run；× 并发 8 = 峰值 ~64 并行操作。对照外部上限：

| 服务 | 上限 | 64 峰值 |
| --- | --- | --- |
| DeepSeek Flash | 2500 并发 | ✓ |
| ~~Groq ASR~~ | — | **已移除** → 改用 Qwen3-ASR-Flash（中文）/ Deepgram（英文），见 [实施记录](./实施记录.md) ASR 段 |
| Trigger Hobby | 50 并发 run | ✓（用 ~8，不升套餐） |

机器按秒计费（非月费）：medium-1x $0.000085/s、large-1x $0.00034/s —— 并行后跑得短，单次净更便宜。（原 Groq 30 RPM 天花板已不适用：ASR 换成 Qwen3-ASR-Flash，限额充足。）

## 4. 已确认实施方案（2026-06-03，待落地）

| 项 | 现状 → 改为 | 说明 |
| --- | --- | --- |
| XHS 处理循环 | 串行 → **pLimit 并行**（同 YouTube） | 头号提速 |
| `VIDEO_CONCURRENCY` | 4 → **8**（API 稳可再上调至 ~16） | |
| machine | medium-1x → **large-1x（8GB）** | 并发 8 + 长音频缓冲留余量；跑得短 → 净更便宜 |
| 重任务 queue 上限 | 无 → **6**（analyze-channel / monitor-competitors） | 吸收多用户突发 |
| 分析模型 | Pro → **Flash**（保质量，上线抽查对比） | XHS 先切，YouTube 带护栏再切 |
| `maxOutputTokens` | 8192 → **16384，绝不降** | V4 上限 384K，留 2–3× 冗余：杜绝截断、并给推理模型留预算 |
| parseAnalysis | + 对象值 `JSON.stringify` 兜底 + 每条 retry | 修偶发解析失败 |
| ASR | **XHS → Qwen3-ASR-Flash**（中文母语，直接吃 h265）；YouTube → Deepgram 主 + Qwen ≤10MB 兜底；**Groq 移除** | 见 [实施记录](./实施记录.md) ASR 段 |
| Trigger 套餐 | Hobby **不变** | 50 并发对 4 用户够 |
| 自托管 | **不做** | 留到规模化再评 |

**预期：单次 Clerk(20) 48min → ~5–7min，$0.245 → ~$0.10（更快又更便宜）。**

实施落点：`analyze-channel.ts`（:328 并发 / :332 机器 / :476-686 XHS 并行 / :576 Flash+tokens / :268 parseAnalysis / task queue）、`monitor-competitors.ts`（queue）、`packages/shared/src/clients/asr.ts`（XHS → Qwen3-ASR-Flash，Groq 移除）。
