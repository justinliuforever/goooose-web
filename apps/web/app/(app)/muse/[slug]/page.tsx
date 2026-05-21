import { and, asc, count, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";

import { channels, museIdeas, museMonitorVideos, type CompetitorRef } from "@singularity/db";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getActiveAgentRun } from "@/lib/agent-run";
import { db } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/users";

import { IdeaApproveToggle } from "./_components/idea-approve-toggle";
import { MuseRunButton } from "./_components/muse-run-button";
import {
  MuseRunProgressPanel,
  type LastProcessed,
  type LiveStats,
} from "./_components/muse-run-progress-panel";

type Props = { params: Promise<{ slug: string }> };

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default async function MuseChannelPage({ params }: Props) {
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

  const competitors = (channel.competitors ?? []) as CompetitorRef[];
  const activeCompetitors = competitors.filter(
    (c) => c.platform === "youtube" || c.platform === "xhs",
  );

  const [monitored, ideas, activeRun] = await Promise.all([
    db
      .select()
      .from(museMonitorVideos)
      .where(eq(museMonitorVideos.channelId, channel.id))
      .orderBy(desc(museMonitorVideos.processedAt)),
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
        generatedAt: museIdeas.generatedAt,
        sourceTitle: museMonitorVideos.title,
        sourceUrl: museMonitorVideos.url,
      })
      .from(museIdeas)
      .leftJoin(museMonitorVideos, eq(museMonitorVideos.id, museIdeas.sourceVideoId))
      .where(eq(museIdeas.channelId, channel.id))
      .orderBy(asc(museIdeas.ideaNumber)),
    getActiveAgentRun(channel.id, user.id, "muse"),
  ]);

  let liveStats: LiveStats | null = null;
  let lastProcessed: LastProcessed = null;
  if (activeRun) {
    const [allMon, relMon, irrMon, runIdeas, lastRow] = await Promise.all([
      db
        .select({ c: count() })
        .from(museMonitorVideos)
        .where(
          and(
            eq(museMonitorVideos.channelId, channel.id),
            eq(museMonitorVideos.runId, activeRun.runId),
          ),
        ),
      db
        .select({ c: count() })
        .from(museMonitorVideos)
        .where(
          and(
            eq(museMonitorVideos.channelId, channel.id),
            eq(museMonitorVideos.runId, activeRun.runId),
            eq(museMonitorVideos.relevant, true),
          ),
        ),
      db
        .select({ c: count() })
        .from(museMonitorVideos)
        .where(
          and(
            eq(museMonitorVideos.channelId, channel.id),
            eq(museMonitorVideos.runId, activeRun.runId),
            eq(museMonitorVideos.relevant, false),
          ),
        ),
      db
        .select({ c: count() })
        .from(museIdeas)
        .where(
          and(
            eq(museIdeas.channelId, channel.id),
            eq(museIdeas.runId, activeRun.runId),
          ),
        ),
      db
        .select({
          title: museMonitorVideos.title,
          sourceChannelName: museMonitorVideos.sourceChannelName,
          relevant: museMonitorVideos.relevant,
          topicClassification: museMonitorVideos.topicClassification,
          transcript: museMonitorVideos.transcript,
        })
        .from(museMonitorVideos)
        .where(
          and(
            eq(museMonitorVideos.channelId, channel.id),
            eq(museMonitorVideos.runId, activeRun.runId),
          ),
        )
        .orderBy(desc(museMonitorVideos.processedAt))
        .limit(1),
    ]);
    liveStats = {
      monitored: allMon[0]?.c ?? 0,
      relevant: relMon[0]?.c ?? 0,
      irrelevant: irrMon[0]?.c ?? 0,
      ideas: runIdeas[0]?.c ?? 0,
    };
    const r = lastRow[0];
    if (r) {
      lastProcessed = {
        title: r.title,
        sourceChannelName: r.sourceChannelName,
        relevant: r.relevant,
        topicClassification: r.topicClassification,
        transcriptLength: r.transcript?.length ?? 0,
      };
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-8 p-8">
      <Button
        variant="ghost"
        size="sm"
        render={<Link href="/muse" />}
        className="w-fit text-muted-foreground"
      >
        <ChevronLeft data-icon="inline-start" />
        Muse · 选题官
      </Button>

      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="size-2 rounded-full bg-muse" />
          <h1 className="text-2xl font-semibold tracking-tight">{channel.name}</h1>
          <Badge variant="secondary" className="font-mono text-[10px]">
            {ideas.length} 个选题
          </Badge>
          <Badge variant="secondary" className="font-mono text-[10px]">
            {activeCompetitors.length} 个对标频道
          </Badge>
        </div>
        <MuseRunButton
          channelId={channel.id}
          channelName={channel.name}
          competitorCount={activeCompetitors.length}
          isActive={!!activeRun}
        />
      </header>

      {activeRun && liveStats ? (
        <MuseRunProgressPanel
          triggerRunId={activeRun.triggerRunId}
          accessToken={activeRun.publicAccessToken}
          startedAt={activeRun.startedAt ?? null}
          liveStats={liveStats}
          lastProcessed={lastProcessed}
        />
      ) : null}

      {monitored.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">已巡视视频</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>标题</TableHead>
                <TableHead className="w-40">对标频道</TableHead>
                <TableHead className="w-20">时长</TableHead>
                <TableHead className="w-24">相关性</TableHead>
                <TableHead className="w-32">分类</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monitored.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="max-w-md truncate">
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {v.title}
                      <ExternalLink className="size-3" />
                    </a>
                  </TableCell>
                  <TableCell className="truncate text-sm text-muted-foreground">
                    {v.sourceChannelName ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {formatDuration(v.durationSec)}
                  </TableCell>
                  <TableCell>
                    {v.relevant === null ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : v.relevant ? (
                      <Badge variant="secondary" className="text-[10px]">
                        相关
                      </Badge>
                    ) : (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        已排除
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="truncate text-xs text-muted-foreground">
                    {v.topicClassification ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      {ideas.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">选题列表</h2>
          <div className="flex flex-col gap-4">
            {ideas.map((idea) => (
              <article
                key={idea.id}
                className="flex flex-col gap-3 rounded-lg border bg-card p-5"
              >
                <header className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-xs text-muted-foreground">
                      #{idea.ideaNumber}
                      {idea.sourceTitle ? (
                        <>
                          {" · 来源："}
                          {idea.sourceUrl ? (
                            <a
                              href={idea.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-foreground"
                            >
                              {idea.sourceTitle}
                            </a>
                          ) : (
                            idea.sourceTitle
                          )}
                        </>
                      ) : null}
                    </span>
                    <h3 className="text-base font-medium whitespace-pre-wrap">
                      {idea.storyAngle ?? "—"}
                    </h3>
                  </div>
                  <div className="flex shrink-0">
                    <IdeaApproveToggle
                      ideaId={idea.id}
                      approved={idea.approved}
                      scripted={idea.scripted}
                    />
                  </div>
                </header>

                {idea.factsAndData ? (
                  <div className="flex flex-col gap-1">
                    <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      事实与数据
                    </h4>
                    <p className="text-sm whitespace-pre-wrap">{idea.factsAndData}</p>
                  </div>
                ) : null}

                {idea.whySimilar ? (
                  <div className="flex flex-col gap-1">
                    <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      为什么对标
                    </h4>
                    <p className="text-sm whitespace-pre-wrap">{idea.whySimilar}</p>
                  </div>
                ) : null}

                {idea.viralTrigger ? (
                  <div className="flex flex-col gap-1">
                    <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      爆款触发因素
                    </h4>
                    <p className="text-sm whitespace-pre-wrap">{idea.viralTrigger}</p>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : monitored.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
          <span>还没有选题</span>
          {activeCompetitors.length > 0 ? (
            <span className="text-xs">点击右上角"开始巡视"，分析对标频道的爆款并生成选题</span>
          ) : (
            <span className="text-xs">先在频道设置中添加对标账号</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
