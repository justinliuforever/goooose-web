# Goooose 三大模块 · 逻辑链路（Working Flow）

> 目的：把网站底层运行逻辑梳理清楚，方便对齐与定位优化点。
>
> 怎么读：每个模块讲三件事 —— ① 用户在这里能做什么 ② 系统一步步怎么跑 ③ 每一步用哪个模型、哪个 prompt。
>
> Prompt 不内嵌正文，正文与文末「Prompt 索引」里的 prompt 名均为可点击链接，在 GitHub 上点开即跳转到对应源文件那一行。
>
> 状态：Clerk / Muse / Poet 三个模块均已覆盖（含 YouTube 与小红书分支）。

---

## 模型说明

| 代号 | 实际模型 | 特点 | 主要用途 |
|---|---|---|---|
| Pro | DeepSeek V4 Pro（推理模型）| 质量高，但慢、贵 | 视频拆解、SOP 归并与合成、写稿、事实核查 |
| Flash | DeepSeek V4 Flash | 快、便宜 | 视频拆解小结（map）、圣经生成、相关性判断、评论总结；也作 Pro 空输出时的回退 |
| Vision | Claude Sonnet 4.6 | 看图 / 读文档 | 封面 / 封图分析；圣经文件导入的文档忠实转写 |
| ASR | Deepgram Nova-3 主 + Qwen3-ASR-Flash 备 | 语音转文字 | 无字幕视频转写 |

> Pro 是推理模型，偶发把输出预算耗在隐藏推理上返回空文本——多数 Pro 调用带「空输出回退 / 重试 Flash」保护，正文里不再逐一注明。

---

## 0. 账号接入（三个模块共用的起点）

用户先添加账号：「我的账号」里建自有账号（每个账号自动带一个默认项目，Muse / Poet 挂在项目下），「对标账号」里加要研究的账号。选平台（YouTube / 小红书）→ 粘贴主页链接 → 系统记录（平台 / 链接 / 语言）。

- 平台决定后续抓取链路：YouTube 走 yt-dlp + 住宅代理；小红书走 TikHub。
- 频道语言（中文 / 英文）决定后续大部分产出的输出语言。

添加好账号后，才能进入 Clerk / Muse / Poet 对它操作。

---

## 1. Clerk · 频道分析（看对标 → 出 SOP）

一句话：把一个频道最近 / 最热的若干条视频逐条拆解，再汇总成 3 份「频道 SOP」（创作手册）。

### 1.1 用户操作

点「开始分析」，弹出设置：

- 来源：最新发布 / 近期热门 / 指定链接（手动粘 URL，每行一个）
  - 「近期热门」= 近期发布里播放量（小红书为互动分）最高的 N 条，看不到很老的爆款。
- 数量：1–50 条（推荐 20）
- 分析模式：从头分析（覆盖已有结果）/ 仅新视频（跳过已分析过的）
- 时间范围（仅 YouTube 的「近期热门」生效）：不限 / 近 1 / 3 / 6 月
- SOP 语言：中文 / English（一般跟随频道语言）

开始后实时看进度面板（逐条进度 + 活动日志）。

### 1.2 流程（YouTube 频道）

```
拉列表 → 补数据筛选 → 逐条理解×N（并发8）→ 抓评论 → map-reduce 出 3 份 SOP → 存库
```

1. **拉视频列表** — yt-dlp（走住宅代理）抓频道视频，被 YouTube 拦截时自动换 IP 重试。产出：候选视频列表。
2. **补数据 + 筛选** — yt-dlp 列表不带播放量 / 日期，用 YouTube Data API 补齐；按「近期热门」排序或「时间范围」过滤，挑出 Top N。产出：待分析清单。
3. **逐条理解** — 最多同时 8 条，每条依次：
   1. 取文字稿 — 字幕优先；没字幕才下载音频转写（ASR：Deepgram 主 / Qwen 备；超 60 分钟跳过转写）。
   2. 拆解视频 — Pro（截断 / 空输出时 Flash 重试一次），prompt [`buildVideoAnalysisPrompt`](../packages/prompts/src/clerk.ts#L104)。产出结构化拆解（开头钩子 / 框架 / 节奏 / 选题角度，带 [mm:ss] 时间戳引用）。
   3. 看封面 — Vision，与上一步并行。
   - 产出：每条一份「视频拆解」（文字稿洞察 + 封面洞察）。
4. **抓热门评论** — 仅对播放量第一的视频：抓前 100 条评论 → Flash 总结，prompt [`buildCommentsSummaryPrompt`](../packages/prompts/src/clerk-comments.ts#L7)，结果喂给「爆款版」SOP。评论少于 5 条或失败则跳过；小红书不抓评论。
5. **map-reduce 生成 3 份 SOP** — SOP 不再直接吃原始文字稿，分三步（控制上下文规模，视频多也不截断）：
   1. **map** — 每条视频先 Flash 压成一份「拆解小结」，prompt [`buildVideoMapSummaryPrompt`](../packages/prompts/src/clerk.ts#L209)；小结缓存在库里，增量分析不重算。
   2. **reduce** — 小结分批 Pro 归并成「部分套路集」，prompt [`buildSopPartialReducePrompt`](../packages/prompts/src/clerk.ts#L273)。
   3. **合成** — 归并结果喂给三份 SOP，各一次 Pro 调用：
      - 真人版 [`buildHumanSopPrompt`](../packages/prompts/src/clerk.ts#L318) —— 创作者本人看的创作手册，跟随频道语言。
      - AI 参考版 [`buildAiSopReferencePrompt`](../packages/prompts/src/clerk.ts#L398) —— 给 Poet 写稿 AI 读的结构化参考，强制英文。
      - 爆款版 [`buildHottestSopPrompt`](../packages/prompts/src/clerk.ts#L501) —— 拆解最高播放视频的套路，跟随频道语言（需该视频有文字稿，否则跳过）。
6. **存库** — 3 份 SOP 入库（新旧原子替换，中途失败旧 SOP 不丢），前端展示。

另有「单视频 SOP」：在已分析的单条视频详情页手动触发（clerk-analyze-single-video 任务），复用缓存的文字稿与拆解 + [`buildHottestSopPrompt`](../packages/prompts/src/clerk.ts#L501)，不重新抓取。

### 1.3 小红书频道的差异

走 TikHub，不走 yt-dlp / 代理，差异主要在「取文字稿」：

- 图文笔记：直接用「标题 + 正文」当文字稿，不做语音转写。
- 视频笔记：从小红书 CDN 取音频做语音转写（CDN 不限制，无需代理）。

之后同样 Pro 拆解（[`buildVideoAnalysisPrompt`](../packages/prompts/src/clerk.ts#L104)）+ Vision 封图分析（多图用图集分析、单图 / 视频封面用单图分析），最终同样走 map-reduce 汇总成 3 份 SOP（与 1.2 第 5–6 步一致）。

### 1.4 系列检测（独立按钮，可选）

不在「开始分析」主流程里，是 Clerk 页上一个单独按钮，用户手动触发。作用：判断频道是否有「系列栏目」（固定选题 / 固定结构）。模型：Flash 主，空结果回退 Pro。Prompt [`buildSeriesDetectPrompt`](../packages/prompts/src/clerk-series.ts#L7)。

### 1.5 待优化点（内部参考）

| 类型 | 位置 | 说明 |
|---|---|---|
| 性能 / 成本 | 逐条拆解（步骤 3.2）| 每条都用 Pro（16K）是速度与成本主因；拆解输出是结构化 JSON，可评估降级或换模型 |
| 性能 | 音频转写 | 无字幕视频要下载 MB 级音频走代理，较慢 |
| 质量 | 翻译腔 | 英文源「读英文 → 出中文」一步到位，易翻译腔（逻辑正确，需单独优化写法）|
| 质量 | 中文转写 | 中文音频转写偶有乱码，会污染后续产出 |
| 成本 | 3 份 SOP | 最终合成三份都用 Pro 各 16K，可评估部分降级 |

> 具体耗时占比需结合后端真实运行记录确认，本表先标出嫌疑位置。

---

## 2. Muse · 竞品监控（看竞品 → 出选题）

一句话：扫描对标频道的最新视频，挑出"有可借鉴爆款机制"的，提炼套路，再为本频道生成选题。

### 2.1 用户操作

点「开始巡视」，弹出设置：

- 每个对标频道拉取视频数：5 / 10 / 20 / 50（推荐 10）
- 每个相关视频生成选题数：3 / 5 / 10（推荐 5）
- 选题语言：中文 / English

对标频道列表来自「频道」里维护的竞品清单。

### 2.2 流程

```
扫竞品视频 → 去重 → 取文字稿 → 相关性判断 → 提炼爆款触发器 → 生成选题 → 存库
```

1. **扫竞品视频** — 逐个对标频道抓最新 N 条：YouTube 走 yt-dlp（被拦截换 IP 重试），小红书走 TikHub。产出：候选视频。
2. **去重** — 跳过之前已处理过的视频（按频道 + 视频 id）。产出：新视频。
3. **取文字稿** — 与 Clerk 相同：YouTube 字幕优先、无则音频转写；小红书取音频或用标题正文。
4. **相关性判断** — Flash，prompt [`buildClassificationPrompt`](../packages/prompts/src/muse.ts#L15)。判断这条视频有没有"可迁移的爆款机制"（看的是钩子 / 情绪 / 叙事结构能不能借，不是题材是否相同）。不相关或文字稿过短则到此为止（防编造门：YouTube 文字稿至少 200 字、小红书图文至少 50 字才允许往下走）。
5. **提炼爆款触发器** — Pro，prompt [`buildViralTriggerPrompt`](../packages/prompts/src/muse.ts#L63)。读完整文字稿，提炼"点击 / 观看 / 转发"三类触发点。
6. **生成选题** — Pro，prompt [`buildIdeaGenerationPrompt`](../packages/prompts/src/muse.ts#L107)。基于触发器为本频道生成 N 条选题（故事角度 / 事实数据 / 为何相似 / 封面概念 / 钩子类型 / 风险点）。频道定位除简介外还取启用圣经的定位类章节（POSITIONING / AUDIENCE / CONTENT_RULES）；圣经与 SOP 只当「嗓音」用，硬性规定不得作为事实来源。
7. **存库** — 选题入库，前端展示供挑选。

任务中断（超时 / 手动取消）后重跑会续接：已分类相关但还没出选题的视频直接从库里补齐，不重新抓取。

> 理论上限 = 对标频道数 × 每频道视频数 × 每视频选题数；但相关性筛选会砍掉很多，实际产出远低于上限。

### 2.3 待优化点（内部参考）

| 类型 | 位置 | 说明 |
|---|---|---|
| 性能 / 成本 | 触发器 + 选题生成 | 两步都用 Pro，且每条视频顺序处理（间隔 1.5s），视频多时很慢 |
| 质量 | 翻译腔 | 英文竞品 → 中文选题，同样有翻译腔风险 |
| 性能 | 任务时长 | 单次最长 4 小时，竞品多 + 视频多时可能跑很久 |

---

## 3. Poet · 写稿（选题 → 成稿）

Poet 有三条独立流程：频道圣经（写稿前置）、选题分析、写稿。

### 3.1 频道圣经（Channel Bible）— 写稿的前置基准

一句话：把"频道是做什么的"固化成一份基准文档，后续写稿都围绕它，防跑题。

**圣经格式（v0.6 起锚点化）**：首行 `TOPIC:`（可选第二行 `HOST:` 人设名）+ 9 个英文锚点章节（POSITIONING / PERSONA / AUDIENCE / CONTENT_PILLARS / CONTENT_RULES / METHODOLOGY / INFORMATION_SOURCES / TOPIC_FRAMEWORK / FACT_SHEET）。下游按需取节：写稿取定位 + 人设 + 内容规则 + 方法论；选题分析与 Muse 不取事实类章节（防张冠李戴）；无锚点的旧圣经回退整块使用。

用户操作：填频道定位 / 想法（一段话）→ 起名字 → 选语言 → 生成。

流程：

1. **补频道简介** — 若频道还没简介，用 Flash 从播放量前 8 的视频提炼一份。
2. **生成圣经** — Flash（流式，前端实时看字数增长），prompt [`buildChannelBiblePrompt`](../packages/prompts/src/poet.ts#L14)。
3. **防编造校对** — 第二遍 LLM 对照输入删除无依据的具体信息（数字 / 专名等）。
4. **跑题检测** — 程序算法（非 AI）：比对"用户填的想法"与"圣经声称的主题"的词汇重叠，并检测是否凭空冒出 AI 相关词。判定跑题则该圣经标记为未启用，并记录一次跑题事件。
5. **存库** — 仅当该账号当前没有启用圣经时自动启用；已有启用圣经则新版本存为历史，由用户手动切换（不悄悄顶掉正在用的）。

### 3.1b 圣经文件导入 — 已有人设文档直接变圣经（v0.6 新增）

一句话：MCN / 创作者已有现成人设 / IP 文档（md / txt / pdf / docx，≤15MB），拖拽上传直接生成圣经，不用重新口述。每次扣 10 分钟，失败自动退回。

流程：

1. **分片上传** — 文件切 2MB 分片经 API 入库暂存（绕开平台请求体上限），校验哈希与文件头后触发导入任务。
2. **忠实转写** — Vision（Claude Sonnet 4.6）逐页转写为 markdown：数字版 PDF 用文本层数字交叉核对（免费、确定性）；扫描件与文档内的表格截图做二遍数字复核；辨认不出的内容标 `[无法辨识]`，绝不猜。
3. **重组圣经** — Pro，prompt [`buildBibleFromDocumentPrompt`](../packages/prompts/src/poet.ts#L97)。所有数字 / 专名必须逐字来自转写；文档声明的主播名写进 `HOST:` 行，写稿自称用人设名（如「我是徐艳梅」）而非账号名。
4. **数字审计** — 程序算法：圣经里出现的每个数字必须能在转写里找到，违规先重新生成一次，再违规删行并标记存疑。
5. **逐字段确认** — 存疑项（无法辨识 / 截断 / 审计违规）在前端逐条确认，全部确认前圣经不能激活（服务端硬门）。
6. **存库** — 完整转写另存为写稿的事实依据（grounding source）；分片阅后即焚。

### 3.2 选题分析（Custom Topic）— 自定义选题入口

一句话：用户自己给一个选题 + 参考资料，系统拆成可写稿的结构化选题（与 Muse 产出的选题同构）。

用户操作：填选题（一段话）+ 最多 10 个参考（YouTube / 小红书链接，或直接贴文本）→ 选语言 → 分析。

流程：

1. **抓参考资料** — YouTube 走 yt-dlp + 转写、小红书走 TikHub、纯文本直接用。
2. **拆解选题** — Pro，prompt [`buildTopicAnalysisPrompt`](../packages/prompts/src/poet.ts#L365)。结合参考 + 圣经（只取无事实类章节；导入圣经的已核实事实另走独立区块）+ AI 参考 SOP，产出：故事角度 / 事实数据 / 原文事实（保留原语言，数字专名不翻）/ 为何契合 / 爆款触发点。圣经与 SOP 只当「嗓音」用，不得作为事实来源。
3. **事实核查** — Pro，prompt [`buildFactCheckPrompt`](../packages/prompts/src/poet.ts#L435)。对提取的原文事实逐条用世界知识分类 verified / disputed / unsupported（只标注不改写；拿不准一律 verified）。disputed 的事实写稿时带 ⚠️ 提示。
4. **存库** — 选题状态置为"已分析"，参考资料与核查结果一并存下供写稿用。

### 3.3 写稿（Generate Script）

一句话：拿一个选题（来自 Muse 或选题分析），结合圣经 + AI 参考 SOP，写成可拍脚本。

用户操作：选一个已批准的选题 → 设目标时长（1–60 分钟，默认 5）→ 选语言 → 生成。

- 目标字数：中文约 200 字 / 分钟，英文约 150 词 / 分钟。
- 长短分流阈值：**中文 ≥2000 字 / 英文 ≥1500 词 走长稿**，否则短稿。

加载上下文（两条路共用）：启用中的圣经（必需，按需取节：定位 / 人设 / 内容规则 / 方法论 + HOST 人设名；导入圣经再带上完整文档转写当事实依据）+ AI 参考 SOP（`ai_reference`，项目绑定的主 SOP 优先）+ 选题来源的文字稿 / 参考 + 事实核查结果。

短稿：一次出全文 — Pro，prompt [`buildScriptWritingPrompt`](../packages/prompts/src/poet.ts#L164)。

长稿：

1. **列大纲** — Pro，prompt [`buildLongFormOutlinePrompt`](../packages/prompts/src/poet.ts#L249)。按比例分配各段字数（钩子 / 铺垫 / 正文 / 高潮 / CTA / 收尾），产出分段大纲。
2. **逐段扩写** — Pro（空输出该段 Flash 重试），prompt [`buildSectionExpandPrompt`](../packages/prompts/src/poet.ts#L311)，按大纲一段一段写（每段一次调用），最后拼接。

两条路汇合后的收尾（顺序固定）：

1. **防编造校对** — 第二遍 LLM（Pro）对照事实依据（参考 / 原文事实 / 圣经转写）删改无依据的具体断言。
2. **口语化（仅中文短稿）** — Pro，prompt [`buildChineseHumanizerPrompt`](../packages/prompts/src/poet.ts#L475)，改写成真人开口的口语；长稿与英文稿跳过。
3. **长度门（最后一步）** — 程序检查实际字数：超过目标 1.2× 走压缩 [`buildScriptCompressPrompt`](../packages/prompts/src/poet.ts#L512)；低于下限走扩写 [`buildScriptExpandPrompt`](../packages/prompts/src/poet.ts#L538)（细节须来自参考，不编造）。口语化会剪掉约三成字数，所以长度门必须垫底。
4. **身份净化** — 程序算法兜底：删掉冒用被拆解创作者身份的自我介绍（自称只允许账号名或圣经 HOST 人设名）。
5. **存库**。

### 3.4 待优化点（内部参考）

| 类型 | 位置 | 说明 |
|---|---|---|
| 性能 / 成本 | 写稿全程 Pro | 短稿 = 1 次写稿 + 1 次校对 +（中文）1 次口语化；长稿 = 1 次大纲 + N 段 × Pro + 1 次校对；超窗 / 不足再加压缩或扩写，串行，长稿很慢很贵 |
| 质量 | 翻译腔 | 英文 SOP / 参考 → 中文稿一步到位；口语化只修表面，修不掉概念层翻译腔 |
| 质量 | 上游依赖 | 写稿质量强依赖圣经与 AI 参考 SOP；上游 SOP 的翻译腔会传导到稿子 |

---

## Prompt 索引（可在 GitHub 直接打开）

> 所有 prompt 为 `.ts` 文件里的模板函数（静态指令正文 + 变量插值 + 中英 / 可选段落等条件）。点函数名即跳转到源文件对应行。
>
> 行号为参考，以函数名为准（代码改动后行号可能轻微偏移）。

| Prompt 函数 | 位置 | 作用 |
|---|---|---|
| [`buildVideoAnalysisPrompt`](../packages/prompts/src/clerk.ts#L104) | clerk.ts:104 | 单条视频 / 笔记：文字稿 + 元数据 → 结构化拆解 |
| [`buildVideoMapSummaryPrompt`](../packages/prompts/src/clerk.ts#L209) | clerk.ts:209 | 单条拆解 → 打法小结（SOP map 步，入库缓存）|
| [`buildSopPartialReducePrompt`](../packages/prompts/src/clerk.ts#L273) | clerk.ts:273 | 一批小结 → 部分套路集（SOP reduce 步）|
| [`buildHumanSopPrompt`](../packages/prompts/src/clerk.ts#L318) | clerk.ts:318 | 归并小结 → 创作者版 SOP（手册）|
| [`buildAiSopReferencePrompt`](../packages/prompts/src/clerk.ts#L398) | clerk.ts:398 | 归并小结 → AI 写稿参考 SOP（英文）|
| [`buildHottestSopPrompt`](../packages/prompts/src/clerk.ts#L501) | clerk.ts:501 | 最高播放视频 → 爆款深拆 SOP（单视频 SOP 复用）|
| [`buildCommentsSummaryPrompt`](../packages/prompts/src/clerk-comments.ts#L7) | clerk-comments.ts:7 | top 视频热门评论 → 观众反馈总结 |
| [`buildSeriesDetectPrompt`](../packages/prompts/src/clerk-series.ts#L7) | clerk-series.ts:7 | 视频列表 → 系列栏目聚类（系列检测，独立触发）|
| [`buildClassificationPrompt`](../packages/prompts/src/muse.ts#L15) | muse.ts:15 | 竞品视频 → 是否有可迁移爆款机制（相关性）|
| [`buildViralTriggerPrompt`](../packages/prompts/src/muse.ts#L63) | muse.ts:63 | 相关视频 → 点击 / 观看 / 转发触发器 |
| [`buildIdeaGenerationPrompt`](../packages/prompts/src/muse.ts#L107) | muse.ts:107 | 触发器 → 本频道 N 条选题 |
| [`buildChannelBiblePrompt`](../packages/prompts/src/poet.ts#L14) | poet.ts:14 | 频道想法 → 锚点化圣经（TOPIC/HOST + 9 章节）|
| [`buildBibleFromDocumentPrompt`](../packages/prompts/src/poet.ts#L97) | poet.ts:97 | 人设文档转写 → 锚点化圣经（文件导入）|
| [`buildTopicAnalysisPrompt`](../packages/prompts/src/poet.ts#L365) | poet.ts:365 | 选题 + 参考 → 结构化选题 |
| [`buildFactCheckPrompt`](../packages/prompts/src/poet.ts#L435) | poet.ts:435 | 原文事实逐条核查 verified / disputed / unsupported |
| [`buildScriptWritingPrompt`](../packages/prompts/src/poet.ts#L164) | poet.ts:164 | 选题 + 圣经 + SOP → 短稿全文 |
| [`buildLongFormOutlinePrompt`](../packages/prompts/src/poet.ts#L249) | poet.ts:249 | 长稿：选题 → 分段大纲 |
| [`buildSectionExpandPrompt`](../packages/prompts/src/poet.ts#L311) | poet.ts:311 | 长稿：单段大纲 → 成段正文 |
| [`buildChineseHumanizerPrompt`](../packages/prompts/src/poet.ts#L475) | poet.ts:475 | 中文短稿 → 真人口语化改写 |
| [`buildScriptCompressPrompt`](../packages/prompts/src/poet.ts#L512) | poet.ts:512 | 长度门：超长稿 → 压进预算窗口 |
| [`buildScriptExpandPrompt`](../packages/prompts/src/poet.ts#L538) | poet.ts:538 | 长度门：不足稿 → 按参考扩写到下限之上 |

> 圣经文件导入的「文档忠实转写」提示词在 `packages/integrations/src/clients/docTranscribe.ts`（Claude Sonnet 4.6，属集成层，不在 prompts 包）。

---

## 附：成本测算

详见独立文档 [cost_analysis.md](./cost_analysis.md)：真实单价（逐家查证 + 来源）× 真实用量（生产库 + Trigger.dev 运行记录），含单次运行明细、轻/中/重度用户月度估算、成本大头与优化方向。

一句话：固定月费约 $55（+ TikHub / Logto 待确认），单次 Clerk 分析 20 条 YouTube 视频按量约 $1.0，最大成本来源依次是住宅代理、ASR、Claude vision（DeepSeek token 只占小头）。
