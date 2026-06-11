import { sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { platformEnum } from "./channels";
import { users } from "./users";

// platform_key is the lowercase canonical dedup key (XHS user id / YouTube UC id).
// needs_resolution flags rows whose key is provisional (YouTube /c/ /user/ handles)
// until the offline resolver canonicalizes them.
export const competitorAccounts = pgTable(
  "competitor_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    platformKey: text("platform_key").notNull(),
    url: text("url").notNull(),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    subscriberCount: integer("subscriber_count"),
    needsResolution: boolean("needs_resolution").notNull().default(false),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("competitor_accounts_user_id_idx").on(table.userId),
    // DB-level dedup; partial so a soft-deleted row doesn't block re-adding the same account.
    userPlatformKeyUnique: uniqueIndex("competitor_accounts_user_platform_key_unique")
      .on(table.userId, table.platform, table.platformKey)
      .where(sql`${table.deletedAt} IS NULL`),
  }),
);

export type CompetitorAccount = typeof competitorAccounts.$inferSelect;
export type NewCompetitorAccount = typeof competitorAccounts.$inferInsert;
