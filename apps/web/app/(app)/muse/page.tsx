import { count, desc, eq, max, sql } from "drizzle-orm";
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
    .having(sql`count(${museIdeas.id}) > 0`)
    .orderBy(desc(max(museIdeas.generatedAt)));

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
        <span className="text-sm text-muted-foreground">监控竞品 + 生成选题</span>
      </header>

      {ideaRows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-16 text-sm text-muted-foreground">
          还没有选题
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
                  {monitoredByChannel.get(r.channelId) ?? 0}
                </TableCell>
                <TableCell className="font-mono text-sm">{r.ideaCount}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {r.lastGeneratedAt
                    ? r.lastGeneratedAt.toLocaleDateString("zh-CN")
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
