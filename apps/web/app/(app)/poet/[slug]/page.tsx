import { and, asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ChevronLeft } from "lucide-react";

import {
  channels,
  museIdeas,
  museMonitorVideos,
  poetBible,
  poetDriftEvents,
  poetScripts,
} from "@singularity/db";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getActiveAgentRun } from "@/lib/agent-run";
import { db } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/users";

import { BibleEditSheet } from "./_components/bible-edit-sheet";
import { BibleGenerateSheet } from "./_components/bible-generate-sheet";
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

  const [activeBibleRow, bibles, latestDrift, approvedIdeas, scripts, activeRun] =
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
        <PoetRunProgress
          initialActive={
            activeRun
              ? {
                  runId: activeRun.runId,
                  triggerRunId: activeRun.triggerRunId,
                  publicAccessToken: activeRun.publicAccessToken,
                  kind:
                    activeRun.command === "poet-generate-bible" ? "bible" : "script",
                }
              : null
          }
        />
      </header>

      {showDriftBanner && recentDrift ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="flex flex-col gap-1 text-sm">
            <strong className="font-medium">上次生成的圣经被标记为偏题</strong>
            <span>{recentDrift.humanMessage ?? DRIFT_REASON_LABEL[recentDrift.reason]}</span>
            <span className="text-xs">建议重新填写更具体的频道想法后再生成</span>
          </div>
        </div>
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
              {activeBible.updatedAt.toLocaleDateString("zh-CN")} 更新
            </footer>
          </article>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-card/40 p-8 text-sm text-muted-foreground">
            <span>该频道还没有可用的圣经</span>
            <span className="text-xs">先生成一份，再来选题写稿</span>
          </div>
        )}
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

      {scripts.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">已生成脚本</h2>
          <div className="flex flex-col gap-3">
            {scripts.map((s) => (
              <details
                key={s.id}
                className="flex flex-col gap-3 rounded-lg border bg-card p-4"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-3 list-none [&::-webkit-details-marker]:hidden">
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
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {s.generatedAt.toLocaleDateString("zh-CN")}
                  </span>
                </summary>
                <pre className="max-h-[480px] overflow-y-auto whitespace-pre-wrap border-t pt-3 font-sans text-sm leading-relaxed">
                  {s.scriptText}
                </pre>
              </details>
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
