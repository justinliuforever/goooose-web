# Singularity Web — 最终架构

**Date**: 2026-05-15

---

## 架构图

```
┌────────────────────────────────────────────────┐
│   浏览器                                        │
└────────────────────┬───────────────────────────┘
                     │
        ┌────────────▼─────────────────────┐
        │   Next.js 15 (Vercel)             │
        │   ─────────────────────────────   │
        │   • Tailwind 4 + shadcn/ui        │
        │   • tRPC v11 (BFF)                │
        │   • Vercel AI SDK (流式批改)      │
        │   • Trigger.dev v3 (长任务)       │
        └────┬─────────────────┬────────────┘
             │                 │
             │                 │ 内部 JWT
             │                 ▼
             │      ┌──────────────────────┐
             │      │  Python Sidecar       │
             │      │  (Render Singapore)   │
             │      │  • yt-dlp + PoToken   │
             │      │  • XHS sign.js        │
             │      │  • ~500 LOC           │
             │      └──────────────────────┘
             │
     ┌───────┼───────┬─────────────────┐
     ▼       ▼       ▼                 ▼
   Logto  Supabase   R2                LLM
  (Auth) (Postgres + (大文件)         Claude / Gemini /
         Realtime)                     DeepSeek / Groq Whisper
```

---

## 技术栈一览

| 层            | 选择                                    |
| ------------- | --------------------------------------- |
| 主语言        | **TypeScript**                          |
| 前端框架      | Next.js 15 App Router (Vercel)          |
| UI 组件       | shadcn/ui + Radix（基于 Tailwind 4）    |
| API 层        | tRPC v11                                |
| 客户端缓存    | tRPC 内置 React Query（按需补 Zustand） |
| AI 流式       | Vercel AI SDK v4+                       |
| 长任务编排    | **Trigger.dev v3**                      |
| **Auth**      | **Logto Cloud**                         |
| 数据库        | Supabase Pro (Postgres + Realtime)      |
| ORM           | Drizzle                                 |
| 大文件存储    | Cloudflare R2                           |
| Python 微服务 | FastAPI on Render SG（仅 yt-dlp + XHS） |
| Monorepo      | pnpm + Turborepo                        |

> 关于状态管理：Next.js 15 Server Components + tRPC + React Query 已经覆盖大部分场景（服务端数据、缓存、乐观更新）。本地 UI 状态用 `useState` + `Context` 即可。仅当出现需要跨页面共享的复杂客户端状态时再引入 Zustand。

---

## 核心决策要点

### 1. 舍弃 Electron 桌面版

- 现有 macOS app 停止维护
- 6K Python LOC 移到 `archive/` 作 prompt 参考库

### 2. 主语言 TypeScript（不是 Python）

- 现有 Python 80% 易移植到 TS（约 3,300 / 6,100 LOC）
- Vercel AI SDK 的流式 UX 没有 Python 等价方案
- 2 人团队单语言栈降低认知负担
- **Python 仅保留** yt-dlp + XHS 抓取微服务

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

| 阶段                             | 月度        |
| -------------------------------- | ----------- |
| MVP（1K MAU, ~5K 批改/月）       | **~$183**   |
| Growth（50K MAU, ~250K 批改/月） | **~$5,368** |

成本结构：MVP 阶段基础设施约 $60，LLM 推理约 $115；Growth 阶段约 70% 为 LLM 推理。

---

## 8 周 Beta 路线

| 周  | 里程碑                                                             |
| --- | ------------------------------------------------------------------ |
| W1  | 地基：monorepo + Next.js + Supabase + Logto + Vercel deploy 全打通 |
| W2  | Channel CRUD + Python sidecar 抓取 YouTube/XHS 跑通                |
| W3  | Clerk 管线（频道分析 + SOP HTML 输出）                             |
| W4  | Muse 管线（竞品监控 + ideas 审批）                                 |
| W5  | Poet 短脚本管线（Bible + script writer + humanizer）               |
| W6  | Poet 长稿管线（outline → section expand，Trigger.dev 主线）        |
| W7  | Upload Critique + Browse + Link Analysis 三模式上线                |
| W8  | Polish + closed beta 邀请 50 人                                    |

---

## 配套文档

完整 8 周拆解、Monorepo 仓库结构、Python 代码迁移评估、风险登记、第一天行动清单：
👉 [`./beta_rewrite_plan.md`](./beta_rewrite_plan.md)
