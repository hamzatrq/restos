-- 01-F68 / 01-F69 / 01-F70: the TENANCY DIRECTORY — the org, the branch and the device
-- as NAMED records.
--
-- `01 §5` has listed `orgs/branches/users/roles` among the cloud tables since Draft 1 and no FR
-- ever said what an org IS, so the plumbing shipped and the record did not: `org_id` arrives at
-- this gateway as free text, nothing anywhere creates an org, and every surface therefore renders
-- a UUID where a restaurant's name belongs.
--
-- ⚠ THIS MIGRATION CREATES NO FOREIGN KEY, AND `01-F68` FORBIDS ONE FROM ANY LEDGER TABLE **EVER**.
-- Events already exist under org ids that no row here names — that is the state of the deployment
-- today — so a referential constraint from `kernel.events` would refuse ingest for exactly those
-- orgs, and refusing ingest is refusing a sale a till has already rung and persisted (01-F17,
-- 00 §5.1, 01-F2). It buys nothing either: admission is the gate and it is one layer up
-- (01-F25/01-F47/01-F48 — no push without a registered, unrevoked, unexpired credential naming its
-- org; 01-F71 (c) quarantines an envelope whose org_id disagrees with its session's). A row-level
-- gate could only ever reject events a credentialed device produced, which is the failure mode
-- and not the protection. An org with events and no record is UNNAMED, not invalid.
--
-- The same restraint is applied to the directory's own edges — `branches.org_id` does not
-- reference `orgs`, and `device_registry.branch_id` does not reference `branches`. That extension
-- is an interpretation and is recorded as one in `schema.ts`: an FK on the first would make naming
-- a branch impossible until its org is named, turning a directory into an ordering gate on exactly
-- the reconciliation 01-F68 describes; an FK on the second would break provisioning and admission
-- outright, because every device registered to date has no branch row. Ordering is the writer's
-- job (15-F26 provisioning), which is where this service already puts completeness rules (01-F60).
--
-- Closed sets — `orgs.status` (15-F25: `active | suspended`, and deliberately no third value),
-- `branches.branch_type` (01-F25) and `branches.branch_class` (01-F49) — are stored as free text
-- with NO CHECK constraint, exactly as `device_registry.device_class` and `catalog_entries.kind`
-- already are. This schema validates closed sets at the writer (Zod), never in Postgres; a second
-- interpretation of a closed set is the defect 03-F40's two sensor bit layouts cost this corpus.
-- `display_name`'s NON-EMPTY requirement is likewise OWED at the writer for the same reason.
--
-- `branches`' primary key is `branch_id` ALONE, unlike `device_registry`'s `(org_id, device_id)`
-- pair. 01-F69 says a branch is "under exactly one org" and its id is "never reused"; both are
-- untrue under a composite key, which would admit the same branch_id beneath two orgs.
--
-- ADDITIVE ONLY: three CREATEs and one nullable ADD COLUMN. Nothing existing is dropped, renamed
-- or tightened, so this cannot fail on a database already carrying the first ten migrations.
--
-- ⚠ HOW THIS FILE WAS PRODUCED, because the obvious route is a trap. `meta/` carries snapshots for
-- 0000..0003 only — 0004 onward were hand-authored — so `drizzle-kit generate` diffs the current
-- schema against `0003_snapshot.json` and re-emits every change from 0004..0009 as well (measured:
-- it recreates `catalog_entries`, `catalog_versions` and `org_events`, re-adds `token_expires_at`,
-- and DROPs two constraints that no longer exist). That output fails on any migrated database. The
-- DDL below is the generator's own, for the new objects only, with the 0004..0009 replay removed.

CREATE TABLE "kernel"."orgs" (
	"org_id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"status" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kernel"."branches" (
	"branch_id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"display_name" text NOT NULL,
	"branch_type" text NOT NULL,
	"branch_class" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
-- The only read path this table has: one org's branches.
CREATE INDEX "branches_org_idx" ON "kernel"."branches" USING btree ("org_id");
--> statement-breakpoint
-- 01-F70: the device's human name ("Counter till", "Kitchen screen"), on the REGISTRY row rather
-- than in device-local configuration (00 §7 layer 3) — the two surfaces that need it (14-F12's
-- device list, 15-F11's fleet dashboard) are lists of devices nobody is holding. It is a LABEL and
-- never an identifier: device_id stays the sole key for admission, fan-out, watermarks and
-- 01-F64's store binding, and two devices may legitimately share a name.
--
-- Nullable, and it does NOT backfill, on the precedent 0005 and 0008 set: rows provisioned before
-- this migration have no name and inventing one would be inventing a fact about a physical device
-- nobody looked at. 01-F70 makes the name required at REGISTRATION — that refusal belongs to the
-- writer (`provision-device`/`registerDevice`) and is OWED; a device that has not learned its own
-- name renders per 21-F15.
ALTER TABLE "kernel"."device_registry" ADD COLUMN "display_name" text;
