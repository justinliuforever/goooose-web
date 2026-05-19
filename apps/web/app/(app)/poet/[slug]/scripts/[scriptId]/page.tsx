import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import {
  channels,
  clerkSops,
  museIdeas,
  museMonitorVideos,
  poetBible,
  poetCustomTopics,
  poetScripts,
} from "@singularity/db";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/datetime";
import { db } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/users";

import { ScriptDetailActions } from "./_components/script-detail-actions";

type Props = { params: Promise<{ slug: string; scriptId: string }> };

export default async function ScriptDetailPage({ params }: Props) {
  const { slug: rawSlug, scriptId: rawScriptId } = await params;
  const slug = decodeURIComponent(rawSlug);
  const scriptId = decodeURIComponent(rawScriptId);

  const user = await ensureCurrentUser();
  if (!user) return null;

  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.slug, slug))
    .limit(1);
  if (!channel || channel.userId !== user.id) notFound();

  const [script] = await db
    .select()
    .from(poetScripts)
    .where(and(eq(poetScripts.id, scriptId), eq(poetScripts.channelId, channel.id)))
    .limit(1);
  if (!script) notFound();

  const [bibleRow, sopRow, ideaRow, customTopicRow] = await Promise.all([
    script.bibleId
      ? db.select().from(poetBible).where(eq(poetBible.id, script.bibleId)).limit(1)
      : Promise.resolve([]),
    script.sopId
      ? db.select().from(clerkSops).where(eq(clerkSops.id, script.sopId)).limit(1)
      : Promise.resolve([]),
    script.ideaId
      ? db
          .select({
            id: museIdeas.id,
            storyAngle: museIdeas.storyAngle,
            sourceTitle: museMonitorVideos.title,
            sourceUrl: museMonitorVideos.url,
          })
          .from(museIdeas)
          .leftJoin(museMonitorVideos, eq(museMonitorVideos.id, museIdeas.sourceVideoId))
          .where(eq(museIdeas.id, script.ideaId))
          .limit(1)
      : Promise.resolve([]),
    script.customTopicId
      ? db
          .select()
          .from(poetCustomTopics)
          .where(eq(poetCustomTopics.id, script.customTopicId))
          .limit(1)
      : Promise.resolve([]),
  ]);
  const bible = bibleRow[0] ?? null;
  const sop = sopRow[0] ?? null;
  const idea = ideaRow[0] ?? null;
  const customTopic = customTopicRow[0] ?? null;

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <Button
        variant="ghost"
        size="sm"
        render={<Link href={`/poet/${encodeURIComponent(slug)}`} />}
        className="w-fit text-muted-foreground"
      >
        <ChevronLeft data-icon="inline-start" />
        {channel.name}
      </Button>

      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">脚本详情</h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <Badge variant="secondary" className="font-mono text-[10px] uppercase">
              {script.language}
            </Badge>
            <span className="font-mono text-xs">
              {script.wordCount ?? "—"} {script.language === "zh" ? "字" : "词"}
            </span>
            {script.durationMinutes ? (
              <span className="font-mono text-xs">约 {script.durationMinutes} 分钟</span>
            ) : null}
            <span className="font-mono text-xs">
              {formatDateTime(script.generatedAt)} 生成
            </span>
          </div>
        </div>
        <ScriptDetailActions
          scriptId={script.id}
          scriptText={script.scriptText}
          channelSlug={slug}
        />
      </header>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            选题来源
          </h3>
          {idea ? (
            <div className="mt-2 flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Muse 选题</span>
              <p className="text-sm whitespace-pre-wrap">{idea.storyAngle ?? "—"}</p>
              {idea.sourceTitle ? (
                <span className="text-xs text-muted-foreground">
                  对标：{idea.sourceTitle}
                </span>
              ) : null}
            </div>
          ) : customTopic ? (
            <div className="mt-2 flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">自定义选题</span>
              <p className="text-sm whitespace-pre-wrap">{customTopic.topic}</p>
            </div>
          ) : (
            <span className="mt-2 block text-xs text-muted-foreground">—</span>
          )}
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            引用的圣经
          </h3>
          <p className="mt-2 text-sm">{bible?.name ?? "—"}</p>
          {bible ? (
            <span className="text-xs text-muted-foreground">
              {bible.content.length.toLocaleString("en-US")} 字 ·{" "}
              {formatDateTime(bible.updatedAt)}
            </span>
          ) : null}
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            引用的 SOP
          </h3>
          <p className="mt-2 text-sm">
            {sop ? sop.sopType.replace(/_/g, " ") : "—"}
          </p>
          {sop ? (
            <span className="text-xs text-muted-foreground">
              {(sop.contentMd?.length ?? 0).toLocaleString("en-US")} 字 ·{" "}
              {formatDateTime(sop.generatedAt)}
            </span>
          ) : null}
        </div>
      </section>

      <section className="rounded-lg border bg-card p-6">
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
          {script.scriptText}
        </pre>
      </section>
    </div>
  );
}
