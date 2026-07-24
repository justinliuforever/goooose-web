import "server-only";

import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { channels, projects, type Channel, type Project } from "@goooose/db";

import { db } from "./db";
import { ensureCurrentUser } from "./users";

// Single source of truth for slug → owned resource resolution in RSC pages. Slugs are
// only unique per (user_id, slug), so every lookup MUST scope by the current user — doing
// it here means a new page physically cannot reintroduce the cross-user 404 bug.
export async function resolveOwnedChannel(
  slug: string,
): Promise<{ user: NonNullable<Awaited<ReturnType<typeof ensureCurrentUser>>>; channel: Channel }> {
  const user = await ensureCurrentUser();
  if (!user) notFound();
  const [channel] = await db
    .select()
    .from(channels)
    .where(and(eq(channels.userId, user.id), eq(channels.slug, slug)))
    .limit(1);
  if (!channel) notFound();
  return { user, channel };
}

export async function resolveOwnedProject(
  slug: string,
  projectSlug: string,
): Promise<{
  user: NonNullable<Awaited<ReturnType<typeof ensureCurrentUser>>>;
  channel: Channel;
  project: Project;
}> {
  const { user, channel } = await resolveOwnedChannel(slug);
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.ownAccountId, channel.id), eq(projects.slug, projectSlug)))
    .limit(1);
  if (!project) notFound();
  return { user, channel, project };
}
