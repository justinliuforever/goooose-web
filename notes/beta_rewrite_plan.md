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

### Week 1: 地基（端到端 hello-world） — **✓ 完成 2026-05-16**

- [x] Create monorepo: pnpm + Turborepo + Next.js 16 + Tailwind 4 + shadcn base-nova
- [x] Setup Supabase project, Drizzle schema (11 张表 — users + channels + pipeline_runs + clerk×2 + muse×2 + poet×4)
- [x] Setup Logto Cloud, integrate Email OTP（branded sign-in page，Caveat 字体 + Singularity logo + 浅色背景）
- [ ] Setup deploy host（Vercel vs Render — D6 仍待定，W2 后期决；本地 dev 跑通即可）
- [ ] Setup Render project for scraper sidecar（W2 D3+ 视 D5 而定）
- [ ] Setup Trigger.dev project（W3 用到再设）
- [x] **不**做 user-facing Settings UI：keys 服务端托管 `.env.local`
- [x] **交付**：访问 localhost → 邮箱 OTP 登录 → splash 动画 → dashboard 空状态 CTA

### Week 2: Channel CRUD + 抓取 sidecar — **D1+D2 完成 2026-05-17**

- [ ] **D5 决定 XHS 数据层**：(A) TikHub-only（79 endpoint、$0.01/call、10 req/s、托管 sign.js + cookie）；(B) 混合（yt-dlp Python sidecar + TikHub for XHS）；(C) Spider_XHS Python sidecar（archive 路线）。调研 TikHub 是否覆盖 YouTube transcript，对比 5K 批改/月成本
- [x] **D1**：Channel schema + tRPC v11 CRUD endpoints（list/create/delete，slug 自动生成 + 冲突检测）
- [x] **D1**：Channel 列表 UI（shadcn Table + AlertDialog 删除确认 + Field/Input/Select/Textarea 创建表单）
- [x] **D2**：xlsx archive 数据 import（`packages/db/scripts/import-archive.ts` — 10 channels + 218 clerk_videos + 31 sops + 10 muse_videos + 50 ideas + 7 bibles + 18 custom topics 全绑 justinliuforever@gmail.com）
- [ ] **D2 续**：Channel detail/edit 页（`/channels/[slug]` — 平台 URL + description + competitors + 关联实体计数）
- [ ] **D3**：Python sidecar yt-dlp + bgutil-pot-provider Docker compose（若 D5=A 则整个 `apps/scraper` 不需要）
- [ ] **D3**：Sidecar API: `POST /youtube/fetch-channel`, `POST /youtube/transcript`（同上条件）
- [ ] **D3**：Next.js 通过内部 JWT 调 sidecar（同上条件）
- [ ] **交付**：UI 创建频道 → 触发抓取 → 数据落 Supabase

### Week 3: Clerk 管线（分析器 + SOP 生成）

- [ ] Port `services/analyzer.py` → `packages/shared/agents/clerk-analyzer.ts`
- [ ] analyzer 输出**双字段**：`facts_and_data`（paraphrased）+ `verbatim_facts`（数字 / 型号 / 日期 / 引用字符级保留 + `[src: ...]` 来源；archive 2026-05 加的，原 plan 没覆盖）
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

- [ ] Port `bible_generator.py` 含 drift detection（lexical overlap + AI-bias 标记词；≥3 命中 Bible 存为 `is_active=false` + 文件名 `_DRIFTED` 后缀；UI 黄色 banner + Regenerate）
- [ ] Port `script_writer.py` 短脚本路径（< 20 min）
- [ ] Port `humanizer.py`
- [ ] Trigger.dev task: `generate-script-short`
- [ ] UI: Bible 编辑器（含 inline 编辑）+ script 列表 + drift 警告 banner
- [ ] **Poet Custom Topic flow**（archive 2026-05 加的，原 plan 没覆盖）—— 跳过 Muse，用户输入主题 + 附件（YouTube / XHS URL / 粘贴文本）→ 用 active Bible + SOP 直接生成。新表 `poet_custom_topics`，archive 整体 ~614 LOC（`poet_custom_repo.py` + `routers/poet.py` 的 `POST /custom-topic` + UI panel `CustomTopicPanel.tsx` 507 行）
- [ ] **交付**：选 idea + bible → 生成短脚本 → markdown 预览；或用 Custom Topic 直接进入 Poet

### Week 6: Poet 长稿管线（Class B 主线）

- [ ] Port `script_writer.py` 长稿路径（outline → section expand；触发阈值：中文 ≥2000 字 / 英文 ≥1500 词，约 10 min+）
- [ ] Script writer prompt 强制 **VERBATIM PRESERVATION** 规则（archive 2026-05 加的，原 plan 没覆盖）：references 里的数字 / 日期 / 型号 / 人名 / 引用一律字符级保留，不 paraphrase；source 标注 `[src: ...]`
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
- [ ] 用户 profile / quota 页（取代 archive 的 Settings.tsx；无 user-facing API key 配置）
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
| R2  | XHS sign.js Node 实现需自行编写 | 高 → 待 D5 | 中 | **W2 评估 TikHub**（托管 sign.js + cookie + 79 endpoint，$0.01/call、10 req/s）；选用则风险降为低，Python sidecar 可能整体不需要。回退：Node `vm` 跑 archive 的 sign.js |
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
| **D3** | 1 人还是 2 人开发？时间表是否需根据人力调整 | — | **✓ 2026-05-16 锁定：1 人 8 周节奏** | ✓ |
| **D4** | 是否提前启动 ICP / 微信开放平台申请流程     | A) 立刻启动（M3 上线 WeChat） B) 等 beta 反馈再说                           | **A** — 备案 3-6 月，启动越早越好；不然 WeChat 上线时间持续后延 | Week 2 |
| **D5** | 生产 XHS 数据层 | A) TikHub-only（删除 Python sidecar）B) 混合（yt-dlp Python + TikHub for XHS） C) Spider_XHS Python sidecar | **W2 调研后定**（TikHub 是否覆盖 YouTube transcript？5K 批改/月成本对比 vs Render sidecar） | Week 2 |
| **D6** | Deploy host | A) Vercel（800s 函数限制） B) Render（与 sidecar 统一管理） | **W1 末定**（取决于 D5：若 D5=A 则 Render 跟 sidecar 统一的优势降低） | Week 1 |

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

## 10. Plan revisions

### 2026-05-16

下列条目来自 archive 的 2026-05 更新（原 2026-05-15 plan 没覆盖）或本日新决策：

1. **W3**：analyzer 输出 `verbatim_facts`（字符级保留 + `[src: ...]` 来源）
2. **W5**：Poet **Custom Topic flow**（跳过 Muse 的第三种 Poet 入口；archive ~614 LOC）
3. **W5**：Bible drift detection 落地（`is_active=false` + `_DRIFTED` 后缀 + UI banner）
4. **W6**：Script writer **VERBATIM PRESERVATION** 规则
5. **W1 / W8**：取消 user-facing Settings UI（archive `Settings.tsx` 635 行）；keys 服务端托管；W8 用户页改 profile / quota
6. **D3 resolved**：1 人 8 周节奏
7. **新 D5**：XHS 数据层（TikHub-only vs 混合 vs Spider_XHS）—— W2 决
8. **新 D6**：Deploy host（Vercel vs Render）—— W1 末定，与 D5 联动
9. **栈实操数字**：Next.js 15 → **16.2.6**（App Router 不变；`@latest` 拿到 16）；pnpm 11 的 `allowBuilds` 显式批准 `sharp` + `unrs-resolver`，跳过 `msw`
10. **长稿阈值修正**：中文 ≥**2000** 字 / 英文 ≥**1500** 词（CLAUDE.md 之前写 4000/3000 是误记，archive `script_writer.py:_write_script_long_form()` 实际值）

---

### 2026-05-17

11. **W1 完成**：monorepo + Next.js 16.2.6 + 11 张表上 Supabase + Logto branded sign-in 端到端通；splash 动画 + dashboard 空状态 CTA 全 live tested
12. **W2 D1 完成**：channel CRUD（list/create/delete）live tested
13. **W2 D2 完成**：xlsx archive 数据 import 落库（10 channels + 218 + 31 + 10 + 50 + 7 + 18 行 全 user_id 绑定 justinliuforever@gmail.com）
14. **新增 schema enum value**：`sop_type` 加 `single_video`（archive 实际用过，11 张表设计阶段漏了）
15. **xlsx 导出丢损**：archive 的 xlsx 把所有长文本截到 ~301 字符（`poet_bible.content`, `clerk_sops.content_md`, `custom_topic.references_json`, 多数 clerk video 分析字段）。**TODO**：W3 Clerk + W5 Poet 实现后让用户重跑 pipeline 重建全文
16. **跳过 import 的表**：`poet_scripts`（10 行）—— xlsx 没存 `script_text`（archive 用 `file_path` 引旧机本地文件），且行列结构有两种不一致 layout。W5 实现 Poet 后从 ideas / custom_topics 重新生成
17. **运维发现 1**：Supabase ap-southeast-1 项目本地 IPv4 网络只能走 **Supavisor pooler `aws-1-ap-southeast-1.pooler.supabase.com:6543`**（不是 aws-0），直连 `db.{ref}.supabase.co` IPv6-only 跑不通。`postgres-js` 必须 `prepare: false`
18. **运维发现 2**：Next.js 16 cookies 修改只能在 **Route Handler** 或 **Server Action**，不能在 Page Component。`/callback` 必须是 `route.ts`（调 `handleSignIn`）→ redirect 到 `/welcome`（page，渲染 splash）；不能合并为单一 page
19. **运维发现 3**：Next.js 16 把 `middleware.ts` / `middleware()` 重命名为 `proxy.ts` / `proxy()`
20. **运维发现 4**：pnpm 11 ERR_PNPM_IGNORED_BUILDS — 在 `pnpm-workspace.yaml` 用 `allowBuilds` 显式批准 `sharp`/`unrs-resolver`/`esbuild`，明确跳过 `msw`
21. **运维发现 5**：base-nova shadcn 用 `render` prop 而非 `asChild`；`DropdownMenuLabel` 必须包在 `DropdownMenuGroup` 里（否则 `MenuGroupRootContext is missing` 报错）
22. **运维发现 6**：16GB Mac 在 Turbopack 冷编译时可能 OS 级 crash，给 dev script 加 `NODE_OPTIONS=--max-old-space-size=4096` cap

---

**Date locked**: 2026-05-15（原版）；revisions 2026-05-16 + 2026-05-17 追加
**Next review**: 完成 Week 2 D3（scraper sidecar）后
