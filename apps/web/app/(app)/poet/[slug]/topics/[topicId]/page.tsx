import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";

import { channels, poetBible, poetCustomTopics, clerkSops } from "@singularity/db";
import type { CustomTopicReference } from "@singularity/db";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

function ReferenceChip({ ref }: { ref: CustomTopicReference }) {
  const label = ref.title ?? ref.url ?? ref.text?.slice(0, 60) ?? ref.kind;
  if (ref.url) {
    return (
      <a
        href={ref.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1 text-xs hover:bg-muted"
      >
        <Badge variant="secondary" className="text-[9px]">
          {ref.kind}
        </Badge>
        <span className="max-w-[24ch] truncate">{label}</span>
        <ExternalLink className="size-3" />
      </a>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1 text-xs">
      <Badge variant="secondary" className="text-[9px]">
        {ref.kind}
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
    <div className="flex flex-1 flex-col gap-8 p-8">
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
            {topic.status}
          </Badge>
          <span className="font-mono text-xs uppercase">{topic.language}</span>
          {topic.durationMinutes ? (
            <span className="font-mono text-xs">{topic.durationMinutes}m target</span>
          ) : null}
          {topic.targetWordCount ? (
            <span className="font-mono text-xs">{topic.targetWordCount} words</span>
          ) : null}
          <span className="font-mono text-xs">
            updated {formatDateTime(topic.updatedAt)}
          </span>
        </div>
      </header>

      {topic.references.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            References
          </h3>
          <div className="flex flex-wrap gap-2">
            {topic.references.map((ref, i) => (
              <ReferenceChip key={i} ref={ref} />
            ))}
          </div>
        </section>
      ) : null}

      <Section title="Story angle" body={topic.storyAngle} />
      <Section title="Facts & data" body={topic.factsAndData} />
      <Section title="Verbatim facts" body={topic.verbatimFacts} />
      <Section title="Why similar" body={topic.whySimilar} />
      <Section title="Viral trigger" body={topic.viralTrigger} />

      {bible || sop ? (
        <section className="flex flex-col gap-2 border-t pt-6">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Linked
          </h3>
          <div className="flex flex-col gap-1 text-sm">
            {bible ? (
              <span>
                Bible:{" "}
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
                SOP: {sop.sopType} ({sop.language})
              </span>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
