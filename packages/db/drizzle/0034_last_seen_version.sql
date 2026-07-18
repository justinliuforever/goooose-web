-- Per-user what's-new tracking. NULL = existing user who predates the feature
-- (gets the current announcement once); new users are stamped at creation.
ALTER TABLE "users" ADD COLUMN "last_seen_version" text;
