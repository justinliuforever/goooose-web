import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { channels } from "./channels";

export const agentEnum = pgEnum("agent", ["clerk", "muse", "poet"]);
export const runStatusEnum = pgEnum("run_status", ["pending", "running", "done", "failed"]);

export const pipelineRuns = pgTable("pipeline_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  agent: agentEnum("agent").notNull(),
  command: text("command").notNull(),
  status: runStatusEnum("status").notNull().default("pending"),
  progress: integer("progress").notNull().default(0),
  total: integer("total").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  configJson: jsonb("config_json"),
});

export type PipelineRun = typeof pipelineRuns.$inferSelect;
export type NewPipelineRun = typeof pipelineRuns.$inferInsert;
