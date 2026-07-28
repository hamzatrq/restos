-- T-C2 (plans/wave-1/catalog-transport.md; 01-F52, 01-F9 "plus org-scope reference data").
--
-- The published catalog: what the API publishes and this gateway serves to devices (founder
-- ruling, §6 Q1). ORG-scoped, never branch-scoped — 01-F52 is explicit, and it is why a
-- training branch mirrors production read-only (01-F49) with no special case anywhere.
--
-- Two tables rather than one because they answer two different questions, and splitting them
-- is what makes the atomicity story simple: `catalog_versions` is the COMMIT POINT (written
-- last, inside the publish transaction), so a reader that can see version N is guaranteed to
-- see every entry of version N. A reader that saw the version first could hand a device a
-- number it cannot fetch, and that device would then sit reporting itself up to date with a
-- menu it never received.
--
-- `catalog_entries` holds what CHANGED at each version, not a full menu per version. That
-- shape makes both device requests cheap out of one table: a DELTA from A to B is
-- `A < version <= B`, and a SNAPSHOT at V is the greatest `version <= V` per (kind, entry_id).
-- Storing a full menu per version would make the delta a diff — the expensive direction, and
-- the one that invites this service to start comparing entries, i.e. to start understanding
-- the menu it is supposed to be passing through untouched.
--
-- `deleted` is a TOMBSTONE (01-F55), not an absence: a reprint of an order placed before an
-- item was deleted must still render its name, so a delete travels as a marked row and a
-- snapshot carries its tombstones. The oracle round found the device side destroying every
-- tombstone on each snapshot recovery; carrying them explicitly here is what lets the device
-- stop inferring them.
--
-- Nothing here is ledger (01-F52). No event is written, no fold reads it, and `catalog.changed`
-- — which doc 14 emits for its own history view — plays no part in delivery.

CREATE TABLE "kernel"."catalog_versions" (
	"org_id" text NOT NULL,
	"version" bigint NOT NULL,
	"published_at" bigint NOT NULL,
	"actor_user_id" text,
	CONSTRAINT "catalog_versions_org_id_version_pk" PRIMARY KEY("org_id","version")
);
--> statement-breakpoint
CREATE TABLE "kernel"."catalog_entries" (
	"org_id" text NOT NULL,
	"version" bigint NOT NULL,
	"kind" text NOT NULL,
	"entry_id" text NOT NULL,
	"name" text NOT NULL,
	"kitchen_name" text,
	"parent_id" text,
	"sort" bigint,
	"deleted" bigint NOT NULL,
	CONSTRAINT "catalog_entries_org_id_version_kind_entry_id_pk" PRIMARY KEY("org_id","version","kind","entry_id")
);
--> statement-breakpoint
-- Both access paths in one index: the delta scan (org + version range) and the snapshot fold
-- (org + entity, greatest version).
CREATE INDEX "catalog_entries_org_kind_entry_version_idx" ON "kernel"."catalog_entries" USING btree ("org_id","kind","entry_id","version");
