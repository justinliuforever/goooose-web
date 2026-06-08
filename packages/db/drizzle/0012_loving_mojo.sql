CREATE TYPE "public"."project_sop_role" AS ENUM('primary', 'reference');--> statement-breakpoint
CREATE TABLE "own_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"platform" "platform" NOT NULL,
	"platform_url" text NOT NULL,
	"platform_channel_id" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "own_accounts_user_slug_unique" UNIQUE("user_id","slug")
);
--> statement-breakpoint
CREATE TABLE "competitor_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"platform_key" text NOT NULL,
	"url" text NOT NULL,
	"name" text,
	"avatar_url" text,
	"subscriber_count" integer,
	"needs_resolution" boolean DEFAULT false NOT NULL,
	"last_verified_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_competitors" (
	"project_id" uuid NOT NULL,
	"competitor_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_competitors_project_id_competitor_account_id_pk" PRIMARY KEY("project_id","competitor_account_id")
);
--> statement-breakpoint
CREATE TABLE "project_sops" (
	"project_id" uuid NOT NULL,
	"sop_id" uuid NOT NULL,
	"role" "project_sop_role" DEFAULT 'reference' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_sops_project_id_sop_id_pk" PRIMARY KEY("project_id","sop_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"own_account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"platform" "platform" NOT NULL,
	"target_duration_seconds" integer DEFAULT 300 NOT NULL,
	"active_bible_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_own_account_slug_unique" UNIQUE("own_account_id","slug")
);
--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD COLUMN "own_account_id" uuid;--> statement-breakpoint
ALTER TABLE "clerk_sops" ADD COLUMN "own_account_id" uuid;--> statement-breakpoint
ALTER TABLE "clerk_sops" ADD COLUMN "competitor_account_id" uuid;--> statement-breakpoint
ALTER TABLE "clerk_videos" ADD COLUMN "own_account_id" uuid;--> statement-breakpoint
ALTER TABLE "muse_ideas" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "muse_monitor_videos" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "muse_monitor_videos" ADD COLUMN "competitor_account_id" uuid;--> statement-breakpoint
ALTER TABLE "poet_bible" ADD COLUMN "own_account_id" uuid;--> statement-breakpoint
ALTER TABLE "poet_custom_topics" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "poet_drift_events" ADD COLUMN "own_account_id" uuid;--> statement-breakpoint
ALTER TABLE "poet_scripts" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "channel_series" ADD COLUMN "own_account_id" uuid;--> statement-breakpoint
ALTER TABLE "own_accounts" ADD CONSTRAINT "own_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_accounts" ADD CONSTRAINT "competitor_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_competitors" ADD CONSTRAINT "project_competitors_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_competitors" ADD CONSTRAINT "project_competitors_competitor_account_id_competitor_accounts_id_fk" FOREIGN KEY ("competitor_account_id") REFERENCES "public"."competitor_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_sops" ADD CONSTRAINT "project_sops_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_sops" ADD CONSTRAINT "project_sops_sop_id_clerk_sops_id_fk" FOREIGN KEY ("sop_id") REFERENCES "public"."clerk_sops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_own_account_id_own_accounts_id_fk" FOREIGN KEY ("own_account_id") REFERENCES "public"."own_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_active_bible_id_poet_bible_id_fk" FOREIGN KEY ("active_bible_id") REFERENCES "public"."poet_bible"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "own_accounts_user_id_idx" ON "own_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "competitor_accounts_user_id_idx" ON "competitor_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_own_account_id_idx" ON "projects" USING btree ("own_account_id");--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_own_account_id_own_accounts_id_fk" FOREIGN KEY ("own_account_id") REFERENCES "public"."own_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clerk_sops" ADD CONSTRAINT "clerk_sops_own_account_id_own_accounts_id_fk" FOREIGN KEY ("own_account_id") REFERENCES "public"."own_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clerk_sops" ADD CONSTRAINT "clerk_sops_competitor_account_id_competitor_accounts_id_fk" FOREIGN KEY ("competitor_account_id") REFERENCES "public"."competitor_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clerk_videos" ADD CONSTRAINT "clerk_videos_own_account_id_own_accounts_id_fk" FOREIGN KEY ("own_account_id") REFERENCES "public"."own_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "muse_ideas" ADD CONSTRAINT "muse_ideas_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "muse_monitor_videos" ADD CONSTRAINT "muse_monitor_videos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "muse_monitor_videos" ADD CONSTRAINT "muse_monitor_videos_competitor_account_id_competitor_accounts_id_fk" FOREIGN KEY ("competitor_account_id") REFERENCES "public"."competitor_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poet_bible" ADD CONSTRAINT "poet_bible_own_account_id_own_accounts_id_fk" FOREIGN KEY ("own_account_id") REFERENCES "public"."own_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poet_custom_topics" ADD CONSTRAINT "poet_custom_topics_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poet_drift_events" ADD CONSTRAINT "poet_drift_events_own_account_id_own_accounts_id_fk" FOREIGN KEY ("own_account_id") REFERENCES "public"."own_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poet_scripts" ADD CONSTRAINT "poet_scripts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_series" ADD CONSTRAINT "channel_series_own_account_id_own_accounts_id_fk" FOREIGN KEY ("own_account_id") REFERENCES "public"."own_accounts"("id") ON DELETE cascade ON UPDATE no action;