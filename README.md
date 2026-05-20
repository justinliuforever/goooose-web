# Singularity Web

AI 内容教练 web SaaS — 给中国小型创作者（XHS + YouTube）完成"看对标 → 出选题 → 写稿"的全链路。Closed beta 目标 Q3 2026。

## 技术栈

Next.js 16 · TypeScript · tRPC v11 · Vercel AI SDK · Trigger.dev v3 · Logto Cloud · Supabase + Drizzle · Cloudflare R2 · DeepSeek + Claude Sonnet · Deepgram + Groq Whisper

## 文档

- 架构图与技术栈：[`notes/architecture_final.md`](./notes/architecture_final.md)
- 功能模块、运维注意事项、未来优化：[`notes/beta_rewrite_plan.md`](./notes/beta_rewrite_plan.md)
- Claude Code 工作约定：[`CLAUDE.md`](./CLAUDE.md)

## 仓库结构

```
singularity-web/
├── apps/
│   ├── web/                  # Next.js (Vercel)
│   └── jobs/                 # Trigger.dev 长任务
├── packages/
│   ├── db/                   # Drizzle schema + 迁移 + smoke 脚本
│   ├── shared/               # 核心 IP：prompts / schemas / clients / services
│   └── ui/                   # 共用 UI
└── notes/                    # 架构 + 功能说明
```

## 开发

```bash
pnpm install
pnpm --filter @singularity/web dev          # Next.js dev
pnpm --filter @singularity/jobs dev         # Trigger.dev worker（另开窗口）
```

Smoke 测试（任选）：

```bash
pnpm --filter @singularity/db poet-services-smoke
pnpm --filter @singularity/db muse-services-smoke
pnpm --filter @singularity/db xhs-client-smoke
pnpm --filter @singularity/db vision-and-verify-smoke
pnpm --filter @singularity/db asr-fallback-smoke
```
