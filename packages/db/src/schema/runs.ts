import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { channels } from "./channels";
import { competitorAccounts } from "./competitor";
import { ownAccounts } from "./own-account";
import { projects } from "./project";

export const agentEnum = pgEnum("agent", ["clerk", "muse", "poet"]);
export const runStatusEnum = pgEnum("run_status", ["pending", "running", "done", "failed"]);

export const pipelineRuns = pgTable(
  "pipeline_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Exactly-one-owner (0018): clerk runs may target a competitor instead of a channel;
    // muse/poet runs always carry channel_id. CHECK pipeline_runs_one_owner enforces it.
    channelId: uuid("channel_id").references(() => channels.id, { onDelete: "cascade" }),
    competitorAccountId: uuid("competitor_account_id").references(() => competitorAccounts.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    ownAccountId: uuid("own_account_id").references(() => ownAccounts.id, { onDelete: "set null" }),
    agent: agentEnum("agent").notNull(),
    command: text("command").notNull(),
    status: runStatusEnum("status").notNull().default("pending"),
    progress: integer("progress").notNull().default(0),
    total: integer("total").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    configJson: jsonb("config_json"),
  },
  (table) => ({
    channelStatusIdx: index("pipeline_runs_channel_status_idx").on(table.channelId, table.status),
  })
);

export type PipelineRun = typeof pipelineRuns.$inferSelect;
export type NewPipelineRun = typeof pipelineRuns.$inferInsert;
