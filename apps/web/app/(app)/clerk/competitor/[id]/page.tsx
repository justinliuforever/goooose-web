import { and, desc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";

import { clerkSops, clerkVideos, competitorAccounts } from "@singularity/db";

import { ActiveRunsBanner } from "@/components/active-runs-banner";
import { BackLink } from "@/components/back-link";
import { Badge } from "@/components/ui/badge";
import { CompetitorAvatar } from "@/components/competitor-avatar";
import { CopyButton } from "@/components/copy-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { followerNoun, formatFollowerCount } from "@/lib/format-count";
import { getActiveAgentRun } from "@/lib/agent-run";
import { formatDateTime } from "@/lib/datetime";
import { db } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/users";

import { ClerkRunButton } from "../../[slug]/_components/clerk-run-button";
import { DeleteSopButton } from "../../[slug]/_components/delete-sop-button";

type Props = { params: Promise<{ id: string }> };

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

export default async function ClerkCompetitorPage({ params }: Props) {
  const { id } = await params;

  const user = await ensureCurrentUser();
  if (!user) return null;

  const [competitor] = await db
    .select()
    .from(competitorAccounts)
    .where(
      and(
        eq(competitorAccounts.id, id),
        eq(competitorAccounts.userId, user.id),
        isNull(competitorAccounts.deletedAt),
      ),
    )
    .limit(1);
  if (!competitor) notFound();

  const isXhs = competitor.platform === "xhs";
  const [videos, sops, activeRun] = await Promise.all([
    db
      .select()
      .from(clerkVideos)
      .where(eq(clerkVideos.competitorAccountId, competitor.id))
      .orderBy(desc(clerkVideos.views)),
    db
      .select()
      .from(clerkSops)
      .where(eq(clerkSops.competitorAccountId, competitor.id))
      .orderBy(desc(clerkSops.generatedAt)),
    getActiveAgentRun({ competitorAccountId: competitor.id }, user.id, "clerk"),
  ]);

  const sopOrder: Record<string, number> = { human: 0, hottest: 1, single_video: 2, ai_reference: 3 };
  const sortedSops = [...sops].sort(
    (a, b) => (sopOrder[a.sopType] ?? 99) - (sopOrder[b.sopType] ?? 99),
  );
  const primarySops = sortedSops.filter((s) => s.sopType !== "ai_reference");
  const aiReferenceSops = sortedSops.filter((s) => s.sopType === "ai_reference");
  const name = competitor.name ?? competitor.url;

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col gap-6 p-6 sm:p-8">
      <BackLink href="/clerk" label="Clerk · 分析师" />

      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <CompetitorAvatar name={competitor.name} avatarUrl={competitor.avatarUrl} className="size-9" />
          <div className="flex min-w-0 flex-col">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{name}</h1>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                🎯 对标账号
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground">
              {isXhs ? "小红书" : "YouTube"}
              {competitor.subscriberCount != null
                ? ` · ${formatFollowerCount(competitor.subscriberCount)} ${followerNoun(competitor.platform)}`
                : ""}
              {" · "}
              <a href={competitor.url} target="_blank" rel="noopener noreferrer" className="font-mono hover:text-foreground">
                {competitor.url.slice(0, 60)}
              </a>
            </span>
          </div>
          <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
            {videos.length} {isXhs ? "篇笔记" : "个视频"}
          </Badge>
          {primarySops.length > 0 ? (
            <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
              {primarySops.length} 份 SOP
            </Badge>
          ) : null}
        </div>
      </header>

      <ClerkRunButton
        target={{ kind: "competitor", competitorAccountId: competitor.id }}
        channelName={name}
        platform={competitor.platform}
        initialActive={activeRun}
      />

      <ActiveRunsBanner competitorAccountId={competitor.id} />

      {videos.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-card/40 p-10 text-sm text-muted-foreground">
          <span>还没拆解过这个对标</span>
          <span className="text-xs">
            点上方「开始分析」— Clerk 会拆解 TA 的{isXhs ? "笔记" : "视频"}，沉淀出可复用的 SOP
          </span>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>标题</TableHead>
                <TableHead className="w-24">{isXhs ? "文本来源" : "字幕来源"}</TableHead>
                <TableHead className="hidden w-28 md:table-cell">开场钩子</TableHead>
                <TableHead className="w-20">{isXhs ? "互动分" : "播放量"}</TableHead>
                <TableHead className="w-20">时长</TableHead>
                <TableHead className="hidden w-28 md:table-cell">分析时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {videos.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="max-w-md truncate font-medium">
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-foreground hover:underline"
                    >
                      {v.title}
                    </a>
                  </TableCell>
                  <TableCell>
                    {v.transcript ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {v.transcriptSource === "caption" ? "字幕" : v.transcriptSource === "xhs_text" ? "正文" : "AI 转写"}
                      </Badge>
                    ) : (
                      <span className="font-mono text-[10px] text-muted-foreground">无字幕</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                    {v.openingHookType ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs font-semibold text-foreground">
                    {formatViews(v.views)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {v.contentType === "xhs_image" ? "图文" : formatDuration(v.durationSec)}
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                    {formatDateTime(v.analyzedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {primarySops.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-muted-foreground">脚本撰写 SOP</h2>
          <div className="flex flex-col gap-4">
            {primarySops.map((sop) => (
              <SopCard key={sop.id} sop={sop} sourceName={name} defaultOpen={primarySops.length <= 3} />
            ))}
          </div>
          <div className="rounded-lg border-2 border-dashed border-poet/40 bg-poet/5 p-4 text-sm">
            <span className="font-medium">SOP 已进库。</span>
            <span className="text-muted-foreground">
              去任意项目主页的「写稿 SOP · 更换」里选用这份打法，Poet 写稿就会按它来。
            </span>
          </div>
        </section>
      ) : null}

      {aiReferenceSops.length > 0 ? (
        <details className="flex flex-col gap-3 rounded-lg border bg-card/50 p-4 text-sm">
          <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
            AI 参考稿（默认隐藏 · 给 AI 用，非给人读 · 写稿选用的就是这类）
          </summary>
          <div className="mt-3 flex flex-col gap-4">
            {aiReferenceSops.map((sop) => (
              <SopCard key={sop.id} sop={sop} sourceName={name} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function SopCard({
  sop,
  sourceName,
  defaultOpen = false,
}: {
  sop: typeof clerkSops.$inferSelect;
  sourceName: string;
  defaultOpen?: boolean;
}) {
  const label = sop.sopType.replace(/_/g, " ");
  return (
    <details open={defaultOpen} className="flex flex-col gap-3 rounded-lg border bg-card p-5">
      <summary className="flex cursor-pointer items-center justify-between gap-3 list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="font-mono text-[10px] uppercase">
            {label}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            🎯 来自对标 · {sourceName.slice(0, 16)}
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
          <CopyButton text={sop.contentMd} label="复制" />
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
    <article className="prose-clerk max-w-3xl border-t pt-4 text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </article>
  );
}
