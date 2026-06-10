import { count, desc, eq, max } from "drizzle-orm";
import Link from "next/link";

import { channels, clerkVideos } from "@singularity/db";

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

export default async function ClerkLandingPage() {
  const user = await ensureCurrentUser();
  if (!user) return null;

  const rows = await db
    .select({
      channelId: channels.id,
      channelSlug: channels.slug,
      channelName: channels.name,
      platform: channels.platform,
      videoCount: count(clerkVideos.id),
      lastAnalyzedAt: max(clerkVideos.analyzedAt),
    })
    .from(channels)
    .leftJoin(clerkVideos, eq(clerkVideos.channelId, channels.id))
    .where(eq(channels.userId, user.id))
    .groupBy(channels.id, channels.slug, channels.name, channels.platform)
    .orderBy(desc(max(clerkVideos.analyzedAt)), desc(channels.createdAt));

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col gap-6 p-6 sm:p-8">
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="size-2 shrink-0 rounded-full bg-clerk" />
          <h1 className="text-2xl font-semibold tracking-tight">Clerk · 分析师</h1>
          <span className="text-sm text-muted-foreground">
            分析视频结构、钩子、节奏，生成可复用的脚本撰写 SOP
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Clerk 拆解你添加的频道，沉淀脚本 SOP；巡视对标账号出选题的是 Muse。
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <span>还没有频道</span>
          <Link href="/accounts/new" className="text-xs hover:text-foreground hover:underline">
            先创建一个频道
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>频道</TableHead>
              <TableHead className="w-24">平台</TableHead>
              <TableHead className="w-24">已分析</TableHead>
              <TableHead className="w-40">最近分析</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.channelId}>
                <TableCell className="font-medium">
                  <Link
                    href={`/clerk/${encodeURIComponent(r.channelSlug)}`}
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
                  {r.videoCount > 0 ? r.videoCount : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {r.lastAnalyzedAt ? formatDate(r.lastAnalyzedAt) : "未分析"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      )}
    </div>
  );
}
