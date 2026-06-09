import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { eq } from "drizzle-orm";

import { channels } from "@singularity/db";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/users";

type Props = { params: Promise<{ slug: string }> };

// No project-create mutation exists yet: projects are auto-provisioned with the account
// via ensureProjectSpine during the 1:1 expand phase. Honest placeholder until multi-project.
export default async function NewProjectPage({ params }: Props) {
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

  const a = encodeURIComponent(channel.slug);

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
        <h1 className="text-2xl font-semibold tracking-tight">新建项目</h1>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            当前阶段：每个账号一个默认项目（待你定）
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
          <p>
            现阶段每个账号在创建时会自动生成一个与账号同名的默认项目，暂不支持手动新建额外项目（待你定）。
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button render={<Link href={`/accounts/${a}/projects/${a}`} />}>
              打开默认项目
            </Button>
            <Button variant="outline" render={<Link href="/accounts/new" />}>
              新建账号
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
