-- 01-F80 / 01-F73 / 01-F81: THE PAIRING CODE'S CLOUD STORAGE — a pending-pairing table, an
-- org's two keypairs, and the two columns `device_registry` needed to record what a claim issued.
--
-- ⚠ THE ONE DESIGN DECISION THIS SCHEMA MAKES, AND IT IS NOT IN ANY FR: HOW A CLAIM FINDS ITS ROW.
-- `01-F80` (b) requires the cloud to store "an Argon2id hash at 01-F61's cost floor and never the
-- code", and an Argon2id hash carries a random salt, so it CANNOT be looked up by. The three
-- candidates, with the reason for the choice:
--   (i)  scan every live pending row and Argon2id-verify each — correct, and a denial of service
--        by construction: one guess costs N verifications at the cost floor (~0.6 s each here), so
--        an attacker with no code at all can spend the deployment's CPU, which is the outcome
--        `01-F80` (e) refuses in its own words ("never lock the deployment").
--   (ii) store part of the code in the clear as a selector — cheap, and it spends the entropy
--        (b) sizes against an online guess; 26.6 bits is already stated to be the whole defence.
--   (iii) A BLIND INDEX: `code_index` is HMAC-SHA256(deployment key, code), deterministic so one
--        SELECT finds the row, and keyed so it is not a hash anybody holding a database dump can
--        reverse. That is what (b)'s own stated property asks for — "a database read then hands
--        over no live pairing" — and the Argon2id verifier still gates the claim, so the index is
--        a LOOKUP and never the check.
-- (iii) is what this table stores. The key is derived from the deployment's device-token secret
-- through a labelled HMAC (`pairing.ts`), never the secret itself: one secret, two purposes,
-- separated by construction rather than by hoping nobody notices.
--
-- ⚠ AN EXPIRED PENDING ROW IS KEPT AND IS NOT SWEPT. `01-F80` (c) says an unclaimed code that
-- expires "leaves nothing — no registry row, no certificate, no device, nothing to clean up", and
-- that clause is about DEVICES. Deleting the pending row would make `01-F80` (f)'s `expired` and
-- `unknown_code` indistinguishable — the FR distinguishes them deliberately ("an owner reading
-- yesterday's code off a note needs to be told to re-issue rather than left doubting her typing"),
-- so the row survives its code and holds no credential, only a verifier nothing can use.
--
-- NO FOREIGN KEY, on `0010`/`0011`/`0012`'s reasoning unchanged: nothing here references
-- `kernel.orgs`, `kernel.branches` or `kernel.device_registry`. Completeness is the WRITER's.
--
-- CLOSED SETS CARRY NO CHECK — `device_class` is `01-F39`'s vocabulary, validated in Zod at the
-- writer exactly as `device_registry.device_class` already is.
--
-- ADDITIVE ONLY: two CREATEs, one index and two nullable ADD COLUMNs.

-- 01-F80 (a)/(b)/(c)/(d): ONE PENDING PAIRING. The owner minted it; no device exists yet.
--
-- `code_index` is the PRIMARY KEY and not `device_id`, because the lookup this table exists for is
-- by code: `01-F80` (a) says "a code resolves to exactly one pending pairing DEPLOYMENT-WIDE", so
-- the code's index is the deployment-wide key and a collision at mint is a re-draw.
--
-- `claimed_at` + `claimed_key_fingerprint` are `01-F80` (d) verbatim: "the pending row records the
-- fingerprint of the key it issued over". They are what make a retry a retry rather than a second
-- device — the same code with the SAME public key returns the SAME certificate, and every other
-- presentation is `already_claimed`.
CREATE TABLE "kernel"."device_pairings" (
	"code_index" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"device_id" text NOT NULL,
	"device_class" text NOT NULL,
	"display_name" text NOT NULL,
	"code_hash" text NOT NULL,
	"minted_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL,
	"actor_user_id" text,
	"claimed_at" bigint,
	"claimed_key_fingerprint" text
);
--> statement-breakpoint
-- 14-F41's waiting row: "a WAITING row joins the list under the name she typed". One org's pending
-- pairings, which is the only read this table has besides the claim's key lookup.
CREATE INDEX "device_pairings_org_branch_idx" ON "kernel"."device_pairings" USING btree ("org_id","branch_id");
--> statement-breakpoint
-- 01-F73 (b) + 01-F81 (c): AN ORG'S TWO KEYPAIRS, AND THEY ARE TWO ON PURPOSE.
--
-- The issuer signs device certificates; the roster-signing key signs `01-F81`'s device roster.
-- `01-F81` (c): "THE SIGNING KEY IS NOT THE ISSUING KEY, AND THAT IS FORCED BY 01-F74 (c) RATHER
-- THAN CHOSEN" — one key doing both jobs makes "a compromised issuer still cannot admit a device
-- the roster does not name" false, because that issuer would mint the certificate AND sign a
-- roster naming its fingerprint. Two columns, one row, so they cannot drift apart per org.
--
-- PER ORG and never platform-wide (`01-F73` (b), `01-F71`): a roster from one org must be
-- STRUCTURALLY incapable of admitting a device from another.
--
-- ⚠ PRIVATE KEY MATERIAL IS IN THIS TABLE AND IN NO OTHER. `01-F73` (b·i) has the device "never
-- hold issuing material", so neither private column below may ever appear in a response — the
-- claim reply carries `issuer_cert_pem` and `roster_signing_public_key_pem` and nothing else from
-- this row. Where the issuing key ultimately LIVES is still open (`01-F73` (f) defers it to docs
-- 15/29); this is the cloud-plane answer that clause names as one of its two candidates, and
-- moving it under an offline root later changes this table and no caller.
CREATE TABLE "kernel"."org_pki" (
	"org_id" text PRIMARY KEY NOT NULL,
	"issuer_cert_pem" text NOT NULL,
	"issuer_private_key_pem" text NOT NULL,
	"roster_signing_public_key_pem" text NOT NULL,
	"roster_signing_private_key_pem" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
-- 01-F81 (a)/(f): WHAT THE CLAIM ISSUED, RECORDED WHERE THE ROSTER IS BUILT FROM.
--
-- (f) names the producer of the roster artifact as "the registry WRITE (01-F80's claim, 14-F13's
-- revocation)", and (a) puts "the certificate fingerprint as lowercase hex SHA-256 of the DER" on
-- every roster row — so the fingerprint belongs on the row the roster is folded from, or
-- `01-F74` (c)'s pin half is unbuildable and the chain alone "admits anything the issuer ever
-- signed, including a device revoked an hour ago".
--
-- `certificate_pem` is stored beside it and is not a duplicate of the fingerprint: `01-F80` (d)
-- requires a retry inside the TTL to return THE SAME certificate, and a certificate's validity
-- window is stamped from the issuing instant — re-issuing at a later instant produces different
-- bytes for the same identity. The only way to return the same one is to have kept it.
--
-- Both NULLABLE and neither backfilled, on `0005`/`0008`/`0010`'s precedent: every device
-- registered before pairing existed was provisioned by `provision-device` and holds no LAN
-- credential at all, which is true rather than missing.
ALTER TABLE "kernel"."device_registry" ADD COLUMN "certificate_pem" text;--> statement-breakpoint
ALTER TABLE "kernel"."device_registry" ADD COLUMN "certificate_fingerprint" text;
