import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export type BonusBalances = {
  accounts?: number;
  contents?: number;
  generations?: number;
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  logtoId: text("logto_id").notNull().unique(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  accessStatus: text("access_status", { enum: ["pending", "approved", "blocked"] })
    .notNull()
    .default("pending"),
  role: text("role", { enum: ["member", "admin"] }).notNull().default("member"),
  plan: text("plan").notNull().default("free"),
  bonusBalances: jsonb("bonus_balances").$type<BonusBalances>().notNull().default({}),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  // NULL = predates the what's-new feature; new users are stamped at creation.
  lastSeenVersion: text("last_seen_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
