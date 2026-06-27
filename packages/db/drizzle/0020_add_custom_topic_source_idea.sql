-- Round 4 Muse->Poet: track which Muse idea a custom topic was imported from (provenance + dedup).
-- Additive, nullable — safe and reversible. Hand-written raw SQL (journal drifted at 0014).
ALTER TABLE "poet_custom_topics" ADD COLUMN "source_idea_id" uuid;
