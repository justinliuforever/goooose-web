import { count, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { channels, clerkSops, clerkVideos, poetBible, projects } from "@singularity/db";
import { formatDurationLabel } from "@singularity/shared/schemas/poet";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/users";

import { EditChannelSheet } from "../_components/edit-channel-sheet";

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

export default async function AccountDetailPage({ params }: Props) {
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

  const [
    [clerkVideoCount],
    [clerkSopCount],
    [poetBibleCount],
    activeBibleRows,
    projectList,
    topClerkVideos,
  ] = await Promise.all([
    db.select({ c: count() }).from(clerkVideos).where(eq(clerkVideos.channelId, channel.id)),
    db.select({ c: count() }).from(clerkSops).where(eq(clerkSops.channelId, channel.id)),
    db.select({ c: count() }).from(poetBible).where(eq(poetBible.channelId, channel.id)),
    db
      .select()
      .from(poetBible)
      .where(eq(poetBible.channelId, channel.id))
      .orderBy(desc(poetBible.updatedAt)),
    db
      .select()
      .from(projects)
      .where(eq(projects.ownAccountId, channel.id))
      .orderBy(desc(projects.createdAt)),
    db
      .select()
      .from(clerkVideos)
      .where(eq(clerkVideos.channelId, channel.id))
      .orderBy(desc(clerkVideos.views))
      .limit(5),
  ]);

  const a = encodeURIComponent(channel.slug);
  const itemNoun = channel.platform === "xhs" ? "篇笔记" : "个视频";
  const activeBible = activeBibleRows.find((b) => b.isActive) ?? null;

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col gap-6 p-6 sm:p-8">
      <Button
        variant="ghost"
        size="sm"
        render={<Link href="/accounts" />}
        className="w-fit text-muted-foreground"
      >
        <ChevronLeft data-icon="inline-start" />
        账号列表
      </Button>

      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{channel.name}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                {channel.platform}
              </Badge>
              <a
                href={channel.platformUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate font-mono text-xs hover:text-foreground"
              >
                {channel.platformUrl}
              </a>
            </div>
          </div>
          <EditChannelSheet channel={channel} />
        </div>
        {channel.description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{channel.description}</p>
        ) : null}
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href={`/clerk/${a}`}>
          <Card className="transition-colors hover:bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span className="size-[9px] rounded-full bg-clerk" />
                Clerk · 分析师
                <span className="text-[11px] font-normal text-muted-foreground/70">
                  ① 先拆解视频出 SOP
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-1 font-mono text-sm">
                <span>{clerkVideoCount?.c ?? 0} {itemNoun}</span>
                <span>{clerkSopCount?.c ?? 0} 份 SOP</span>
              </div>
              {(clerkVideoCount?.c ?? 0) === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">还没有分析，点击进入开始</p>
              ) : null}
            </CardContent>
          </Card>
        </Link>
        <Link href={`/accounts/${a}/bible`}>
          <Card className="transition-colors hover:bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span className="size-[9px] rounded-full bg-poet" />
                频道圣经
                <span className="text-[11px] font-normal text-muted-foreground/70">
                  ② 据 SOP 生成
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm">
                {activeBible ? (
                  <>
                    <Badge variant="success" className="text-[10px]">已选用</Badge>
                    <span className="truncate font-mono text-xs">{activeBible.name}</span>
                  </>
                ) : (
                  <span className="font-mono text-sm">{poetBibleCount?.c ?? 0} 本</span>
                )}
              </div>
              {(poetBibleCount?.c ?? 0) === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">先用 Clerk 出 SOP，再生成圣经</p>
              ) : null}
            </CardContent>
          </Card>
        </Link>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">项目</h2>
          <Button
            size="sm"
            variant="outline"
            render={<Link href={`/accounts/${a}/projects/new`} />}
          >
            新建项目
          </Button>
        </div>
        {projectList.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-card/40 p-6 text-center text-xs text-muted-foreground">
            先建项目，再绑定对标账号、出选题、写稿
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {projectList.map((proj) => (
            <Link key={proj.id} href={`/accounts/${a}/projects/${encodeURIComponent(proj.slug)}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardHeader className="pb-2">
                  <CardTitle className="truncate text-sm font-medium">{proj.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                    <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                      {proj.platform}
                    </Badge>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {formatDurationLabel(proj.targetDurationSeconds)}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {topClerkVideos.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">热门 Clerk 视频</h2>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>标题</TableHead>
                  <TableHead className="w-24">播放量</TableHead>
                  <TableHead className="w-20">时长</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topClerkVideos.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="max-w-md truncate">
                      <a
                        href={v.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-foreground"
                      >
                        {v.title}
                      </a>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {formatViews(v.views)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {formatDuration(v.durationSec)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
