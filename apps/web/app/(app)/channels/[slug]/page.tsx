import { count, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import {
  channels,
  clerkSops,
  clerkVideos,
  museIdeas,
  museMonitorVideos,
  poetBible,
  poetCustomTopics,
} from "@singularity/db";

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
import { formatDateTime } from "@/lib/datetime";
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

export default async function ChannelDetailPage({ params }: Props) {
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
    [museVideoCount],
    [museIdeaCount],
    [poetBibleCount],
    [poetTopicCount],
    topClerkVideos,
    topMuseIdeas,
    topPoetTopics,
    bibles,
  ] = await Promise.all([
    db.select({ c: count() }).from(clerkVideos).where(eq(clerkVideos.channelId, channel.id)),
    db.select({ c: count() }).from(clerkSops).where(eq(clerkSops.channelId, channel.id)),
    db
      .select({ c: count() })
      .from(museMonitorVideos)
      .where(eq(museMonitorVideos.channelId, channel.id)),
    db.select({ c: count() }).from(museIdeas).where(eq(museIdeas.channelId, channel.id)),
    db.select({ c: count() }).from(poetBible).where(eq(poetBible.channelId, channel.id)),
    db
      .select({ c: count() })
      .from(poetCustomTopics)
      .where(eq(poetCustomTopics.channelId, channel.id)),
    db
      .select()
      .from(clerkVideos)
      .where(eq(clerkVideos.channelId, channel.id))
      .orderBy(desc(clerkVideos.views))
      .limit(5),
    db
      .select()
      .from(museIdeas)
      .where(eq(museIdeas.channelId, channel.id))
      .orderBy(desc(museIdeas.generatedAt))
      .limit(5),
    db
      .select()
      .from(poetCustomTopics)
      .where(eq(poetCustomTopics.channelId, channel.id))
      .orderBy(desc(poetCustomTopics.updatedAt))
      .limit(5),
    db
      .select()
      .from(poetBible)
      .where(eq(poetBible.channelId, channel.id))
      .orderBy(desc(poetBible.updatedAt)),
  ]);

  const encodedSlug = encodeURIComponent(channel.slug);
  const itemNoun = channel.platform === "xhs" ? "篇笔记" : "个视频";
  const stats = [
    {
      label: "Clerk · 分析师",
      href: `/clerk/${encodedSlug}`,
      hasData: (clerkVideoCount?.c ?? 0) > 0,
      lines: [
        `${clerkVideoCount?.c ?? 0} ${itemNoun}`,
        `${clerkSopCount?.c ?? 0} 份 SOP`,
      ],
    },
    {
      label: "Muse · 选题官",
      href: `/muse/${encodedSlug}`,
      hasData: (museIdeaCount?.c ?? 0) > 0 || (museVideoCount?.c ?? 0) > 0,
      lines: [
        `${museVideoCount?.c ?? 0} ${channel.platform === "xhs" ? "篇监控笔记" : "个监控视频"}`,
        `${museIdeaCount?.c ?? 0} 个选题`,
      ],
    },
    {
      label: "Poet · 写手",
      href: `/poet/${encodedSlug}`,
      hasData: (poetBibleCount?.c ?? 0) > 0 || (poetTopicCount?.c ?? 0) > 0,
      lines: [
        `${poetBibleCount?.c ?? 0} 本圣经`,
        `${poetTopicCount?.c ?? 0} 个自定义选题`,
      ],
    },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <Button
        variant="ghost"
        size="sm"
        render={<Link href="/channels" />}
        className="w-fit text-muted-foreground"
      >
        <ChevronLeft data-icon="inline-start" />
        频道列表
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

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => {
          const card = (
            <Card
              className={
                s.hasData
                  ? "transition-colors hover:bg-muted/50"
                  : ""
              }
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {s.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-1">
                  {s.lines.map((line) => (
                    <span key={line} className="font-mono text-sm">
                      {line}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
          return s.hasData ? (
            <Link key={s.label} href={s.href}>
              {card}
            </Link>
          ) : (
            <div key={s.label}>{card}</div>
          );
        })}
      </section>

      {topClerkVideos.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Top Clerk videos</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead className="w-24">Views</TableHead>
                <TableHead className="w-20">Duration</TableHead>
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
        </section>
      ) : null}

      {bibles.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Poet bibles</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-24">Active</TableHead>
                <TableHead className="w-32">Generated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bibles.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="max-w-md truncate">{b.name}</TableCell>
                  <TableCell>
                    {b.isActive ? (
                      <Badge variant="secondary" className="text-[10px]">
                        active
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {formatDateTime(b.generatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      {topPoetTopics.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Custom topics</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Topic</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-32">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topPoetTopics.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="max-w-md truncate">{t.topic}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px]">
                      {t.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {formatDateTime(t.updatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      {topMuseIdeas.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Recent Muse ideas</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Story angle</TableHead>
                <TableHead className="w-24">Approved</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topMuseIdeas.map((idea) => (
                <TableRow key={idea.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {idea.ideaNumber}
                  </TableCell>
                  <TableCell className="max-w-md truncate">
                    {idea.storyAngle ?? "—"}
                  </TableCell>
                  <TableCell>
                    {idea.approved ? (
                      <Badge variant="secondary" className="text-[10px]">
                        approved
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}
    </div>
  );
}
