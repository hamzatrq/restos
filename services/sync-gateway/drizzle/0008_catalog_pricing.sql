-- 01-F60 / 03-F50: the catalog entry gains its price grid and its kitchen station.
--
-- `prices` is jsonb — a `{branch_id, channel, price_paisa}` list — rather than a side table, on
-- the founder ruling this service is built on: the API publishes, the gateway SERVES. A
-- `catalog_prices` table would make this service join, filter and therefore understand pricing;
-- a column it passes through untouched keeps it a store. 01-F60 puts the completeness rule at
-- the WRITER (`publishCatalog`), not here.
--
-- Both are nullable and neither backfills: an existing published version legitimately carries
-- no prices (it predates 01-F60) and no station (absence is INHERITANCE under 03-F50, not
-- "none"). Backfilling either would invent data for menus already served to devices.
ALTER TABLE "kernel"."catalog_entries" ADD COLUMN "prices" jsonb;
--> statement-breakpoint
ALTER TABLE "kernel"."catalog_entries" ADD COLUMN "station" text;
