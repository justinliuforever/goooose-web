import { count, desc, eq, max } from "drizzle-orm";
import Link from "next/link";

import { channels, museIdeas, museMonitorVideos } from "@singularity/db";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/datetime";
import { db } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/users";

export default async function MuseLandingPage() {
  const user = await ensureCurrentUser();
  if (!user) return null;

  const ideaRows = await db
    .select({
      channelId: channels.id,
      channelSlug: channels.slug,
      channelName: channels.name,
      platform: channels.platform,
      ideaCount: count(museIdeas.id),
      lastGeneratedAt: max(museIdeas.generatedAt),
    })
    .from(channels)
    .leftJoin(museIdeas, eq(museIdeas.channelId, channels.id))
    .where(eq(channels.userId, user.id))
    .groupBy(channels.id, channels.slug, channels.name, channels.platform)
    .orderBy(desc(max(museIdeas.generatedAt)), desc(channels.createdAt));

  const videoRows = await db
    .select({
      channelId: channels.id,
      monitoredCount: count(museMonitorVideos.id),
    })
    .from(channels)
    .leftJoin(museMonitorVideos, eq(museMonitorVideos.channelId, channels.id))
    .where(eq(channels.userId, user.id))
    .groupBy(channels.id);

  const monitoredByChannel = new Map(videoRows.map((r) => [r.channelId, r.monitoredCount]));

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <header className="flex items-center gap-3">
        <span className="size-2 rounded-full bg-muse" />
        <h1 className="text-2xl font-semibold tracking-tight">Muse · 选题官</h1>
        <span className="text-sm text-muted-foreground">巡视对标账号，提取爆款机制并生成选题</span>
      </header>

      {ideaRows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <span>还没有频道</span>
          <Link href="/channels/new" className="text-xs hover:text-foreground hover:underline">
            先创建一个频道
          </Link>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>频道</TableHead>
              <TableHead className="w-24">平台</TableHead>
              <TableHead className="w-28">已监控</TableHead>
              <TableHead className="w-24">选题数</TableHead>
              <TableHead className="w-40">最近生成</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ideaRows.map((r) => (
              <TableRow key={r.channelId}>
                <TableCell className="font-medium">
                  <Link
                    href={`/muse/${encodeURIComponent(r.channelSlug)}`}
                    className="hover:text-foreground hover:underline"
                  >
                    {r.channelName}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                    {r.platform}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {(monitoredByChannel.get(r.channelId) ?? 0) > 0
                    ? monitoredByChannel.get(r.channelId)
                    : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {r.ideaCount > 0 ? r.ideaCount : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {r.lastGeneratedAt ? formatDate(r.lastGeneratedAt) : "未巡视"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
