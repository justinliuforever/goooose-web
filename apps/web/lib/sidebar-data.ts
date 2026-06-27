import { asc, eq } from "drizzle-orm";

import { channels } from "@singularity/db";

import { db } from "@/lib/db";

export type SidebarAccount = {
  slug: string;
  name: string;
  platform: string;
};

export async function getSidebarAccounts(userId: string): Promise<SidebarAccount[]> {
  return db
    .select({ slug: channels.slug, name: channels.name, platform: channels.platform })
    .from(channels)
    .where(eq(channels.userId, userId))
    .orderBy(asc(channels.createdAt));
}
