-- T-01-22 fix round (01-F37 as amended; adversarial review M2): record the STORED
-- ENVELOPE's author alongside the row's attribution.
--
-- Supersession must be scoped by who WROTE the quarantined bytes, not by who the row
-- is attributed to. The two differ exactly where it matters: a relayed
-- pre-registration placeholder is attributed to the HUB but carries the ORIGIN's
-- envelope verbatim (01-F1 — a relay never re-authors), while a forged claim on the
-- same id carries someone else's envelope entirely.
--
-- A column rather than parsing `envelope` at query time: that column is TEXT and may
-- not be valid JSON at all (`storage_reject` rows exist precisely because Postgres
-- could not hold those bytes), so any `::jsonb` cast in a WHERE clause risks throwing
-- INSIDE the merge transaction and wedging the push (01-F17). Postgres does not
-- guarantee AND-condition evaluation order, so a guard cannot be relied on.
--
-- Nullable: rows written before this migration, and rows whose envelope was never
-- parseable, simply never match — they stay live, which is the safe direction for
-- evidence.

ALTER TABLE "kernel"."quarantine" ADD COLUMN "envelope_author" text;
