import { and, count, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  channels,
  clerkSops,
  competitorAccounts,
  museIdeas,
  museMonitorVideos,
  poetBible,
  poetCustomTopics,
  poetScripts,
  projectCompetitors,
  projects,
  projectSops,
} from "@singularity/db";
import { formatDurationLabel } from "@singularity/shared/schemas/poet";

import { Badge } from "@/components/ui/badge";
import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/users";

import { EditChannelSheet } from "../../../_components/edit-channel-sheet";
import { ProjectCompetitorsCard } from "../../../_components/project-competitors-card";

import { ProjectSopRow, type CurrentSop } from "./_components/project-sop-row";
import { SetupChecklist } from "./_components/setup-checklist";

type Props = { params: Promise<{ slug: string; project: string }> };

export default async function ProjectHubPage({ params }: Props) {
  const { slug: rawSlug, project: rawProject } = await params;
  const slug = decodeURIComponent(rawSlug);
  const projectSlug = decodeURIComponent(rawProject);

  const user = await ensureCurrentUser();
  if (!user) return null;

  // Account identity (D3 spine: channel.id == own_account.id == default project.id).
  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.slug, slug))
    .limit(1);
  if (!channel || channel.userId !== user.id) notFound();

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.ownAccountId, channel.id), eq(projects.slug, projectSlug)))
    .limit(1);
  if (!project) notFound();

  // Content rows are channel_id-authoritative until the INC6 contract; during expand
  // project.id == channel.id, so channel.id is the correct scope for these counts.
  const [
    [museVideoCount],
    [museIdeaCount],
    [poetBibleCount],
    [poetTopicCount],
    [poetScriptCount],
    pinnedBible,
    [clerkSopCount],
    [boundCount],
  ] = await Promise.all([
    db.select({ c: count() }).from(museMonitorVideos).where(eq(museMonitorVideos.channelId, channel.id)),
    db.select({ c: count() }).from(museIdeas).where(eq(museIdeas.channelId, channel.id)),
    db.select({ c: count() }).from(poetBible).where(eq(poetBible.channelId, channel.id)),
    db.select({ c: count() }).from(poetCustomTopics).where(eq(poetCustomTopics.channelId, channel.id)),
    db.select({ c: count() }).from(poetScripts).where(eq(poetScripts.channelId, channel.id)),
    project.activeBibleId
      ? db.select().from(poetBible).where(eq(poetBible.id, project.activeBibleId)).limit(1)
      : Promise.resolve([]),
    db.select({ c: count() }).from(clerkSops).where(eq(clerkSops.channelId, channel.id)),
    db
      .select({ c: count() })
      .from(projectCompetitors)
      .innerJoin(competitorAccounts, eq(competitorAccounts.id, projectCompetitors.competitorAccountId))
      .where(and(eq(projectCompetitors.projectId, project.id), isNull(competitorAccounts.deletedAt))),
  ]);

  const a = encodeURIComponent(channel.slug);
  const p = encodeURIComponent(project.slug);
  const itemNoun = project.platform === "xhs" ? "篇监控笔记" : "个监控视频";
  const activeBible = pinnedBible[0] ?? null;

  // Current writing SOP: explicit primary binding wins, else mirror the resolver's
  // fallback (this account's latest ai_reference) so the row shows what writing will use.
  const [pinnedSop] = await db
    .select({ generatedAt: clerkSops.generatedAt, sourceName: channels.name })
    .from(projectSops)
    .innerJoin(clerkSops, eq(clerkSops.id, projectSops.sopId))
    .innerJoin(channels, eq(channels.id, clerkSops.channelId))
    .where(and(eq(projectSops.projectId, project.id), eq(projectSops.role, "primary")))
    .limit(1);
  let currentSop: CurrentSop = pinnedSop
    ? { sourceName: pinnedSop.sourceName, generatedAt: pinnedSop.generatedAt, pinned: true }
    : null;
  if (!currentSop) {
    const [fallbackSop] = await db
      .select({ generatedAt: clerkSops.generatedAt })
      .from(clerkSops)
      .where(and(eq(clerkSops.channelId, channel.id), eq(clerkSops.sopType, "ai_reference")))
      .orderBy(desc(clerkSops.generatedAt))
      .limit(1);
    if (fallbackSop) {
      currentSop = { sourceName: channel.name, generatedAt: fallbackSop.generatedAt, pinned: false };
    }
  }

  const tools = [
    {
      label: "Clerk · 分析师",
      href: `/clerk/${a}`,
      dot: "bg-clerk",
      lines: [`${clerkSopCount?.c ?? 0} 份 SOP`],
    },
    {
      label: "Muse · 选题官",
      href: `/accounts/${a}/projects/${p}/muse`,
      dot: "bg-muse",
      lines: [`${museVideoCount?.c ?? 0} ${itemNoun}`, `${museIdeaCount?.c ?? 0} 个选题`],
    },
    {
      label: "Poet · 写手",
      href: `/accounts/${a}/projects/${p}/poet`,
      dot: "bg-poet",
      lines: [`${poetTopicCount?.c ?? 0} 个自定义选题`, `${poetScriptCount?.c ?? 0} 篇脚本`],
    },
  ];

  const setupSteps = [
    { label: "绑定对标账号", href: "#competitors", done: (boundCount?.c ?? 0) > 0 },
    { label: "用 Clerk 拆解频道生成 SOP", href: `/clerk/${a}`, done: (clerkSopCount?.c ?? 0) > 0 },
    { label: "生成并选用频道圣经", href: `/accounts/${a}/bible`, done: !!activeBible },
    { label: "Muse 出选题", href: `/accounts/${a}/projects/${p}/muse`, done: (museIdeaCount?.c ?? 0) > 0 },
    { label: "Poet 写稿", href: `/accounts/${a}/projects/${p}/poet`, done: (poetScriptCount?.c ?? 0) > 0 },
  ];

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col gap-6 p-6 sm:p-8">
      <BackLink href="/accounts" label="账号" />

      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{channel.name}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                {project.platform}
              </Badge>
              <Badge variant="outline" className="font-mono text-[10px]">
                目标时长 {formatDurationLabel(project.targetDurationSeconds)}
              </Badge>
              <a
                href={channel.platformUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate font-mono text-xs hover:text-foreground"
              >
                {channel.platformUrl}
              </a>
            </div>
          </div>
          <EditChannelSheet channel={channel} />
        </div>
        {channel.description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{channel.description}</p>
        ) : null}
      </header>

      <SetupChecklist steps={setupSteps} />

      <ProjectSopRow projectId={project.id} current={currentSop} />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {tools.map((t) => (
          <Link key={t.label} href={t.href}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <span className={`size-[9px] rounded-full ${t.dot}`} />
                  {t.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-1">
                  {t.lines.map((line) => (
                    <span key={line} className="font-mono text-sm">
                      {line}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between gap-3 text-sm font-medium text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="size-[9px] rounded-full bg-poet" />
              频道圣经
            </span>
            <Button variant="ghost" size="sm" render={<Link href={`/accounts/${a}/bible`} />}>
              管理
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeBible ? (
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="success" className="text-[10px]">已选用</Badge>
              <span className="truncate font-medium">{activeBible.name}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              还没有选用的圣经（{poetBibleCount?.c ?? 0} 本可选）。
            </p>
          )}
        </CardContent>
      </Card>

      <div id="competitors" className="scroll-mt-20">
        <ProjectCompetitorsCard
          projectId={project.id}
          accountSlug={channel.slug}
          projectSlug={project.slug}
        />
      </div>
    </div>
  );
}
