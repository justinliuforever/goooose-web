# Singularity Web — 最终架构

**Initial**: 2026-05-15 · **Last revised**: 2026-05-18

---

## 架构图

```
┌────────────────────────────────────────────────┐
│   浏览器                                        │
└────────────────────┬───────────────────────────┘
                     │
        ┌────────────▼─────────────────────┐
        │   Next.js 16 (Vercel)             │
        │   ─────────────────────────────   │
        │   • Tailwind 4 + shadcn/ui        │
        │   • tRPC v11 (BFF)                │
        │   • Vercel AI SDK (流式批改)      │
        │   • Trigger.dev v3 (长任务)       │
        └────┬─────────────────┬────────────┘
             │                 │
   ┌─────────┴────┐    ┌───────┴───────────────┐
   ▼              ▼    ▼                       ▼
 Logto       Supabase  TikHub                  LLM / ASR
(Auth)      (Postgres) (YouTube + XHS data    DeepSeek (主)
                       + audio streams)        Claude Sonnet (vision / W7)
            R2                                  Deepgram Nova-3 (主 ASR)
            (大文件)                            Groq Whisper (备 ASR)
                                                YouTube Data API (metadata)
```

---

## 技术栈一览

| 层 | 选择 |
|---|---|
| 主语言 | **TypeScript**（D5=A 锁定 TikHub-only，无 Python sidecar） |
| 前端框架 | Next.js 16 App Router (Vercel) |
| UI 组件 | shadcn/ui (base-nova) + Radix（Tailwind 4） |
| API 层 | tRPC v11 |
| 客户端缓存 | tRPC + React Query（按需补 Zustand） |
| AI 流式 | Vercel AI SDK v4+ |
| 长任务编排 | **Trigger.dev v3** |
| Auth | **Logto Cloud** |
| 数据库 | Supabase Pro (Postgres + Realtime) + Drizzle |
| 大文件存储 | Cloudflare R2 |
| 数据层 / 抓取 | TikHub（YouTube 频道列表 + audio streams + XHS 全套） |
| LLM 主链 | DeepSeek V4 Pro + Flash |
| LLM vision / W7 critique | Claude Sonnet 4.6 |
| ASR | Deepgram Nova-3（主）+ Groq Whisper（备）|
| 视频元数据 | YouTube Data API v3（免费 10K/天） |
| Monorepo | pnpm + Turborepo |

> 状态管理：Next.js 16 Server Components + tRPC + React Query 已覆盖大部分场景。本地 UI 状态用 `useState` / `Context` 即可。仅当出现跨页面复杂共享状态时再引入 Zustand。

---

## 核心决策要点

### 1. 舍弃 Electron 桌面版

- 现有 macOS app 停止维护
- 6K Python LOC 移到 `archive/` 作 prompt 参考库（archive 移植 100% 完成）

### 2. 主语言 TypeScript

- archive Python 80% 易移植到 TS（约 3,300 / 6,100 LOC，全部完成）
- Vercel AI SDK 的流式 UX 没有 Python 等价方案
- 单语言栈降低认知负担
- D5=A 锁定 TikHub-only 后，**Python sidecar 整目录不建**

### 3. Auth 选 Logto Cloud（不是 Supabase Auth）

- Day 1 支持：Email 验证码 / 手机号 / Apple / Google / GitHub
- 原生 WeChat 连接器（M3 加 WeChat 时无需迁移）
- 50K MAU 免费（与 Supabase Auth 一致）
- 不选 Supabase Auth 的原因：它不支持 WeChat，而目标用户为中国创作者，WeChat 入口不可缺失

### 4. 长任务用 Trigger.dev v3

- Vercel 函数最长 800s，30 分钟长稿生成无法在单个函数内完成
- Trigger.dev 免费层覆盖 50K execs/月
- `useRealtimeRun` hook 推送进度到前端，无需自行实现轮询

### 5. SOP / 脚本输出改 HTML + PDF（放弃 .docx）

- npm `docx` 包功能弱于 `python-docx`
- Web 用户场景下 HTML/PDF 更通用（移动端可读）
- 节省约 1 周开发量

### 6. ICP 备案 + WeChat 开放平台尽早启动

- 备案周期 3-6 个月 + 约 $5-15K
- 不立刻启动 → WeChat 上线时间将持续后延

---

## 月度成本

| 阶段 | 月度 |
|---|---|
| MVP（1K MAU, ~5K 批改/月） | **~$131** |
| Growth（50K MAU, ~250K 批改/月） | **~$4,818** |

详细 breakdown 见 [beta_rewrite_plan.md §5](./beta_rewrite_plan.md#5-月度成本预估)。

---

## 8 周 Beta 路线（截至 2026-05-18）

| 周 | 里程碑 | 状态 |
|---|---|---|
| W1 | 地基：monorepo + Next.js + Supabase + Logto + 端到端通 | ✓ |
| W2 | Channel CRUD + TikHub 数据层 + xlsx import | ✓ |
| W3 | Clerk 管线：频道分析 + 3 种 SOP + ASR fallback | ✓ |
| W4 | Muse 管线：竞品监控 + ideas 审批三态 | ✓ |
| W5 | Poet 短稿：Bible + drift + script writer + humanizer | ✓ |
| W6 | Poet 长稿：outline → section expand + Custom Topic flow | ✓ |
| W7 | Upload Critique + Browse + Link Analysis | in progress |
| W8 | Polish + closed beta 邀请 50 人 | — |

---

## 配套文档

完整 8 周拆解、Monorepo 仓库结构、Python 代码迁移评估、风险登记、第一天行动清单：
👉 [`./beta_rewrite_plan.md`](./beta_rewrite_plan.md)
