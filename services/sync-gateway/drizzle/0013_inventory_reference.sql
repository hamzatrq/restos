-- 10-F1 / 10-F3 / 10-F29 / 10-F30 / 10-F31 (+ 01-F21, 01-F75, 01-F76): THE INVENTORY REFERENCE
-- SET'S CLOUD STORAGE — items, their per-(location, area) membership rows, recipes and the
-- menu-recipe mapping, as ONE versioned publication log per org.
--
-- ⚠ FOUR KINDS, NOT `plans/inventory/design.md` §6's SIX. That paragraph names suppliers and
-- supplier items in the row union; `packages/inventory`'s `ReferenceData` — the ONE declaration of
-- this shape (`18 §2`), and the only thing that reads it — has exactly `items`, `areas`, `recipes`
-- and `menu_recipes`. A supplier kind here would be a column nothing folds, on a table whose whole
-- argument is that it stores what the arithmetic consumes. `10-F13`/`10-F14`'s supplier ledger is
-- real and is slice 1 step 5's editor work; when it lands it lands as a fifth kind on THIS table
-- (that is what the `kind` column is for) rather than as a second migration.
--
-- WHY THIS EXISTS AT ALL. `services/api`'s `10-F18` variance report has been hosted, gated and
-- correct since it landed, over `unconfiguredInventoryReference` — a port that REFUSES every read.
-- Measured 2026-08-25 on a real four-process stack, `inventory.variance` answered HTTP 500 for an
-- authenticated owner, because nothing anywhere stores the reference data the fold needs. This is
-- that storage. It is deliberately NOT a memory stub: `services/api/src/inventory.ts` spends a
-- paragraph on why a source answering `{ items: [] }` is the most dangerous shape available here
-- (a complete, confident, entirely empty report for a location that may be short any amount).
--
-- ⚠ THE SHAPE IS `0007`'s AND `0012`'s, AND THE REASONS TRANSFER WHOLE. `inventory_versions` is the
-- COMMIT POINT, written last inside the publish transaction, so a reader that can see version N is
-- guaranteed to see every entry of version N. `inventory_entries` holds what CHANGED at each
-- version, never a full reference set per version — which makes a delta a range scan rather than a
-- diff, and a diff is the direction that invites this service to start UNDERSTANDING the data it
-- passes through. Nothing here is ledger (`01-F52`'s reasoning, `01-F21`'s carrier): no event is
-- written, no fold reads it.
--
-- ⚠ ORG-SCOPED, AND THAT IS `01-F76` RATHER THAN A CONVENIENCE. An item's identity, its base unit,
-- its recipe and its two `10-F31` scope flags are org facts — the same tomato paste at two branches
-- is one item, which is the whole `10-F1` argument the design takes from Restaurant365. What is
-- per-LOCATION is the `item_locations` row (par, area membership, storage-layout sort), and that is
-- carried as a KIND inside this org-scoped artifact rather than as a second branch-scoped resource:
-- a device counting at one branch still needs the item's base unit and count units, so splitting
-- the set across two scopes would make a count sheet require two artifacts to render one line.
--
-- ⚠ ONE ROW UNION, NOT SIX TABLES, AND THE PAYLOAD IS `jsonb`. The six kinds have almost nothing in
-- common beyond identity — a recipe has lines, a supplier item has a pack triple, an item-location
-- has a par — so six tables would be six migrations, six serve paths and six chances for the served
-- shape to drift from `packages/inventory`'s `ReferenceData`, which is the ONE declaration
-- `18 §2` allows. The kind-specific fields are therefore opaque here and are validated in Zod at
-- the WRITER, which is where `10-F31`'s R1–R5 refusals already live (`referenceRefusals`) and where
-- `14-F29`/`01-F60`'s precedent puts completeness. This service stores bytes and serves them back;
-- it has no opinion about a recipe.
--
-- ⚠ `deleted` IS A TOMBSTONE (`01-F55`, R26), NOT AN ABSENCE, on `0007`'s reasoning applied to a
-- sharper case: a variance report for a CLOSED period must still name an item that was retired
-- last week, and `10-F18`'s report is a difference of two counts, so an item that vanishes from the
-- reference set between them turns a real gap into a missing row. A departure is a marked entry.
--
-- ⚠ NO FOREIGN KEY, on `0010`/`0011`/`0012`'s reasoning unchanged. Nothing here references
-- `kernel.orgs`, `kernel.branches` or `kernel.catalog_entries` — and the last one is the
-- interesting restraint: a `menu_recipe` row names a sellable by `(kind, entry_id)` and a recipe by
-- id, and completeness across that edge is the WRITER's (`10-F8` reports coverage gaps rather than
-- refusing them, because `01-F17` forbids a sale blocked on inventory data).
--
-- ADDITIVE ONLY: two CREATEs and one index. Nothing is dropped, renamed or tightened.

CREATE TABLE "kernel"."inventory_versions" (
	"org_id" text NOT NULL,
	"version" bigint NOT NULL,
	"published_at" bigint NOT NULL,
	"actor_user_id" text,
	CONSTRAINT "inventory_versions_org_id_version_pk" PRIMARY KEY("org_id","version")
);
--> statement-breakpoint
-- `kind` holds the closed set `item | area | recipe | menu_recipe`.
-- CLOSED SETS CARRY NO CHECK here, exactly as `catalog_entries.kind`, `orgs.status`,
-- `branch_type`, `branch_class` and `device_class` already do — one interpretation of a closed set,
-- in Zod, at the writer.
--
-- `entry_id` is unique WITHIN A KIND and not across the artifact: an item and a recipe may share an
-- id without colliding, which is why the primary key carries both columns rather than treating the
-- id as globally unique. That is `catalog_entries`' key exactly.
CREATE TABLE "kernel"."inventory_entries" (
	"org_id" text NOT NULL,
	"version" bigint NOT NULL,
	"kind" text NOT NULL,
	"entry_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"deleted" bigint NOT NULL,
	CONSTRAINT "inventory_entries_org_id_version_kind_entry_id_pk" PRIMARY KEY("org_id","version","kind","entry_id")
);
--> statement-breakpoint
-- The snapshot fold — `org + kind + entry, greatest version <= V`. ⚠ Its sibling in `0012` carries
-- a measured warning that the equivalent index is NOT the one the delta scan uses (the primary key
-- is, because it orders `version` third and a version RANGE can be a leading condition there).
-- That is expected to hold here for the same structural reason, and it is NOT re-measured on this
-- table — stated so the next reader knows this claim is inherited rather than observed.
CREATE INDEX "inventory_entries_org_kind_entry_version_idx" ON "kernel"."inventory_entries" USING btree ("org_id","kind","entry_id","version");
