-- Round 4 multi-project: a project is a folder/category under an account, with an optional
-- description. Additive, nullable — safe and reversible.
-- Hand-written raw SQL (drizzle meta/journal drifted at 0014 — do NOT use drizzle-kit generate).
ALTER TABLE "projects" ADD COLUMN "description" text;
