# Singularity Web — Claude Code 上下文

## 项目状态

**Week 0**：仓库刚初始化，只有 planning 文档。Week 1 Day 1 才开始 `pnpm dlx create-turbo` 拉骨架。

## 它是什么

AI 内容教练 web SaaS。目标用户：中国小型创作者（1-2 人团队，主战 XHS + YouTube）。核心交付：60 秒内出流式 AI 批改稿件。

完整定位 / 业务模型见 `notes/beta_rewrite_plan.md`。

## 锁定的技术栈

| 层 | 选择 |
|---|---|
| 主语言 | **TypeScript**（仅 yt-dlp / XHS sidecar 用 Python）|
| 前端 | Next.js 15 App Router on Vercel |
| UI | Tailwind 4 + shadcn/ui + Radix |
| API | tRPC v11 |
| AI 流式 | Vercel AI SDK v4+ |
| 长任务 | Trigger.dev v3（Vercel Pro 函数最长 800s 跑不了 30 min 长稿）|
| Auth | Logto Cloud（不是 Supabase Auth；要支持 WeChat）|
| DB | Supabase Pro (Postgres + Realtime) + Drizzle ORM |
| 大文件 | Cloudflare R2 |
| Python sidecar | FastAPI on Render SG（yt-dlp + bgutil-pot-provider + XHS sign.js）|
| Monorepo | pnpm + Turborepo |

## 约定

- TS 一统天下，Python 只在 `apps/scraper/` 出现
- **不**预装 Zustand。客户端状态用 tRPC + React Query + useState/Context；只有跨页面复杂共享状态出现时才引入
- 所有 prompt 模板集中在 `packages/shared/prompts/`（核心 IP）
- 所有 Trigger.dev 任务在 `apps/jobs/trigger/`
- 文档输出统一 HTML + PDF（不做 `.docx`）
- 用词避免"拍死""完胜""硬伤"等口语化措辞

## 仍待 Justin 决定

- **D3**：1 人 8 周 vs 2 人 5 周开发节奏
- **D4**：ICP 备案 + 微信开放平台是否 Week 1 启动

## 前身仓库（archive）

`~/Desktop/Singularity-Macos-Social-Media-AI-Agent/` — Electron 原型，含 6K Python LOC。
重写时从这里查阅：
- prompt 模板（`backend/app/prompts/*.py`）
- bible drift detection 算法（`backend/app/services/bible_generator.py`）
- long-form thresholds（`backend/app/services/script_writer.py`）
- XHS sign.js（`backend/app/services/xhs_fetcher.py`）
- LLM 调用 retry 模式（`backend/app/services/transcript.py`）
