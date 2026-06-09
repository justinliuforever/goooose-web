# 运行时进度展示 + 时间估算（ETA）改进方案

> 来源：multi-agent workflow（25 agents：10 inventory + 8 research + 3 design + 1 synth + 3 adversarial verify）。
> 本文档 = 综合方案 **已并入对抗复核的修正**（复核发现初稿有真实统计错误，下面是修正版，按此执行）。

## 0. 一句话结论
**当前不是最优。** 实时管道（Trigger `useRealtimeRun`）底子好，但：**完全没有 ETA**、有一个写了类型却没接的 `estSecondsRemaining`（dead）、进度条是「平均 1/N」会先冲后卡、没有时长历史列、外加几个「看起来坏了」的小 bug。**可以做到实时、诚实、明显更准的 ETA**——但必须**按任务拓扑分别估算**，不能一招通吃。

## 1. 当前真实状态（inventory 实证）
- **Trigger 实时**：Clerk/Muse/Poet 都用 `useRealtimeRun` 订阅 `metadata.progress`；底座 OK。
- **没有 ETA**：全站没有任何剩余时间估算。`estSecondsRemaining` 仅在 `clerk-run-button.tsx:100` 的类型里存在，**没人 emit、没人渲染**（dead field）。
- **进度条失真**：Clerk 用「完成数/总数」平均增长 → 8 路并发下前段飞涨、长 ASR 尾段卡死（「先冲后停」）。
- **没有时长历史**：`pipeline_runs` 只有 `(channelId,status)` 索引，**无 `durationSeconds` 列**；无法算历史 p50/p90。
- **「看起来坏了」的小 bug（P0 修）**：
  - Muse 面板「已分类」统计取错字段（应为 `liveStats.relevant + irrelevant`）。
  - Clerk SOP 阶段「0/3 卡 3-5 分钟」——其实计数器在 emit，问题是**首个并行 SOP 落地前的冷窗口**没有 heartbeat（需要的是「仍在生成…」不确定态，不是接计数器）。
  - `generate-bible` 单次 LLM 窗口 `total=1, current=0` 全程不动，同样需要 heartbeat。
  - `useRealtimeRun` 没传 `experimental_throttleInMs` + `skipColumns`，大 payload（脚本/competitor）会 re-render storm。
- **Class A streaming**：实际**不存在**（全站没有 `streamText/useChat/streamObject` 的前端面；唯一 `streamText` 在 Trigger 任务内的 `bible.ts`）。→ 这块本轮**不做**（无对象）。

## 2. 核心：ETA 必须「按任务拓扑」分别估（复核关键修正）
绝不能对所有任务用同一个「每完成一项的 EWMA」。三种拓扑三种估法：

| 任务 | 拓扑 | 正确估法 |
|---|---|---|
| **Clerk** `analyze-channel` | **8 路并发**（`VIDEO_CONCURRENCY=8`）+ 视频时长极度异质（30s XHS vs 60min YT） | **时长份额加权 + 吞吐量外推**：`rate = completedDurationShare / elapsed`；`eta = remainingDurationShare / rate`。**绝不用**「完成项数 EWMA」（并发下前期严重低估、尾部暴涨）。`durationSec` 为 null/0 时退化到运行内中位数、权重设 epsilon 下限。 |
| **Muse** `monitor-competitors` | **串行**（`for` + `sleep(1500)`），但**两段循环**（分类 total=fresh，再选题 total=relevant，中间 total 重置） | **阶段加权 EWMA**：classify ≈0.55 / idea-gen ≈0.45；`progress = 0.55*classifyFrac + 0.45*ideaFrac`，避免边界跳变。串行循环 EWMA 本身最准（±15-25% 目标现实）。 |
| **Poet/Bible** `generate-script/bible` | 异质**阶段**（outline→N sections；bible 单次长流式） | **阶段权重外推**（权重 map）。Poet 长稿方差极大（prod p50=131s vs p90=4469s≈74min）→ **不显示 ETA 数字，显示「outline → 第 k/N 段」步进**；section≥1 后才用运行内外推。Bible 按字符/目标，但**显示封顶 95%** 直到 COMPLETED（freeze-at-95% 防 jank）。 |

### 两层 ETA + 平滑
- **T1 冷启动范围**：历史 `completed_at - started_at` 的 `percentile_cont` p50/p90，显示为**诚实区间**（不是假倒计时）。
- **T2 实时**：上述按拓扑的估算 emit 进 `metadata.progress.estSecondsRemaining`。
- **T1→T2 切换**：完成 <10% 只显示 T1 区间/步进；10%-40% 混合 **70% 历史 / 30% 实时**；>40% 实时主导——防止 T2 接管时数字跳变。
- **clampEta**：单调降 + 衰减 + 取整 + 兜底；**但放宽**为「不超过 T1_p90 不准升」（Clerk 并发尾部 ETA 合法上升时不能被死压，否则比现在更像坏了）。

## 3. 冷启动兜底（复核：beta 上线时几乎没历史，必须有）
n_samples<5 时用硬编码线性兜底（×1.3 悲观偏置），来源于 `feedback-clerk-timing.ts`，放 `packages/shared/src/eta/defaults.ts`：
- Clerk：`~180s + 8s*videoCount`
- Muse：`~120s + 45s*competitorCount`
- Poet：短 `~90s` / 长 `~300s + 60s*section`
- Bible：`~600s + 12s*videoCount`
n<5 显示**步进计数**而非数字（诚实 > 假精度），尤其 Poet 长稿这种高方差命令即使 n≥5 也优先步进。

## 4. 数据 / 查询（复核修正）
- **不把 `durationSeconds` 迁移放进关键路径**：先用 tRPC query 直接 `percentile_cont(EXTRACT(EPOCH FROM completed_at-started_at))`；生成列 + `(agent,command,status,started_at)` 索引留作 beta 后的优化（beta 量级不需要）。
- **命令名归一化（必须）**：prod 表有重复命令串（`analyze-channel` vs `clerk-analyze-channel`；`monitor-competitors` vs `muse-monitor-competitors`）+ 垃圾行（`p0a-test`/`retry`）。查询必须 alias 归并 + 排除测试行，否则历史桶被劈裂。
- **离群清洗**：剔除 DONE 但时长 > N×p50 的「卡完成」行（有一条 muse 10 小时、poet p90=74min）。
- **从第 1 次就记 `eta_predicted_sec`**（写入 `pipeline_runs.configJson`），让后续 MAPE 校准有数据；准确度用「跑 50 次后测 MAPE，目标 <40%」表述，不预先吹数字。

## 5. 修正后的分阶段路线图
- **P0（<0.5d，纯 web，无需重部署 Trigger）— 真·最小第一步**：
  Muse「已分类」字段修正 + `clampEta` 客户端工具 + Clerk `estSecondsRemaining` 渲染槽 + `useRealtimeRun` 加 `experimental_throttleInMs:500` & `skipColumns`。立刻消除「看起来坏了」信号，零迁移零重部署。
- **P1（~0.5d）**：`etaHints` tRPC（percentile_cont + 命令归一化 + 离群清洗）+ 冷启动兜底常量 + 前端渲染 T1 区间/步进。
- **P2（~2-2.5d，改 apps/jobs → 需重部署 Trigger，刻意一次批量）**：按拓扑 emit ETA —— Clerk 时长份额+吞吐；Muse 阶段加权 EWMA（用 `metadata.increment` 减小 payload）；Poet/Bible 阶段权重；duration-weighted Clerk 进度条。**前置**：先 `tr -d '\000'` 清掉 `analyze-channel.ts` 的 NUL 字节（该文件被识别为 binary，编辑有损坏风险）。
- **P3（~0.5d）**：clampEta 接 T1↔T2 混合 + freeze-at-95% + heartbeat（SOP 冷窗口 / bible 单 LLM）+ banner 加 progress/total mini-bar（**注意**：`listActive` 是 channelId 域，不是「全局」；真·跨账号 banner 是另一个更大的活，descope/延后）。
- **P4（beta 后）**：MAPE 闭环 + 回归校准（regr_slope/intercept、Welford）+ 生成列/索引优化。

## 6. 关键风险 / 坑（复核）
- Clerk 并发 → 别用项数 EWMA（已修正为吞吐/时长份额）。
- `durationSec` 常 null（失败的长 ASR 视频）→ 退化中位数 + epsilon 下限。
- 每个动 `apps/jobs/**` 的项都要**手动重部署 Trigger**（CLAUDE.md 规则）；P0 严格限制在 web，P2 批量一次。
- `analyze-channel.ts` 含 NUL 字节（binary，56KB）→ 编辑前清理。
- 冷启动无历史 → 兜底常量是 P1 硬交付，否则上线头几周区间为空/噪声。
- 高方差命令（Poet 长稿 34×）→ 步进优先，别给可操作性差的「最长 74 分钟」。

## 7. 建议起点
**P0（纯 web、<0.5d、零重部署）** 立刻做：修「看起来坏了」的 4 处 + 上 clampEta + throttle。先把体感修正、把 dead field 接上，再进 P1 的历史区间。
