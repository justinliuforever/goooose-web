import { and, asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import {
  channels,
  museIdeas,
  museMonitorVideos,
  poetBible,
  poetCustomTopics,
  poetDriftEvents,
  poetScripts,
  type CustomTopicReference,
} from "@singularity/db";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getActiveAgentRun } from "@/lib/agent-run";
import { formatDateTime } from "@/lib/datetime";
import { db } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/users";

import { BibleEditSheet } from "./_components/bible-edit-sheet";
import { BibleGenerateSheet } from "./_components/bible-generate-sheet";
import { BibleHistory } from "./_components/bible-history";
import { DeleteScriptButton } from "./_components/delete-script-button";
import { CustomTopicActions } from "./_components/custom-topic-actions";
import { CustomTopicCreateSheet } from "./_components/custom-topic-create-sheet";
import { DriftBanner } from "./_components/drift-banner";
import { PoetRunProgress } from "./_components/poet-run-progress";
import { WriteScriptButton } from "./_components/write-script-button";

type Props = { params: Promise<{ slug: string }> };

const DRIFT_REASON_LABEL: Record<string, string> = {
  no_overlap: "话题与你的描述无重合词",
  ai_markers: "内容大量倒向 AI/LLM 等模板话题",
  topic_substitution: "话题被替换",
};

export default async function PoetChannelPage({ params }: Props) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);

  const user = await ensureCurrentUser();
  if (!user) return null;

  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.slug, slug))
    .limit(1);
  if (!channel || channel.userId !== user.id) notFound();

  const [activeBibleRow, bibles, latestDrift, approvedIdeas, customTopics, scripts, activeRun] =
    await Promise.all([
      db
        .select()
        .from(poetBible)
        .where(and(eq(poetBible.channelId, channel.id), eq(poetBible.isActive, true)))
        .limit(1),
      db
        .select()
        .from(poetBible)
        .where(eq(poetBible.channelId, channel.id))
        .orderBy(desc(poetBible.updatedAt))
        .limit(10),
      db
        .select()
        .from(poetDriftEvents)
        .where(eq(poetDriftEvents.channelId, channel.id))
        .orderBy(desc(poetDriftEvents.detectedAt))
        .limit(1),
      db
        .select({
          id: museIdeas.id,
          ideaNumber: museIdeas.ideaNumber,
          storyAngle: museIdeas.storyAngle,
          factsAndData: museIdeas.factsAndData,
          whySimilar: museIdeas.whySimilar,
          viralTrigger: museIdeas.viralTrigger,
          approved: museIdeas.approved,
          scripted: museIdeas.scripted,
          sourceTitle: museMonitorVideos.title,
        })
        .from(museIdeas)
        .leftJoin(museMonitorVideos, eq(museMonitorVideos.id, museIdeas.sourceVideoId))
        .where(
          and(
            eq(museIdeas.channelId, channel.id),
            eq(museIdeas.approved, true),
            eq(museIdeas.scripted, false),
          ),
        )
        .orderBy(asc(museIdeas.generatedAt)),
      db
        .select()
        .from(poetCustomTopics)
        .where(eq(poetCustomTopics.channelId, channel.id))
        .orderBy(desc(poetCustomTopics.updatedAt)),
      db
        .select()
        .from(poetScripts)
        .where(eq(poetScripts.channelId, channel.id))
        .orderBy(desc(poetScripts.generatedAt))
        .limit(20),
      getActiveAgentRun(channel.id, user.id, "poet"),
    ]);

  const activeBible = activeBibleRow[0] ?? null;
  const recentDrift = latestDrift[0] ?? null;
  const showDriftBanner =
    recentDrift !== null &&
    !activeBible &&
    bibles.some((b) => b.id === recentDrift.bibleId && !b.isActive);

  return (
    <div className="flex flex-1 flex-col gap-8 p-8">
      <Button
        variant="ghost"
        size="sm"
        render={<Link href="/poet" />}
        className="w-fit text-muted-foreground"
      >
        <ChevronLeft data-icon="inline-start" />
        Poet · 写手
      </Button>

      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="size-2 rounded-full bg-poet" />
          <h1 className="text-2xl font-semibold tracking-tight">{channel.name}</h1>
          <Badge variant="secondary" className="font-mono text-[10px]">
            {scripts.length} 篇脚本
          </Badge>
          <Badge variant="secondary" className="font-mono text-[10px]">
            {approvedIdeas.length} 个待写选题
          </Badge>
        </div>
      </header>

      <PoetRunProgress
        initialActive={
          activeRun
            ? {
                runId: activeRun.runId,
                triggerRunId: activeRun.triggerRunId,
                publicAccessToken: activeRun.publicAccessToken,
                startedAt: activeRun.startedAt,
                kind:
                  activeRun.command === "poet-generate-bible"
                    ? "bible"
                    : activeRun.command === "poet-analyze-custom-topic"
                      ? "analyze"
                      : "script",
              }
            : null
        }
      />

      {showDriftBanner && recentDrift ? (
        <DriftBanner
          driftEventId={recentDrift.id}
          humanMessage={recentDrift.humanMessage ?? DRIFT_REASON_LABEL[recentDrift.reason]}
        />
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">频道圣经</h2>
          {activeBible ? (
            <div className="flex items-center gap-2">
              <BibleEditSheet
                bibleId={activeBible.id}
                bibleName={activeBible.name}
                bibleContent={activeBible.content}
              />
              <BibleGenerateSheet
                channelId={channel.id}
                channelName={channel.name}
                channelDescription={channel.description}
                buttonLabel="重新生成"
                buttonVariant="outline"
              />
            </div>
          ) : (
            <BibleGenerateSheet
              channelId={channel.id}
              channelName={channel.name}
              channelDescription={channel.description}
              buttonLabel="生成圣经"
            />
          )}
        </div>

        {activeBible ? (
          <article className="flex flex-col gap-3 rounded-lg border bg-card p-5">
            <header className="flex items-center justify-between">
              <h3 className="text-base font-medium">{activeBible.name}</h3>
              <Badge variant="secondary" className="text-[10px]">
                生效中
              </Badge>
            </header>
            <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-relaxed">
              {activeBible.content}
            </pre>
            <footer className="font-mono text-xs text-muted-foreground">
              {formatDateTime(activeBible.updatedAt)} 更新
            </footer>
          </article>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-card/40 p-8 text-sm text-muted-foreground">
            <span>该频道还没有可用的圣经</span>
            <span className="text-xs">先生成一份，再来选题写稿</span>
          </div>
        )}
        <BibleHistory bibles={bibles} />
      </section>

      {approvedIdeas.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">待写选题（Muse 已通过）</h2>
          <div className="flex flex-col gap-3">
            {approvedIdeas.map((idea) => (
              <article
                key={idea.id}
                className="flex items-start justify-between gap-3 rounded-lg border bg-card p-4"
              >
                <div className="flex flex-1 flex-col gap-1">
                  <span className="font-mono text-xs text-muted-foreground">
                    #{idea.ideaNumber}
                    {idea.sourceTitle ? ` · 来源：${idea.sourceTitle}` : ""}
                  </span>
                  <h3 className="text-sm font-medium whitespace-pre-wrap">
                    {idea.storyAngle ?? "—"}
                  </h3>
                  {idea.whySimilar ? (
                    <p className="text-xs text-muted-foreground line-clamp-2">{idea.whySimilar}</p>
                  ) : null}
                </div>
                <WriteScriptButton
                  channelId={channel.id}
                  ideaId={idea.id}
                  ideaTitle={idea.storyAngle ?? "选题"}
                  disabled={!activeBible}
                  disabledReason={!activeBible ? "请先生成并激活一份频道圣经" : undefined}
                />
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            自定义选题（跳过 Muse，直接喂主题）
          </h2>
          <CustomTopicCreateSheet channelId={channel.id} hasActiveBible={!!activeBible} />
        </div>
        {customTopics.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-card/40 p-6 text-center text-xs text-muted-foreground">
            {activeBible
              ? "想到什么写什么 — 新建一个自定义选题，AI 会根据当前圣经分析并写稿"
              : "先生成圣经，才能新建自定义选题"}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {customTopics.map((t) => (
              <article
                key={t.id}
                className="flex flex-col gap-3 rounded-lg border bg-card p-4"
              >
                <header className="flex items-start justify-between gap-3">
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={t.status === "scripted" ? "secondary" : "outline"}
                        className="text-[10px]"
                      >
                        {t.status === "draft"
                          ? "草稿"
                          : t.status === "analyzed"
                            ? "已分析"
                            : "已写稿"}
                      </Badge>
                      <span className="font-mono text-[10px] text-muted-foreground uppercase">
                        {t.language}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {formatDateTime(t.updatedAt)}
                      </span>
                    </div>
                    <h3 className="text-sm font-medium whitespace-pre-wrap">{t.topic}</h3>
                  </div>
                  <CustomTopicActions
                    channelId={channel.id}
                    topicId={t.id}
                    topicLabel={t.topic}
                    status={t.status}
                    hasActiveBible={!!activeBible}
                  />
                </header>

                {((t.references as CustomTopicReference[] | null) ?? []).length > 0 ? (
                  <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {((t.references as CustomTopicReference[] | null) ?? []).map((r, i) => (
                      <li key={i} className="truncate">
                        <span className="font-mono uppercase">[{r.kind}]</span>{" "}
                        {r.title ?? r.url ?? "未命名素材"}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {t.status !== "draft" && t.storyAngle ? (
                  <details className="flex flex-col gap-2">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground list-none [&::-webkit-details-marker]:hidden">
                      展开分析结果
                    </summary>
                    <div className="grid gap-3 border-t pt-3 text-xs">
                      {t.storyAngle ? (
                        <div className="flex flex-col gap-1">
                          <span className="font-medium uppercase text-muted-foreground">
                            故事角度
                          </span>
                          <p className="whitespace-pre-wrap">{t.storyAngle}</p>
                        </div>
                      ) : null}
                      {t.factsAndData ? (
                        <div className="flex flex-col gap-1">
                          <span className="font-medium uppercase text-muted-foreground">
                            事实与数据
                          </span>
                          <p className="whitespace-pre-wrap">{t.factsAndData}</p>
                        </div>
                      ) : null}
                      {t.verbatimFacts ? (
                        <div className="flex flex-col gap-1">
                          <span className="font-medium uppercase text-muted-foreground">
                            原文事实
                          </span>
                          <p className="whitespace-pre-wrap font-mono">{t.verbatimFacts}</p>
                        </div>
                      ) : null}
                      {t.whySimilar ? (
                        <div className="flex flex-col gap-1">
                          <span className="font-medium uppercase text-muted-foreground">
                            为什么对标
                          </span>
                          <p className="whitespace-pre-wrap">{t.whySimilar}</p>
                        </div>
                      ) : null}
                      {t.viralTrigger ? (
                        <div className="flex flex-col gap-1">
                          <span className="font-medium uppercase text-muted-foreground">
                            爆款触发因素
                          </span>
                          <p className="whitespace-pre-wrap">{t.viralTrigger}</p>
                        </div>
                      ) : null}
                    </div>
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      {scripts.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">已生成脚本</h2>
          <div className="flex flex-col gap-3">
            {scripts.map((s) => (
              <article
                key={s.id}
                className="flex items-start justify-between gap-3 rounded-lg border bg-card p-4 hover:bg-muted/30"
              >
                <Link
                  href={`/poet/${encodeURIComponent(slug)}/scripts/${s.id}`}
                  className="flex flex-1 flex-col gap-2 min-w-0"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                      {s.language}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {s.wordCount ?? "—"} {s.language === "zh" ? "字" : "词"}
                    </span>
                    {s.durationMinutes ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        约 {s.durationMinutes} 分钟
                      </span>
                    ) : null}
                    <span className="ml-auto font-mono text-xs text-muted-foreground">
                      {formatDateTime(s.generatedAt)}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground whitespace-pre-wrap">
                    {s.scriptText.slice(0, 240)}
                  </p>
                </Link>
                <DeleteScriptButton scriptId={s.id} />
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!activeBible && approvedIdeas.length === 0 && scripts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-sm text-muted-foreground">
          <span>这个频道还没有脚本</span>
          <span className="text-xs">
            先生成圣经 → 通过 Muse 选题 → 回到这里点「写稿」
          </span>
        </div>
      ) : null}
    </div>
  );
}
