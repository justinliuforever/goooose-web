CREATE TABLE "proxy_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"host" text NOT NULL,
	"port" integer NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"geo" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"disabled_at" timestamp with time zone,
	"disabled_reason" text,
	"total_ok" integer DEFAULT 0 NOT NULL,
	"total_err" integer DEFAULT 0 NOT NULL,
	"total_bytes" bigint DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"last_error" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proxy_sessions_provider_password_unique" UNIQUE("provider","password")
);
--> statement-breakpoint
CREATE INDEX "proxy_sessions_pickable_idx" ON "proxy_sessions" USING btree ("provider","enabled");