import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { poetBible } from "../schema/poet";
import { projects } from "../schema/project";

export type ResolvedBible = { bible: typeof poetBible.$inferSelect; viaFallback: boolean } | null;

// The Bible a project writes against: its hard pin (project.active_bible_id) first; otherwise
// the account-level active Bible (Bible is per-account, shared across the account's projects).
// accountId is the channel/own-account spine. viaFallback flags "served the account active
// Bible instead of a project pin" so the caller can log it.
export async function resolveActiveBible(
  db: PostgresJsDatabase,
  projectId: string,
  accountId: string,
): Promise<ResolvedBible> {
  const [proj] = await db
    .select({ pin: projects.activeBibleId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (proj?.pin) {
    // A stale pin (pointing at a now-deactivated Bible) falls through to the account active
    // Bible instead of serving the wrong voice.
    const [pinned] = await db
      .select()
      .from(poetBible)
      .where(and(eq(poetBible.id, proj.pin), eq(poetBible.isActive, true)))
      .limit(1);
    if (pinned) return { bible: pinned, viaFallback: false };
  }
  const [active] = await db
    .select()
    .from(poetBible)
    .where(and(eq(poetBible.channelId, accountId), eq(poetBible.isActive, true)))
    .limit(1);
  return active ? { bible: active, viaFallback: true } : null;
}
