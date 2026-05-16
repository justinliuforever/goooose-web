import { boolean, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { channels } from "./channels";
import { pipelineRuns } from "./runs";

export const museMonitorVideos = pgTable(
  "muse_monitor_videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    platformVideoId: text("platform_video_id").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    sourceChannelName: text("source_channel_name"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    durationSec: integer("duration_sec"),
    transcript: text("transcript"),
    relevant: boolean("relevant"),
    topicClassification: text("topic_classification"),
    rejectionReason: text("rejection_reason"),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
    runId: uuid("run_id").references(() => pipelineRuns.id, { onDelete: "set null" }),
  },
  (table) => ({
    channelVideoUnique: unique("muse_monitor_videos_channel_video_unique").on(
      table.channelId,
      table.platformVideoId,
    ),
  })
);

export const museIdeas = pgTable("muse_ideas", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  sourceVideoId: uuid("source_video_id").references(() => museMonitorVideos.id, { onDelete: "set null" }),
  ideaNumber: integer("idea_number").notNull(),
  storyAngle: text("story_angle"),
  factsAndData: text("facts_and_data"),
  whySimilar: text("why_similar"),
  viralTrigger: text("viral_trigger"),
  approved: boolean("approved").notNull().default(false),
  scripted: boolean("scripted").notNull().default(false),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  runId: uuid("run_id").references(() => pipelineRuns.id, { onDelete: "set null" }),
});

export type MuseMonitorVideo = typeof museMonitorVideos.$inferSelect;
export type NewMuseMonitorVideo = typeof museMonitorVideos.$inferInsert;
export type MuseIdea = typeof museIdeas.$inferSelect;
export type NewMuseIdea = typeof museIdeas.$inferInsert;
