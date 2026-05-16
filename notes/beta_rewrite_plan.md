# Singularity Web — Beta

**Date**: 2026-05-15
**Supersedes**: 2026-04-25 v3 架构决策中关于后端语言 + Auth provider 的部分（其他不变）

---

## 0. TL;DR

**Next.js 15 + Vercel AI SDK + Trigger.dev v3 + Supabase + Logto Cloud + Python yt-dlp sidecar**

- 主代码 TypeScript / Node
- Python 仅保留一个微服务（YouTube / XHS 抓取）
- 预计 **8 周到 closed beta**
- MVP 月度成本 **< $200**

---

## 1.

| 组件           | v3 (2026-04-25 锁定)            | v4 (当前)                                                   | 理由                                                                                                                             |
| -------------- | ------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **后端主语言** | Python FastAPI（6K LOC 全保留） | **Node.js / Next.js 主体 + Python sidecar 只跑 yt-dlp/XHS** | (1) Vercel AI SDK 的 streaming UX 无 Python 等价；(2) 80% Python 代码（3,300/6,100 LOC）易移植；(3) 2 人团队单语言栈降低认知负担 |
| **Auth**       | Casdoor 自部署                  | **Logto Cloud**（Day 1）                                    | (1) Logto Cloud 50K MAU 免费、$24/mo 无限；(2) 原生 WeChat web + native 连接器；(3) 2 人团队不便运维独立 auth server             |
| **长任务编排** | 未明确（默认 BullMQ + Redis）   | **Trigger.dev v3**                                          | (1) MVP 免费层覆盖 50K execs/月；(2) `useRealtimeRun` hook 推进度到前端；(3) 无超时（支持 20-30 min 长稿生成）                   |

其他保留：Supabase Pro / Cloudflare R2 / LLM 四源（Claude / Gemini / DeepSeek / Groq Whisper）/ China routing 三阶段策略。

---

## 2. 最终技术栈

```
┌─ Frontend ────────────────────────────────────┐
│  Next.js 15 App Router (Vercel)               │
│  Tailwind 4 + shadcn/ui + Radix               │
│  tRPC v11（前后端类型契约）                    │
│  tRPC 内置 React Query（按需补 Zustand）       │
└────────────────────────────────────────────────┘

┌─ AI / 长任务 ─────────────────────────────────┐
│  Vercel AI SDK v4+                            │
│    ├─ streamText / useChat → Class A 短批改   │
│    ├─ streamObject / useObject → JSON 流式    │
│    └─ stopWhen: stepCountIs(N) → 多步 agent   │
│                                                │
│  Trigger.dev v3 → Class B 长任务              │
│    └─ useRealtimeRun → 进度推送                │
└────────────────────────────────────────────────┘

┌─ Auth ─────────────────────────────────────────┐
│  Logto Cloud                                   │
│    Day 1: Email OTP + Apple + Google           │
│    M3+: WeChat 扫码（ICP 备案后开启）          │
└────────────────────────────────────────────────┘

┌─ Data ─────────────────────────────────────────┐
│  Supabase Pro (Postgres + Realtime + Storage)  │
│  Drizzle ORM                                   │
│  Cloudflare R2（音视频大文件）                  │
└────────────────────────────────────────────────┘

┌─ Python Sidecar ───────────────────────────────┐
│  Render Singapore（小实例 $7-25/mo）           │
│  FastAPI 薄壳                                  │
│  yt-dlp + bgutil-pot-provider (Deno) + ffmpeg │
│  XHS sign.js 执行器                            │
│  约 500-800 LOC                                │
└────────────────────────────────────────────────┘
```

> 状态管理说明：Next.js 15 Server Components + tRPC + React Query 已覆盖服务端数据缓存与乐观更新。本地 UI 状态用 `useState` + `Context` 即可。仅当出现需要跨页面共享的复杂客户端状态时再引入 Zustand。

---

## 3. Monorepo 仓库结构

```
singularity-web/
├── apps/
│   ├── web/                          # Next.js (Vercel)
│   │   ├── app/
│   │   │   ├── (marketing)/          # 营销页 (SSG, SEO)
│   │   │   ├── (app)/                # 登录后产品页
│   │   │   ├── api/trpc/[trpc]/      # tRPC 端点
│   │   │   └── api/critique/         # 流式 LLM 端点
│   │   ├── components/               # shadcn 实例化组件
│   │   ├── lib/                      # 客户端工具
│   │   └── server/                   # 服务端代码
│   │       ├── trpc/                 # tRPC routers
│   │       └── ai/                   # AI SDK 调用 + prompts 引用
│   ├── scraper/                      # Python sidecar (Render)
│   │   ├── app/
│   │   │   ├── main.py
│   │   │   ├── youtube.py            # yt-dlp wrapper
│   │   │   ├── xhs.py                # XHS sign.js + fetch
│   │   │   └── pot_provider.py       # PoToken 集成
│   │   └── pyproject.toml
│   └── jobs/                         # Trigger.dev 任务定义
│       └── trigger/
│           ├── long-form.ts          # Class B 长脚本生成
│           ├── analyze-channel.ts    # Clerk 管线
│           └── monitor-competitors.ts# Muse 管线
├── packages/
│   ├── db/                           # Drizzle schema + migrations
│   │   └── schema/
│   ├── shared/                       # Zod schemas, 类型, 常量
│   │   └── prompts/                  # 全部 prompt 模板（核心 IP）
│   └── ui/                           # shadcn 共用组件
├── infra/
│   ├── render.yaml                   # scraper sidecar 部署
│   └── supabase/                     # migrations
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

**关键设计原则：**

1. **`packages/shared/prompts/`** — 所有 prompt 模板集中在此，无论 Next.js 还是 Trigger.dev 都从这里 import。这是核心 IP 的统一仓库
2. **`apps/jobs/`** — Trigger.dev 任务文件，部署到 Trigger.dev 云端，从 Next.js 触发
3. **`packages/db/`** — Drizzle schema 是 single source of truth，migrations 走 git
4. **`apps/scraper/`** — 唯一 Python 子目录，独立 deploy 到 Render SG

---

## 4. 现有代码迁移评估（基于 2026-05-15 audit）

| 分类        | LOC       | 处理                                                           |
| ----------- | --------- | -------------------------------------------------------------- |
| EASY        | 3,200     | 移植到 TS，5-7 天                                              |
| MEDIUM      | 1,700     | 找 npm 等价包，5-7 天                                          |
| HARD        | 1,100     | **重新设计**：`.docx` 改 HTML/PDF；XHS Spider 重写为 Node `vm` |
| PROMPT-ONLY | 100       | 复制粘贴                                                       |
| **总计**    | **6,100** | **5-7 person-weeks**                                           |

### 关键决策：放弃 `.docx` 输出，改用 HTML + PDF

理由：

- `python-docx` → npm `docx` 功能差距明显
- Web 用户场景下，HTML 预览 + PDF 下载比 `.docx` 更通用（移动端可读）
- SOP 文档本质是结构化文本，HTML 表达力足够
- 节省 5-7 天工作量

### 核心 IP（必须 1:1 移植）

- `prompts/poet_prompts.py` — SCRIPT_WRITING_PROMPT, LONG_FORM_OUTLINE_PROMPT, SECTION_EXPAND_PROMPT, CHANNEL_BIBLE_PROMPT
- `prompts/muse_prompts.py` — VIRAL_TRIGGER_PROMPT, IDEA_GENERATION_PROMPT
- `prompts/clerk_prompts.py` — analysis prompts
- `services/humanizer.py` — humanize_chinese prompt
- `services/bible_generator.py` 中的 drift detection 算法（lexical overlap + stopwords list）
- `services/script_writer.py` 中的 long-form thresholds（中文 4000 字 / 英文 3000 词）

---

## 5. 8-周 Beta 路线

### Week 1: 地基（端到端 hello-world）

- [ ] Create monorepo: pnpm + Turborepo + Next.js 15 + Tailwind + shadcn
- [ ] Setup Supabase project, Drizzle schema (users, channels, sessions)
- [ ] Setup Logto Cloud, integrate Email OTP
- [ ] Setup Vercel deploy
- [ ] Setup Render project for scraper sidecar
- [ ] Setup Trigger.dev project
- [ ] **交付**：访问 web 域名 → 邮箱注册 → 登录后欢迎页

### Week 2: Channel CRUD + 抓取 sidecar

- [ ] Channel schema + tRPC CRUD endpoints
- [ ] Channel 列表 UI（shadcn DataTable）
- [ ] Python sidecar: yt-dlp + bgutil-pot-provider Docker compose
- [ ] Sidecar API: `POST /youtube/fetch-channel`, `POST /youtube/transcript`
- [ ] Next.js 通过内部 JWT 调 sidecar
- [ ] **交付**：UI 创建频道 → 触发 sidecar 抓取 → 数据落 Supabase

### Week 3: Clerk 管线（分析器 + SOP 生成）

- [ ] Port `services/analyzer.py` → `packages/shared/agents/clerk-analyzer.ts`
- [ ] Port `services/sop_generator.py` → 输出 HTML/Markdown 而非 `.docx`
- [ ] Trigger.dev task: `analyze-channel`
- [ ] UI: 分析进度页（`useRealtimeRun` 推进度）
- [ ] **交付**：选频道 → 启动 Clerk 分析 → 流式进度 → SOP HTML 渲染

### Week 4: Muse 管线（监控 + idea 生成）

- [ ] Port `classifier.py` + `viral_analyzer.py` + `idea_generator.py` → TS
- [ ] Imagination gate 逻辑保留（字幕 < 200 字符跳过）
- [ ] Approval workflow（tRPC mutation）
- [ ] Trigger.dev task: `monitor-competitors`
- [ ] UI: ideas table（shadcn）+ approve toggle
- [ ] **交付**：监控竞品 → 生成 ideas → 用户审批

### Week 5: Poet 管线（Bible + 短脚本）

- [ ] Port `bible_generator.py` 含 drift detection
- [ ] Port `script_writer.py` 短脚本路径（< 20 min）
- [ ] Port `humanizer.py`
- [ ] Trigger.dev task: `generate-script-short`
- [ ] UI: Bible 编辑器 + script 列表
- [ ] **交付**：选 idea + bible → 生成短脚本 → markdown 预览

### Week 6: Poet 长稿管线（Class B 主线）

- [ ] Port `script_writer.py` 长稿路径（outline → section expand）
- [ ] Trigger.dev task: `generate-script-long`（无 timeout）
- [ ] UI: 长稿生成页（phase 切换：outline / section 1/N / humanize / done）
- [ ] **交付**：30 分钟视频脚本一键生成，前端流式看进度

### Week 7: Upload Critique（核心 MVP 功能）

- [ ] Upload UI（文本 + 图 + 短视频）
- [ ] AI SDK `streamText` 流式批改（Claude Sonnet 4.6）
- [ ] Browse 模式（pre-generated AI 资讯 trends）从 Supabase 渲染
- [ ] Link Analysis 模式（粘贴 URL → 调 sidecar 抓取 → LLM 分析）
- [ ] **交付**：3 个核心模式全部可用

### Week 8: Polish + Beta 上线

- [ ] Onboarding flow（首次登录引导）
- [ ] Quota 系统（Free tier：3 video/mo + 5 images + 5 scripts，带水印）
- [ ] 计费骨架（预留 Stripe，不开收费）
- [ ] Bug 修复 + 体验打磨
- [ ] 邀请首批 50 用户 closed beta
- [ ] **交付**：beta 上线，开始收集 feedback

---

## 6. 风险登记

| #   | 风险                            | 概率 | 影响 | 缓解                                                                    |
| --- | ------------------------------- | ---- | ---- | ----------------------------------------------------------------------- |
| R1  | yt-dlp PoToken 持续维护负担     | 高   | 中   | 选用 `bgutil-ytdlp-pot-provider` 社区方案；备 `youtubei.js` 作 fallback |
| R2  | XHS sign.js Node 实现需自行编写 | 高   | 中   | 第一版用 Node `vm` 模块跑现有 sign.js；改动小                           |
| R3  | Trigger.dev v3 vendor lock      | 中   | 中   | 任务逻辑写在 `apps/jobs/`，可迁 Inngest/Hatchet；接口层抽象             |
| R4  | Logto Cloud 价格未来上涨        | 低   | 低   | $24/mo 无限 MAU 已有竞争力；最坏迁 Casdoor 自部署                       |
| R5  | Vercel 5TB 出口后成本明显上升   | 中   | 高   | 监控带宽；50K MAU 前迁 Cloudflare Pages                                 |
| R6  | `.docx` 不支持，用户反馈        | 低   | 低   | Studio tier 时加付费 `.docx` 转换服务（headless LibreOffice）           |
| R7  | WeChat 网站应用审批被拒         | 中   | 中   | Day 1 不依赖；M3+ 通过 Logto 加；备选合作伙伴 WFOE 代申请               |
| R8  | 8 周时间表偏紧                  | 中   | 高   | Week 5-6 是关键路径；如延期，Upload Critique 视频形态后置，先做文本     |

---

## 7. 月度成本预估

### MVP (1K MAU, ~5K 批改/月)

| 项                           | 价           |
| ---------------------------- | ------------ |
| Vercel Pro                   | $20          |
| Supabase Pro                 | $25          |
| Render scraper (Starter)     | $7           |
| Logto Cloud (free 50K MAU)   | $0           |
| Trigger.dev (free 50K execs) | $0           |
| Cloudflare R2                | $1           |
| BrightData PAYG              | $15          |
| Claude 主批改                | $75          |
| Gemini 2.5 Flash 视频帧      | $30          |
| DeepSeek 分类                | $5           |
| Groq Whisper                 | $5           |
| **合计**                     | **~$183/mo** |

### Growth (50K MAU, ~250K 批改/月)

| 项                           | 价             |
| ---------------------------- | -------------- |
| Vercel Pro + 带宽            | ~$770          |
| Supabase Team                | $599           |
| Render scraper (Standard ×2) | $50            |
| Logto Cloud Pro              | $24            |
| Trigger.dev Pro              | $50            |
| Cloudflare R2                | $75            |
| BrightData                   | $300           |
| LLM 四源                     | ~$3,500        |
| **合计**                     | **~$5,368/mo** |

与 2026-04-25 v3 成本模型基本一致（$224 / $5,329）。

---

## 8. 仍待 Justin 决定的 4 个事项

| #      | 决策                                        | 选项                                                                        | 我的建议                                                        | 截止   |
| ------ | ------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------- | ------ |
| **D1** | Electron 旧版处理                           | A) 立即停止维护，专心 web B) 双轨并行到 M3                                  | **A** — 旧版无真实用户，绑定本地数据，维护成本高                | Week 1 |
| **D2** | 现有 ~6K Python LOC 命运                    | A) `git rm -r`，仅保留 prompts + sidecar 必要部分 B) 移到 `archive/` 作参考 | **B** — 便于查 prompt 历史和 LLM 调用经验                       | Week 1 |
| **D3** | 1 人还是 2 人开发？时间表是否需根据人力调整 | —                                                                           | 8 周计划假设 1 人全职。2 人可压到 5 周                          | Week 1 |
| **D4** | 是否提前启动 ICP / 微信开放平台申请流程     | A) 立刻启动（M3 上线 WeChat） B) 等 beta 反馈再说                           | **A** — 备案 3-6 月，启动越早越好；不然 WeChat 上线时间持续后延 | Week 2 |

---

## 9. 第一天具体行动（Week 1 Day 1）

```bash
# 1. 新建仓库
mkdir singularity-web && cd singularity-web
git init
pnpm init

# 2. 装 Turborepo + 基础结构
pnpm dlx create-turbo@latest .

# 3. 创建 apps/web (Next.js 15)
cd apps && pnpm dlx create-next-app@latest web \
  --typescript --tailwind --app --src-dir=false

# 4. 装 shadcn
cd web && pnpm dlx shadcn@latest init

# 5. 创建 packages/db + Drizzle
cd ../../packages && mkdir db && cd db
pnpm init -y && pnpm add drizzle-orm postgres

# 6. 注册云服务（仅注册，先不配）
#   - Vercel (link to GitHub repo)
#   - Supabase (create project, note connection string)
#   - Logto Cloud (create tenant)
#   - Trigger.dev (create project)
#   - Render (Week 2 用)

# 7. 部署 hello-world 到 Vercel
git add . && git commit -m "init"
gh repo create singularity-web --private --source=. --remote=origin --push
# Vercel 自动 deploy
```

End-of-day 1 交付：访问 `*.vercel.app` 域名能看到 Next.js 默认页 + Tailwind 工作。

---

## 附录 A — Python 包到 npm 包映射

| Python                            | npm                                 | 难度     |
| --------------------------------- | ----------------------------------- | -------- |
| fastapi → next.js api routes      | (built-in)                          | 易       |
| aiosqlite → drizzle + postgres-js | `drizzle-orm`, `postgres`           | 易       |
| openai (Python) → openai (Node)   | `openai`                            | 易       |
| youtube-transcript-api            | `youtube-transcript-api` (npm port) | 易       |
| pydantic                          | `zod`                               | 易       |
| loguru                            | `pino`                              | 易       |
| requests                          | `fetch` (built-in)                  | 易       |
| python-docx                       | `docx`（功能弱）→ **改用 HTML/PDF** | **避开** |
| websockets                        | `ws` (via Next.js)                  | 易       |
| groq                              | `groq-sdk`                          | 易       |
| yt-dlp                            | **保留 Python sidecar**             | 不移植   |
| PyExecJS                          | `vm` (Node built-in)                | 易       |
| openpyxl                          | `exceljs`                           | 易       |

---

## 附录 B — 关键技术决策的研究证据

### B.1 yt-dlp 在 2026 的真实状态

- PoToken/SABR 改动要求 yt-dlp + Deno + `bgutil-ytdlp-pot-provider` 容器
- Node-native YouTube 库：`ytdl-core` abandoned；`@distube/ytdl-core` archived；`@ybd-project/ytdl-core` 被 GitHub 标 spam；唯一仍维护的是 `youtubei.js` (LuanRT, v17.0.1 / 2026-03)
- 结论：Python sidecar 包含 yt-dlp + PoToken 容器；可备 `youtubei.js` 作 fallback

### B.2 Vercel Function 超时限制（2026-02 Fluid Compute）

- Hobby: 300s
- Pro: **800s（13 min）**
- Enterprise: 800s（可定制）
- → Class B 长任务（20-30 min）必须走 Trigger.dev / Inngest / Hatchet

### B.3 Trigger.dev v3 vs Inngest 对比

|               | Trigger.dev v3           | Inngest              |
| ------------- | ------------------------ | -------------------- |
| 免费层        | 50K execs/mo, 20 并发    | 50K execs/mo, 5 并发 |
| Pro 起步      | $10/mo Hobby, $50/mo Pro | $75/mo               |
| Realtime hook | 内置 `useRealtimeRun`    | 需 +Inngest Realtime |
| TS DX         | 最佳                     | 良好                 |

→ MVP 阶段 Trigger.dev 优势明显

### B.4 Auth.js v5 内置 WeChat（备选项）

- 路径：`packages/core/src/providers/wechat.ts`
- 社区扩展：`@next-auth-oauth/wechat` 支持 OfficialAccount + WebsiteApp
- 仍需自管 session 持久化、用户表 — Logto Cloud 在运维成本上更优

### B.5 ICP 备案 2026 现状

- 外资实体不能直接 ICP 备案，需 WFOE / JV / 中国合作方
- 端到端成本：US$5K-15K，timeline 3-6 个月
- 关键发现：如果不用 `.cn` 域名 + 不在中国大陆托管，WeChat web 登录可绕过 ICP（只需 ¥300 网站应用审核）；但 Mini Program 后端 callback 域名仍需 ICP

---

**Date locked**: 2026-05-15
**Next review**: 完成 Week 1 后
