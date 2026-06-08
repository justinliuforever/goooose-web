import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { channels } from "./channels";
import { ownAccounts } from "./own-account";

export type SeriesVideoRef = {
  video_id: string;
  title: string;
  duration_sec: number;
  views: number;
  published_at: string | null;
};

export const channelSeries = pgTable(
  "channel_series",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    ownAccountId: uuid("own_account_id").references(() => ownAccounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    videoCount: integer("video_count").notNull().default(0),
    sampleVideos: jsonb("sample_videos").$type<SeriesVideoRef[]>().notNull().default([]),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    channelIdx: index("channel_series_channel_id_idx").on(table.channelId),
  }),
);

export type ChannelSeries = typeof channelSeries.$inferSelect;
export type NewChannelSeries = typeof channelSeries.$inferInsert;
