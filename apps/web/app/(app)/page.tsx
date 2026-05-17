import { count, eq } from "drizzle-orm";
import Link from "next/link";
import { Plus } from "lucide-react";

import { channels } from "@singularity/db";

import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/users";

export default async function DashboardPage() {
  const user = await ensureCurrentUser();
  if (!user) return null;

  const [result] = await db
    .select({ count: count() })
    .from(channels)
    .where(eq(channels.userId, user.id));
  const channelCount = result?.count ?? 0;

  if (channelCount === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Button render={<Link href="/channels/new" />} size="lg">
          <Plus data-icon="inline-start" />
          创建第一个频道
        </Button>
      </div>
    );
  }

  return <div className="flex flex-1 p-8" />;
}
