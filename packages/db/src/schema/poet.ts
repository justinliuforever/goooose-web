import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { channels } from "./channels";
import { clerkSops } from "./clerk";
import { museIdeas } from "./muse";
import { pipelineRuns } from "./runs";

export const languageEnum = pgEnum("language", ["zh", "en"]);

export const poetBible = pgTable(
  "poet_bible",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    content: text("content").notNull(),
    sourceIdea: text("source_idea"),
    isActive: boolean("is_active").notNull().default(true),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Hard-guarantee a single active bible per channel (consumers do where(isActive).limit(1)).
    oneActivePerChannel: uniqueIndex("poet_bible_one_active_per_channel")
      .on(table.channelId)
      .where(sql`${table.isActive}`),
  }),
);

export const driftReasonEnum = pgEnum("drift_reason", ["no_overlap", "ai_markers", "topic_substitution"]);

export const poetDriftEvents = pgTable("poet_drift_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  bibleId: uuid("bible_id").references(() => poetBible.id, { onDelete: "set null" }),
  reason: driftReasonEnum("reason").notNull(),
  claimedTopic: text("claimed_topic"),
  humanMessage: text("human_message"),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CustomTopicReference = {
  kind: "youtube" | "xhs" | "text";
  url?: string;
  text?: string;
  title?: string;
};

// Per-fact verification produced at topic-analysis time. status="disputed" means the
// fact conflicts with well-known reality even though a source cites it (e.g. a wrong
// product year); note carries the suggested correct value. We mark, never auto-edit.
export type CheckedFact = {
  fact: string;
  src: string;
  status: "verified" | "disputed" | "unsupported";
  note?: string;
};

export const customTopicStatusEnum = pgEnum("custom_topic_status", [
  "draft",
  "analyzed",
  "scripted",
]);

export const poetCustomTopics = pgTable("poet_custom_topics", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  topic: text("topic").notNull(),
  references: jsonb("references").$type<CustomTopicReference[]>().default([]).notNull(),
  storyAngle: text("story_angle"),
  factsAndData: text("facts_and_data"),
  verbatimFacts: text("verbatim_facts"),
  factChecks: jsonb("fact_checks").$type<CheckedFact[]>().default([]).notNull(),
  whySimilar: text("why_similar"),
  viralTrigger: text("viral_trigger"),
  status: customTopicStatusEnum("status").notNull().default("draft"),
  bibleId: uuid("bible_id").references(() => poetBible.id, { onDelete: "set null" }),
  sopId: uuid("sop_id").references(() => clerkSops.id, { onDelete: "set null" }),
  language: languageEnum("language").notNull().default("zh"),
  durationMinutes: integer("duration_minutes"), // legacy — superseded by durationSeconds
  durationSeconds: integer("duration_seconds"),
  targetWordCount: integer("target_word_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const poetScripts = pgTable(
  "poet_scripts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    ideaId: uuid("idea_id").references(() => museIdeas.id, { onDelete: "set null" }),
    customTopicId: uuid("custom_topic_id").references(() => poetCustomTopics.id, { onDelete: "set null" }),
    bibleId: uuid("bible_id").references(() => poetBible.id, { onDelete: "set null" }),
    sopId: uuid("sop_id").references(() => clerkSops.id, { onDelete: "set null" }),
    scriptText: text("script_text").notNull(),
    language: languageEnum("language").notNull(),
    wordCount: integer("word_count"),
    durationMinutes: integer("duration_minutes"), // legacy — superseded by durationSeconds
    durationSeconds: integer("duration_seconds"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    runId: uuid("run_id").references(() => pipelineRuns.id, { onDelete: "set null" }),
  },
  (table) => ({
    exactlyOneSource: check(
      "poet_scripts_exactly_one_source",
      sql`(${table.ideaId} IS NULL) <> (${table.customTopicId} IS NULL)`,
    ),
    channelIdx: index("poet_scripts_channel_id_idx").on(table.channelId),
  })
);

export type PoetBible = typeof poetBible.$inferSelect;
export type NewPoetBible = typeof poetBible.$inferInsert;
export type PoetDriftEvent = typeof poetDriftEvents.$inferSelect;
export type NewPoetDriftEvent = typeof poetDriftEvents.$inferInsert;
export type PoetCustomTopic = typeof poetCustomTopics.$inferSelect;
export type NewPoetCustomTopic = typeof poetCustomTopics.$inferInsert;
export type PoetScript = typeof poetScripts.$inferSelect;
export type NewPoetScript = typeof poetScripts.$inferInsert;
