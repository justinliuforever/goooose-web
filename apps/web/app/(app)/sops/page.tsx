import { desc, eq } from "drizzle-orm";
import Link from "next/link";

import { channels, clerkSops } from "@singularity/db";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/datetime";
import { db } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/users";

type SopRow = {
  id: string;
  sopType: string;
  language: string;
  contentMd: string;
  generatedAt: Date | null;
  channelName: string;
  channelSlug: string;
  platform: "youtube" | "xhs";
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
      platform: channels.platform,
    })
    .from(clerkSops)
    .innerJoin(channels, eq(clerkSops.channelId, channels.id))
    .where(eq(channels.userId, user.id))
    .orderBy(desc(clerkSops.generatedAt));

  // Group SOPs by account, preserving generatedAt-desc order of first appearance.
  const groups = new Map<string, { name: string; slug: string; platform: "youtube" | "xhs"; sops: SopRow[] }>();
  for (const row of rows) {
    const existing = groups.get(row.channelSlug);
    if (existing) {
      existing.sops.push(row);
    } else {
      groups.set(row.channelSlug, {
        name: row.channelName,
        slug: row.channelSlug,
        platform: row.platform,
        sops: [row],
      });
    }
  }

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col gap-6 p-6 sm:p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">SOP 库</h1>
      </header>

      {groups.size === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card/40 p-10 text-sm text-muted-foreground">
          <span>还没有任何 SOP</span>
          <Button render={<Link href="/clerk" />}>去 Clerk 分析视频</Button>
        </div>
      ) : (
        [...groups.values()].map((group) => {
          const a = encodeURIComponent(group.slug);
          const sorted = [...group.sops].sort(
            (x, y) => (sopOrder[x.sopType] ?? 99) - (sopOrder[y.sopType] ?? 99),
          );
          const primarySops = sorted.filter((s) => s.sopType !== "ai_reference");
          const aiReferenceSops = sorted.filter((s) => s.sopType === "ai_reference");

          return (
            <section key={group.slug} className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="size-2 shrink-0 rounded-full bg-clerk" />
                  <h2 className="truncate text-base font-medium">{group.name}</h2>
                  <Badge variant="secondary" className="shrink-0 font-mono text-[10px] uppercase">
                    {group.platform}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  render={<Link href={`/clerk/${a}`} />}
                >
                  Clerk · 分析师
                </Button>
              </div>

              <div className="flex flex-col gap-4">
                {primarySops.map((sop) => (
                  <SopCard key={sop.id} sop={sop} />
                ))}
              </div>

              {aiReferenceSops.length > 0 ? (
                <details className="flex flex-col gap-3 rounded-lg border bg-card/50 p-4 text-sm">
                  <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                    AI 参考稿（默认隐藏 · 给 AI 用，非给人读）
                  </summary>
                  <div className="mt-3 flex flex-col gap-4">
                    {aiReferenceSops.map((sop) => (
                      <SopCard key={sop.id} sop={sop} />
                    ))}
                  </div>
                </details>
              ) : null}
            </section>
          );
        })
      )}
    </div>
  );
}

function SopCard({ sop }: { sop: SopRow }) {
  const label = sop.sopType.replace(/_/g, " ");
  return (
    <details className="flex flex-col gap-3 rounded-lg border bg-card p-5">
      <summary className="flex cursor-pointer items-center justify-between gap-3 list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="font-mono text-[10px] uppercase">
            {label}
          </Badge>
          <span className="font-mono text-xs text-muted-foreground uppercase">{sop.language}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {(sop.contentMd?.length ?? 0).toLocaleString("en-US")} chars
          </span>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {formatDateTime(sop.generatedAt)}
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
