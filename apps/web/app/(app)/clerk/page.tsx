import { count, desc, eq, max, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { channels, clerkVideos, competitorAccounts } from "@singularity/db";

import { Badge } from "@/components/ui/badge";
import { CompetitorAvatar } from "@/components/competitor-avatar";
import { followerNoun, formatFollowerCount } from "@/lib/format-count";
import { formatDate } from "@/lib/datetime";
import { db } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/users";

export default async function ClerkLandingPage() {
  const user = await ensureCurrentUser();
  if (!user) return null;

  const [ownRows, competitorRows] = await Promise.all([
    db
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
      .orderBy(desc(max(clerkVideos.analyzedAt)), desc(channels.createdAt)),
    db
      .select({
        id: competitorAccounts.id,
        name: competitorAccounts.name,
        url: competitorAccounts.url,
        platform: competitorAccounts.platform,
        avatarUrl: competitorAccounts.avatarUrl,
        subscriberCount: competitorAccounts.subscriberCount,
        videoCount: sql<number>`(SELECT count(*)::int FROM clerk_videos cv WHERE cv.competitor_account_id = ${competitorAccounts.id})`,
        sopCount: sql<number>`(SELECT count(*)::int FROM clerk_sops cs WHERE cs.competitor_account_id = ${competitorAccounts.id} AND cs.sop_type != 'ai_reference')`,
      })
      .from(competitorAccounts)
      .where(eq(competitorAccounts.userId, user.id))
      .orderBy(desc(competitorAccounts.createdAt)),
  ]);
  const competitors = competitorRows.filter((c) => c != null);

  // Single-target phase: a chooser with exactly one choice is a wasted hop.
  if (ownRows.length === 1 && competitors.length === 0) {
    redirect(`/clerk/${encodeURIComponent(ownRows[0]!.channelSlug)}`);
  }

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col gap-6 p-6 sm:p-8">
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="size-2 shrink-0 rounded-full bg-clerk" />
          <h1 className="text-2xl font-semibold tracking-tight">Clerk · 分析师</h1>
          <span className="text-sm text-muted-foreground">
            拆解视频结构、钩子、节奏，沉淀可复用的脚本撰写 SOP
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          选一个要拆解的目标 — 拆对标学打法，复盘自己的号找规律；产出的 SOP 进库，任何项目都能选用。
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">拆解对标账号 — 学别人怎么做爆</h2>
        {competitors.length === 0 ? (
          <div className="flex items-center justify-between rounded-lg border border-dashed bg-card/40 p-5 text-sm text-muted-foreground">
            <span>还没有对标账号 — 先去导入，再回来拆解</span>
            <Link href="/competitors" className="text-xs hover:text-foreground hover:underline">
              去对标账号 →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {competitors.map((c) => (
              <Link
                key={c.id}
                href={`/clerk/competitor/${c.id}`}
                className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50"
              >
                <CompetitorAvatar name={c.name} avatarUrl={c.avatarUrl} className="size-9" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{c.name ?? c.url}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {c.platform === "xhs" ? "小红书" : "YouTube"}
                    {c.subscriberCount != null
                      ? ` · ${formatFollowerCount(c.subscriberCount)} ${followerNoun(c.platform)}`
                      : ""}
                  </span>
                </div>
                <span className="shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                  {c.videoCount > 0 ? `已拆 ${c.videoCount} 条` : "未拆解"}
                  {c.sopCount > 0 ? ` · ${c.sopCount} 份 SOP` : ""}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">复盘我的账号 — 找自己的规律</h2>
        {ownRows.length === 0 ? (
          <div className="flex items-center justify-between rounded-lg border border-dashed bg-card/40 p-5 text-sm text-muted-foreground">
            <span>还没有账号</span>
            <Link href="/accounts/new" className="text-xs hover:text-foreground hover:underline">
              先创建一个账号 →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ownRows.map((r) => (
              <Link
                key={r.channelId}
                href={`/clerk/${encodeURIComponent(r.channelSlug)}`}
                className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{r.channelName}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {r.platform === "xhs" ? "小红书" : "YouTube"}
                    {r.lastAnalyzedAt ? ` · 最近分析 ${formatDate(r.lastAnalyzedAt)}` : ""}
                  </span>
                </div>
                <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
                  {r.videoCount > 0 ? `${r.videoCount} 已析` : "未分析"}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
