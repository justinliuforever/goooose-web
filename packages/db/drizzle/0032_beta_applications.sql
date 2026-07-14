-- Public beta survey applications (/apply, no login): contact columns split out for
-- admin search; answers as {questionId: answer} jsonb so question edits never touch
-- the table. Additive.
CREATE TABLE "beta_applications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" text NOT NULL UNIQUE,
  "wechat" text,
  "social" text,
  "answers" jsonb NOT NULL,
  "survey_version" integer NOT NULL DEFAULT 1,
  "status" text NOT NULL DEFAULT 'new',
  "note" text,
  "ip" text,
  "submit_count" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Mirror 0030: RLS on, app connects as postgres (bypass); REST roles locked out.
ALTER TABLE "beta_applications" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "beta_applications" FROM anon, authenticated;
