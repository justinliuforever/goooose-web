import { count, desc, eq, max, sql } from "drizzle-orm";
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
    .having(sql`count(${clerkVideos.id}) > 0`)
    .orderBy(desc(max(clerkVideos.analyzedAt)));

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <header className="flex items-center gap-3">
        <span className="size-2 rounded-full bg-clerk" />
        <h1 className="text-2xl font-semibold tracking-tight">Clerk · 分析师</h1>
        <span className="text-sm text-muted-foreground">
          分析视频结构、钩子、节奏，生成可复用的脚本撰写 SOP
        </span>
      </header>

      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-16 text-sm text-muted-foreground">
          还没有分析过的视频 — 去频道页点 &quot;开始分析&quot; 启动 Clerk
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>频道</TableHead>
              <TableHead className="w-24">平台</TableHead>
              <TableHead className="w-24">已分析视频</TableHead>
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
                <TableCell className="font-mono text-sm">{r.videoCount}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {r.lastAnalyzedAt
                    ? r.lastAnalyzedAt.toLocaleDateString("zh-CN")
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
