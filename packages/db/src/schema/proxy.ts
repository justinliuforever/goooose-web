import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const proxySessions = pgTable(
  "proxy_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    host: text("host").notNull(),
    port: integer("port").notNull(),
    username: text("username").notNull(),
    password: text("password").notNull(),
    geo: text("geo"),

    enabled: boolean("enabled").notNull().default(true),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    disabledReason: text("disabled_reason"),

    totalOk: integer("total_ok").notNull().default(0),
    totalErr: integer("total_err").notNull().default(0),
    totalBytes: bigint("total_bytes", { mode: "number" }).notNull().default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    lastError: text("last_error"),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    providerPasswordUnique: unique("proxy_sessions_provider_password_unique").on(
      t.provider,
      t.password,
    ),
    pickableIdx: index("proxy_sessions_pickable_idx").on(t.provider, t.enabled),
  }),
);

export type ProxySessionRow = typeof proxySessions.$inferSelect;
export type NewProxySession = typeof proxySessions.$inferInsert;
