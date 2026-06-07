import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";

import { channels, poetBible, poetCustomTopics, clerkSops } from "@singularity/db";
import type { CustomTopicReference } from "@singularity/db";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PoetFactList } from "@/components/poet-fact-list";
import { formatDateTime } from "@/lib/datetime";
import { db } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/users";

type Props = { params: Promise<{ slug: string; topicId: string }> };

function Section({ title, body }: { title: string; body: string | null }) {
  if (!body) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <p className="text-sm whitespace-pre-wrap">{body}</p>
    </section>
  );
}

function ReferenceChip({ reference }: { reference: CustomTopicReference }) {
  const label =
    reference.title ?? reference.url ?? reference.text?.slice(0, 60) ?? reference.kind;
  if (reference.url) {
    return (
      <a
        href={reference.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1 text-xs hover:bg-muted"
      >
        <Badge variant="secondary" className="text-[9px]">
          {reference.kind}
        </Badge>
        <span className="max-w-[24ch] truncate">{label}</span>
        <ExternalLink className="size-3" />
      </a>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1 text-xs">
      <Badge variant="secondary" className="text-[9px]">
        {reference.kind}
      </Badge>
      <span className="max-w-[24ch] truncate">{label}</span>
    </span>
  );
}

export default async function PoetTopicDetailPage({ params }: Props) {
  const { slug: rawSlug, topicId } = await params;
  const slug = decodeURIComponent(rawSlug);

  const user = await ensureCurrentUser();
  if (!user) return null;

  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.slug, slug))
    .limit(1);

  if (!channel || channel.userId !== user.id) notFound();

  const [topic] = await db
    .select()
    .from(poetCustomTopics)
    .where(
      and(eq(poetCustomTopics.id, topicId), eq(poetCustomTopics.channelId, channel.id)),
    )
    .limit(1);

  if (!topic) notFound();

  const [bible, sop] = await Promise.all([
    topic.bibleId
      ? db.select().from(poetBible).where(eq(poetBible.id, topic.bibleId)).limit(1).then((r) => r[0])
      : Promise.resolve(undefined),
    topic.sopId
      ? db.select().from(clerkSops).where(eq(clerkSops.id, topic.sopId)).limit(1).then((r) => r[0])
      : Promise.resolve(undefined),
  ]);

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col gap-8 p-6 sm:p-8">
      <Button
        variant="ghost"
        size="sm"
        render={<Link href={`/poet/${encodeURIComponent(slug)}`} />}
        className="w-fit text-muted-foreground"
      >
        <ChevronLeft data-icon="inline-start" />
        {channel.name}
      </Button>

      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight whitespace-pre-wrap">
          {topic.topic}
        </h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <Badge variant="secondary" className="font-mono text-[10px]">
            {topic.status === "draft" ? "草稿" : topic.status === "analyzed" ? "已分析" : "已写稿"}
          </Badge>
          <span className="font-mono text-xs uppercase">{topic.language}</span>
          <span className="font-mono text-xs">更新于 {formatDateTime(topic.updatedAt)}</span>
        </div>
      </header>

      {topic.references.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            参考素材
          </h3>
          <div className="flex flex-wrap gap-2">
            {topic.references.map((reference, i) => (
              <ReferenceChip key={i} reference={reference} />
            ))}
          </div>
        </section>
      ) : null}

      <Section title="故事角度" body={topic.storyAngle} />
      <Section title="事实与数据" body={topic.factsAndData} />
      {topic.factChecks.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            原文事实
          </h3>
          <PoetFactList facts={topic.factChecks} references={topic.references} />
        </section>
      ) : (
        <Section title="原文事实" body={topic.verbatimFacts} />
      )}
      <Section title="为什么对标" body={topic.whySimilar} />
      <Section title="爆款触发因素" body={topic.viralTrigger} />

      {bible || sop ? (
        <section className="flex flex-col gap-2 border-t pt-6">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            关联
          </h3>
          <div className="flex flex-col gap-1 text-sm">
            {bible ? (
              <span>
                圣经：{" "}
                <Link
                  href={`/poet/${encodeURIComponent(slug)}`}
                  className="hover:text-foreground hover:underline"
                >
                  {bible.name}
                </Link>
              </span>
            ) : null}
            {sop ? (
              <span className="font-mono text-xs text-muted-foreground">
                SOP：{sop.sopType}（{sop.language}）
              </span>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
