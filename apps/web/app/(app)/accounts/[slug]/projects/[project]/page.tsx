import { and, count, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import {
  channels,
  museIdeas,
  museMonitorVideos,
  poetBible,
  poetCustomTopics,
  poetScripts,
  projects,
} from "@singularity/db";
import { formatDurationLabel } from "@singularity/shared/schemas/poet";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/users";

import { ProjectCompetitorsCard } from "../../../_components/project-competitors-card";

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
  ] = await Promise.all([
    db.select({ c: count() }).from(museMonitorVideos).where(eq(museMonitorVideos.channelId, channel.id)),
    db.select({ c: count() }).from(museIdeas).where(eq(museIdeas.channelId, channel.id)),
    db.select({ c: count() }).from(poetBible).where(eq(poetBible.channelId, channel.id)),
    db.select({ c: count() }).from(poetCustomTopics).where(eq(poetCustomTopics.channelId, channel.id)),
    db.select({ c: count() }).from(poetScripts).where(eq(poetScripts.channelId, channel.id)),
    project.activeBibleId
      ? db.select().from(poetBible).where(eq(poetBible.id, project.activeBibleId)).limit(1)
      : Promise.resolve([]),
  ]);

  const a = encodeURIComponent(channel.slug);
  const p = encodeURIComponent(project.slug);
  const itemNoun = project.platform === "xhs" ? "篇监控笔记" : "个监控视频";
  const activeBible = pinnedBible[0] ?? null;

  const tools = [
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
        <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="secondary" className="font-mono text-[10px] uppercase">
            {project.platform}
          </Badge>
          <Badge variant="outline" className="font-mono text-[10px]">
            目标时长 {formatDurationLabel(project.targetDurationSeconds)}
          </Badge>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              Channel Bible
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
              还没有选用的 Bible（{poetBibleCount?.c ?? 0} 本可选）。
            </p>
          )}
        </CardContent>
      </Card>

      <ProjectCompetitorsCard projectId={project.id} />
    </div>
  );
}
