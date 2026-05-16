# Singularity Web

AI 内容教练 — Chinese-native creators 上传任意稿件（视频 / 图 / 文 / 标题），获取流式 LLM 批改 + 改写建议，背靠 XHS + YouTube 头部创作者实时知识库。

## 状态

🚧 开发中。Closed beta 目标：Q3 2026。

## 架构

- 总览：[`notes/architecture_final.md`](./notes/architecture_final.md)
- 完整 8 周 beta 计划：[`notes/beta_rewrite_plan.md`](./notes/beta_rewrite_plan.md)

## 技术栈

Next.js 15 · TypeScript · tRPC · Vercel AI SDK · Trigger.dev · Logto Cloud · Supabase · Drizzle · Cloudflare R2

Python sidecar（yt-dlp + XHS 抓取，~500 LOC）部署到 Render Singapore。

## 仓库结构（开发中，Week 1 由 Turborepo 初始化）

```
singularity-web/
├── notes/                  # 架构 / 计划文档
├── apps/                   # Week 1 添加
│   ├── web/                # Next.js (Vercel)
│   ├── scraper/            # Python sidecar (Render)
│   └── jobs/               # Trigger.dev 任务
├── packages/               # Week 1 添加
│   ├── db/                 # Drizzle schema
│   ├── shared/             # Zod + prompts
│   └── ui/                 # shadcn 共用
└── infra/                  # 部署配置
```

## 前身

本项目是 Electron 桌面原型的 web 重写。原仓库（仅作参考归档）：
[Singularity-Macos-Social-Media-AI-Agent](https://github.com/Oooowadd/Singularity-Macos-Social-Media-AI-Agent)

可在那里查阅原始 Python prompt 模板、LLM 调用模式、抓取层踩坑历史。
