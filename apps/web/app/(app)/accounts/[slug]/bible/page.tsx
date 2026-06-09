import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { channels, poetBible } from "@singularity/db";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/datetime";
import { db } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/users";

import { BibleGenerateSheet } from "../projects/[project]/poet/_components/bible-generate-sheet";
import { BibleHistory } from "../projects/[project]/poet/_components/bible-history";

type Props = { params: Promise<{ slug: string }> };

export default async function AccountBiblePage({ params }: Props) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);

  const user = await ensureCurrentUser();
  if (!user) return null;

  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.slug, slug))
    .limit(1);
  if (!channel || channel.userId !== user.id) notFound();

  // Bible rows stay channel_id-authoritative during expand (project.id == channel.id).
  const bibles = await db
    .select()
    .from(poetBible)
    .where(eq(poetBible.channelId, channel.id))
    .orderBy(desc(poetBible.updatedAt));

  const a = encodeURIComponent(channel.slug);
  const activeBible = bibles.find((b) => b.isActive) ?? null;

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col gap-6 p-6 sm:p-8">
      <Button
        variant="ghost"
        size="sm"
        render={<Link href={`/accounts/${a}`} />}
        className="w-fit text-muted-foreground"
      >
        <ChevronLeft data-icon="inline-start" />
        {channel.name}
      </Button>

      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Channel Bible</h1>
          <BibleGenerateSheet
            channelId={channel.id}
            channelName={channel.name}
            channelDescription={channel.description}
            buttonLabel={activeBible ? "+ 新建 Bible" : "生成圣经"}
            buttonVariant={activeBible ? "outline" : "default"}
          />
        </div>
      </header>

      {activeBible ? (
        <article className="flex flex-col gap-3 rounded-lg border bg-card p-5">
          <header className="flex items-center justify-between">
            <h3 className="text-base font-medium">{activeBible.name}</h3>
            <Badge variant="secondary" className="text-[10px]">
              生效中
            </Badge>
          </header>
          <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-relaxed">
            {activeBible.content}
          </pre>
          <footer className="font-mono text-xs text-muted-foreground">
            {formatDateTime(activeBible.updatedAt)} 更新
          </footer>
        </article>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-card/40 p-8 text-sm text-muted-foreground">
          <span>该频道还没有可用的圣经</span>
          <span className="text-xs">先生成一份，再来选题写稿</span>
        </div>
      )}

      <BibleHistory bibles={bibles} />
    </div>
  );
}
