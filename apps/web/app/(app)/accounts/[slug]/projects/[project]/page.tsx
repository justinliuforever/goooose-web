import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";

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
import { formatDurationLabel } from "@singularity/domain/schemas/poet";

import { Badge } from "@/components/ui/badge";
import { BackLink } from "@/components/back-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/datetime";
import { db } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/users";

import { ProjectCompetitorsCard } from "../../../_components/project-competitors-card";
import { ProjectSopRow, type CurrentSop } from "./_components/project-sop-row";

type Props = { params: Promise<{ slug: string; project: string }> };

export default async function ProjectHubPage({ params }: Props) {
  const { slug: rawSlug, project: rawProject } = await params;
  const slug = decodeURIComponent(rawSlug);
  const projectSlug = decodeURIComponent(rawProject);

  const user = await ensureCurrentUser();
  if (!user) return null;

  const [channel] = await db.select().from(channels).where(eq(channels.slug, slug)).limit(1);
  if (!channel || channel.userId !== user.id) notFound();

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.ownAccountId, channel.id), eq(projects.slug, projectSlug)))
    .limit(1);
  if (!project) notFound();

  const [
    [museVideoCount],
    [museIdeaCount],
    [poetTopicCount],
    [poetScriptCount],
    [boundCount],
    activeBibleRows,
    recentScripts,
  ] = await Promise.all([
    db.select({ c: count() }).from(museMonitorVideos).where(eq(museMonitorVideos.projectId, project.id)),
    db.select({ c: count() }).from(museIdeas).where(eq(museIdeas.projectId, project.id)),
    db.select({ c: count() }).from(poetCustomTopics).where(eq(poetCustomTopics.projectId, project.id)),
    db.select({ c: count() }).from(poetScripts).where(eq(poetScripts.projectId, project.id)),
    db
      .select({ c: count() })
      .from(projectCompetitors)
      .innerJoin(competitorAccounts, eq(competitorAccounts.id, projectCompetitors.competitorAccountId))
      .where(and(eq(projectCompetitors.projectId, project.id), isNull(competitorAccounts.deletedAt))),
    db
      .select()
      .from(poetBible)
      .where(and(eq(poetBible.channelId, channel.id), eq(poetBible.isActive, true)))
      .limit(1),
    db
      .select({
        id: poetScripts.id,
        wordCount: poetScripts.wordCount,
        durationSeconds: poetScripts.durationSeconds,
        generatedAt: poetScripts.generatedAt,
      })
      .from(poetScripts)
      .where(eq(poetScripts.projectId, project.id))
      .orderBy(desc(poetScripts.generatedAt))
      .limit(5),
  ]);

  // Current writing SOP: explicit primary binding wins, else this account's latest ai_reference.
  const [pinnedSop] = await db
    .select({
      generatedAt: clerkSops.generatedAt,
      sourceName: sql<string>`coalesce(${channels.name}, ${competitorAccounts.name}, ${competitorAccounts.url}, '未知来源')`,
      sourceKind: sql<"own" | "competitor">`case when ${clerkSops.channelId} is not null then 'own' else 'competitor' end`,
    })
    .from(projectSops)
    .innerJoin(clerkSops, eq(clerkSops.id, projectSops.sopId))
    .leftJoin(channels, eq(channels.id, clerkSops.channelId))
    .leftJoin(competitorAccounts, eq(competitorAccounts.id, clerkSops.competitorAccountId))
    .where(and(eq(projectSops.projectId, project.id), eq(projectSops.role, "primary")))
    .limit(1);
  let currentSop: CurrentSop = pinnedSop
    ? {
        sourceName: pinnedSop.sourceName,
        generatedAt: pinnedSop.generatedAt,
        pinned: true,
        sourceKind: pinnedSop.sourceKind,
      }
    : null;
  if (!currentSop) {
    const [fallbackSop] = await db
      .select({ generatedAt: clerkSops.generatedAt })
      .from(clerkSops)
      .where(and(eq(clerkSops.channelId, channel.id), eq(clerkSops.sopType, "ai_reference")))
      .orderBy(desc(clerkSops.generatedAt))
      .limit(1);
    if (fallbackSop) {
      currentSop = {
        sourceName: channel.name,
        generatedAt: fallbackSop.generatedAt,
        pinned: false,
        sourceKind: "own",
      };
    }
  }

  const a = encodeURIComponent(channel.slug);
  const p = encodeURIComponent(project.slug);
  const activeBible = activeBibleRows[0] ?? null;

  const entries = [
    {
      label: "Muse · 选题官",
      desc: "巡视对标账号 → 生成可写的选题",
      href: `/accounts/${a}/projects/${p}/muse`,
      dot: "bg-muse",
      stats: [
        `${boundCount?.c ?? 0} 个对标`,
        `${museVideoCount?.c ?? 0} ${project.platform === "xhs" ? "篇" : "个"}已巡视`,
        `${museIdeaCount?.c ?? 0} 个选题`,
      ],
    },
    {
      label: "Poet · 写手",
      desc: "选题 / 时长 / 参考 → 成稿",
      href: `/accounts/${a}/projects/${p}/poet`,
      dot: "bg-poet",
      stats: [`${poetTopicCount?.c ?? 0} 个自定义选题`, `${poetScriptCount?.c ?? 0} 篇脚本`],
    },
  ];

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col gap-6 p-6 sm:p-8">
      <BackLink href={`/accounts/${a}`} label={channel.name} />

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Link href={`/accounts/${a}`} className="hover:text-foreground hover:underline">
            {channel.name}
          </Link>
          <span className="opacity-40">·</span>
          <Badge variant="secondary" className="font-mono text-[10px] uppercase">
            {project.platform}
          </Badge>
          <Badge variant="outline" className="font-mono text-[10px]">
            目标时长 {formatDurationLabel(project.targetDurationSeconds)}
          </Badge>
        </div>
      </header>

      <Link
        href={`/accounts/${a}/bible`}
        className="flex items-center gap-2 rounded-md border bg-card/40 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/50"
      >
        <span className="size-[7px] rounded-full bg-poet" />
        联动账号圣经：
        <span className="font-medium text-foreground">{activeBible ? activeBible.name : "未设置"}</span>
        {activeBible ? null : <span className="text-muted-foreground">· 去账号页设置</span>}
      </Link>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {entries.map((e) => (
          <Link key={e.label} href={e.href}>
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2">
                    <span className={`size-2.5 rounded-full ${e.dot}`} />
                    {e.label}
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">{e.desc}</p>
                <div className="flex flex-wrap gap-2">
                  {e.stats.map((s) => (
                    <Badge key={s} variant="secondary" className="font-mono text-[10px]">
                      {s}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      <p className="text-center text-xs text-muted-foreground">
        Muse 出选题 →（一键导入）→ Poet 写稿
      </p>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Poet 写稿依据 · SOP</span>
        <ProjectSopRow projectId={project.id} current={currentSop} />
      </div>

      <div id="competitors" className="flex scroll-mt-20 flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Muse 巡视对象 · 对标账号</span>
        <ProjectCompetitorsCard
          projectId={project.id}
          accountSlug={channel.slug}
          projectSlug={project.slug}
        />
      </div>

      {recentScripts.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">最近脚本</h2>
          <div className="flex flex-col gap-2">
            {recentScripts.map((s) => (
              <Link
                key={s.id}
                href={`/accounts/${a}/projects/${p}/poet/scripts/${s.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 text-sm transition-colors hover:bg-muted/50"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {formatDurationLabel(s.durationSeconds ?? 0)} · {s.wordCount ?? 0} 字
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {formatDateTime(s.generatedAt)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
