import { index, integer, pgEnum, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { platformEnum } from "./channels";
import { clerkSops } from "./clerk";
import { competitorAccounts } from "./competitor";
import { ownAccounts } from "./own-account";
import { poetBible } from "./poet";
import { users } from "./users";

// Execution unit (方案一): one platform + a target duration default, belonging to one
// own_account. Binds SOPs (M:N), one active Bible, competitor accounts (M:N). Muse and
// Poet are peer tools inside a project. Backfilled with id == channels.id (the D3 spine),
// so every content row's channel_id value already equals its default project's id.
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownAccountId: uuid("own_account_id").notNull().references(() => ownAccounts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    platform: platformEnum("platform").notNull(),
    targetDurationSeconds: integer("target_duration_seconds").notNull().default(300),
    activeBibleId: uuid("active_bible_id").references(() => poetBible.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ownAccountSlugUnique: unique("projects_own_account_slug_unique").on(table.ownAccountId, table.slug),
    ownAccountIdx: index("projects_own_account_id_idx").on(table.ownAccountId),
  }),
);

export const projectCompetitors = pgTable(
  "project_competitors",
  {
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    competitorAccountId: uuid("competitor_account_id").notNull().references(() => competitorAccounts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.projectId, table.competitorAccountId] }),
  }),
);

export const projectSopRoleEnum = pgEnum("project_sop_role", ["primary", "reference"]);

export const projectSops = pgTable(
  "project_sops",
  {
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    sopId: uuid("sop_id").notNull().references(() => clerkSops.id, { onDelete: "cascade" }),
    role: projectSopRoleEnum("role").notNull().default("reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.projectId, table.sopId] }),
  }),
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectCompetitor = typeof projectCompetitors.$inferSelect;
export type NewProjectCompetitor = typeof projectCompetitors.$inferInsert;
export type ProjectSop = typeof projectSops.$inferSelect;
export type NewProjectSop = typeof projectSops.$inferInsert;
