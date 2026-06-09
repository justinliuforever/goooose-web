import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { channels, channelSeries, clerkSops, clerkVideos } from "@singularity/db";

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
import { formatDateTime } from "@/lib/datetime";
import { db } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/users";


import { ClerkRunButton } from "./_components/clerk-run-button";
import { DeleteSopButton } from "./_components/delete-sop-button";
import { ClerkSeriesPanel } from "./_components/clerk-series-panel";

type Props = { params: Promise<{ slug: string }> };

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

export default async function ClerkChannelPage({ params }: Props) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);

  const user = await ensureCurrentUser();
  if (!user) return null;

  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.slug, slug))
    .limit(1);

  if (!channel || channel.userId !== user.id) {
    notFound();
  }

  const isXhs = channel.platform === "xhs";

  const [videos, sops, activeRun, seriesRows] = await Promise.all([
    db
      .select()
      .from(clerkVideos)
      .where(eq(clerkVideos.channelId, channel.id))
      .orderBy(desc(clerkVideos.views)),
    db
      .select()
      .from(clerkSops)
      .where(eq(clerkSops.channelId, channel.id))
      .orderBy(desc(clerkSops.generatedAt)),
    getActiveAgentRun(channel.id, user.id, "clerk"),
    channel.platform === "youtube"
      ? db
          .select()
          .from(channelSeries)
          .where(eq(channelSeries.channelId, channel.id))
          .orderBy(desc(channelSeries.videoCount))
      : Promise.resolve([]),
  ]);

  const sopOrder: Record<string, number> = {
    human: 0,
    hottest: 1,
    single_video: 2,
    ai_reference: 3,
  };
  const sortedSops = [...sops].sort(
    (a, b) => (sopOrder[a.sopType] ?? 99) - (sopOrder[b.sopType] ?? 99),
  );
  const primarySops = sortedSops.filter((s) => s.sopType !== "ai_reference");
  const aiReferenceSops = sortedSops.filter((s) => s.sopType === "ai_reference");

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col gap-6 p-6 sm:p-8">
      <Button
        variant="ghost"
        size="sm"
        render={<Link href="/clerk" />}
        className="w-fit text-muted-foreground"
      >
        <ChevronLeft data-icon="inline-start" />
        Clerk · 分析师
      </Button>

      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="size-2 shrink-0 rounded-full bg-clerk" />
          <h1 className="truncate text-2xl font-semibold tracking-tight">{channel.name}</h1>
          <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
            {videos.length} {isXhs ? "篇笔记" : "个视频"}
          </Badge>
        </div>
      </header>

      <ClerkRunButton
        channelId={channel.id}
        channelName={channel.name}
        platform={channel.platform}
        initialActive={activeRun}
      />

      <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>标题</TableHead>
            <TableHead className="w-20">类型</TableHead>
            <TableHead className="w-24">{isXhs ? "文本来源" : "字幕来源"}</TableHead>
            <TableHead className="w-28">开场钩子</TableHead>
            <TableHead className="w-20">{isXhs ? "互动分" : "播放量"}</TableHead>
            <TableHead className="w-20">时长</TableHead>
            <TableHead className="w-28">分析时间</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {videos.map((v) => (
            <TableRow key={v.id}>
              <TableCell className="max-w-md truncate font-medium">
                <div className="flex items-center gap-2">
                  {v.coverDiagnosis ? (
                    <span
                      title={`封面可改进点：${v.coverDiagnosis.slice(0, 200)}`}
                      className="size-2 shrink-0 rounded-full bg-amber-500"
                      aria-label="cover has diagnosis"
                    />
                  ) : null}
                  <Link
                    href={`/clerk/${encodeURIComponent(slug)}/${encodeURIComponent(v.platformVideoId)}`}
                    className="truncate hover:text-foreground hover:underline"
                  >
                    {v.title}
                  </Link>
                </div>
              </TableCell>
              <TableCell>
                <ContentTypeBadge contentType={v.contentType} />
              </TableCell>
              <TableCell>
                <TranscriptSourceBadge source={v.transcriptSource} hasTranscript={!!v.transcript} />
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {v.openingHookType ?? "—"}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {formatViews(v.views)}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {v.contentType === "xhs_image" ? "图文" : formatDuration(v.durationSec)}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {formatDateTime(v.analyzedAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>

      {channel.platform === "youtube" ? (
        <ClerkSeriesPanel channelId={channel.id} initialSeries={seriesRows} />
      ) : null}

      {primarySops.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-muted-foreground">脚本撰写 SOP</h2>
          <div className="flex flex-col gap-4">
            {primarySops.map((sop) => (
              <SopCard key={sop.id} sop={sop} />
            ))}
          </div>
        </section>
      ) : null}

      {aiReferenceSops.length > 0 ? (
        <details className="flex flex-col gap-3 rounded-lg border bg-card/50 p-4 text-sm">
          <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
            AI 参考稿（默认隐藏 · 给 AI 用，非给人读）
          </summary>
          <div className="mt-3 flex flex-col gap-4">
            {aiReferenceSops.map((sop) => (
              <SopCard key={sop.id} sop={sop} />
            ))}
          </div>
        </details>
      ) : null}
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
    return <span className="font-mono text-[10px] text-muted-foreground">无字幕</span>;
  }
  if (source === "caption") {
    return <Badge variant="secondary" className="text-[10px]">字幕</Badge>;
  }
  if (source === "asr" || source === "xhs_asr") {
    return <Badge variant="outline" className="text-[10px]">AI 转写</Badge>;
  }
  if (source === "xhs_text") {
    return <Badge variant="secondary" className="text-[10px]">正文</Badge>;
  }
  return <span className="font-mono text-[10px] text-muted-foreground">无字幕</span>;
}

function ContentTypeBadge({ contentType }: { contentType: string }) {
  if (contentType === "xhs_image") {
    return <Badge variant="outline" className="text-[10px]">图文</Badge>;
  }
  if (contentType === "xhs_video") {
    return <Badge variant="outline" className="text-[10px]">短视频</Badge>;
  }
  return <Badge variant="secondary" className="text-[10px]">视频</Badge>;
}

function SopCard({ sop }: { sop: typeof clerkSops.$inferSelect }) {
  const label = sop.sopType.replace(/_/g, " ");
  return (
    <details className="flex flex-col gap-3 rounded-lg border bg-card p-5">
      <summary className="flex cursor-pointer items-center justify-between gap-3 list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="font-mono text-[10px] uppercase">
            {label}
          </Badge>
          <span className="font-mono text-xs text-muted-foreground uppercase">{sop.language}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {(sop.contentMd?.length ?? 0).toLocaleString("en-US")} chars
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {formatDateTime(sop.generatedAt)}
          </span>
          <DeleteSopButton sopId={sop.id} sopLabel={label} />
        </div>
      </summary>
      <SopContent text={sop.contentMd} />
    </details>
  );
}

async function SopContent({ text }: { text: string }) {
  const { default: ReactMarkdown } = await import("react-markdown");
  const { default: remarkGfm } = await import("remark-gfm");
  return (
    <article className="prose-clerk max-w-none border-t pt-4 text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </article>
  );
}
