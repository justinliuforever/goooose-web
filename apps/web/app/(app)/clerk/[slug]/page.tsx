import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { channels, clerkSops, clerkVideos } from "@singularity/db";

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
import { getActiveClerkRun } from "@/lib/clerk-run";
import { db } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/users";

import { ClerkRunButton } from "./_components/clerk-run-button";

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

  const [videos, sops, activeRun] = await Promise.all([
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
    getActiveClerkRun(channel.id, user.id),
  ]);

  const sopOrder: Record<string, number> = {
    human: 0,
    ai_reference: 1,
    hottest: 2,
    single_video: 3,
  };
  const sortedSops = [...sops].sort(
    (a, b) => (sopOrder[a.sopType] ?? 99) - (sopOrder[b.sopType] ?? 99),
  );

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <Button
        variant="ghost"
        size="sm"
        render={<Link href="/clerk" />}
        className="w-fit text-muted-foreground"
      >
        <ChevronLeft data-icon="inline-start" />
        Clerk · 分析师
      </Button>

      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="size-2 rounded-full bg-clerk" />
          <h1 className="text-2xl font-semibold tracking-tight">{channel.name}</h1>
          <Badge variant="secondary" className="font-mono text-[10px]">
            {videos.length} 个视频
          </Badge>
        </div>
        <ClerkRunButton
          channelId={channel.id}
          channelName={channel.name}
          initialActive={activeRun}
        />
      </header>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>标题</TableHead>
            <TableHead className="w-28">开场钩子</TableHead>
            <TableHead className="w-20">播放量</TableHead>
            <TableHead className="w-20">时长</TableHead>
            <TableHead className="w-28">分析时间</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {videos.map((v) => (
            <TableRow key={v.id}>
              <TableCell className="max-w-md truncate font-medium">
                <Link
                  href={`/clerk/${encodeURIComponent(slug)}/${encodeURIComponent(v.platformVideoId)}`}
                  className="hover:text-foreground hover:underline"
                >
                  {v.title}
                </Link>
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {v.openingHookType ?? "—"}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {formatViews(v.views)}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {formatDuration(v.durationSec)}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {v.analyzedAt ? v.analyzedAt.toLocaleDateString("zh-CN") : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {sortedSops.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-muted-foreground">脚本撰写 SOP</h2>
          <div className="flex flex-col gap-4">
            {sortedSops.map((sop) => (
              <SopCard key={sop.id} sop={sop} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SopCard({ sop }: { sop: typeof clerkSops.$inferSelect }) {
  return (
    <details className="flex flex-col gap-3 rounded-lg border bg-card p-5">
      <summary className="flex cursor-pointer items-center justify-between gap-3 list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="font-mono text-[10px] uppercase">
            {sop.sopType.replace(/_/g, " ")}
          </Badge>
          <span className="font-mono text-xs text-muted-foreground uppercase">{sop.language}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {(sop.contentMd?.length ?? 0).toLocaleString("en-US")} chars
          </span>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {sop.generatedAt.toLocaleDateString("zh-CN")}
        </span>
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
