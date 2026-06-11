import { count, desc, eq, or } from "drizzle-orm";
import Link from "next/link";

import { channels, clerkSops, competitorAccounts, projectSops } from "@singularity/db";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { formatDateTime } from "@/lib/datetime";
import { db } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/users";

type SopRow = {
  id: string;
  sopType: string;
  language: string;
  contentMd: string;
  generatedAt: Date | null;
  sourceKind: "own" | "competitor";
  sourceName: string;
  sourceHref: string;
};

const sopOrder: Record<string, number> = {
  human: 0,
  hottest: 1,
  single_video: 2,
  ai_reference: 3,
};

export default async function SopsLibraryPage() {
  const user = await ensureCurrentUser();
  if (!user) return null;

  const rows = await db
    .select({
      id: clerkSops.id,
      sopType: clerkSops.sopType,
      language: clerkSops.language,
      contentMd: clerkSops.contentMd,
      generatedAt: clerkSops.generatedAt,
      channelName: channels.name,
      channelSlug: channels.slug,
      competitorId: competitorAccounts.id,
      competitorName: competitorAccounts.name,
      competitorUrl: competitorAccounts.url,
    })
    .from(clerkSops)
    .leftJoin(channels, eq(clerkSops.channelId, channels.id))
    .leftJoin(competitorAccounts, eq(clerkSops.competitorAccountId, competitorAccounts.id))
    .where(or(eq(channels.userId, user.id), eq(competitorAccounts.userId, user.id)))
    .orderBy(desc(clerkSops.generatedAt));

  const usage = await db
    .select({ sopId: projectSops.sopId, n: count() })
    .from(projectSops)
    .where(eq(projectSops.role, "primary"))
    .groupBy(projectSops.sopId);
  const usedByMap = new Map(usage.map((u) => [u.sopId, u.n]));

  const sops: SopRow[] = rows.map((r) => ({
    id: r.id,
    sopType: r.sopType,
    language: r.language,
    contentMd: r.contentMd,
    generatedAt: r.generatedAt,
    sourceKind: r.channelSlug ? "own" : "competitor",
    sourceName: r.channelName ?? r.competitorName ?? r.competitorUrl ?? "未知来源",
    sourceHref: r.channelSlug
      ? `/clerk/${encodeURIComponent(r.channelSlug)}`
      : `/clerk/competitor/${r.competitorId}`,
  }));

  // Group by source within each kind, preserving generatedAt-desc first appearance.
  const buildGroups = (kind: "own" | "competitor") => {
    const groups = new Map<string, { name: string; href: string; sops: SopRow[] }>();
    for (const s of sops) {
      if (s.sourceKind !== kind) continue;
      const existing = groups.get(s.sourceHref);
      if (existing) existing.sops.push(s);
      else groups.set(s.sourceHref, { name: s.sourceName, href: s.sourceHref, sops: [s] });
    }
    return [...groups.values()];
  };
  const competitorGroups = buildGroups("competitor");
  const ownGroups = buildGroups("own");

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col gap-6 p-6 sm:p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">SOP 库</h1>
        <p className="text-sm text-muted-foreground">
          SOP 是 Clerk 从频道拆解出的可复用写稿方法论 — 任何项目都可以在项目主页选用任意一份用于写稿。
        </p>
      </header>

      {sops.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card/40 p-10 text-sm text-muted-foreground">
          <span>还没有任何 SOP</span>
          <Button render={<Link href="/clerk" />}>去 Clerk 拆解</Button>
        </div>
      ) : (
        <>
          {competitorGroups.length > 0 ? (
            <SourceSection
              title="来自对标账号 — 学来的打法"
              groups={competitorGroups}
              chip="🎯 对标"
              usedByMap={usedByMap}
            />
          ) : null}
          {ownGroups.length > 0 ? (
            <SourceSection
              title="来自我的账号 — 自己的规律"
              groups={ownGroups}
              chip="📺 我的"
              usedByMap={usedByMap}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function SourceSection({
  title,
  groups,
  chip,
  usedByMap,
}: {
  title: string;
  groups: Array<{ name: string; href: string; sops: SopRow[] }>;
  chip: string;
  usedByMap: Map<string, number>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      {groups.map((group) => {
        const sorted = [...group.sops].sort(
          (x, y) => (sopOrder[x.sopType] ?? 99) - (sopOrder[y.sopType] ?? 99),
        );
        const primarySops = sorted.filter((s) => s.sopType !== "ai_reference");
        const aiReferenceSops = sorted.filter((s) => s.sopType === "ai_reference");
        return (
          <section key={group.href} className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="size-2 shrink-0 rounded-full bg-clerk" />
                <h3 className="truncate text-base font-medium">{group.name}</h3>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {chip}
                </Badge>
              </div>
              <Button variant="ghost" size="sm" render={<Link href={group.href} />}>
                查看分析
              </Button>
            </div>

            <div className="flex flex-col gap-4">
              {primarySops.map((sop) => (
                <SopCard
                  key={sop.id}
                  sop={sop}
                  usedBy={usedByMap.get(sop.id) ?? 0}
                  defaultOpen={primarySops.length <= 3}
                />
              ))}
            </div>

            {aiReferenceSops.length > 0 ? (
              <details className="flex flex-col gap-3 rounded-lg border bg-card/50 p-4 text-sm">
                <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                  AI 参考稿（默认隐藏 · 给 AI 用，非给人读 · 写稿选用的就是这类）
                </summary>
                <div className="mt-3 flex flex-col gap-4">
                  {aiReferenceSops.map((sop) => (
                    <SopCard key={sop.id} sop={sop} usedBy={usedByMap.get(sop.id) ?? 0} />
                  ))}
                </div>
              </details>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function SopCard({
  sop,
  usedBy = 0,
  defaultOpen = false,
}: {
  sop: SopRow;
  usedBy?: number;
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
          {usedBy > 0 ? (
            <Badge variant="outline" className="text-[10px]">
              已用于 {usedBy} 个项目
            </Badge>
          ) : null}
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
