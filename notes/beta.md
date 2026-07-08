# Goooose Web — 功能 运维

**Last revised**: 2026-07-08

---

目标：Closed beta 目标 Q3 2026。

**进度**：Beta v0.6 已上线（2026-07-07，goooose.com）。历轮：三轮 feedback（IA 三层重构、Clerk 拆对标解耦、防编造、ASR 转写修复、进度条/ETA、UIUX motion 层）→ R4 多项目 + SOP map-reduce → v0.5 内测准入 + 分钟配额 + 管理后台 → v0.6 更名搬砖小鹅 Goooose + 锚点化圣经 + 圣经文件导入 + 维护任务。版本 release notes 见 `notes/releases/`；各轮执行文档见 `notes/archive/`。

---

## 技术栈

| 层         | 选择                                         |
| ---------- | -------------------------------------------- |
| 主语言     | TypeScript                                   |
| 前端       | Next.js 16 App Router on Vercel              |
| UI         | Tailwind 4 + shadcn/ui (base-nova) + Radix   |
| API        | tRPC v11                                     |
| AI 流式    | Vercel AI SDK                                |
| 长任务     | Trigger.dev v4 (Hobby, $10/mo)               |
| Auth       | Logto Cloud（自定义域 auth.goooose.com）     |
| 邮件       | Resend（审批通知，发信域 goooose.com）       |
| DB         | Supabase Pro (Postgres only) + Drizzle       |
| LLM 主链   | DeepSeek V4 Pro + Flash（reasoning enabled） |
| LLM vision | Claude Sonnet 4.6                            |
| ASR        | Deepgram Nova-3 主 / Qwen3-ASR-Flash 备      |
| 视频元数据 | YouTube Data API v3                          |
| 数据层     | TikHub（YouTube + XHS 全套）                 |
| Monorepo   | pnpm + Turborepo                             |

---

## 仓库结构

```
goooose-web/
├── apps/
│   ├── web/                       # Next.js 应用
│   │   ├── app/(app)/             # 已登录页面
│   │   ├── server/trpc/           # tRPC routers
│   │   └── lib/                   # 业务逻辑入口
│   └── worker/trigger/            # Trigger.dev 长任务
└── packages/
    ├── db/                        # Drizzle schema + 迁移 + smoke 脚本
    ├── domain/                    # 领域服务 + schemas
    ├── integrations/              # clients + proxy + utils
    └── prompts/                   # LLM 提示词（核心 IP）
```

**原则**：prompt 集中 `packages/prompts/`；长任务集中 `apps/worker/trigger/`；Drizzle schema 是 single source of truth。详见 [`ARCHITECTURE.md`](../ARCHITECTURE.md)。

---

## 功能模块

IA 三层：**账号**（自有账号，圣经 / SOP 挂账号）→ **项目**（每账号可多项目，目标时长是项目属性，Muse / Poet 挂项目）→ **对标账号**（独立实体，可绑定到项目）。登录首屏 `/` 直接跳第一个账号（无账号跳 Clerk）；旧 `/channels`、`/muse/[slug]`、`/poet/[slug]` 等 URL 全部 308 到新层级。

### 1. 账号 `/accounts`

账号是其它一切的根。

- CRUD：新建 / 编辑（抽屉式）/ 删除（确认弹窗，连带三表清理）
- 账号主页：统计、项目列表、圣经入口、「复盘」（对自己频道跑 Clerk 分析）
- **URL 验证 + 预览**：YouTube 走官方 Data API 优先 + TikHub 兜底；XHS 直接拉粉丝 / 获赞 / 头像 / IP 归属地。防止错误连接
- URL 路径生成支持 CJK slug；改名后老 URL 保持不变，可一键「重置 slug」；默认项目 slug 与账号相同

### 2. 对标账号 `/competitors` + Clerk 入口 `/clerk`

- 对标账号独立管理（不再挂在某个频道下面）：导入 URL 自动去重（YouTube @handle 两段式解析到 UC id）、刷新统计、绑定 / 解绑项目
- `/clerk` 平铺全部可分析对象（自有 + 对标），SOP 库是这里的一个 tab；跨账号 SOP 库另有 `/sops`，项目可设一个主 SOP（写稿优先用）

### 3. Clerk 分析师 `/clerk/[slug]`、`/clerk/competitor/[id]`

拆解频道（自有或对标）的爆款机制。

- 启动后抓取最近 N 个视频（YouTube：yt-dlp + 住宅代理抓列表和音频、YT Data API 补元数据、Deepgram/Qwen ASR；XHS：TikHub `get_user_notes_v2` 一次拿全 + 视频 note 走 ASR、图文 note 用 title+desc）
- 视频列表按平台自适应表头：YouTube 显示「播放量 / 字幕」，XHS 显示「互动分 / 正文」
- 单视频详情：13 个分析维度 + transcript + 「单视频 SOP」按钮（复用缓存拆解，不重抓）
- 三种 SOP（map-reduce 生成：每视频 Flash 小结 → 分批 Pro 归并 → Pro 合成，Markdown 渲染）：
  - **human**：把频道选题方法论用人话讲清楚
  - **ai_reference**：AI 结构化 SOP，给 Muse/Poet prompt 注入
  - **hottest**：仅基于 Top-N 高互动视频拆爆款机制（避免在低互动样本上幻觉）
- 多图 vision（≤9 张图 / 笔记）走 Claude Sonnet — 综合整组图，不只看封面
- 系列栏目检测（独立按钮，YouTube）：Flash 聚类标题 → 展示固定栏目

### 4. Muse 选题官 `/accounts/[slug]/projects/[project]/muse`

巡视对标，提取爆款触发因素，出选题。

- 启动后逐个 competitor 抓最新视频/笔记，三阶段流水线：**分类相关性 → 分析爆款触发 → 生成选题（每相关视频 5 个）**
- 双栏进度面板：左侧 timeline + 实时小计 + 进度条；右侧「正在分析」+「上一条已分类」预览
- 选题卡：故事角度 / 数据 / 与本频道契合点 / 爆款触发因素；一键审批

- **任务中断后重跑会续接生成选题**：上一次跑挂了（比如 Trigger 超时），已分类的相关视频还在 DB 里。重跑时不再回放抓取，直接读 DB 找「已 relevant 但还没出选题」的行补齐
- 「取消」按钮在「开始巡视」旁边一键终止当前 run（含 Trigger.dev 侧 cancel）；之后再启动会自动续接

**Imagination gate**（防 LLM 编造）：分类阶段要求 transcript 必须真实存在。YouTube 视频 floor 200 字；XHS 图文 floor 50 字（title+desc 通常 80-300 字）。

### 5. Poet 写手 `/accounts/[slug]/projects/[project]/poet`

按频道圣经 + 爆款套路写稿。

- **频道圣经（Channel Bible，v0.6 起锚点化）**：`TOPIC:`/`HOST:` 行 + 9 个英文锚点章节；下游按需取节（写稿取人设与方法论，选题与 Muse 不接触事实类章节）。每个账号一个活跃圣经 + 多版本历史，可编辑、激活老版本、删除。Drift 检测：新圣经 topic 与最初描述无重叠 / 含 AI 通用词时弹黄 banner
- **圣经文件导入（v0.6 新增）**：拖拽上传现成人设 / IP 文档（md/txt/pdf/docx ≤15MB）→ Claude 视觉忠实转写（数字交叉核对 + 生成后数字审计）→ 存疑项逐字段确认后才能激活；`HOST:` 人设名供写稿自称；扣 10 分钟，失败退回
- **写稿入口**：
  - 「待写选题」：Muse 已通过的选题，每条一个「写稿」按钮 + 4 种时长（5/10/20/30 min）下拉
  - 「自定义选题」：用户粘 URL（YouTube / XHS）或附文本 → AI 主题分析（出故事角度、数据、爆款触发）→ 原文事实逐条核查（disputed 带 ⚠️ 进写稿）→ 然后写稿
- 短稿（< 2000 字中文 / < 1500 字英文）单次出稿；长稿走 outline → section expand 两阶段，每段失败 1 次重试，再失败 fallback short 保证用户拿到完整长度
- 收尾链固定顺序：防编造校对 → Humanizer（仅中文短稿）→ 长度门（超 1.2× 压缩 / 低于下限扩写，垫底跑）→ 身份净化（自称只允许账号名或 HOST 人设名）；section markers `[HOOK] [TEASE] [ITEM] [CLIMAX] [CTA] [CLOSE]` 全程保留
- 脚本详情页：复制全文 / HTML / PDF 导出 / 删除

### 6. 内测准入 + 配额（v0.5–v0.6 上线）

- 邮箱白名单准入：未授权邮箱登录进「申请内测」页，管理员审批自动放行；审批通过发邮件通知（Resend）
- 每月 300 分钟用量池（Asia/Shanghai 自然月）：视频分析按实际分钟、图文 5、写稿按目标时长、圣经 5、文件导入 10、选题 3、单视频 2；生成类触发时扣，分析类结束结算；失败 / 取消 / 回收自动退回
- 兑换码面额为当月分钟，月底随池重置；账号数上限 30
- `/usage` 用量页：本月用量、剩余分钟、兑换码兑换
- 管理后台 `/admin`：准入审批、预邀请、兑换码、用户管理（角色 / 停用 / 删除 / 详情）、用量总览与额度规则
- Stripe 暂不接（原计划的按次数计费方案已被分钟池取代）

### 7. （计划中）Upload Critique `/critique`

用户上传任意稿件（文 / 图 / 短视频），出流式批改（Upload / Browse / Link Analysis 三模式）。archive 无此功能，纯 greenfield，Claude Sonnet 4.6 `streamText`。尚未动工。

### 8. （未做）Onboarding 引导

引导用户跑通「建账号 → Clerk → Muse → Poet」首循环。闭测邀请 50 用户。

---

## 运维我们要notices

### 平台

- **Trigger.dev**：Free plan 1h/task 硬限会limit。已升 Hobby（$10/mo, 7 天上限）；代码侧 `maxDuration: 14400` (4h) 全部任务统一
- **Supabase ap-southeast-1**：本地 IPv4 只能走 Supavisor pooler `aws-1-ap-southeast-1.pooler.supabase.com:6543`（不是 aws-0）；`postgres-js` 必须 `prepare: false`
- **Next.js 16**：cookies 修改只能在 Route Handler / Server Action，不能在 Page Component。`/callback` 必须 `route.ts` → redirect `/welcome`
- **Next.js 16**：`middleware.ts` → `proxy.ts`
- **Trigger.dev dev worker**：读 `apps/worker/` cwd 的 `.env` → 必须 symlink `apps/worker/.env.local → ../../.env.local`
- **drizzle-kit push** 有 CHECK constraint introspection bug → 用 `apply-pending-migration.ts` 直接执行 SQL
- **迁移 0015 起是手写 SQL**，不进 drizzle journal（journal 停在 0014）——`drizzle-kit push/generate` 不可信，schema 改动 = 手写 SQL + `apply-*.ts` + 手工同步 Drizzle 定义；部分 CHECK 约束与 partial unique 索引只存在于 SQL
- **RLS 已全表开启默认拒绝**（迁移 0030/0031，anon/authenticated 全部 REVOKE）；应用走 postgres 角色不受影响。新环境必须先跑这两个迁移，否则 anon key 可直读用户邮箱与代理凭证
- **Trigger 任务 `maxAttempts: 1` 是刻意的**：4h 级任务重试会双扣配额、挤占共享队列；重试只加在任务内部的 IO 调用上，用户侧错误抛 `AbortTaskRunError`
- **维护 cron（仅 prod）**：卡死任务回收 + 退分钟（每 15 分钟）、过期圣经导入分片清理（每小时）、代理会话冷却恢复（每小时）
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

### 1. YouTube CDN 限速（R9）— 已用住宅代理解决，持续观察

**现状**：wealthproxies 住宅代理池已上线（`proxy_sessions` 表 + 轮转 / 健康标记 / 403 冷却自动恢复 cron），yt-dlp 抓取与音频下载全走代理，约 $6/GB（单次 Clerk 20 条 ≈ $0.35，是最大按量成本项）。

**观察信号**：HTTP 403/429 高频、持续下载速率 < 5 KB/s、ASR 阻塞 > 20min/视频、代理池大面积被禁。恶化时评估换 BrightData / Smartproxy；**不**上 yt-dlp Python sidecar（违反单语言决策）。

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

| 服务                      | 区域                                                  | 备注                                                                           |
| ------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| Vercel 函数               | **`hkg1` (Hong Kong)**                                | `apps/web/vercel.json` 已锁 `regions: ["hkg1"]`，对中国用户 RTT ~50ms          |
| Supabase Postgres         | **ap-southeast-1（Singapore）**                       | 本地 IPv4 必走 Supavisor pooler `aws-1-ap-southeast-1.pooler.supabase.com:6543` |
| Trigger.dev cloud workers | **us-east-1 (Virginia)**                              | **R9 来源** — IDC IP 被 YouTube CDN 403，需残留代理（详见「未来优化 #1」）     |
| Logto Cloud               | **ap-northeast-1 (Tokyo)**                            | Auth 黑盒；不影响业务延迟（只在登录）                                          |
| TikHub                    | DigitalOcean SG（CF 前置）                            | 1 req/sec per route                                                            |
| DeepSeek                  | **中国（北京）**                                      | 主 LLM；对中国用户低延迟是优势                                                 |
| Anthropic Claude          | us-east                                               | Vision + 后续 Upload Critique                                                  |
| Deepgram                  | us-east                                               | ASR 主链                                                                       |
| Qwen3-ASR-Flash       | —       | ASR 兜底                                                                       |
| YouTube Data API          | Google anycast                                        | 视频元数据                                                                     |
| 域名 goooose.com          | GoDaddy（DNS 也在 GoDaddy）                           | A @ → Vercel；www 308 → apex；auth → Logto；Resend 发信记录                    |
| Resend                    | us-east-1                                             | 审批通知邮件；发信域 goooose.com                                               |

**跨大洲延迟现实**：Trigger.dev (us-east) → 任何亚洲服务（Supabase/Logto/TikHub/DeepSeek）≈ 150-300ms 单次 RTT；Vercel (hkg1) → 亚洲服务 ≈ 10-80ms。一次 Clerk 任务做 ~10 DB + ~8 DeepSeek + ~5 TikHub 调用，纯网络等待累计约 5 秒。当前不是主要瓶颈，留意。

---

## 已确认月费

只列已经在付 / 已经签约的：

| 项          | 月费             | 备注                                                                             |
| ----------- | ---------------- | -------------------------------------------------------------------------------- |
| Trigger.dev | **$10**（Hobby） | 2026-05-20 升级 — Free 1h/task 上限不够 Muse 长 ASR；Hobby 解锁 7 天 maxDuration |
| Vercel      | **$20**（Pro）   | 函数 800s 上限 + 团队功能（见 `cost_analysis.md`）                                |
| Supabase    | **$25**（Pro）   | 含 $10 compute credit（见 `cost_analysis.md`）                                    |
| 域名        | ~$1（年付摊）    | goooose.com，GoDaddy 2026-07-07 注册                                              |

其它（Logto / TikHub / Resend / 各 LLM / ASR / 住宅代理）目前都在免费额度内 / pay-as-you-go，按量成本见 `cost_analysis.md`（单次 Clerk 20 条 YouTube ≈ $1.0，大头是住宅代理 / ASR / vision）。

---

**Vercel timeout**：Hobby 300s / Pro 800s (13min) / Enterprise 800s。30 min 长稿必须走 Trigger.dev。

**Trigger.dev v3 vs Inngest**：免费层都 50K execs/月，但 Trigger.dev 20 并发（vs Inngest 5）+ 内置 `useRealtimeRun`，TS DX 更佳。

**Auth.js v5 内置 WeChat（备选）**：需自管 session 持久化 + 用户表，Logto Cloud 运维成本更优。

**Trigger.dev 退出策略**：月费 > $200 时迁自部署 v3（开源 MIT）。所有进度上报包在 `reportProgress(current, total)` thin wrapper 后面，切 vendor 只改一个文件。

**核心 IP（archive 1:1 移植）**：6 个 prompt 文件（`packages/prompts/`）+ drift detection 算法 + long-form thresholds + XHS engagement 公式。archive 路径 `~/Desktop/Singularity-Macos-Social-Media-AI-Agent/backend/`。

---
