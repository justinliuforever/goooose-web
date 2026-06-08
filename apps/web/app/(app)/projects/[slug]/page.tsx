import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { channels, projects } from "@singularity/db";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/users";

import { ProjectCompetitorsCard } from "../../channels/_components/project-competitors-card";

type Props = { params: Promise<{ slug: string }> };

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m} 分钟` : `${m} 分 ${s} 秒`;
}

// Explicit project route (one platform + target duration). project.id == channel.id during
// the expand phase, so we resolve the channel by slug and treat its id as the project id.
export default async function ProjectHubPage({ params }: Props) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);

  const user = await ensureCurrentUser();
  if (!user) return null;

  const [channel] = await db.select().from(channels).where(eq(channels.slug, slug)).limit(1);
  if (!channel || channel.userId !== user.id) notFound();

  const [project] = await db
    .select({ targetDurationSeconds: projects.targetDurationSeconds })
    .from(projects)
    .where(eq(projects.id, channel.id))
    .limit(1);

  const encodedSlug = encodeURIComponent(channel.slug);
  const tools = [
    { label: "Clerk · 分析师", href: `/projects/${encodedSlug}/clerk`, desc: "拆解对标视频，沉淀 SOP" },
    { label: "Muse · 选题官", href: `/projects/${encodedSlug}/muse`, desc: "巡视对标，生成选题" },
    { label: "Poet · 写手", href: `/projects/${encodedSlug}/poet`, desc: "按圣经与 SOP 写稿" },
  ];

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col gap-6 p-6 sm:p-8">
      <Button
        variant="ghost"
        size="sm"
        render={<Link href={`/channels/${encodedSlug}`} />}
        className="w-fit text-muted-foreground"
      >
        <ChevronLeft data-icon="inline-start" />
        账号
      </Button>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{channel.name}</span>
          <span>·</span>
          <Badge variant="secondary" className="font-mono text-[10px] uppercase">
            {channel.platform}
          </Badge>
          <span>·</span>
          <span>目标时长 {formatDuration(project?.targetDurationSeconds ?? null)}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{channel.name}</h1>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {tools.map((t) => (
          <Link key={t.label} href={t.href}>
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{t.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{t.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      <ProjectCompetitorsCard projectId={channel.id} />
    </div>
  );
}
