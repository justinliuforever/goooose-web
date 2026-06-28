import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { channels, poetBible } from "@singularity/db";

import { Badge } from "@/components/ui/badge";
import { BackLink } from "@/components/back-link";
import { getActiveAgentRun } from "@/lib/agent-run";
import { formatDateTime } from "@/lib/datetime";
import { db } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/users";

import { BibleGenerateSheet } from "../projects/[project]/poet/_components/bible-generate-sheet";
import { BibleHistory } from "../projects/[project]/poet/_components/bible-history";
import { BibleRunProgress } from "./_components/bible-run-progress";

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
  const [bibles, poetRun] = await Promise.all([
    db
      .select()
      .from(poetBible)
      .where(eq(poetBible.channelId, channel.id))
      .orderBy(desc(poetBible.updatedAt)),
    getActiveAgentRun(channel.id, user.id, "poet"),
  ]);

  // Only watch a bible run here — an active script run belongs to the project poet page.
  const activeBibleRun =
    poetRun && poetRun.command === "poet-generate-bible" ? poetRun : null;

  const a = encodeURIComponent(channel.slug);
  const activeBible = bibles.find((b) => b.isActive) ?? null;

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col gap-6 p-6 sm:p-8">
      <BackLink href={`/accounts/${a}`} label={channel.name} />

      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">频道圣经</h1>
          <p className="text-xs text-muted-foreground">
            账号的人设 / 受众 / 更新方向 · Muse 和 Poet 都会读取生效中的版本
          </p>
        </div>
        <BibleGenerateSheet
          channelId={channel.id}
          channelName={channel.name}
          channelDescription={channel.description}
          buttonLabel={activeBible ? "+ 新建版本" : "生成圣经"}
          buttonVariant="outline"
        />
      </header>

      <BibleRunProgress
        initialActive={
          activeBibleRun
            ? {
                runId: activeBibleRun.runId,
                triggerRunId: activeBibleRun.triggerRunId,
                publicAccessToken: activeBibleRun.publicAccessToken,
                startedAt: activeBibleRun.startedAt,
              }
            : null
        }
      />

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
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card/40 p-8 text-sm text-muted-foreground">
          <span>这个账号还没有频道圣经</span>
          <span className="text-xs">账号的策略简报，Muse 和 Poet 都会以它为准</span>
          <BibleGenerateSheet
            channelId={channel.id}
            channelName={channel.name}
            channelDescription={channel.description}
            buttonLabel="生成圣经"
          />
        </div>
      )}

      <BibleHistory bibles={bibles} />
    </div>
  );
}
