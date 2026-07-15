import { and, eq } from "drizzle-orm";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  Anchor,
  Clock,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  LayoutGrid,
  ListChecks,
  Sparkles,
} from "lucide-react";

import { channels, clerkVideos } from "@goooose/db";

import { Badge } from "@/components/ui/badge";
import { formatDuration, formatViews } from "@/lib/format-count";
import { BackLink } from "@/components/back-link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatDateTime } from "@/lib/datetime";
import { xhsGoHref } from "@/lib/xhs-go";
import { db } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/users";

import { VideoTimelineBar } from "./_components/video-timeline-bar";

type Props = { params: Promise<{ slug: string; videoId: string }> };

function Field({ label, body }: { label: string; body: string | null }) {
  if (!body) return null;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <p
        className="text-sm leading-relaxed whitespace-pre-wrap text-foreground"
        style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
      >
        {body}
      </p>
    </div>
  );
}

function MonoField({ label, body }: { label: string; body: string | null }) {
  if (!body) return null;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <pre
        className="overflow-x-auto rounded-md bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground"
        style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
      >
        {body}
      </pre>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-muted-foreground">{icon}</span>
          <CardTitle className="min-w-0 truncate">{title}</CardTitle>
        </div>
        {description ? (
          <CardDescription className="min-w-0">{description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-5 pt-2">{children}</CardContent>
    </Card>
  );
}

function MetaTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-card px-4 py-3">
      <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <div className="flex min-w-0 items-baseline gap-2 truncate font-mono text-sm font-medium">
        {value}
      </div>
      {hint ? <span className="text-[10px] text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

function TranscriptSourceBadge({
  source,
  hasTranscript,
}: {
  source: string | null;
  hasTranscript: boolean;
}) {
  if (!hasTranscript) {
    return <span className="font-mono text-xs text-muted-foreground">无字幕</span>;
  }
  if (source === "caption") return <Badge variant="secondary">字幕</Badge>;
  if (source === "asr" || source === "xhs_asr") return <Badge variant="outline">AI 转写</Badge>;
  if (source === "xhs_text") return <Badge variant="secondary">正文</Badge>;
  return <span className="font-mono text-xs text-muted-foreground">无字幕</span>;
}

function ContentTypeLabel({ type }: { type: string }) {
  if (type === "xhs_image") return <>图文</>;
  if (type === "xhs_video") return <>短视频</>;
  return <>视频</>;
}

export default async function ClerkVideoDetailPage({ params }: Props) {
  const { slug: rawSlug, videoId: rawVideoId } = await params;
  const slug = decodeURIComponent(rawSlug);
  const videoId = decodeURIComponent(rawVideoId);

  const user = await ensureCurrentUser();
  if (!user) return null;

  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.slug, slug))
    .limit(1);

  if (!channel || channel.userId !== user.id) notFound();

  const [video] = await db
    .select()
    .from(clerkVideos)
    .where(
      and(eq(clerkVideos.channelId, channel.id), eq(clerkVideos.platformVideoId, videoId)),
    )
    .limit(1);

  if (!video) notFound();

  const isXhs = video.contentType.startsWith("xhs_");
  const isImagePost = video.contentType === "xhs_image";
  const hasTimeline =
    !!video.durationSec &&
    ((video.chapters?.length ?? 0) > 0 || (video.sponsorChapters?.length ?? 0) > 0);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6 sm:p-8">
      <BackLink href={`/clerk/${encodeURIComponent(slug)}`} label={channel.name} />

      <Card>
        <div className="grid grid-cols-1 gap-0 md:grid-cols-[260px_minmax(0,1fr)]">
          {video.thumbnailUrl ? (
            <div className="relative aspect-video w-full overflow-hidden bg-muted">
              <Image
                src={video.thumbnailUrl}
                alt={video.title}
                fill
                sizes="(max-width: 768px) 100vw, 260px"
                className="object-cover"
                unoptimized
              />
            </div>
          ) : null}
          <div className="flex min-w-0 flex-col gap-3 p-5">
            <h1
              className="text-xl font-semibold leading-tight tracking-tight"
              style={{ overflowWrap: "anywhere" }}
            >
              {video.title}
            </h1>
            <a
              href={xhsGoHref(video.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full min-w-0 items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              <span className="min-w-0 flex-1 truncate">{video.url}</span>
              <ExternalLink className="size-3 shrink-0" />
            </a>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                <ContentTypeLabel type={video.contentType} />
              </Badge>
              {video.openingHookType ? (
                <Badge variant="secondary" className="font-mono text-[10px]">
                  <span style={{ overflowWrap: "anywhere" }}>{video.openingHookType}</span>
                </Badge>
              ) : null}
              <TranscriptSourceBadge
                source={video.transcriptSource}
                hasTranscript={!!video.transcript}
              />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px border-t bg-border sm:grid-cols-4">
          <MetaTile
            label={isXhs ? "互动" : "播放量"}
            value={<span>{formatViews(video.views)}</span>}
          />
          {!isImagePost ? (
            <MetaTile label="时长" value={<span>{formatDuration(video.durationSec)}</span>} />
          ) : null}
          {video.transcript ? (
            <MetaTile label="字幕" value={<span>{video.transcript.length.toLocaleString()} 字</span>} />
          ) : null}
          {video.analyzedAt ? (
            <MetaTile
              label="分析时间"
              value={<span className="text-xs">{formatDateTime(video.analyzedAt)}</span>}
            />
          ) : null}
        </div>
      </Card>

      <SectionCard
        icon={<ImageIcon className="size-4" />}
        title="封面分析"
        description="基于真实封面图像的视觉拆解 + 改进建议"
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="视觉描述" body={video.thumbnailDescription} />
          <Field label="有效原因" body={video.thumbnailWhyItWorks} />
        </div>
        {video.coverDiagnosis || (video.coverTitleSuggestions && video.coverTitleSuggestions.length > 0) ? (
          <>
            <Separator />
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {video.coverDiagnosis ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    可改进点
                  </span>
                  <p
                    className="text-sm leading-relaxed whitespace-pre-wrap text-amber-700 dark:text-amber-400"
                    style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
                  >
                    {video.coverDiagnosis}
                  </p>
                </div>
              ) : null}
              {video.coverTitleSuggestions && video.coverTitleSuggestions.length > 0 ? (
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    备选标题建议
                  </span>
                  <ol className="flex flex-col gap-1 text-sm">
                    {video.coverTitleSuggestions.map((t, i) => (
                      <li key={i} className="flex min-w-0 gap-2">
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {i + 1}.
                        </span>
                        <span className="min-w-0" style={{ overflowWrap: "anywhere" }}>
                          {t}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </SectionCard>

      <SectionCard
        icon={<Anchor className="size-4" />}
        title="开场钩子 & 留住读者"
        description="开场抓人、文字钩子、二次钩子，整片的钩子分布"
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="开场钩子" body={video.openingHook} />
          <Field label="文字钩子" body={video.textHook} />
          <Field label="全片钩子" body={video.hooksThroughout} />
          <Field label="二次钩子" body={video.rehooksUsed} />
        </div>
        {video.allHookTypes ? (
          <>
            <Separator />
            <Field label="钩子类型汇总" body={video.allHookTypes} />
          </>
        ) : null}
      </SectionCard>

      <SectionCard
        icon={<LayoutGrid className="size-4" />}
        title="内容结构"
        description="从开场到结尾的节奏框架与脚本拆解"
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="内容框架" body={video.framework} />
          <Field label="开场结构" body={video.openingStructure} />
        </div>
        {video.scriptStructure ? (
          <>
            <Separator />
            <MonoField label="脚本结构（带时间戳）" body={video.scriptStructure} />
          </>
        ) : null}
      </SectionCard>

      <SectionCard
        icon={<Sparkles className="size-4" />}
        title="叙事 / 留存 / CTA"
        description="如何把观众留到结尾 + 引导转化"
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="叙事框架" body={video.storytellingFramework} />
          <Field label="留存策略" body={video.retentionPattern} />
          <Field label="CTA 位置" body={video.ctaPlacement} />
          <Field label="核心要点" body={video.keyTakeaways} />
        </div>
      </SectionCard>

      {hasTimeline ? (
        <SectionCard
          icon={<Clock className="size-4" />}
          title="视频时间轴"
          description="创作者标注的章节 + SponsorBlock 段（悬停看详情）"
        >
          <VideoTimelineBar
            durationSec={video.durationSec ?? 0}
            chapters={video.chapters}
            sponsorChapters={video.sponsorChapters}
          />
          {video.chapters && video.chapters.length > 0 ? (
            <ul className="flex flex-col gap-1.5 text-sm">
              {video.chapters.map((c, i) => (
                <li key={i} className="flex min-w-0 items-baseline gap-3">
                  <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">
                    {`${Math.floor(c.start_time / 60)}:${String(Math.floor(c.start_time % 60)).padStart(2, "0")}`}
                  </span>
                  <span className="min-w-0 flex-1" style={{ overflowWrap: "anywhere" }}>
                    {c.title}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </SectionCard>
      ) : null}

      {video.transcript && video.transcript !== "None" ? (
        <details className="group/details">
          <summary className="flex cursor-pointer flex-wrap items-center gap-2 rounded-lg border bg-card px-5 py-4 text-sm font-medium text-foreground hover:bg-card/80">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span>{isImagePost ? "正文" : isXhs ? "标题 / 描述 / 转写" : "字幕 / 转写文本"}</span>
            <Badge variant="outline" className="ml-auto font-mono text-[10px]">
              {video.transcript.length.toLocaleString()} 字
            </Badge>
          </summary>
          <div className="mt-3 rounded-lg border bg-card p-5">
            <pre
              className="font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground"
              style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
            >
              {video.transcript}
            </pre>
          </div>
        </details>
      ) : null}

      {!video.framework && !video.thumbnailDescription ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <ListChecks className="size-6" />
            <p>这个视频还没有分析结果。回到频道页重新触发分析即可。</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
