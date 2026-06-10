import {
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { channels } from "./channels";
import { competitorAccounts } from "./competitor";
import { ownAccounts } from "./own-account";
import { pipelineRuns } from "./runs";

export type VerbatimFact = {
  fact: string;
  src: string;
};

export const clerkVideos = pgTable(
  "clerk_videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Exactly-one-owner (0018): own rows carry channel_id+own_account_id, competitor rows
    // carry competitor_account_id; CHECK clerk_videos_one_owner enforces the XOR.
    channelId: uuid("channel_id").references(() => channels.id, { onDelete: "cascade" }),
    ownAccountId: uuid("own_account_id").references(() => ownAccounts.id, { onDelete: "cascade" }),
    competitorAccountId: uuid("competitor_account_id").references(() => competitorAccounts.id, { onDelete: "cascade" }),
    platformVideoId: text("platform_video_id").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    views: bigint("views", { mode: "number" }),
    durationSec: integer("duration_sec"),
    thumbnailUrl: text("thumbnail_url"),
    sourceChannelName: text("source_channel_name"),
    sourceChannelId: text("source_channel_id"),
    transcript: text("transcript"),
    transcriptSource: text("transcript_source"),
    contentType: text("content_type").notNull().default("video"),
    thumbnailDescription: text("thumbnail_description"),
    thumbnailWhyItWorks: text("thumbnail_why_it_works"),
    coverDiagnosis: text("cover_diagnosis"),
    coverTitleSuggestions: jsonb("cover_title_suggestions").$type<string[]>(),
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
    chapters: jsonb("chapters").$type<Array<{ start_time: number; end_time: number; title: string }>>(),
    sponsorChapters: jsonb("sponsor_chapters").$type<Array<{ start_time: number; end_time: number; category: string; type: string }>>(),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
    runId: uuid("run_id").references(() => pipelineRuns.id, { onDelete: "set null" }),
  },
  (table) => ({
    channelVideoUnique: unique("clerk_videos_channel_video_unique").on(table.channelId, table.platformVideoId),
    // Owner-keyed twin of the channel unique; channel-scoped index retires with channel_id (契约末轮).
    ownerVideoUnique: unique("clerk_videos_owner_video_unique").on(table.ownAccountId, table.platformVideoId),
    // Competitor-side dedup twin lives in 0018 as a partial unique index (NULLs make the
    // own-side uniques vacuous for competitor rows).
    channelIdx: index("clerk_videos_channel_id_idx").on(table.channelId),
  })
);

export const sopTypeEnum = pgEnum("sop_type", ["human", "ai_reference", "hottest", "single_video"]);

export const clerkSops = pgTable(
  "clerk_sops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id").references(() => channels.id, { onDelete: "cascade" }),
    ownAccountId: uuid("own_account_id").references(() => ownAccounts.id, { onDelete: "cascade" }),
    // cascade (not set null): a SET NULL here would strand rows in violation of the
    // one-owner CHECK when a competitor is deleted (0018 rebuilds the FK).
    competitorAccountId: uuid("competitor_account_id").references(() => competitorAccounts.id, { onDelete: "cascade" }),
    sopType: sopTypeEnum("sop_type").notNull(),
    language: text("language").notNull().default("zh"),
    contentMd: text("content_md").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    runId: uuid("run_id").references(() => pipelineRuns.id, { onDelete: "set null" }),
  },
  (table) => ({
    channelIdx: index("clerk_sops_channel_id_idx").on(table.channelId),
  })
);

export type ClerkVideo = typeof clerkVideos.$inferSelect;
export type NewClerkVideo = typeof clerkVideos.$inferInsert;
export type ClerkSop = typeof clerkSops.$inferSelect;
export type NewClerkSop = typeof clerkSops.$inferInsert;
