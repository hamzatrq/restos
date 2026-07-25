-- T-01-21 (01-F37, audit-1 #6/#7): one quarantine row PER CLAIMANT DEVICE.
--
-- The old org-wide (org_id, claimed_event_id) uniqueness let the FIRST claimant own
-- the only slot, so an honest origin arriving second had its envelope DISCARDED
-- ENTIRELY — bytes gone, not merely mis-attributed. A trivial insider pre-claim, or
-- the DEC-SYNC-009 unregistered->registered relay race, destroyed exactly the
-- evidence 01-F37 exists to preserve.
--
-- quarantine_notices widens in lockstep: left at the org-wide pair, the second
-- claimant's row would exist but its origin could NEVER be notified.
--
-- superseded_at (null <=> live) marks a placeholder whose event later merged
-- legitimately. Retained as evidence, never deleted (review #7, ruled) — deleting
-- would leave an investigation a hole with no trace anything was removed.

ALTER TABLE "kernel"."quarantine" DROP CONSTRAINT "quarantine_org_claimed_event_uq";--> statement-breakpoint
ALTER TABLE "kernel"."quarantine" ADD COLUMN "superseded_at" bigint;--> statement-breakpoint
ALTER TABLE "kernel"."quarantine" ADD CONSTRAINT "quarantine_org_claimed_device_uq" UNIQUE("org_id","claimed_event_id","device_id");--> statement-breakpoint
ALTER TABLE "kernel"."quarantine_notices" DROP CONSTRAINT "quarantine_notices_org_claimed_event_uq";--> statement-breakpoint
ALTER TABLE "kernel"."quarantine_notices" ADD CONSTRAINT "quarantine_notices_org_claimed_device_uq" UNIQUE("org_id","claimed_event_id","device_id");
