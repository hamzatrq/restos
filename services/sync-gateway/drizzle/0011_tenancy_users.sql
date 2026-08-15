-- 11-F20 / 15-F26 / 15-F27: the PERSON as a stored record — the fourth table of the tenancy
-- directory, and the one that turns "the only owner this deployment has" from three environment
-- variables into a row.
--
-- `01 §5` has listed `orgs/branches/users/roles` among the cloud tables since Draft 1. `0010` added
-- the first two; this adds the third. (`roles` is NOT a table and is not owed one: `01-F26`'s roles
-- are a CLOSED set declared in `packages/domain`'s permission matrix, and a table of them would be
-- a second interpretation of a set the matrix already fixes — `03-F40`'s two sensor bit layouts,
-- the defect `schema.ts` cites for every closed set in this schema.)
--
-- ⚠ WHAT THIS REPLACES, so that the shape is read as a fix rather than a preference.
-- `services/api/src/server.ts` assembles ONE owner at boot from `BOOTSTRAP_OWNER_EMAIL` /
-- `BOOTSTRAP_OWNER_PASSWORD_HASH` / `BOOTSTRAP_ORG_ID` into `createMemoryUserStore` — a process-local
-- `Map` that dies with the process. `15-F26` names that as a stopgap standing in a provisioning
-- step's place. So: one org, one user, no way to make a second of either, and a restart is a
-- migration.
--
-- ⚠ NO FOREIGN KEY, on `0010`'s reasoning applied unchanged. `users.org_id` does not reference
-- `kernel.orgs`. `01-F68` forbids a ledger-table FK outright and `0010` extended the restraint to
-- the directory's own edges; the same argument holds here and one more besides — this table is read
-- on the LOGIN path by a second service, and a referential failure there is a restaurant that
-- cannot get into its own back office. Ordering is the writer's job (`15-F27`): `create-owner`
-- refuses an org with no record, by name.
--
-- ⚠ ONE WRITER, TWO READERS, AND THE SPLIT IS DELIBERATE (`18 §4`: every table owns exactly one
-- writer service). The writer is `services/sync-gateway` — this schema's sole writer since
-- T-01-07, and where every other provisioning command already lives. `services/api` READS this
-- table on the login path (`createPostgresUserStore`) and never writes it; user CRUD (`14-F14`) is
-- owed and, when it lands, lands as an API call into a writer here or as a spec change that moves
-- the table. Two services connecting to one Postgres is not a cross-service import (`18 §2` bans
-- the import, not the database), and the alternative — a second users table in a second schema —
-- is two answers to "who is the owner of this org".
--
-- CLOSED SETS CARRY NO CHECK, exactly as `orgs.status`, `branch_type`, `branch_class`,
-- `device_class` and `catalog_entries.kind` already do: `assignments` holds `01-F26`'s
-- `(role, branch_id|null)` pairs as jsonb and the ROLE vocabulary is validated at the writer, in
-- Zod, against `packages/domain`'s `ROLES`. One interpretation of a closed set, in one place.
--
-- `password_hash` IS NOT NULL AND HOLDS AN ARGON2ID PHC STRING, NEVER A PASSWORD (`01-F61`'s cost
-- floor via `domain`'s `hashPin`, which is `01-F26`'s single hashing story). It is NOT NULL rather
-- than nullable because a user row that cannot authenticate is a user who does not exist for every
-- purpose this product has, and `15-F26`'s set-credential link — which is what a nullable column
-- would be preparing for — needs a redemption surface behind `14-F1` that does not exist yet
-- (`15-F27` names that gap). Making this column nullable when that lands is a legal, additive
-- ALTER; shipping it nullable now would mean shipping rows nothing can log in as.
--
-- EMAIL IS UNIQUE CASE-FOLDED AND **GLOBALLY**, not per org, because that is what the login path
-- actually does: `UserStore.findByEmail` takes an email and nothing else — `AuthSubject`'s org
-- comes FROM the user record (`01-F71` (b): the org is taken from the authenticated subject and
-- never from the request), so a per-org unique index would admit two rows one lookup cannot choose
-- between. The residual is stated: one human wanting an account in two orgs needs two emails, which
-- is `backoffice-catalog.md` Q3's open multi-org question and not this migration's to answer.
--
-- ADDITIVE ONLY: one CREATE and two indexes. Nothing existing is dropped, renamed or tightened.

CREATE TABLE "kernel"."users" (
	"user_id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"assignments" jsonb NOT NULL,
	"grid_ordinal" bigint NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
-- The login lookup, and the constraint that makes it single-valued. `lower()` because an email is
-- not case-sensitive in its local use and `createMemoryUserStore` already folded it — a durable
-- store that folded on read but not on write would admit `Owner@x` and `owner@x` as two accounts
-- and then serve whichever the planner reached first.
CREATE UNIQUE INDEX "users_email_lower_uq" ON "kernel"."users" USING btree (lower("email"));
--> statement-breakpoint
-- The only other read path: one org's people (`14-F14`'s list, `15-F27`'s read-back).
CREATE INDEX "users_org_idx" ON "kernel"."users" USING btree ("org_id");
