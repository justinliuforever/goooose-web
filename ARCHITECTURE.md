# 架构

## 部署:3 个独立运行时

| 运行时 | 是什么 | 今 | 可换 |
|---|---|---|---|
| `apps/web` | Next.js 全栈,`next start` → **Web Service** | Vercel hkg1 | Render / 腾讯云 / Docker |
| `apps/jobs` | Trigger.dev 后台长任务,`trigger deploy` | us-east-1 | 自托管 Trigger.dev |
| 数据库 | Supabase 托管 Postgres | 新加坡 | 任意 Postgres |

三者独立、各自可换平台。`packages/*` 不部署——构建时打包进 web 和 jobs。

> `apps/web` 前端 UI 和后端 API 在**同一进程**(一个 `next start` 同时吐页面 + 处理 tRPC/SSR/鉴权),所以是 Web Service,不是 Static Site。

## 仓库布局

```
apps/                  ← 部署单位
  web/    Next.js:UI + tRPC API + SSR + 鉴权
  jobs/   Trigger.dev:抓取 / LLM 编排 / 长稿
packages/              ← 库,被 apps 打包,不单独部署
  db/      Drizzle schema + 迁移 + 复用查询
  shared/  后端核心(核心 IP):clients + services + prompts + schemas + proxy
  ui/      共享 UI 组件
notes/    文档(archive/ 为历史)
```

## 依赖方向(单向无环)

- `apps/web`、`apps/jobs` → `shared`(后端核心,框架无关:无 Next/React/tRPC/db 依赖)、`db`
- `apps/web` → `ui`
- apps 依赖 packages,反之不行;app 之间不互相依赖。

## 何时提成 package

一个 app 用 → 留在该 app(`apps/web/lib`、`components`);两个以上 app 共用 → 提成 `packages/*`。

## 外部服务

| 用途 | 选择 |
|---|---|
| Auth | Logto Cloud(Tokyo) |
| DB | Supabase Postgres + Drizzle(新加坡) |
| 抓取 / 元数据 | TikHub(YouTube + XHS)/ YouTube Data API |
| LLM | DeepSeek V4 Pro+Flash 主,Claude Sonnet 4.6 vision |
| ASR | Deepgram Nova-3 主 + Qwen3-ASR-Flash 备 |

## 任务分流

`< 800s` → `apps/web` 的 Next.js 路由(AI SDK 流式);`≥ 800s` → `apps/jobs` 的 Trigger.dev(前端 `useRealtimeRun` 看进度)。阈值 = Vercel 函数上限。

## 计划中的演进(未执行)

- 拆包:`shared` → `domain` / `integrations` / `prompts`;`jobs` → `worker`。
- ESLint 依赖边界规则强制上面的方向。
- `output: 'standalone'` + Dockerfile → 可搬腾讯云/自托管。
