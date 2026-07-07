-- Bible file import: chunked-upload staging (Vercel 4.5MB body / Trigger 3MB payload
-- force file-to-DB in pieces) + fidelity columns on poet_bible. Additive.
CREATE TABLE "bible_import_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE CASCADE,
  "filename" text NOT NULL,
  "mime" text NOT NULL,
  "size" integer NOT NULL,
  "sha256" text NOT NULL,
  "expected_chunks" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'uploading',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone NOT NULL DEFAULT now() + interval '2 hours'
);
CREATE INDEX "bible_import_files_user_idx" ON "bible_import_files" ("user_id", "created_at");

CREATE TABLE "bible_import_chunks" (
  "file_id" uuid NOT NULL REFERENCES "bible_import_files"("id") ON DELETE CASCADE,
  "idx" integer NOT NULL,
  "bytes" bytea NOT NULL,
  PRIMARY KEY ("file_id", "idx")
);

ALTER TABLE "poet_bible" ADD COLUMN "source_kind" text NOT NULL DEFAULT 'idea';
ALTER TABLE "poet_bible" ADD COLUMN "source_transcript" text;
ALTER TABLE "poet_bible" ADD COLUMN "host_name" text;
ALTER TABLE "poet_bible" ADD COLUMN "import_file_id" uuid REFERENCES "bible_import_files"("id") ON DELETE SET NULL;
ALTER TABLE "poet_bible" ADD COLUMN "import_flags" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Quota refund-on-failure: stamp the charge on the run; refund flips the flag exactly once.
ALTER TABLE "pipeline_runs" ADD COLUMN "quota_charged" integer NOT NULL DEFAULT 0;
ALTER TABLE "pipeline_runs" ADD COLUMN "quota_refunded" boolean NOT NULL DEFAULT false;

-- Mirror 0030: RLS on, app connects as postgres (bypass); REST roles locked out.
ALTER TABLE "bible_import_files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bible_import_chunks" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "bible_import_files", "bible_import_chunks" FROM anon, authenticated;
