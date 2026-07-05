// Idempotent apply for 0029: minutes quota columns + login events.
import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: new URL("../../../.env.local", import.meta.url).pathname });

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

await sql`ALTER TABLE usage_counters ADD COLUMN IF NOT EXISTS minutes_used integer NOT NULL DEFAULT 0`;
await sql`ALTER TABLE usage_counters ADD COLUMN IF NOT EXISTS bonus_minutes integer NOT NULL DEFAULT 0`;
await sql`ALTER TABLE quota_adjustments ADD COLUMN IF NOT EXISTS minutes_delta integer NOT NULL DEFAULT 0`;
await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at timestamp with time zone`;

await sql`CREATE TABLE IF NOT EXISTS login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
)`;
await sql`CREATE INDEX IF NOT EXISTS login_events_user_idx ON login_events (user_id, created_at)`;

const verify = await sql`SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'usage_counters' AND column_name IN ('minutes_used','bonus_minutes')) AS counter_cols,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'last_seen_at') AS user_cols,
  to_regclass('login_events') AS login_events`;
console.log("verify:", verify[0]);
await sql.end();
