import { bigint, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { channels } from "./channels";
import { pipelineRuns } from "./runs";

export type VerbatimFact = {
  fact: string;
  src: string;
};

export const clerkVideos = pgTable(
  "clerk_videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    platformVideoId: text("platform_video_id").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    views: bigint("views", { mode: "number" }),
    durationSec: integer("duration_sec"),
    thumbnailUrl: text("thumbnail_url"),
    sourceChannelName: text("source_channel_name"),
    sourceChannelId: text("source_channel_id"),
    transcript: text("transcript"),
    thumbnailDescription: text("thumbnail_description"),
    thumbnailWhyItWorks: text("thumbnail_why_it_works"),
    openingHook: text("opening_hook"),
    openingHookType: text("opening_hook_type"),
    hooksThroughout: text("hooks_throughout"),
    allHookTypes: text("all_hook_types"),
    textHook: text("text_hook"),
    framework: text("framework"),
    openingStructure: text("opening_structure"),
    scriptStructure: text("script_structure"),
    storytellingFramework: text("storytelling_framework"),
    rehooksUsed: text("rehooks_used"),
    retentionPattern: text("retention_pattern"),
    ctaPlacement: text("cta_placement"),
    keyTakeaways: text("key_takeaways"),
    verbatimFacts: jsonb("verbatim_facts").$type<VerbatimFact[]>(),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
    runId: uuid("run_id").references(() => pipelineRuns.id, { onDelete: "set null" }),
  },
  (table) => ({
    channelVideoUnique: unique("clerk_videos_channel_video_unique").on(table.channelId, table.platformVideoId),
  })
);

export const sopTypeEnum = pgEnum("sop_type", ["human", "ai_reference", "hottest"]);

export const clerkSops = pgTable("clerk_sops", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  sopType: sopTypeEnum("sop_type").notNull(),
  language: text("language").notNull().default("zh"),
  contentMd: text("content_md").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  runId: uuid("run_id").references(() => pipelineRuns.id, { onDelete: "set null" }),
});

export type ClerkVideo = typeof clerkVideos.$inferSelect;
export type NewClerkVideo = typeof clerkVideos.$inferInsert;
export type ClerkSop = typeof clerkSops.$inferSelect;
export type NewClerkSop = typeof clerkSops.$inferInsert;
