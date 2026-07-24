import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { channels } from "@goooose/db";

import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/users";

type Props = { params: Promise<{ slug: string }> };

// Projects are auto-provisioned with the account via ensureProjectSpine; placeholder until multi-project.
export default async function NewProjectPage({ params }: Props) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);

  const user = await ensureCurrentUser();
  if (!user) return null;

  const [channel] = await db
    .select()
    .from(channels)
    .where(and(eq(channels.userId, user.id), eq(channels.slug, slug)))
    .limit(1);
  if (!channel || channel.userId !== user.id) notFound();

  const a = encodeURIComponent(channel.slug);

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col gap-6 p-6 sm:p-8">
      <BackLink href={`/accounts/${a}`} label={channel.name} />

      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">新建项目</h1>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            每个账号默认一个项目
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
          <p>
            创建账号时会自动生成一个与账号同名的默认项目，暂不支持手动新建额外项目。
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
