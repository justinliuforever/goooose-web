import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./users";

// Pre-approval by email: matching login is auto-approved (lowercase-normalized).
export const allowedEmails = pgTable("allowed_emails", {
  email: text("email").primaryKey(),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accessRequests = pgTable("access_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  contact: text("contact"),
  status: text("status", { enum: ["pending", "approved", "rejected"] })
    .notNull()
    .default("pending"),
  decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AllowedEmail = typeof allowedEmails.$inferSelect;
export type AccessRequest = typeof accessRequests.$inferSelect;
