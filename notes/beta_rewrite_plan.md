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

- [x] **D5 — A 锁定**：TikHub-only（79 XHS endpoint + 50 YouTube endpoint，$0.001-0.01/call，1 req/sec per route）；Python sidecar 整目录不建
- [x] **D1**：Channel schema + tRPC v11 CRUD endpoints（list/create/delete，slug 自动生成 + 冲突检测）
- [x] **D1**：Channel 列表 UI（shadcn Table + AlertDialog 删除确认 + Field/Input/Select/Textarea 创建表单）
- [x] **D2**：xlsx archive 数据 import（`packages/db/scripts/import-archive.ts` — 10 channels + 218 clerk_videos + 31 sops + 10 muse_videos + 50 ideas + 7 bibles + 18 custom topics 全绑 justinliuforever@gmail.com）
- [x] **D2 续**：Channel detail/edit 页（`/channels/[slug]` — Edit drawer + 3 stat cards 链跳 agent 视图）
- [x] **D2 续**：Agent 浏览 UI（`/clerk` 三级 + `/muse` 二级 + `/poet` 三级 + topic detail + 7 个 loading skeleton）
- [x] **D2 续**：sanity-check + tikhub-smoke + groq-asr-smoke 三个测试脚本
- ~~D3 Python sidecar~~ → ✗ 不做（D5=A）
- [x] **D6**：Vercel 锁定（D5=A 后 Render 优势消失）
- [x] **Trigger.dev 配置**：apps/jobs scaffold + worker 连云（proj_lfwtogxhtvfemlfqeooh，build 20260517.1）
- [x] **LLM 栈**：Vercel AI SDK + `@ai-sdk/deepseek`，flash/pro 双 tier via `apps/web/lib/llm.ts`
- [x] **apps/scraper 清理**（D5=A 后整目录删除）
- [ ] **下一步**：W3 Clerk pipeline（见下）

### Week 3: Clerk 管线（分析器 + SOP 生成）

- [x] **D1**：Port `prompts/clerk_prompts.py` → `packages/shared/prompts/clerk.ts`（6 个 prompts 1:1 移植，含 builder 函数 + Zod schema + clerkAnalysisToDbRow mapper）
- [x] **D1**：Trigger.dev task `clerk-analyze-channel`（apps/jobs/trigger/analyze-channel.ts）— 端到端 live test 跑通 @MKBHD，DeepSeek V4 Pro 实分析落 DB
- [x] **D1**：`apps/web/lib/{llm,tikhub}.ts` 经 `packages/shared/clients/` thin shared client（lazy-init 避开 Trigger.dev bundle-time throw）
- [x] **D1**：tRPC `clerk.startAnalysis` + `clerk.runStatus` mutation/query；UI `/clerk/[slug]` Run analysis button + `useRealtimeRun` 进度显示
- [x] **D1 诊断**：fixed 3 个 live test 暴露的 issue：(a) `generateObject` strict Zod 在 DeepSeek compatibility mode 易拒，换成 `generateText` + 软 JSON parse；(b) TikHub `/web_v2/get_video_info` 对最新视频 metadata 稀疏，fall back 到 channel-listing 字段；(c) DeepSeek 偶尔输出 NULL byte (U+0000)，postgres TEXT 拒，加 `safeText()` 全局过滤
- [x] **D2**：SOP generator（port `services/sop_generator.py`）— 跑完分析后用 V4-Pro 生成 human / ai_reference / hottest 三种 SOP markdown 写 `clerk_sops`；@MKBHD 测试 generated 2 SOPs (15.6KB + 13.1KB)，hottest 因 transcript 空自动跳过
- [x] **D2**：`/clerk/[slug]` 加 SOP 渲染（react-markdown + remark-gfm，最新 generation 自动顶起，旧 SOPs 跑前先 delete 清理）
- [x] **D2 polish 1 — 中文化**：sidebar + Channels CRUD + Clerk page + Run button + 进度面板 + toast + SOPs 标签 + 删除/编辑对话框 + signed-out 页全 zh-CN；UI 不再露 "DeepSeek" / "TikHub" 等供应商名字
- [x] **D2 polish 2 — 刷新续断**：`apps/web/lib/clerk-run.ts` `getActiveClerkRun()` 查 active pipeline_runs + `auth.createPublicToken()` 1h 颁发 → ClerkRunButton 的 `initialActive` prop → 自动重接 `useRealtimeRun`
- [x] **D2 polish 3 — 细化进度**：每视频拆 4 个 sub-phase（fetch metadata / fetch transcript / running analyzer / writing），SOP 阶段标注预计时长（"约 1-2 分钟"）；UI 加进度条 + 百分比 + elapsed timer + 视频标题 detail
- [x] **D2 polish 4 — 中文输出保证**：4 个 prompt builder 全接 `language` 参数 + 在 zh 模式下走 CHINESE_WRAPPER；analyzer 额外加 reinforcement "JSON keys 保留英文，VALUES 中文"；ai_reference 加 reinforcement "章节锚保留英文，描述内容中文"。tRPC default language flipped to "zh"。**Verified**：英文 transcript (Rick Astley) + language=zh → V4 Pro 27s 返回纯中文 JSON，4/4 字段全中文，4/4 keys 全英文（`packages/db/scripts/verify-chinese-output.ts`）
- ~~D2 verbatim_facts 双字段~~ → 注：archive 2026-05 加的，**仅 Poet 用**，不在 Clerk
- [x] **D3 — ASR fallback**：无字幕（或字幕 base_url 返回空 XML）的视频自动走 TikHub `streams_v2` + Groq `whisper-large-v3`；新表列 `clerk_videos.transcript_source` ("caption" / "asr" / null)；UI 频道页加字幕来源 badge。Helper 永不抛出（无音频流 / 超 25 MB / 链接失效 / Groq 5xx 全部 graceful null）。**Verified**：Rick Astley caption 全空 → ASR 1.5KB 转写成功；3h 直播 → 因 duration > 60min 自动跳过；bogus ID → graceful null。`packages/db/scripts/asr-{fallback,branch}-smoke.ts` 3/3 绿。同时修复 caption 链路：`fetchTranscriptText` 加 `fmt=srv3`，`transcriptFromTracks` 改为按语言偏好顺序逐 track 尝试直到拿到非空文本
- [ ] **D3 polish next**：单视频重跑 / 单 SOP 重跑 / 手动 transcript override / Imagination gate（< 3 transcripts 拒生 SOP，防 LLM 编造）
- [x] **交付**：选频道 → 启动 Clerk 分析 → 流式进度 → SOP markdown 渲染（在 /clerk/[slug] 可见）

### Week 4: Muse 管线（监控 + idea 生成）

- [x] **D1**：Port `muse_prompts.py` → `packages/shared/src/prompts/muse.ts`（3 个 prompt 1:1 移植 + language 参数 + CHINESE_WRAPPER）
- [x] **D1**：Port `classifier.py` + `viral_analyzer.py` + `idea_generator.py` → `packages/shared/src/services/muse.ts`（同步原 temperatures 0.2/0.4/0.7 + token caps 512/2048/4096）
- [x] **D1**：Imagination gate（`isRealTranscript` < 200 chars 或含 warning markers → false）
- [x] **D1**：Trigger task `muse-monitor-competitors`（iterate channel.competitors → fetch videos → ASR fallback → classify → ideas）
- [x] **D2**：tRPC `muse.{startMonitor, activeRun, approveIdea}` + 共享 `lib/agent-run.ts` `getActiveAgentRun(channelId, userId, agent)`
- [x] **D2**：UI `/muse/[slug]`：开始巡视按钮（zh-CN 进度 + 刷新续断）+ 已巡视视频表 + 选题卡片 + IdeaApproveToggle + 空状态文案
- [x] **D2**：Channels 编辑页加"对标频道" textarea（每行一 URL，xhs/youtube 自动识别）；启动 Muse 前没有 competitors 会被 tRPC PRECONDITION_FAILED 拦截
- [x] **D2**：服务层 smoke test — `packages/db/scripts/muse-services-smoke.ts` 5/5 绿（classifier 中文分类正确、imagination gate 4/4、viral_trigger 353字纯中文、3 ideas 全中文且各异）
- [ ] **D3 next**：端到端 live test —— 给一个 channel 配真实 competitors → 启动巡视 → 观察 Trigger.dev 运行 → 选题落 DB → UI 审批
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
| **D5** | 生产 XHS / YouTube 数据层 | A) TikHub-only B) 混合 C) Spider_XHS | **✓ 2026-05-17 锁 A**（11 endpoint smoke test 全过 + Groq Whisper ASR fallback 端到端验证）。`apps/scraper/` 子树整体不建。详见 §10 第 26 项 | ✓ |
| **D6** | Deploy host | A) Vercel B) Render | **✓ 2026-05-17 锁 Vercel**（D5=A 后 Render 单管理优势消失；Vercel 800s + Trigger.dev 长任务组合就是最优解）| ✓ |

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

36. **W4 D1-D2 完成 — Muse 管线骨架 + UI**：
    - **3 prompts 1:1 移植**（`packages/shared/src/prompts/muse.ts`）：CLASSIFICATION / VIRAL_TRIGGER / IDEA_GENERATION。Builder 函数全接 `language`；zh 模式套 CHINESE_WRAPPER + 对 JSON 类提示加"keys English / values 中文"加固
    - **3 services 移植**（`packages/shared/src/services/muse.ts`）：`classifyVideo` (flash, temp 0.2, 512 tok) / `analyzeViralTrigger` (pro, temp 0.4, 2048 tok) / `generateIdeas` (pro, temp 0.7, 4096 tok)，跟 archive 完全对齐
    - **Imagination gate** (`packages/shared/src/schemas/muse.ts` `isRealTranscript`)：transcript null / 含 archive 的三种 WARNING marker / trim 后 < 200 字符 → 拒绝进 viral_trigger 阶段。归类阶段不挡，分类器可基于 title-only
    - **Trigger task `muse-monitor-competitors`**（`apps/jobs/trigger/monitor-competitors.ts`）：iterate `channel.competitors[]` → 抓视频 → 跟 Clerk 一样的 caption→ASR fallback → classify 写 `muse_monitor_videos` → 对 relevant + isRealTranscript 的视频跑 viral_trigger + generateIdeas → 写 `muse_ideas`。Sub-phase 进度 metadata 全 zh-CN（"AI 分类中" / "分析爆款触发因素" / "生成选题中"）
    - **tRPC muse router**：`startMonitor` / `activeRun` / `approveIdea`。`activeRun` 重用新抽出的 `lib/agent-run.ts` `getActiveAgentRun(channelId, userId, agent)`（替代 `clerk-run.ts`，未来 Poet 也复用）
    - **UI `/muse/[slug]`** 改造：开始巡视按钮（competitorCount=0 时 disable + 提示）+ 进度卡片（沿用 Clerk 的进度 UI pattern，颜色换 bg-muse）+ 已巡视视频表中文化（标题/对标频道/时长/相关性/分类）+ 选题卡片中文化（事实与数据/为什么对标/爆款触发因素）+ IdeaApproveToggle（待审批 ↔ 已通过 ↔ 已写稿三态）
    - **Competitors 管理**：channel 编辑表加"对标频道" textarea（每行一 URL），xiaohongshu URL 自动归类 xhs，其余归类 youtube；schema 加 `competitorRefSchema` + max 20。tRPC `channels.update` 接收 competitors 字段（undefined 时 Drizzle 自动跳过 SET）
    - **PRECONDITION 拦截**：`muse.startMonitor` 检测 `competitors.length === 0` 直接抛 PRECONDITION_FAILED + 中文提示 "请先为该频道配置至少一个对标账号"
    - **Service smoke test 5/5 绿**（`packages/db/scripts/muse-services-smoke.ts`）：classifier zh 案例返回 `relevant=true, topic="反直觉真相 / 认知偏见拆解"`；imagination gate 4 边界全对；viral_trigger 353字纯中文遵循 click/watch/share 模板；generateIdeas 3 条全中文、各异、含具体数据
    - **Trigger.dev 自动 hot-reload**：dev worker 监测到 `monitor-competitors.ts` 新文件 + workspace deps 变更，rebuild 自动注册新 task
    - **共享 sleep / asPositiveNumber / safeText / parseDurationToSec helpers** 仍是 inline 在两个 trigger task 里（Clerk + Muse）；W5 起前可以抽出 `apps/jobs/lib/`

35. **W3 D3 完成 — ASR fallback 上线**：
    - `packages/shared/src/clients/asr.ts` 新加 `transcribeYoutubeVideo(videoId, { onPhase, logger })`：选最小 audio stream → temp 文件 → Groq `whisper-large-v3` → 自动清理。**任何 recoverable 错误（无流 / 超 25MB / 失效 URL / Groq 5xx）一律 return null**，让调用方安全 continue
    - **采坑**：第一版用 `pipe() + finished()`，AbortError 在 Readable 上被 emit 但没有 listener，触发 Node "Unhandled 'error' event" crash。改成 `pipeline()` 完美 propagate
    - **采坑 2**：caption 链路本身有 bug —— YouTube `/api/timedtext` 不加 `fmt` 参数返回空 body；Rick Astley 6 个 caption tracks 全 0 字节。修了 `fetchTranscriptText` 加 `fmt=srv3` 并解析新旧两种 XML 格式（`<p>` / `<text>`），`transcriptFromTracks` 改成按偏好顺序逐 track 试到拿到非空文本
    - **Pipeline branch logic**：`analyze-channel.ts` 在 caption 为 null 且视频 duration ≤ 60min 时 trigger ASR；duration > 60min 跳过（音频几乎必然超 25MB）；duration unknown 也跳过（保守）
    - **DB**：新 `clerk_videos.transcript_source` 列（"caption" / "asr" / null）。migration `0002_clear_ezekiel_stane.sql`。`drizzle-kit push` 有 CHECK constraint introspection bug，绕道 `apply-pending-migration.ts` 直接执行 SQL
    - **UI**：频道页 table 加 "字幕来源" 列 → `<TranscriptSourceBadge>`（"字幕" secondary / "AI 转写" outline / "无" muted-mono），不露 Whisper/Groq 名字。视频详情页头部也加同 badge，并把所有 English Section title 中文化
    - **Smoke tests** 全部 3/3 绿（`pnpm --filter @singularity/db asr-{fallback,branch}-smoke`）：
      - Rick Astley → 6 caption tracks 全空 → ASR fallthrough → 1.5KB 转写
      - Lofi Girl 3h 直播 → duration unknown，ASR 跳过 → source=null
      - 假 video id → TikHub 400 → graceful null
    - **新 feedback 规则**：代码注释只保留 truly non-obvious why 行，无 multi-paragraph docstrings。今天涉及的文件（asr.ts / analyze-channel.ts / smoke scripts）全 trim 过。`MEMORY.md` 加 `feedback_comments-minimal.md`

31. **W3 D1 完成 — Clerk 分析管线端到端**：
    - **`packages/shared/`** 新 workspace：prompts（archive 1:1 port，6 个 prompts）+ Zod schemas + LLM/TikHub clients（shared between web 和 jobs，避免双 app 重复 import）
    - **Trigger.dev task `clerk-analyze-channel`**：拿 channel videos → 逐视频 metadata + captions + DeepSeek V4 Pro 分析 → 写 clerk_videos，metadata.set 推进度
    - **tRPC `clerk.startAnalysis` + `clerk.runStatus`**：tRPC 验 ownership → 创 pipeline_run → 触发 task → return handle.id + publicAccessToken
    - **UI `/clerk/[slug]` Run analysis button**：tRPC mutation → useRealtimeRun → 进度条 + 完成 toast
    - **Live test 验证**：@MKBHD limit=1，1/1 analyzed，opening_hook_type = "Bold Claim with Teaser Stack"，framework = "Anticipation & Reveal Framework"
    - **Diagnostic scripts**：`test-clerk-pipeline.ts`（创 temp channel → trigger → poll → verify）+ `debug-video-info.ts`（compare TikHub video_info* variants）
    - **3 issues 暴露 + 修复**：(a) `generateObject` strict Zod 在 DeepSeek compatibility mode 易拒 → `generateText` + 软 JSON parse；(b) TikHub `/web_v2/get_video_info` 对新视频 metadata 稀疏 → fall back 到 channel-listing 字段；(c) DeepSeek 偶尔输出 NULL byte (U+0000) → `safeText()` 过滤

34. **W3 D2 polish 全面打磨**（基于第一次 live test 后的 UX 反馈）：
    - **全 UI 中文化**（客户是中国创作者）— sidebar、channels CRUD、clerk page、run button、进度面板、toast、SOPs 标签、删除/编辑对话框、signed-out 页全部 zh-CN；agent 名保留 Latin 加中文角色标签（"Clerk · 分析师" / "Muse · 选题官" / "Poet · 写手"）
    - **供应商隐藏**（用户不应看到我们用的什么 LLM / 数据源）— 移除 UI 里的 "DeepSeek V4 Pro" / "TikHub" 等字眼，统一改成 "AI 分析中" / "抓取频道视频列表"。Notes 内部 / CLAUDE.md / git commit messages 仍保留具体供应商
    - **刷新续断** — `getActiveClerkRun()` RSC 挂载时查 `pipeline_runs WHERE status IN ('pending','running') AND agent='clerk'`，用 `auth.createPublicToken({ scopes: { read: { runs: [triggerRunId] }}, expirationTime: "1h" })` 颁发 1 小时 token，传给 `<ClerkRunButton initialActive={...}>` 自动重接 `useRealtimeRun`。**Fix 之前的 UX bug**：刷新页面后进度条消失
    - **细化进度** — 每视频拆 4 个 sub-phase（fetch metadata → fetch transcript → running analyzer → writing analysis），SOP 阶段标注预计时长（"AI 写作中（约 1-2 分钟）"）；UI 加 w-72 卡片 + 进度条 + 百分比 + 每秒更新的 elapsed timer + 视频标题 detail（line-clamp-2）
    - **中文输出强制保证** — 4 个 prompt builders 全接 `language`，zh 模式过 `CHINESE_WRAPPER`；analyzer 额外 reinforcement "JSON keys 保留英文，VALUES 中文"；ai_reference 加 "章节锚保留英文，描述中文"；tRPC default language flipped en → zh
    - **验证**：英文 transcript (Rick Astley) + `language=zh` 调 V4 Pro，27s 返回纯中文 JSON（"开篇以'我们并非爱情新手'建立共鸣..."），4/4 字段中文、4/4 keys 英文。`packages/db/scripts/verify-chinese-output.ts` 留作 prompt 改动后回归测

33. **W3 D2 完成 — SOP 生成 + UI 渲染**：
    - Trigger task 在分析全部视频之后跑 SOP 阶段：human / ai_reference / hottest 三种，DeepSeek V4-Pro，temperature 0.4, maxOutputTokens 8192
    - Old SOPs for the channel deleted before new pass — UI 始终展示最新
    - Hottest SOP 仅在 top-viewed 视频有 transcript 时生成（archive anti-fabrication rule）
    - `/clerk/[slug]` 加 SOPs section：collapsible cards (`<details>`) + react-markdown + remark-gfm + 自定义 `.prose-clerk` CSS（不引 @tailwindcss/typography 插件）
    - @MKBHD limit=2 test：1/2 analyzed + 2 SOPs (15.6KB human + 13.1KB ai_reference)；hottest 自动 skip 因 transcript 空
    - 实际生成的 markdown 格式跟 archive sop_generator.py 输出一致（含 7 sections Content Formula / Common Themes / Thumbnail Essentials / Hook Playbook / Script Blueprint / Storytelling / Retention）

32. **W3 D1 运维发现**：
    - Trigger.dev 本地 dev worker 读 `.env` from cwd（apps/jobs/）—— 需要 symlink `apps/jobs/.env.local → ../../.env.local` 才能拿到 DATABASE_URL / DEEPSEEK_API_KEY / TIKHUB_API_KEY
    - Workspace dep 修改（packages/shared/*.ts）**触发 hot-reload**（worker 重建到 .9 .10 .11 ... 版本递增）但需要 1-2s
    - DeepSeek `responseFormat: JSON schema` 走 OpenAI compatibility — schema 当 system message 注入，模型偶尔输出不严格匹配的 JSON。已知 risk，用 `generateText` + 软 parse 解决

28. **D6 final — Vercel 锁定**：D5=A 后 Render 跟 sidecar 统一管理的优势消失；Vercel Pro 800s 函数 + Trigger.dev 长任务组合就是最优解。生产部署目标：vercel.com，custom domain TBD（W7-W8）

29. **Trigger.dev 分阶段策略**（避免未来 vendor lock 的退出条件）：
    - **阶段 A — MVP → beta（现在 → 6 个月）**：用 Trigger.dev 托管。MVP 500 任务/月在 5K 免费层内，$0/月。`useRealtimeRun` hook 让进度 UI 5 行落地，省 W3-W6 大约 6-8 天实施时间。
    - **阶段 B — Growth 拐点（12-18 月后，5K+ paying user）**：当 Trigger.dev 月费 > $200 时，迁移到自托管 Trigger.dev v3（开源 MIT 许可，跑在 Render Pro Worker $25-50/月 + Supabase Postgres 状态）。代码 SDK 保留，只切运行平台
    - **阶段 C — 真大规模**：评估 Inngest / Hatchet / 完全自建。3+ 年后的问题
    - 退出条件量化：trigger.dev 月费 > $200 触发评估迁移
    - 迁移代价：~1-2 天/agent（Clerk / Muse / Poet 共 3-6 天）
    - 代码层面 hedge：所有进度上报包在 `reportProgress(current, total)` thin wrapper 后面，切 vendor 时只改这一个文件

30. **LLM 栈简化 — DeepSeek-only 双 tier**（替换原 plan 的 Claude / Gemini / DeepSeek 三源策略）：
    - **`deepseek-v4-flash`**：简单 / 快任务（分类、gating、短 critique、idea 生成、drift detection scoring）
    - **`deepseek-v4-pro`**（thinking enabled）：复杂任务（视频 analyzer / SOP 生成 / 长稿 outline + section expand / Bible 生成）
    - 两个模型都是 reasoning-enabled，response 自动带 `reasoning_content` 内部思考
    - Vercel AI SDK + `@ai-sdk/deepseek` 包装，unified API（streamText / streamObject / generateObject）
    - 单一 vendor 简化运维 + 财务（vs 原 plan 5 个 LLM 服务）
    - 成本估算 MVP：Pro $1.10/M tokens vs Claude Sonnet 4.6 ~$3/M tokens，**5K 批改/月省 ~$50-60**
    - Quality 风险：DeepSeek V4-Pro 公开 benchmark 跟 GPT-4 / Claude Sonnet 接近。若中文创作场景质量不足，未来可在 `apps/web/lib/llm.ts` 加 Claude tier 作 Pro+ 选项
    - **退路保留**：`llm.ts` 单一文件抽象，加任何新 provider 只改这一文件
    - Groq Whisper 仍保留（ASR 无替代）

26. **D5 final — A 锁定（TikHub-only，无 Python sidecar）**：
    - 11 endpoint smoke test 全过（YouTube + XHS 关键路径覆盖）
    - **YouTube transcript 文本路径已验证**：`/web_v2/get_video_captions_v2` ($0.001) → 拿 manifest base_url → 直 fetch YouTube timedtext signed URL（**免费**），3877 chars 真 transcript（Rick Astley 例）
    - **ASR fallback 端到端通**：`/web_v2/get_video_streams_v2` ($0.003) → 4 个 audio-only 格式（最小 1.2MB opus webm）→ Groq Whisper large-v3 → 3.2s 完成 3.5min 音频 transcribe，输出完整歌词
    - **Per-video 加权成本**：0.8×$0.002 + 0.2×$0.009 = **~$0.004/视频**
    - **核心 endpoint 选型**（参数名最易踩坑）：
      - `/youtube/web/get_channel_id_v2?channel_url=` （不是 url）
      - `/youtube/web/get_channel_info?channel_id=`
      - `/youtube/web/get_channel_videos_v3?channel_id=`
      - `/youtube/web/get_video_info_v3?video_id=`
      - `/youtube/web_v2/get_video_captions_v2?video_id=` → 直 fetch base_url 拿文本
      - `/youtube/web_v2/get_video_streams_v2?video_id=` → ASR fallback
      - `/youtube/web/search_video?search_query=` （不是 keyword）
      - `/xiaohongshu/app_v2/search_notes?keyword=` （app_v2 用 keyword；web_v2 用 keywords 复数；web_v3 不稳）
      - `/xiaohongshu/web_v2/fetch_hot_list` （无参）
    - 已知 rate limit：**1 request/sec per route**（单 endpoint 1 秒只能调一次，需要批量时跨 endpoint 并发）
    - 已知 caveat：YouTube CDN 对免费 IP 限速（Rick Astley 1.2MB audio 下载用了 82s）。Trigger.dev 在 server side 跑 audio download 应该快很多；或者 Vercel function 在 us-east 跑

27. **ASR 选 Groq Whisper large-v3 锁定**：
    - $0.111/h = $0.00185/min，SOTA 多语言 Whisper
    - 100x realtime（5min 视频 ~3s 完成）
    - TS SDK：`groq-sdk` npm
    - MVP 1K ASR-required 视频/月 × 5min = **$9.25/月**
    - 拒：OpenAI Whisper（$0.006/min，贵 3x），Cloudflare Workers AI（部署复杂度高），Deepgram/AssemblyAI（贵 2-3x 且无 quality 优势）
    - Growth scale 切 turbo 或 Modal 自托管可降 60%，beta 阶段无需

23. **D5 调研结果 — 建议 B（混合），但先 smoke test A**：
    - **A: TikHub-only**：79+ XHS endpoint + 50+ YouTube endpoint，但 YouTube **transcript 在公开文档未确认**。定价 $0.001→$0.0005/call（不是 flat $0.01），MVP 估 $10/月，Growth $350/月。Alipay / USDT / PayPal 付款
    - **B: 混合（推荐默认）**：TikHub 吃 XHS（避开 sign.js 战争），yt-dlp + bgutil-pot-provider v1.3.1 吃 YouTube。Render SG $7-25/月 + TikHub XHS 调用。MVP $12-30/月，Growth ~$200/月。**警告**：yt-dlp 2026 在 datacenter IP 上有 ban 风险（#15899 #16072），Render SG 的 geo 缓解，最坏切 residential proxy 或把 YouTube 也走 TikHub
    - **C: Spider_XHS**：v4.0.0（2026-04 还在更），但 107 个 open issue + 每几周 sign.js 更新 + ICP 风控变化频繁。solo dev 8 周 ship 路径风险过高 — **拒**
    - **行动**：W2 D3 前花 2h + $5 试 TikHub YouTube transcript 是否真有；有 → 切 A（删 `apps/scraper/`，省 1 周）；无 → 走 B
    - 来源：tikhub.io/pricing, github.com/cv-cat/Spider_XHS, github.com/Brainicism/bgutil-ytdlp-pot-provider, yt-dlp issue #16607

24. **Sign-out 链压缩**：之前 4-hop（sign-out → / → proxy → /api/auth/sign-in → Logto）改为公共 `/signed-out` 页面落地（Logto Management API 注册 postLogoutRedirectUri）。用户登出后看到 "Signed out." + Sign in 按钮，不会被立刻再次踢回登录
25. **Channel detail + edit 页**：`/channels/[slug]` RSC 渲染 stat cards（clerk/muse/poet 各表 count）+ top 5 预览（最高 views clerk 视频 / bibles / custom topics / muse ideas）；右上 Edit 抽屉 Sheet 改 name/platform/URL/description（slug 锁住不让改避免 URL 变更）

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
