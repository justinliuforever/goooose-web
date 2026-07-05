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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
