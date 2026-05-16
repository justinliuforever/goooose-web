import { jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { users } from "./users";

export const platformEnum = pgEnum("platform", ["youtube", "xhs"]);

export type CompetitorRef = {
  platform: "youtube" | "xhs";
  url: string;
};

export const channels = pgTable(
  "channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    platform: platformEnum("platform").notNull(),
    platformUrl: text("platform_url").notNull(),
    platformChannelId: text("platform_channel_id"),
    description: text("description"),
    competitors: jsonb("competitors").$type<CompetitorRef[]>().default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userSlugUnique: unique("channels_user_slug_unique").on(table.userId, table.slug),
  })
);

export type Channel = typeof channels.$inferSelect;
export type NewChannel = typeof channels.$inferInsert;
