# Part 2 实施方案 · IA 整体框架大改（方案一）

> 依据：[重构设计-方案一.md](./重构设计-方案一.md)（锁定）+ [优化方案-验证版.md](./优化方案-验证版.md) #3 + 21-agent 规划 workflow（现状测绘 / 深挖研究 / 三方案对抗评审）。
> **已定决策**：① Project 层 = **显式**（按方案一锁定导航）；② 对标去重 = **两段式**（纯 SQL 落表 + 离线联网解析）；③ 迁移力度 = **轻量 EMC**（additive 扩列 + 一次性回填 + 短验证后切换，利用 closed beta 数据量小）。
> **代码未动，待批准后从 INC0 开始。**

---

## 0. 结论：选定架构

三方案对抗评审选定 **D3 基座 + D1 安全 + D2 能力**（评分 8.6 / 8.4 / 7.4）。

**核心招法**：`projects.id` **直接复用现有 `channels.id`（同一批 UUID）**。于是每张内容表里的 `channel_id` 值，天然就是它所属默认 Project 的 `project_id`——我们只需给内容表**新增 `project_id` 列做自拷贝**（`project_id := channel_id`），**不给那 ~30 个 `channel_id` 外键做 re-parent**（re-parent 是整个重构最大的风险源，会逼迫所有 tRPC / Trigger payload / 唯一索引同步改写）。

- `channel_id` 全程保留为**权威键**，所有唯一约束 / CHECK / 单激活索引原样不动；
- 三层（Clerk 全局 / 我的账号 `own_accounts` / `Project`）+ `competitor_accounts` 一等表全部 **additive** 落地；
- 回填只做「ADD COLUMN + 原地 UPDATE」，**不删行、不 null 外键** → `poet_scripts` XOR CHECK 与 `muse_ideas` 唯一索引永不会在迁移中被重新触发（安全）；
- 契约期（最后）才在新 owner 上重建唯一索引、删 `channel_id`，PITR + `pg_dump` 兜底。

---

## 1. 数据模型

### 1.1 新表（5 张）

| 表 | 关键列 | 说明 |
|---|---|---|
| `own_accounts` | id, user_id FK CASCADE, name, slug, platform, platform_url, platform_channel_id, description; **UNIQUE(user_id, slug)** | 我的账号 = 资产层（现 channels 的「自有频道」语义） |
| `projects` | **id（回填时 = channels.id）**, own_account_id FK, user_id, name, slug, platform, target_duration_seconds NOT NULL DEFAULT 300, active_bible_id NULL FK→poet_bible ON DELETE SET NULL; **UNIQUE(own_account_id, slug)** | 执行单元 = 一平台 + 目标时长；绑 SOP/Bible/对标 |
| `competitor_accounts` | id, user_id FK, platform, **platform_key**（小写规范键）, url, name, avatar_url, subscriber_count, last_verified_at, deleted_at, **needs_resolution bool**; UNIQUE(user_id, platform, platform_key)（**Stage B 解析完才加**） | 对标一等实体（Clerk 源 / Muse 监控 / Project 引用共用一张） |
| `project_competitors` | (project_id, competitor_account_id) PK | Project ↔ 对标 多对多 |
| `project_sops` | (project_id, sop_id, **role**) PK | Project ↔ SOP 多对多；role ∈ primary / reference |

> `projects.default_language` **不建**（语言锁定范围里只有「时长」是项目级继承设定；语言仍按各 tRPC 入参默认 zh/en，避免引入无回填来源、无消费方的死列）。

### 1.2 现有表增列（全部 nullable 先行，保留 `channel_id`）

| 表 | 新增 | 语义 |
|---|---|---|
| `clerk_sops` | +own_account_id, +competitor_account_id（SET NULL） | SOP 归属账号；ad-hoc URL 分析归对标 |
| `clerk_videos` | +own_account_id | 自有频道视频分析 |
| `channel_series` | +own_account_id | 账号系列归类（同 clerk_videos） |
| `poet_bible` | +own_account_id | Bible 升为账号级资产 |
| `poet_drift_events` | +own_account_id | 随 Bible |
| `poet_custom_topics` | +project_id（自拷贝） | 选题归 Project |
| `poet_scripts` | +project_id（自拷贝） | 脚本归 Project |
| `muse_monitor_videos` | +project_id（自拷贝）, +competitor_account_id（**永久 nullable**） | 巡视视频归 Project + 溯源对标 |
| `muse_ideas` | +project_id（自拷贝） | 选题归 Project |
| `pipeline_runs` | +project_id, +own_account_id | **channel_id 仍权威**（活跃 run 检测 / 取消不变） |

### 1.3 不动的约束（附安全说明）

`channel_id` 全部外键、`clerk_videos`/`muse_monitor_videos` 的 `UNIQUE(channel_id, platform_video_id)` ×2、`poet_bible_one_active_per_channel` 部分唯一索引、`poet_scripts_exactly_one_source` CHECK —— 全程不动。
**安全说明**：回填是「ADD COLUMN + 原地 UPDATE」，不删行、不把 `idea_id/custom_topic_id/source_video_id` 置 NULL，因此上述 CHECK / 唯一索引在迁移期不会被重新评估。契约期单独处理（§2.5）。

---

## 2. 迁移（轻量 EMC + 两段式去重）

### 2.1 总原则
additive 扩列 → **一次性回填** → 短验证窗口 → 切换 → 灰度删旧。**不做**长期双写 + 2 周 soak（利用 closed beta 数据量小）。回滚：契约前 = 删新列/新表（catalog-only，瞬间）；契约 = PITR + `pg_dump` 兜底。

### 2.2 执行路径与授权（安全层硬约束）
- **prod DB 写被安全层拦**（0010 至今没应用正因如此）。所有迁移（0010 及新 0012+）**必须走授权路径**：`drizzle-kit generate` 产 DDL，DML 用 `--custom`，经 `apply-pending-migration.ts` / 你 `!` 亲跑，**不走脚本直写**。
- **DDL 与 DML 分文件**（结构与数据不混在一个迁移）。
- 0012–0015 apply 脚本**目前不存在**，复用现有 `apply-pending-migration.ts` runner。

### 2.3 两段式对标去重（YouTube 联网解析问题）
`platform_key` 要规范化才能 DB 级去重；YouTube `@handle / /c/ / /user/` 需联网解析成 UC id，纯 SQL 做不到。
- **Stage A（纯 SQL，幂等）**：XHS → `lower(extractXhsUserId)`；YouTube `/channel/UCxxx`、`/@handle` → 直接小写键；`/c/`、`/user/` → `lower(规范化 URL)` 并置 `needs_resolution=true`。先落表，**暂不加 UNIQUE**。
- **Stage B（离线，授权路径）**：对 `needs_resolution` 行调 `resolveChannelId` 解析 UC id → **MERGE** 解析后撞键的行 → 再 `CREATE UNIQUE(user_id, platform, platform_key)`。解析失败的行保留按规范化 URL 的独立键并记日志人工复核（**宁可欠合并，不可误合并**）。
- **迁移前审计查询**：按规范化 URL 形态 `GROUP BY` 统计疑似重复，人工过目后再建唯一约束（两条实为同频道的行一旦各自挂了 muse 视频就无法自动合并）。

### 2.4 阶段（每个动 shared/jobs 的增量后必有 Trigger 重部署门）

| 增量 | 内容 | Trigger 重部署 |
|---|---|---|
| **INC0** | 应用 0010（授权路径，验证部分唯一索引存在）+ 建立 `pg_dump`/PITR 基线习惯。**硬门**：0010 不 live，后续 Bible re-parent 无基。顺带删除已无用的 `GROQ_API_KEY` | — |
| **INC1** | `drizzle generate`：建 5 新表（全 nullable、无 UNIQUE/NOT NULL）+ 1.2 增列。授权应用（catalog-only） | — |
| **INC2** | **一次性回填**（授权 DML）：own_accounts/channel；projects.id=channels.id + own_account_id/project_id 自拷贝；competitor_accounts 两段式；project_competitors；project_sops（**全 sop_type**：ai_reference→role=primary，human/hottest/single_video→role=reference）；Bible pin（§4）；duration seed（§6）；historical `competitor_account_id` best-effort（`lower(source_channel_name)=lower(name)`）。**VERIFY 全套**（见 §2.6）。Stage B 后加 competitor UNIQUE | — |
| **INC3** | shared：`resolveActiveBible`（硬 pin）/ `resolveProjectSop`（仅 ai_reference 回退）；analyze-channel 原子换 SOP 时同事务重指 `project_sops.primary` + 写 own_account_id/competitor_account_id/auto project_sops。回填验证后 `SET NOT NULL`（own_account_id/project_id，与 count-null 同事务，lock_timeout 重试） | ✅ analyze-channel, analyze-custom-topic, generate-script, generate-bible |
| **INC4** | monitor-competitors 切 `project_competitors`（JOIN，JSONB 仅切换窗口兜底）+ guard 切 `COUNT(project_competitors)` 与 job 同源 + 写 competitor_account_id；detect-channel-series（**channelId 权威，hard-delete 谓词不变**）；duration 接 project 默认（优先级 §6）；ASR 路由按**实体平台**；channelDescription 单一来源 | ✅ monitor-competitors, detect-channel-series |
| **INC5** | 前端 IA（Project 显式，§5）：导航 + 新路由 + 深链重定向（真实路由段 308）+ 硬编码 href 清扫 + onboarding 阶梯 + dashboard 聚合层 + context header + bible-history→/accounts/[a]/bible。**所有新文案标「待你定」** | — |
| **INC6** | 契约（灰度删旧，§2.5） | ✅（删列涉及读路径时） |
| **INC7（可选）** | Muse 对标详情页 / 摘要增强 | 视改动 |

### 2.5 契约（INC6，删前对账 + 兜底）
1. **对账查询**：每个 `channels.competitors` 元素都有对应的 live `project_competitors` + `competitor_account_id` 行（不只看「读没回退」）。
2. **单独 `pg_dump`**：导出 `channels.competitors` + join 表，作为契约前的外科级恢复件（独立于 PITR）。
3. 拆分删除：先在新 owner 上 `CREATE UNIQUE INDEX CONCURRENTLY`（clerk_videos→own_account_id；muse_monitor_videos→own_account_id 或 competitor_account_id）并验证 → 删 channel-scoped 索引 → 删 `channels.competitors`、`duration_minutes` → 保留 `channels` 一周期 → 末轮删 `channel_id` + `channels`。每步独立可 PITR。

### 2.6 VERIFY（回填后断言）
- own_account_id / project_id 无 NULL；projects 1:1 channels；
- 无 >1 active Bible（账号级）；每个 project 都 pin 了 active_bible_id；
- competitor 去重后 distinct 数 = 各 channel 数组内去重后总和；无两个不同 UC id 撞同一 key；
- `project_competitors` 数 = 各默认 project 的 legacy JSONB 长度（去重后）；
- `analyzed/scripted` 选题的 `references` JSONB 仍非空（数量前后一致）；
- `poet_scripts` 违反 XOR CHECK 的行数 = 0（廉价保险）。

---

## 3. competitor_accounts 一等表（#3 Muse 导入对标）

- **表 + 去重**：见 §1.1 / §2.3。`platform_key` 复用现成函数：`extractXhsUserId`（小写）/ `parseYoutubeChannelUrl`（id|handle）/ `resolveChannelId`（handle→UC）。
- **导入入口**：`/competitors` 全局池页 + **项目内绑定**（multiselect 已有对标 + 导入新对标）。`verifyUrl`（现仅预览，routers.ts:208-287）改为可持久化；退役 `edit-channel-sheet` 的 textarea 猜平台旧法。多行粘贴逐行 ✓/✗。
- **tRPC**：`competitors.list / import(UPSERT，返回 added|duplicate|invalid|unresolved) / remove(used-by-N 反查 project_competitors，软删) / bind / unbind`。
- **monitor 切换**（INC4）：`monitor-competitors` payload `channelId` 不变；改为 `JOIN project_competitors`（无则 JSONB 兜底，**单次只取一个来源，不 union**）；写 `competitor_account_id` + `project_id`。guard 与 job **同源**（避免 UI 显示 N 而 job 读 0）。
- **历史回填**：`muse_monitor_videos.competitor_account_id` best-effort 按 `source_channel_name` 匹配，接受部分覆盖，列**永久 nullable**。
- **cap 策略**：沿用现 Zod max（20）；老数据 **grandfather**（仅对新增绑定执行 cap）。
- **详情页 `/competitors/[id]`**：展示绑定它的 project 列表（反查）+ last_verified_at +（回填后）跨 project 巡视到的视频——兑现锁定决策 A/B 的「可溯源共享池」，而非薄 CRUD。

---

## 4. SOP / Bible 全局复用

### SOP（↔ Project 多对多）
- `resolveProjectSop` = `role=primary` ELSE recent bound（**仅 sop_type=ai_reference**）ELSE legacy `(channelId) limit 1`（保留整窗口 + fallback 计数器，empty-SOP 解析归零前不进契约）。
- **SOP 写在 `apps/jobs/trigger/analyze-channel.ts`**（sopSteps 循环，原 workflow 笔记「未找到」有误）。改为：insert 时设 own_account_id（恒）+ competitor_account_id（**仅 ad-hoc 单 URL/对标来源**，自有频道 SOP 为 NULL）+ auto 建 `project_sops` primary。**原子换 SOP（delete+insert by channelId+sopType+runId）时，同事务把 `project_sops.primary` 重指到新 SOP id**（否则 primary 指向被删行→项目无 primary→脚本无 retention 脚手架，核心 IP 静默丢失）。

### Bible（账号级资产）
- `poet_bible` +own_account_id；`resolveActiveBible` = **`project.active_bible_id`（硬 pin）** ELSE **硬报错**（沿用现 `generate-script.ts:197` 的 "No active Channel Bible" throw）——**禁止静默回退到 own_account/channel**（否则同账号下第 2 个 project 会串到隔壁 niche 的 Bible，污染 grounding 源、错导文风）。
- 回填给**每个** project 的 `active_bible_id` 填入该 channel 当时 active 的 bible_id；新建 project 强制选 Bible 才可用 Muse/Poet。
- soak 期加 resolve-time `checkDrift`（topic/idea 文本 vs Bible TOPIC 行 token 重叠）零重叠时告警。
- 保留 Part 1 已做：首个 Bible 自动激活 + 新建不强制顶替 + Flash + 16384 + grounding。

---

## 5. 前端 IA / 路由 / 导航（Project 显式）

### 导航
```
全局
├─ 工作台        /
├─ Clerk        /clerk
├─ SOP 库        /sops
└─ 对标账号池     /competitors
我的账号
└─ /accounts → /accounts/[a]
              ├─ Bible        /accounts/[a]/bible
              └─ Project[]    /accounts/[a]/projects/[p] → [Muse | Poet]
```

### 路由表（新）
`/accounts`、`/accounts/[a]`、`/accounts/[a]/bible`、`/accounts/[a]/projects/new`、`/accounts/[a]/projects/[p]`、`.../muse`、`.../poet`、`.../poet/scripts/[id]`、`.../poet/topics/[id]`；`/clerk`、`/clerk/[a]`（保留）、`/clerk/[a]/[videoId]`；`/sops`；`/competitors`、`/competitors/[id]`。

### 深链重定向（关键：**不能用 `next.config` 静态重定向**）
项目 id 是 UUID，老 URL 里没有；且 slug 仅 user 内唯一。做法：**把旧 2 级路由保留为真实 Next 路由段**，server 端按 slug 查默认 project（`projects.id==channels.id`，默认 project slug = 账号 slug = 老 channel slug）后 **308** 到新规范 URL。逐形态显式覆盖：
- `/muse/[slug]` → `/accounts/[slug]/projects/[slug]/muse`
- `/poet/[slug]` / `/poet/[slug]/scripts/[id]` / `/poet/[slug]/topics/[id]` → 对应新路径（**嵌套链各自显式**）
- `/channels` → `/accounts`；`/clerk/[slug]`、`/clerk/[slug]/[videoId]` 保留
契约前用 smoke 验证每个旧 URL 形态可达。

### 硬编码 href 一次性清扫
`channels/[slug]/page.tsx`、`muse/[slug]/page.tsx`、`clerk/[slug]/page.tsx`、`poet/[slug]/page.tsx` 内所有 `/clerk|/muse|/poet|/channels` back-link、跨 agent 卡片、`/clerk/[slug]/[videoId]` 视频深链——随路由改造一次性换成 context-aware（带 account/project 参数）。

### onboarding / dashboard
- `create-channel-form` → 建 own_account；项目创建流内联绑定（平台 + 时长 + SOP + 对标）。
- `next-step-card` + dashboard empty-state 改为「账号 → 项目 → 加对标 → Clerk SOP → Muse → Poet」阶梯；老用户（已有默认 project）跳到首个未完成步。
- `getDashboardSnapshot`（lib/dashboard-data.ts，~8 innerJoin by userId）按 own_account 聚合；AgentStatCard href 落 `/accounts`；`active-runs-banner` 保持 channelId 域（pipeline_runs channel_id 权威）。
- 持久 context header `[账号·平台] > [项目·时长]`；设置分域（账号设置在账号页、项目设置在项目页，不合并）。

### 文案
**所有新 UI 文案（导航标签、context header、competitors 导入结果桶、空状态、阶梯）逐条标「待你定」**，已有 archive 措辞（`对标账号`、`巡视对标频道` 等）**原样复用**；禁用「拍死/完胜/硬伤」。

---

## 6. 内容质量护栏（对抗审查转化的硬性要求）

| 项 | 要求 |
|---|---|
| Bible 跨 niche | 每 project 硬 pin active_bible_id；解析不到→硬报错，**禁静默回退**（§4） |
| SOP 饿死 | resolveProjectSop 回退**仅认 ai_reference**；原子换 SOP 同事务重指 primary；empty-SOP 计数归零前不契约（§4） |
| 时长 | 优先级 = **显式请求 > 行存值 > 项目默认**；回填**不覆盖**老行 `duration_seconds`；project 默认按该 channel 历史**众数** seed（无历史→300） |
| ASR 路由 | 按**被转写实体的平台**（Muse=competitor.platform，Clerk 自频道=own_account.platform），**不按 project.platform**（否则中文 XHS 走 Deepgram 又出乱码） |
| channelDescription | 单一权威列；generate-bible 自动派生**写**该列、monitor-competitors **读**同列（同一次 shared/jobs 部署）；切换后断言非空 |
| factCheck / grounding | **不动**（纯字符串入参，无 channel 耦合）；只断言 topic 加 project_id 后 `references` JSONB 仍在（原地加列即保全） |

---

## 7. 风险与缓解（high，精选）

1. **YouTube 去重在纯 SQL 不可行** → 两段式（§2.3）；用解析后的 UC id 作 key，非 URL；建 UNIQUE 前审计。
2. **安全层拦 prod DML / 0010 未应用** → 所有迁移走授权路径；0012+ 复用 apply-pending-migration；INC0 先把 0010 弄 live（硬门）。
3. **契约删列只能整库 PITR** → 删前对账 + 单独 pg_dump + 拆分删除步（§2.5）。
4. **SET NOT NULL 时序** → 仅在切换代码 live（新行已填 owner 列）+ 补扫后做；与 count-null 同事务防 TOCTOU；competitor_account_id 永久 nullable。
5. **monitor guard/job 不同源** → guard 与 job 用同一 resolver；切换与 Trigger 重部署原子。
6. **深链 404** → 真实路由段 308，覆盖嵌套链（§5）。
7. **Trigger 重部署漏数** → 受影响 6 job：analyze-channel / analyze-custom-topic / generate-script / generate-bible / monitor-competitors / detect-channel-series；每个动 shared/jobs 的增量后 `git log --name-only` 核对再重部署。
8. **Bible 单激活在未来 project 合并下的隐患** → 建账号级唯一索引前加 row_number() dedup-active；以 project.active_bible_id 为唯一权威解析。

---

## 8. 不做 / 范围边界
- Muse ideas 的 facts_and_data 核查 / citation（接 fact-check 层）—— 留下一轮。
- 跨账号「团队/协作」语义、Project 模板、多平台同 Project（锁定 Q2：一 Project 一平台）。
- ASR garble 清洗层、Leica 类上游源数据错（fact-check 层已覆盖标记，不在本轮扩展）。
- `projects.default_language`（§1.1 已砍）。

## 9. 待你最终确认（实施中逐项回来找你）
- **全部新 UI 文案**（账号 / 项目 / 对标 / SOP 库 / 导入结果 / 空状态 / 阶梯 / context header）—— no-invented-copy，逐条定稿。
- competitor cap = 20 + 老数据 grandfather（如需改值告诉我）。
- 迁移每次需要授权应用（0010 及 0012+ 的 prod DML）—— 到点我会请你 `!` 亲跑或授权。

---
## 实施进度（2026-06-07，真机 prod）

**INC0–INC2 完成并验证（DB 地基 + 数据迁移全部落 prod）：**
- **INC0**：0010 单激活 Bible 部分唯一索引已应用。
- **INC1**：迁移 0012 — 5 新表（own_accounts/projects/competitor_accounts/project_competitors/project_sops）+ 13 个 nullable owner 列，全 additive；全仓 typecheck 绿。
- **INC2**：回填 — `own_accounts.id == projects.id == channels.id`（各 24）；owner 列 0 NULL；project_sops 88 绑定/22 primary（去重到每 project 一个 ai_reference）；时长按历史众数 seed（21×300s + 30s/900s/1800s 各一）；active_bible pin 12/24。对标两段式：7 个（4 个 YouTube handle→UC 解析、全部联网取名）、35 条历史 muse 溯源回填、0 重复；0013 部分唯一索引（`WHERE deleted_at IS NULL`）应用。两个回填脚本真幂等。
- prod 基线：24 频道 / 23 Bible / 337 视频；现网 app 不受影响（旧码不读新表）。
- **迁移执行**：dangerouslyDisableSandbox + **逐迁移用户授权**（安全分类器对每个高severity prod 写单独放行；非禁网）。迁移文件 `drizzle/0012`、`0013`（drizzle-kit gen）；回填是 `packages/db/scripts/` 下 TS 脚本（`backfill-inc2.ts`、`backfill-competitors.ts`、`verify-inc1.ts`、`peek-competitors.ts`），**不占 drizzle 编号**。

**校准发现（修正 INC3–5 边界）：**
- **SOP/Bible/对标 的写入主要在 `apps/web/server/trpc/routers.ts`（1284 行，tRPC 同步 mutation），不在 apps/jobs**：`clerk.startAnalysis`（SOP 原子换，:506 delete clerkSops）、`poet.generateBible/updateBible/activateBible`（:754/:798/:825）、`poet.createCustomTopic`（:994 insert，:1004）、`channels`（competitors patch :189）、`muse.startMonitor`（:590）。jobs 侧只有 `generate-script`/`analyze-custom-topic` **读** SOP/Bible，`generate-bible` 写 Bible。
- 故 resolver（读）+ 原子换重指 primary + owner 列写入 + Bible pin + 激活更新 pin **横跨 web(tRPC)+jobs**，需 Trigger 重部署 + 真机内容质量回归。INC3 起按 web/jobs 一起改、每节点真机验证。
- **Bible pin 推迟到 INC5**：当前 1 channel=1 project，bible 解析按 channelId+isActive 与 pin 等价；跨 niche 风险仅在「同账号多 project」（INC5 才出现）。提前切 pin 而不同步改激活路径会读到 stale pin。故 INC3 暂保持 channelId 解析，pin 与「激活更新 pin」放 INC5 一起做。
- **SET NOT NULL 推迟**：要等所有写入方（含 tRPC createCustomTopic 等）都填 owner 列后（约 INC5/契约期），否则新行 NULL 会令 SET NOT NULL 失败。

---
*生成依据：21-agent 规划 workflow（run wf_70226660-4be，2M token / 601 tool calls）。结构化产出存于 /tmp/part2-*.md。*
