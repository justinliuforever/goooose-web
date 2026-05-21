# Singularity Web — 功能与运维说明

**Last revised**: 2026-05-20

---



目标：Closed beta 目标 Q3 2026。

---

## 技术栈

| 层         | 选择                                         |
| ---------- | -------------------------------------------- |
| 主语言     | TypeScript                                   |
| 前端       | Next.js 16 App Router on Vercel              |
| UI         | Tailwind 4 + shadcn/ui (base-nova) + Radix   |
| API        | tRPC v11                                     |
| AI 流式    | Vercel AI SDK                                |
| 长任务     | Trigger.dev v3 (Hobby, $10/mo)               |
| Auth       | Logto Cloud（含 WeChat 连接器）              |
| DB         | Supabase Pro (Postgres + Realtime) + Drizzle |
| 大文件     | Cloudflare R2                                |
| LLM 主链   | DeepSeek V4 Pro + Flash（reasoning enabled） |
| LLM vision | Claude Sonnet 4.6                            |
| ASR        | Deepgram Nova-3 主 / Groq Whisper 备         |
| 视频元数据 | YouTube Data API v3                          |
| 数据层     | TikHub（YouTube + XHS 全套）                 |
| Monorepo   | pnpm + Turborepo                             |

---

## 仓库结构

```
singularity-web/
├── apps/
│   ├── web/                       # Next.js 应用
│   │   ├── app/(app)/             # 已登录页面
│   │   ├── server/trpc/           # tRPC routers
│   │   └── lib/                   # 业务逻辑入口
│   └── jobs/trigger/              # Trigger.dev 长任务
└── packages/
    ├── db/                        # Drizzle schema + 迁移 + smoke 脚本
    └── shared/                    # 核心 IP：prompts / schemas / clients / services
```

**原则**：prompt 集中 `packages/shared/prompts/`；长任务集中 `apps/jobs/trigger/`；Drizzle schema 是 single source of truth。

---

## 功能模块

### 1. 工作台 `/`

登录首屏。

- 时区锁定 Asia/Shanghai 的问候语（早 / 中 / 下午 / 晚）+ 用户名
- 三张 agent 卡（Clerk / Muse / Poet），每张显示累计产出 + 7 天 delta；该 agent 有正在跑的任务时卡片右上小点
- 最近动态列表，按"30 分钟内 / 今天 / 昨天 / 更早"分组；失败行 hover 出错误详情
- 动态 "Next step" 卡片（无频道→建频道、无选题→去 Muse、未审选题积压→去审、…）
- 30s 自动刷新 + 手动刷新按钮

### 2. 频道 `/channels`

频道是其它一切的根。

- CRUD：新建 / 编辑（抽屉式）/ 删除（确认弹窗）
- 主页链接 + 对标频道列表
- **URL 验证 + 预览**：单链接「验证」按钮、对标列表「批量验证」按钮。YouTube 走官方 Data API 优先 + TikHub 兜底；XHS 直接拉粉丝 / 获赞 / 头像 / IP 归属地。防止错误连接
- URL 路径生成支持 CJK slug；改名后老 URL 保持不变，可一键「重置 slug」

### 3. Clerk 分析师 `/clerk/[slug]`

拆解对标频道的爆款机制。

- 启动后抓取最近 N 个视频（YouTube：YT Data API metadata + TikHub audio streams + Deepgram/Groq ASR；XHS：TikHub `get_user_notes_v2` 一次拿全 + 视频 note 走 ASR、图文 note 用 title+desc）
- 视频列表按平台自适应表头：YouTube 显示「播放量 / 字幕」，XHS 显示「互动分 / 正文」
- 单视频详情：13 个分析维度 + transcript
- 三种 SOP（V4 Pro 生成，Markdown 渲染）：
  - **human**：把频道选题方法论用人话讲清楚
  - **ai_reference**：AI 结构化 SOP，给 Muse/Poet prompt 注入
  - **hottest**：仅基于 Top-N 高互动视频拆爆款机制（避免在低互动样本上幻觉）
- 多图 vision（≤9 张图 / 笔记）走 Claude Sonnet — 综合整组图，不只看封面

### 4. Muse 选题官 `/muse/[slug]`

巡视对标，提取爆款触发因素，出选题。

- 启动后逐个 competitor 抓最新视频/笔记，三阶段流水线：**分类相关性 → 分析爆款触发 → 生成选题（每相关视频 5 个）**
- 双栏进度面板：左侧 timeline + 实时小计 + 进度条；右侧「正在分析」+「上一条已分类」预览
- 选题卡：故事角度 / 数据 / 与本频道契合点 / 爆款触发因素；一键审批

- **任务中断后重跑会续接生成选题**：上一次跑挂了（比如 Trigger 超时），已分类的相关视频还在 DB 里。重跑时不再回放抓取，直接读 DB 找「已 relevant 但还没出选题」的行补齐
- 「取消」按钮在「开始巡视」旁边一键终止当前 run（含 Trigger.dev 侧 cancel）；之后再启动会自动续接

**Imagination gate**（防 LLM 编造）：分类阶段要求 transcript 必须真实存在。YouTube 视频 floor 200 字；XHS 图文 floor 50 字（title+desc 通常 80-300 字）。

### 5. Poet 写手 `/poet/[slug]`

按频道圣经 + 爆款套路写稿。

- **频道圣经（Channel Bible）**：每个频道有一个活跃圣经 + 多版本历史。生成后展示在卡片，可编辑、激活老版本、删除。Drift 检测：当新圣经 topic 与最初描述无重叠 / 含 AI 通用词时弹黄 banner（按事件 ID localStorage dismiss）
- **写稿入口**：
  - 「待写选题」：Muse 已通过的选题，每条一个「写稿」按钮 + 4 种时长（5/10/20/30 min）下拉
  - 「自定义选题」：用户粘 URL（YouTube / XHS）或附文本 → AI 主题分析（出故事角度、数据、爆款触发）→ 然后写稿
- 短稿（< 2000 字中文 / < 1500 字英文）单次出稿；长稿走 outline → section expand 两阶段，每段失败 1 次重试，再失败 fallback short 保证用户拿到完整长度
- Humanizer 二轮：让脚本读起来像人写，section markers `[HOOK] [TEASE] [ITEM] [CTA] [CLIMAX] [CLOSE]` 必须保留
- 脚本详情页 `/poet/[slug]/scripts/[id]`：复制全文 / HTML / PDF 导出 / 删除

### 6. （进行中）Upload Critique `/critique`

用户上传任意稿件（文 / 图 / 短视频），出流式批改。三种模式：

- **Upload**：文本 + 图 + 短视频
- **Browse**：Supabase 渲染 pre-generated trends
- **Link Analysis**：粘 URL 直接分析（复用 `references.ts`）

archive 无此功能，纯 greenfield。Claude Sonnet 4.6 `streamText`。

### 7. （未做）Onboarding + 配额

- 引导用户跑通「建频道 → Clerk → Muse → Poet」首循环
- 配额：Free 3 video + 5 images + 5 scripts / 月
- Stripe 计费骨架（不开收费）
- 闭测邀请 50 用户

---

## 运维我们要notices

### 平台

- **Trigger.dev**：Free plan 1h/task 硬限会limit。已升 Hobby（$10/mo, 7 天上限）；代码侧 `maxDuration: 14400` (4h) 全部任务统一
- **Supabase ap-southeast-1**：本地 IPv4 只能走 Supavisor pooler `aws-1-ap-southeast-1.pooler.supabase.com:6543`（不是 aws-0）；`postgres-js` 必须 `prepare: false`
- **Next.js 16**：cookies 修改只能在 Route Handler / Server Action，不能在 Page Component。`/callback` 必须 `route.ts` → redirect `/welcome`
- **Next.js 16**：`middleware.ts` → `proxy.ts`
- **Trigger.dev dev worker**：读 `apps/jobs/` cwd 的 `.env` → 必须 symlink `apps/jobs/.env.local → ../../.env.local`
- **drizzle-kit push** 有 CHECK constraint introspection bug → 用 `apply-pending-migration.ts` 直接执行 SQL
- **pnpm 11** `pnpm-workspace.yaml`：`allowBuilds` 显式批准 `sharp`/`unrs-resolver`/`esbuild`，跳过 `msw`
- **base-nova shadcn**：`DropdownMenuLabel` 必须包在 `DropdownMenuGroup`；DropdownMenuItem 的回调用 `onClick`（不是 Radix 的 `onSelect`）；用 `render` prop 而非 `asChild`
- **16GB Mac**：Turbopack 冷编译 OOM → `NODE_OPTIONS=--max-old-space-size=4096`

### 数据层

- **TikHub 速率**：1 req/sec per route（跨 route 才能并发）；YouTube `get_video_info` 用 `web_v2`，v3 返回 raw playerResponse 没 videoDetails
- **TikHub YouTube `get_channel_info`**：字段是 `title`（不是 `channel_name`）、`avatar[]` 数组（不是 `thumbnail_url`）、`subscriber_count` 是 display 字符串如 `"320K subscribers"`。`parseDisplayCount` 处理 K/M/B/万/千 后缀
- **TikHub XHS `web_v3/fetch_note_detail`** 强制要 `xsec_token`，缺会 422；用 `get_note_info_v4` 或 `get_user_notes_v2` 不要
- **XHS CDN 反爬**：图片默认 `format/heif`（Claude 不支持），normalize 成 `format/jpg`；图片域名拒 Claude SDK 的 URL fetcher（robots.txt） — 必须自己 fetch bytes 传 Uint8Array
- **NULL run_id 原子 swap**：旧 SOPs `run_id IS NULL`，删除时用 `or(ne(runId, X), isNull(runId))` 而非 `ne` 单条件

### LLM

- **V4 Pro reasoning preamble 吃 token**，`maxOutputTokens ≥ 期望输出 × 2.5 + 1500`；中文 1 char ≈ 2 tokens
- **JSON 内嵌未转义 `"`**（中文 prompt 常见 `白色"品牌名"字样`）→ `JSON.parse` fail → `jsonrepair` 兜底
- **DeepSeek 偶尔输出 NULL byte** (U+0000) → `safeText()` 全局过滤
- **Claude vision token**：single image 4000 / 多图 stack 8000
- **`generateObject` 在 DeepSeek 兼容模式 strict Zod 易拒** → `generateText` + 软 JSON parse

### ASR

- **YouTube CDN 对非浏览器 origin 限速 12 KB/s**，下载 timeout 设 900s；Trigger.dev cloud worker 是 IDC IP 限速通常更狠（见下「未来优化」）
- **Deepgram Nova-3** `language=multi` 必传（不传会把英文打散为 "T er ry"）；下载字节 POST 而非 URL 传递
- **bogus / removed video ID** TikHub 返 400 — `transcribeYoutubeVideo` 已 catch return null

---

## 未来优化

按出现概率排序：

### 1. YouTube CDN 限速 → 残留 IP 代理（R9）

**触发信号**：HTTP 403/429、持续下载速率 < 5 KB/s、ASR 阻塞 > 20min/视频、用户报"卡在音频转写中"。

**应对**：BrightData / Smartproxy 残留 IP 代理（治本，~$0.01-0.05/视频）。`asr.ts downloadToTemp()` 加 HTTP agent + `PROXY_URL` env。**不**上 yt-dlp Python sidecar（违反单语言决策）。

### 2. YouTube 评论分析 `commentThreads.list`

每视频 1 quota。prefilter spam / 引战 + 多语言。注入 SOP prompt 进一步抓 viral trigger。

### 3. SOP 阶段用 `channels.list`

把订阅数 / 视频数 / 累积播放塞进 SOP prompt，做更准确的 channel-level summary。

### 4. Drift detection 上 jieba 分词

当前 bag-of-words tokenize `[\w一-鿿]+` 在中文长 run 误报 `no_overlap`（空格 / 标点间整段 token 化）。上 jieba 后准确度大幅提升。

### 5. 长稿 VERBATIM PRESERVATION 升级

SECTION_EXPAND 还没强制"不杜撰"（archive 也没）。ITEM 偶尔编造行业术语（PU2000）。给长稿主指令加 verbatim 规则。

### 6. Global Bibles 跨频道复用

archive 已实现：用户保存「宝妈辅食圣经」复用到多个频道。我们 beta 不需要，beta 后做。

### 7. 导出 CSV / Markdown

Ideas 表 / SOPs 包 / Monitor videos / Clerk report — 各加一个下载按钮。30 min 投入。

### 8. Settings 页

beta 阶段 keys 都在 env，用户不需要配。后续做语言切换 / 主题 / profile / quota 显示。

### 9. ICP 备案 + WeChat 开放平台

外能直接备案，需 WFOE / JV / 中国合作方，端到端 $5-15K + 3-6 个月。WeChat web 登录可绕过 ICP（¥300 网站应用审核）；Mini Program 后端 callback 域名仍需 ICP。**起点越晚 WeChat 上线越晚**。

### 10. Playwright / unit tests

当前测试都靠 `packages/db/scripts/*-smoke.ts` 手动跑。Beta 后补 Playwright e2e + service 单测。

---

## 服务商与区域

> 用户主中国大陆 + 港澳台。区域决策围绕「数据库延迟 / Trigger.dev cloud worker 出口 IP / 服务商合规」三个轴。

| 服务                      | 区域                                | 备注                                                                               |
| ------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| Vercel                    | Global edge（默认）+ 函数 iad1 默认 | 未配 `vercel.json`，按需可改 `regions: ["hkg1", "sin1"]` 进一步降中国延迟          |
| Supabase Postgres         | **ap-southeast-1（Singapore）**     | 本地 IPv4 必走 Supavisor pooler `aws-1-ap-southeast-1.pooler.supabase.com:6543`    |
| Trigger.dev cloud workers | 之后我们决定（默认 us-east）        | **影响 YouTube CDN 限速最严重** — IDC IP 比住宅 IP 限速更狠（详见「未来优化 #1」） |
| Logto Cloud               | 之后我们决定                        | Auth 黑盒；不影响业务延迟（只在登录）                                              |
| Cloudflare R2             | 全球 edge auto                      | 大文件上传 / 下载就近                                                              |
| TikHub                    | 第三方 API，未公开                  | 1 req/sec per route；港澳节点为主                                                  |
| DeepSeek                  | **中国（北京）**                    | 主 LLM；对中国用户低延迟是优势                                                     |
| Anthropic Claude          | us-east                             | Vision + 后续 Upload Critique                                                      |
| Deepgram                  | us-east                             | ASR 主链                                                                           |
| Groq                      | us-east                             | ASR 兜底                                                                           |
| YouTube Data API          | global                              | 视频元数据                                                                         |

**之后我们决定**：

- Vercel 函数是否绑 `hkg1` / `sin1` 区域（默认 iad1 对中国用户~250ms RTT；绑 hkg1 ~50ms）
- Trigger.dev cloud worker 区域（若可选；默认 us-east 触发 R9 加剧）

---

## 已确认月费

只列已经在付 / 已经签约的：

| 项          | 月费             | 备注                                                                             |
| ----------- | ---------------- | -------------------------------------------------------------------------------- |
| Trigger.dev | **$10**（Hobby） | 2026-05-20 升级 — Free 1h/task 上限不够 Muse 长 ASR；Hobby 解锁 7 天 maxDuration |

其它（Vercel / Supabase / Logto / Cloudflare R2 / TikHub / 各 LLM / ASR）目前都在免费额度内 / pay-as-you-go，beta 流量打开后再回填实际数字。

---

**Vercel timeout**：Hobby 300s / Pro 800s (13min) / Enterprise 800s。30 min 长稿必须走 Trigger.dev。

**Trigger.dev v3 vs Inngest**：免费层都 50K execs/月，但 Trigger.dev 20 并发（vs Inngest 5）+ 内置 `useRealtimeRun`，TS DX 更佳。

**Auth.js v5 内置 WeChat（备选）**：需自管 session 持久化 + 用户表，Logto Cloud 运维成本更优。

**Trigger.dev 退出策略**：月费 > $200 时迁自部署 v3（开源 MIT）。所有进度上报包在 `reportProgress(current, total)` thin wrapper 后面，切 vendor 只改一个文件。

**核心 IP（archive 1:1 移植）**：6 个 prompt 文件（`packages/shared/prompts/`）+ drift detection 算法 + long-form thresholds + XHS engagement 公式。archive 路径 `~/Desktop/Singularity-Macos-Social-Media-AI-Agent/backend/`。

---
