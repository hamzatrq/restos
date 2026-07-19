-- T-01-07 fix-round amendment 3: kernel.quarantine.envelope becomes text
-- (verbatim JSON string) — bytes jsonb cannot faithfully hold (e.g. U+0000 in
-- any string) must still be quarantinable as storage_reject. USING is required:
-- jsonb has no automatic cast to text.
ALTER TABLE "kernel"."quarantine" ALTER COLUMN "envelope" SET DATA TYPE text USING "envelope"::text;
