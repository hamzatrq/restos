-- 01-F87 — the layer-2 CONFIGURATION plane's published artifact (00 §7, founder rulings R55/R60/
-- R63/R70/R71).
--
-- `config` is 01-F75's FOURTH reference-data resource. The event half of the plane —
-- `config.changed` — already has a home: it is ORG-SCOPED under 01-F62 and lands in `org_events`
-- (0009), which is why nothing here writes an event. This migration is the VALUE half.
--
-- Two tables rather than one, for `catalog_publication` (0007)'s stated reason: `config_versions`
-- is the COMMIT POINT, written LAST inside the publish transaction, so a reader that can see
-- version N is guaranteed to see every entry of version N. A reader that saw the version first
-- could hand a device a number it cannot fetch, and that device would then sit reporting itself
-- up to date with a tax rate it never received.
--
-- `config_entries` holds what CHANGED at each version, not a full settings set per version. That
-- shape makes both device requests cheap out of one table: a DELTA from A to B is
-- `A < version <= B`, and a SNAPSHOT at V is the greatest `version <= V` per key.
--
-- ORG-scoped with NO branch column. 01-F87 rules this rather than leaving it to an implementer:
-- `00 §7` names layer 2 "Organization (back office)" and 01-F62's emitter test already puts
-- `config.changed` on the org side, so the artifact and the event agree. Layer-2 keys WITH a
-- branch axis are ordinary and already shipping (03-F51's station routes, 01-F60's enabled
-- `(branch, channel)` set) — and that axis is DATA inside one org artifact, because a
-- branch-scoped artifact would make one version number mean different bytes on different devices,
-- destroying the premise 01-F56's divergence detection rests on. The staff roster's opposite
-- answer does not transfer: 01-F76 scopes `staff` to a branch BECAUSE it carries an Argon2id hash
-- and its scope is its blast radius (11-F21), and measured against `00 §7`'s layer-2 list no
-- layer-2 key carries key material, a hash or a credential.
--
-- `deleted` is a RESET, not a row removal (01-F75: "a departure is a MARKED entry and never an
-- absence"). A key an owner has reset returns to its DECLARED BUILD DEFAULT (01-F87 (b)), and the
-- mark is what lets a DELTA state that at all — a key that merely stopped appearing is
-- indistinguishable from a page that has not arrived.
--
-- `value` carries no CHECK and that is deliberate. 01-F87 (a) makes the key space OPEN and the
-- value typed BY THE KEY; the validation is `@restos/domain/config`'s `refuseConfigWrite` at the
-- writer, which is the ONE declaration 14-F48 requires by name. A CHECK here would be a second,
-- silently-disagreeing copy of it, expressed in SQL where no FR id can be cited.

CREATE TABLE "kernel"."config_versions" (
	"org_id" text NOT NULL,
	"version" bigint NOT NULL,
	"published_at" bigint NOT NULL,
	"actor_user_id" text,
	CONSTRAINT "config_versions_org_id_version_pk" PRIMARY KEY("org_id","version")
);
--> statement-breakpoint
CREATE TABLE "kernel"."config_entries" (
	"org_id" text NOT NULL,
	"version" bigint NOT NULL,
	"key" text NOT NULL,
	"value" jsonb,
	"deleted" bigint NOT NULL,
	CONSTRAINT "config_entries_org_id_version_key_pk" PRIMARY KEY("org_id","version","key")
);
--> statement-breakpoint
-- The SNAPSHOT fold's access path (org + key, greatest version). The DELTA scan's leading range
-- condition is served by the primary key, which orders `version` second — `staff_entries`' index
-- note records that measurement (EXPLAIN against a real Postgres) and this follows it rather than
-- repeating the claim its predecessor got wrong.
CREATE INDEX "config_entries_org_key_version_idx" ON "kernel"."config_entries" USING btree ("org_id","key","version");
