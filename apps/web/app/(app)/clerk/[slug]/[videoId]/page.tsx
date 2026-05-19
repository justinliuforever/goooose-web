import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";

import { channels, clerkVideos } from "@singularity/db";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/datetime";
import { db } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/users";

type Props = { params: Promise<{ slug: string; videoId: string }> };

function formatViews(views: number | null): string {
  if (views == null) return "—";
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K`;
  return String(views);
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Section({ title, body }: { title: string; body: string | null }) {
  if (!body) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <p className="text-sm whitespace-pre-wrap">{body}</p>
    </section>
  );
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

  return (
    <div className="flex flex-1 flex-col gap-8 p-8">
      <Button
        variant="ghost"
        size="sm"
        render={<Link href={`/clerk/${encodeURIComponent(slug)}`} />}
        className="w-fit text-muted-foreground"
      >
        <ChevronLeft data-icon="inline-start" />
        {channel.name}
      </Button>

      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{video.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-xs hover:text-foreground"
          >
            {video.url} <ExternalLink className="size-3" />
          </a>
          <span className="font-mono text-xs">{formatViews(video.views)} 播放</span>
          <span className="font-mono text-xs">{formatDuration(video.durationSec)}</span>
          {video.openingHookType ? (
            <Badge variant="secondary" className="font-mono text-[10px]">
              {video.openingHookType}
            </Badge>
          ) : null}
          {video.transcriptSource === "caption" ? (
            <Badge variant="secondary" className="text-[10px]">
              字幕
            </Badge>
          ) : video.transcriptSource === "asr" ? (
            <Badge variant="outline" className="text-[10px]">
              AI 转写
            </Badge>
          ) : null}
          {video.analyzedAt ? (
            <span className="font-mono text-xs">
              {formatDateTime(video.analyzedAt)} 分析
            </span>
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Section title="封面描述" body={video.thumbnailDescription} />
          <Section title="封面有效原因" body={video.thumbnailWhyItWorks} />
          <Section title="开场钩子" body={video.openingHook} />
          <Section title="文字钩子" body={video.textHook} />
          <Section title="全片钩子" body={video.hooksThroughout} />
          <Section title="钩子类型" body={video.allHookTypes} />
          <Section title="二次钩子" body={video.rehooksUsed} />
        </div>

        <div className="flex flex-col gap-6">
          <Section title="内容框架" body={video.framework} />
          <Section title="开场结构" body={video.openingStructure} />
          <Section title="脚本结构" body={video.scriptStructure} />
          <Section title="叙事框架" body={video.storytellingFramework} />
          <Section title="留存策略" body={video.retentionPattern} />
          <Section title="CTA 位置" body={video.ctaPlacement} />
          <Section title="核心要点" body={video.keyTakeaways} />
        </div>
      </div>

      {video.transcript && video.transcript !== "None" ? (
        <Section title="字幕 / 转写文本" body={video.transcript} />
      ) : null}
    </div>
  );
}
