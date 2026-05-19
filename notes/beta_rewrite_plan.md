# Singularity Web — 8-Week Beta Plan

**Initial**: 2026-05-15 · **Last revised**: 2026-05-18

---

## 0. TL;DR

**TS-only 单语言栈**：Next.js 16 + Vercel AI SDK + Trigger.dev v3 + Supabase + Logto Cloud + TikHub。

- 主代码 TypeScript（D5=A 锁定 TikHub-only，无 Python sidecar）
- 8 周到 closed beta：**W1-W6 ✓ 完成**，W7 in progress
- MVP 月度成本 < $150

---

## 1. 锁定的技术栈

| 层 | 选择 |
|---|---|
| 主语言 | TypeScript |
| 前端 | Next.js 16 App Router (Vercel) |
| UI | Tailwind 4 + shadcn/ui (base-nova) + Radix |
| API | tRPC v11 |
| AI 流式 | Vercel AI SDK v4+ |
| 长任务 | Trigger.dev v3（`useRealtimeRun`） |
| Auth | Logto Cloud（含 WeChat 连接器） |
| DB | Supabase Pro (Postgres + Realtime) + Drizzle |
| 大文件 | Cloudflare R2 |
| Monorepo | pnpm + Turborepo |

**LLM / 数据 / ASR 栈**：

| 用途 | 服务 |
|---|---|
| Clerk / Muse / Poet 分析与生成 | DeepSeek V4 Pro + Flash（reasoning enabled，统一 `apps/web/lib/llm.ts`） |
| Thumbnail vision + W7 Upload Critique | Claude Sonnet 4.6（`@ai-sdk/anthropic`） |
| ASR 主链 | Deepgram Nova-3（`language=multi`，下载字节 POST） |
| ASR 兜底 | Groq Whisper large-v3（< 25 MB） |
| 视频元数据 | YouTube Data API v3（免费 10K/天） |
| 频道列表 + audio streams + XHS 全套 | TikHub |

---

## 2. Monorepo 结构

```
singularity-web/
├── apps/
│   ├── web/                       # Next.js
│   │   ├── app/
│   │   │   ├── (marketing)/
│   │   │   ├── (app)/
│   │   │   └── api/trpc/[trpc]/
│   │   ├── components/
│   │   ├── lib/
│   │   └── server/trpc/           # tRPC routers
│   └── jobs/trigger/              # Trigger.dev tasks (analyze-channel, monitor-competitors, generate-bible/script, analyze-custom-topic)
└── packages/
    ├── db/                        # Drizzle schema + migrations + smoke scripts
    └── shared/                    # prompts / schemas / clients / services（核心 IP）
```

**原则**：所有 prompt 集中 `packages/shared/prompts/`；所有 Trigger.dev 任务在 `apps/jobs/trigger/`；Drizzle schema 是 single source of truth。

---

## 3. 8-周 Beta 路线

### Week 1 — ✓ 2026-05-16
Monorepo + Next.js 16 + Supabase 11 张表 + Logto branded sign-in + splash → dashboard 端到端通；不做 user-facing Settings UI（keys 服务端 `.env.local` 托管）。

### Week 2 — ✓ 2026-05-17
- D5 锁定 **TikHub-only**（11 endpoint smoke 全过，`apps/scraper/` 整目录不建）
- D6 锁定 **Vercel**
- 10 archive channels + 218+31+10+50+7+18 行 xlsx import
- Channel CRUD + 3 agent landing pages（`/clerk` `/muse` `/poet`）+ 编辑抽屉

### Week 3 — ✓ 2026-05-18（含 polish）
- 6 prompts 1:1 移植到 `packages/shared/prompts/clerk.ts`
- Trigger task `clerk-analyze-channel` + tRPC `clerk.*` + `/clerk/[slug]` UI（含 ASR fallback / 进度卡 / 刷新续断 / 全栈中文化 / 供应商隐藏）
- 3 种 SOP（human / ai_reference / hottest）+ Markdown 渲染 + 删除按钮
- YouTube Data API v3 批量 metadata fetch（`fetchVideoMetadataBatch`）
- **W3+ optional**：`channels.list` 频道量级 + `commentThreads.list` 评论分析，详见 §7 #43

### Week 4 — ✓ 2026-05-18
- 3 prompts + 3 services（`classifyVideo` flash / `analyzeViralTrigger` pro / `generateIdeas` pro）
- Imagination gate：transcript null / 含 WARNING marker / trim < 200 char → 拒
- Trigger task `muse-monitor-competitors` + tRPC `muse.{startMonitor,activeRun,approveIdea}`
- UI `/muse/[slug]` 含 IdeaApproveToggle 三态 + 对标频道 textarea + PRECONDITION 拦截

### Week 5 — ✓ 2026-05-18
- 3 prompts（CHANNEL_BIBLE / SCRIPT_WRITING / CHINESE_HUMANIZER），含 section markers HOOK/TEASE/ITEM/CTA/CLIMAX/CLOSE
- Bible drift detection（BIAS_MARKERS 8 项 + STOPWORDS + bag-of-words tokenize `[\w一-鿿]+`）
- 短稿默认 5min = 1000 zh / 750 en
- Trigger tasks `generate-bible` + `generate-script` + tRPC `poet.*`
- UI 含 active Bible 卡 + 编辑/重生成 sheet + drift 黄 banner + 历史版本 accordion

### Week 6 — ✓ 2026-05-18
- LONG_FORM_OUTLINE + SECTION_EXPAND 移植，`writeScriptLong` outline → expand 双阶段
- 长稿阈值：中文 ≥2000 / 英文 ≥1500（archive `script_writer.py:_write_script_long_form()` 实际值）
- WriteScriptButton DropdownMenu 4 时长（5/10/20/30 min）
- Custom Topic flow：URL/文本附件 → fetch refs → `analyzeTopic` → 写稿（archive 移植 100% 完成）
- 全栈 token-budget 审计（V4 Pro reasoning preamble 吃 token 问题，所有 `generateText` 调用 maxOutputTokens 至少 = 期望输出 × 2 + 1500）

### Week 7（in progress）— Upload Critique
- [ ] Upload UI（文本 + 图 + 短视频）
- [ ] AI SDK `streamText` 流式批改（Claude Sonnet 4.6）
- [ ] Browse 模式：Supabase 渲染 pre-generated trends
- [ ] Link Analysis 模式：粘贴 URL → fetch（reuse `references.ts`）→ 分析
- archive 无此功能，本周纯 greenfield

### Week 8 — Polish + Beta 上线
- [ ] Onboarding flow + 用户 profile / quota 页
- [ ] Quota 系统（Free 3 video + 5 images + 5 scripts / 月）
- [ ] 计费骨架（预留 Stripe，不开收费）
- [ ] 邀请首批 50 用户 closed beta

---

## 4. 风险登记

| # | 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|---|
| R3 | Trigger.dev v3 vendor lock | 中 | 中 | 任务逻辑在 `apps/jobs/`，可迁 Inngest/Hatchet；月费 > $200 时切自部署 v3（开源 MIT），代价 ~1-2 天/agent |
| R4 | Logto Cloud 价格上涨 | 低 | 低 | 最坏迁 Casdoor 自部署 |
| R5 | Vercel 5TB 出口后成本明显上升 | 中 | 高 | 监控带宽；50K MAU 前迁 Cloudflare Pages |
| R7 | WeChat 网站应用审批被拒 | 中 | 中 | Day 1 不依赖；M3+ 通过 Logto 加 |
| R8 | 8 周时间表偏紧 | 已松（W1-W6 done） | — | W7 起灵活，必要时 Upload Critique 视频形态后置先做文本 |
| R9 | YouTube CDN 对生产 IP 限速 | 中 → 高（用户多了） | 高（ASR 阻塞） | 不预先做；监控 HTTP 403/429 + 单视频 >20min；触发后接 BrightData/Smartproxy 残留 IP 代理（`asr.ts downloadToTemp()` 加 HTTP agent + `PROXY_URL` env）。详见 §7 #42 |

R1（yt-dlp）/ R2（XHS sign.js）— D5=A 后 TikHub 托管掉了，不再相关。

---

## 5. 月度成本预估

| 项 | MVP (1K MAU, ~5K 批改/月) | Growth (50K MAU, ~250K 批改/月) |
|---|---|---|
| Vercel | $20 (Pro) | $770 (Pro + 带宽) |
| Supabase | $25 (Pro) | $599 (Team) |
| Logto Cloud | $0 (50K MAU free) | $24 (Pro) |
| Trigger.dev | $0 (50K execs free) | $50 (Pro) |
| Cloudflare R2 | $1 | $75 |
| TikHub | $10 | $300 |
| YouTube Data API | $0 (10K/day free) | $0 |
| DeepSeek（Clerk/Muse/Poet） | $20 | $800 |
| Claude（vision + W7 critique） | $50 | $2,000 |
| Deepgram + Groq Whisper | $5 | $200 |
| **合计** | **~$131/mo** | **~$4,818/mo** |

W7 上线后实测真实流量再校准。

---

## 6. 待决定

| # | 决策 | 状态 |
|---|---|---|
| D1+D2 | Electron 处理 + Python LOC 命运 | ✓ 2026-05-15（停 Electron，archive 留参考） |
| D3 | 1 vs 2 人开发 | ✓ 2026-05-16（1 人 8 周） |
| D4 | ICP 备案 + WeChat 开放平台启动 | ⏳ 仍待 Justin；备案 3-6 月，启动越晚 WeChat 上线越晚 |
| D5 | XHS / YouTube 数据层 | ✓ 2026-05-17（TikHub-only） |
| D6 | Deploy host | ✓ 2026-05-17（Vercel） |

---

## 7. 决策日志（按时间倒序）

### 2026-05-18

**#43 — YouTube Data API 可选扩展（不做但记下来）**

oEmbed 移除 + 切到批量 `videos.list`（10 视频 run 从 10 次 HTTP 降为 1 次）后，还有两项 TikHub 没法做的能力：

- **`channels.list`** — 拿精确订阅数 / 累积总播放 / 视频总数 / topic categories 塞进 SOP prompt。1 unit / run，投入 ~1h。落点：`youtube-data.ts` 新增 `fetchChannelInfo` + `analyze-channel.ts` SOP 阶段前调 + `clerk.ts` 两个 SOP builder 加 channel-stats 字段
- **`commentThreads.list`** — 每视频 top 20 评论喂 Clerk analyzer / Muse viral_trigger。1 unit / 视频，投入 ~2-3h。**风险**：评论含 spam / 引战要 prefilter 或 top-by-likes 截断；多语言要 prompt 容忍

两者都改 SOP 输出，W7 用户感受当前 SOP 质量后再回头决定优先级。

**#42 — YouTube CDN 限速根因 + Deepgram ASR 改造（R9 预防）**

YouTube CDN 对非浏览器 origin 限速 **~12 KB/s**，4.64MB 音频下载需 6.5min，原 `DOWNLOAD_TIMEOUT_MS=180s` 不够。改造：

- **Deepgram Nova-3 主链**（`packages/shared/src/clients/asr.ts`）：URL 不传，下载字节 POST；`language=multi` 中英混合（避免 `detect_language` 把英文打散为 "T er ry"）。$200 免费额度
- **Groq Whisper 降为 fallback**（< 25MB 时）
- **下载 timeout 180s → 900s**
- ASR 返回 `provider` 字段（"deepgram" / "groq"）便于追踪
- 实测 crypto 视频：Deepgram 7205 中文字、准确度 0.966、转写本身 2.5s

**R9 关键认知**：本地 `trigger dev` 跑住宅 IP，6.5min 是 best case。上线后 Trigger.dev cloud worker 是数据中心 IP，YouTube 限速通常更狠（10-20min 甚至 403）。**触发信号**：HTTP 403/429、持续 < 5 KB/s、用户报「卡在音频转写中」、单视频 >20min。**应对**：① HTTP Range 并行（YT 按 IP 限速则无效）；② BrightData/Smartproxy 残留 IP 代理（治本，~$0.01-0.05/视频）；③ 不上 yt-dlp Python sidecar（违反 no-Python 决策）。

**#41 — Pre-launch P0：删除入口 + 脚本详情页 + 注释清理**

- 3 个 delete mutation：`clerk.deleteSop` / `poet.deleteBible`（active 拦截）/ `poet.deleteScript`（同时重置 `museIdeas.scripted=false` 或 `poetCustomTopics.status='analyzed'`）
- Bible 历史 accordion（非 active 版本）+ `/poet/[slug]/scripts/[scriptId]` 独立详情页（3 列上下文卡 + 复制全文 + 删除）
- 全栈注释清理：删多行 docstring + WHAT-style 评论，只留真正非 obvious 的 WHY 行（MEMORY.md `feedback_comments-minimal.md`）

**#40 — Custom Topic flow（archive 移植 100% 完成）**

- `buildTopicAnalysisPrompt` + `analyzeTopic` service（V4 Pro temp 0.6 maxTokens 6144 + 1 retry）
- `packages/shared/src/clients/references.ts`：text / youtube（reuse `getVideoWithTranscript` + ASR）/ xhs（`web_v3/fetch_note_detail`，24 位 hex note_id）。任何失败 graceful return `{content: "", error: ...}`
- URL extractors：`extractYoutubeVideoId`（处理 watch / youtu.be / shorts / embed 全部）+ `extractXhsNoteId`（16-32 位 hex）
- 新 Trigger task `poet-analyze-custom-topic` + `poet-generate-script` 双源（`ideaId` XOR `customTopicId`）
- 5 个新 tRPC endpoint + UI 自定义选题段（含 4 种时长 DropdownMenu）

### 2026-05-17

**#39 — W6 token-budget 全栈审计**

V4 Pro reasoning preamble 吃光短段 token 预算，全栈 9 处 `generateText` 扫一遍：
- Muse classifier 512 → 1500 + 1 retry（不然中文 prompt 上 reasoning 吃完，默认 relevant=true）
- Muse viral_trigger 2048 → 4096（输出 353 字升到 1017 字）
- Bible generator 内置 1 retry on empty content
- **新规则**：V4 Pro `maxOutputTokens` 至少 = 期望输出 × 2 + 1500

**#38 — W6 长稿管线**

- LONG_FORM_OUTLINE + SECTION_EXPAND 1:1，"LENGTH IS NON-NEGOTIABLE" 规则 + `min_count = target × 0.85`
- `writeScriptLong` 两阶段；section max_tokens 公式 `max(3000, min(target/charsPerToken × 2.0 + 500, 6144))`。**3000 floor** 防 reasoning 吃光短段（HOOK 160 字 / CTA 60 字经常被 reasoning 吃完产 0 字文本）
- `writeScript()` 按 `isLongForm` 路由；section 空文本 1 retry → 仍空 fallback short（保证用户拿到完整长度）
- **采坑**：SECTION_EXPAND 没强制"不杜撰"（archive 也没），ITEM 偶尔编造行业术语（PU2000）→ 留 W7 移交 VERBATIM PRESERVATION 升级

**#37 — W5 短稿 + Bible + drift + humanizer**

- 3 prompts，CHANNEL_BIBLE 强 anti-substitution + SCRIPT_WRITING 含 verbatim preservation
- drift 双启发式：BIAS_MARKERS (AI/LLM/ChatGPT/Midjourney/Runway/machine learning/人工智能/大模型) + bag-of-words tokenize
- **已知行为**：中文 Bible `no_overlap` false-positive — bag-of-words 比对，中文长 run 在空格/标点间 tokenize 成单个 token，与 idea token 集合不交即触发。UI 给"重新生成"出口；未来上 jieba 分词

**#36 — W4 Muse 管线骨架**

- 3 prompts + 3 services（classifier flash temp 0.2 / viral_trigger pro temp 0.4 / ideas pro temp 0.7）
- Imagination gate `isRealTranscript`：null / 含 WARNING marker / trim < 200 char → 拒
- Trigger task `muse-monitor-competitors` + 共享 `lib/agent-run.ts getActiveAgentRun(channelId, userId, agent)`（Clerk/Muse/Poet 共用）

**#35 — W3 D3 ASR fallback 上线**

- `asr.ts transcribeYoutubeVideo`：选最小 audio stream → temp 文件 → ASR → 清理。任何 recoverable 错误 return null
- 修了 caption 链路：`fetchTranscriptText` 加 `fmt=srv3`，`transcriptFromTracks` 改逐 track 试到拿到非空
- **采坑**：第一版 `pipe()+finished()` AbortError 在 Readable 无 listener 触发 crash；改 `pipeline()` 完美 propagate
- 新 DB 列 `clerk_videos.transcript_source`（caption/asr/null）

### 2026-05-16

**#34 — W3 D2 UI polish**

- 全 UI 中文化 + 供应商隐藏（不露 DeepSeek/TikHub 名字）
- **刷新续断**：`getActiveAgentRun()` RSC 挂载查 `pipeline_runs` 用 `auth.createPublicToken({ expirationTime: "1h" })` 颁发 token 自动重接 `useRealtimeRun`
- 中文输出强制 — 4 prompt builders 接 `language`，zh 模式套 `CHINESE_WRAPPER` + "JSON keys 英文 values 中文" 加固

**#33 — W3 D2 SOP 生成**

human / ai_reference / hottest 三种 V4 Pro temp 0.4 maxTokens 8192。Old SOPs 在新 pass 之前 delete。hottest 仅在 top-viewed video 有 transcript 时生成（anti-fabrication）。

**#32 — W3 D1 运维 / 端到端 + 3 issue 修复**

- `packages/shared/` workspace：6 prompts archive 1:1 + Zod schemas + LLM/TikHub clients lazy-init
- 3 个 live test 暴露：
  - `generateObject` strict Zod 在 DeepSeek compatibility mode 易拒 → `generateText` + 软 JSON parse
  - TikHub `get_video_info` 对新视频 metadata 稀疏 → fall back channel-listing 字段
  - DeepSeek 偶尔输出 NULL byte (U+0000) → `safeText()` 全局过滤

**#30 — LLM 栈简化：DeepSeek 双 tier**

替换原 plan 五源策略（Claude / Gemini / DeepSeek / Groq Whisper）：
- `deepseek-v4-flash`：简单/快任务（分类、gating、短 critique、idea 生成、drift scoring）
- `deepseek-v4-pro`（thinking）：复杂任务（视频 analyzer / SOP / 长稿 outline+expand / Bible）
- 两个都 reasoning-enabled
- 成本估算 MVP：Pro $1.10/M tokens vs Claude Sonnet ~$3/M tokens，5K 批改/月省 ~$50-60
- **退路保留**：`apps/web/lib/llm.ts` 单一抽象，加任何 provider 只改这一文件

### 2026-05-17（D5/D6 锁定）

**#26 — D5 final = A（TikHub-only）**

11 endpoint smoke 全过。Per-video 加权成本 ~$0.004。**rate limit 1 req/sec per route**（跨 endpoint 才能并发）。

**踩坑参数**（最易错的）：
- `/youtube/web/get_channel_id_v2?channel_url=`（不是 url）
- `/youtube/web/get_channel_videos_v3?channel_id=`
- `/youtube/web_v2/get_video_info`（用 v2；v3 返回 raw playerResponse 没 videoDetails 子键）
- `/xiaohongshu/app_v2/search_notes?keyword=`（app_v2 用 keyword；web_v2 用 keywords 复数）

**#29 — Trigger.dev 退出策略**

MVP→beta 用云托管；月费 > $200 时迁自部署 v3（开源 MIT）。代码 SDK 保留，只切运行平台。迁移代价 ~1-2 天/agent。所有进度上报包在 `reportProgress(current, total)` thin wrapper 后面，切 vendor 只改一个文件。

### 2026-05-15（plan 初版与 archive 同步）

**#10** 长稿阈值修正：中文 ≥**2000** / 英文 ≥**1500**（CLAUDE.md 之前 4000/3000 是误记）  
**#9** 栈实操数字：Next.js 15 → **16.2.6**（`@latest` 拿到 16，App Router 不变）  
**#4** W6：Script writer **VERBATIM PRESERVATION** 规则（archive 2026-05 加的；W7 移交升级到长稿主指令）

---

## 8. 运维注意事项 / Ops gotchas

- **Supabase ap-southeast-1**：本地 IPv4 只能走 Supavisor pooler `aws-1-ap-southeast-1.pooler.supabase.com:6543`（不是 aws-0）；`postgres-js` 必须 `prepare: false`
- **Next.js 16 cookies**：修改只能在 Route Handler 或 Server Action，不能 Page Component。`/callback` 必须 `route.ts` → redirect `/welcome`，不能合并为单一 page
- **Next.js 16**：`middleware.ts` → `proxy.ts`
- **pnpm 11** `pnpm-workspace.yaml`：`allowBuilds` 显式批准 `sharp`/`unrs-resolver`/`esbuild`，跳过 `msw`
- **base-nova shadcn**：`DropdownMenuLabel` 必须包在 `DropdownMenuGroup`（否则 `MenuGroupRootContext is missing`）；用 `render` prop 而非 `asChild`
- **16GB Mac**：Turbopack 冷编译可能 OS crash → `NODE_OPTIONS=--max-old-space-size=4096`
- **Trigger.dev dev worker**：读 `apps/jobs/` cwd 的 `.env` → 必须 symlink `apps/jobs/.env.local → ../../.env.local`
- **drizzle-kit push** 有 CHECK constraint introspection bug → 用 `apply-pending-migration.ts` 直接执行 SQL
- **NULL run_id 的原子 swap**：旧 SOPs `run_id IS NULL`，用 `or(ne(runId, X), isNull(runId))` 而非 `ne` 单条件（NULL != X 是 NULL 不是 true）
- **xlsx archive import 长文本截到 ~301 字符** → Bible / SOP / Custom Topic 大量字段被截。重跑 pipeline 即可重建全文

---

## 附录 — 关键决策证据

**Vercel timeout**：Hobby 300s / Pro **800s (13min)** / Enterprise 800s。Class B 长任务（20-30 min）必须走 Trigger.dev。

**Trigger.dev v3 vs Inngest**：免费层都 50K execs/月，但 Trigger.dev 20 并发（vs Inngest 5）+ 内置 `useRealtimeRun`，TS DX 更佳。MVP 阶段优势明显。

**Auth.js v5 内置 WeChat**：备选项（`packages/core/src/providers/wechat.ts` + 社区 `@next-auth-oauth/wechat`），仍需自管 session 持久化 + 用户表，Logto Cloud 运维成本更优。

**ICP 备案 2026**：外资实体不能直接备案，需 WFOE / JV / 中国合作方，端到端 US$5-15K + 3-6 个月。不用 `.cn` 域名 + 不在大陆托管，WeChat web 登录可绕过 ICP（¥300 网站应用审核）；但 Mini Program 后端 callback 域名仍需 ICP。

---

**Initial**: 2026-05-15 · **Last revised**: 2026-05-18 · **Next review**: W7 完成后
