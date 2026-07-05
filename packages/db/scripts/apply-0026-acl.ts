// Idempotent apply for 0026: ACL columns + access tables + backfill.
import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: new URL("../../../.env.local", import.meta.url).pathname });

const ADMIN_EMAILS = [
  "justinliuforever@gmail.com",
  "justinliuforever2@gmail.com",
  "justinliu@rotohaus.com",
];

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS access_status text NOT NULL DEFAULT 'pending'`;
await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member'`;
await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free'`;
await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_balances jsonb NOT NULL DEFAULT '{}'::jsonb`;

await sql`CREATE TABLE IF NOT EXISTS allowed_emails (
  email text PRIMARY KEY,
  note text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
)`;

await sql`CREATE TABLE IF NOT EXISTS access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message text NOT NULL,
  contact text,
  status text NOT NULL DEFAULT 'pending',
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
)`;

// Backfill only rows still at the fresh default so re-runs never demote anyone.
const approved = await sql`UPDATE users SET access_status = 'approved' WHERE access_status = 'pending' RETURNING email`;
const admins = await sql`UPDATE users SET role = 'admin' WHERE lower(email) = ANY(${ADMIN_EMAILS}) AND role <> 'admin' RETURNING email`;

const counts = await sql`SELECT
  (SELECT count(*) FROM users) AS users,
  (SELECT count(*) FROM users WHERE access_status = 'approved') AS approved,
  (SELECT count(*) FROM users WHERE role = 'admin') AS admins`;
console.log("backfilled approved:", approved.map((r) => r.email));
console.log("promoted admins:", admins.map((r) => r.email));
console.log("verify:", counts[0]);
await sql.end();
