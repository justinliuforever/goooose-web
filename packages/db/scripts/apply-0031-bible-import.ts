// Idempotent apply for 0031: bible import staging tables + poet_bible fidelity columns.
import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: new URL("../../../.env.local", import.meta.url).pathname });

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

await sql`CREATE TABLE IF NOT EXISTS bible_import_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  filename text NOT NULL,
  mime text NOT NULL,
  size integer NOT NULL,
  sha256 text NOT NULL,
  expected_chunks integer NOT NULL,
  status text NOT NULL DEFAULT 'uploading',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT now() + interval '2 hours'
)`;
await sql`CREATE INDEX IF NOT EXISTS bible_import_files_user_idx ON bible_import_files (user_id, created_at)`;

await sql`CREATE TABLE IF NOT EXISTS bible_import_chunks (
  file_id uuid NOT NULL REFERENCES bible_import_files(id) ON DELETE CASCADE,
  idx integer NOT NULL,
  bytes bytea NOT NULL,
  PRIMARY KEY (file_id, idx)
)`;

await sql`ALTER TABLE poet_bible ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'idea'`;
await sql`ALTER TABLE poet_bible ADD COLUMN IF NOT EXISTS source_transcript text`;
await sql`ALTER TABLE poet_bible ADD COLUMN IF NOT EXISTS host_name text`;
await sql`ALTER TABLE poet_bible ADD COLUMN IF NOT EXISTS import_file_id uuid REFERENCES bible_import_files(id) ON DELETE SET NULL`;
await sql`ALTER TABLE poet_bible ADD COLUMN IF NOT EXISTS import_flags jsonb NOT NULL DEFAULT '[]'::jsonb`;

await sql`ALTER TABLE bible_import_files ENABLE ROW LEVEL SECURITY`;
await sql`ALTER TABLE bible_import_chunks ENABLE ROW LEVEL SECURITY`;
await sql`REVOKE ALL ON bible_import_files, bible_import_chunks FROM anon, authenticated`;

const verify = await sql`SELECT
  to_regclass('bible_import_files') AS files_table,
  to_regclass('bible_import_chunks') AS chunks_table,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'poet_bible'
    AND column_name IN ('source_kind','source_transcript','host_name','import_file_id','import_flags')) AS bible_cols,
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'bible_import_files') AS files_rls`;
console.log("verify:", verify[0]);
await sql.end();
