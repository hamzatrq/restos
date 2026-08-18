-- 01-F75 / 01-F76 / 11-F21 / 11-F22 / 11-F23 (+ R25, R30, R32): THE STAFF ROSTER'S CLOUD STORAGE —
-- a publication log with its own version axis, the device-plane PIN credential in its own table,
-- and the two columns `kernel.users` was missing to carry a person at all.
--
-- ⚠ THE TRAP THIS SHAPE EXISTS TO AVOID, stated first because the plausible wrong answer compiles.
-- `kernel.users` is CURRENT STATE with no version column; the catalog's storage is an
-- append-per-version publication log (`0007`). Assembling a served roster from current `users` rows
-- at serve time passes almost everything and means a device that fetched v3 last week and asks for
-- a delta today silently receives TODAY's people labelled as last week's version — the one thing
-- `01-F56`'s monotonic apply cannot detect, because the version number it compares is correct.
-- So the roster gets a real log: `staff_versions` is the commit point and `staff_entries` is what
-- CHANGED at each version, exactly `catalog_versions`/`catalog_entries`' shape and for exactly its
-- reasons (a snapshot at V is the greatest `version <= V` per user). What is NOT copied is the KEY:
-- the catalog is org-scoped (`01-F52`) and this is branch-scoped (`01-F76`, R25 — "the roster's
-- scope IS its credential blast radius").
--
-- ⚠ AND WHAT IS ALSO NOT COPIED IS THE DELTA. This paragraph said "a delta from A to B is
-- `A < version <= B`" — the catalog's inherited description, OVERRULED by `01-F75` at `6e30636`
-- because on a resource carrying credentials it replays history: a cashier published `active` with
-- a hash at v2 and departed at v3 was served her v2 row, hash and all, to any caller that said
-- `have_version: 1`. A delta carries ONE entry per changed id, the greatest version <= the target.
-- The STORAGE is unchanged by that clause — the same log answers both readings — so this is a
-- comment correction and not a schema one; it is corrected in place because a comment restating an
-- overruled rule is how the next session reintroduces it, and this sentence had already been copied
-- into `staff.ts`'s header and into the oracle's §C2.
--
-- ⚠ THE ARTIFACT KEY IS `(org_id, branch_id)` AS TWO COLUMNS, NEVER A CONCATENATION (`01-F71` (d),
-- quoted by `01-F76`): `("ab","c")` and `("a","bc")` are distinct tenants and a separator-less key
-- maps both to one delivery set, "which is a cross-tenant leak with no error in it". Two columns is
-- what makes that structural rather than a discipline.
--
-- ⚠ NO FOREIGN KEY, on `0010`/`0011`'s reasoning applied unchanged — `01-F68` forbids one from any
-- ledger table ever and this schema extends the restraint to the directory's own edges. Nothing
-- here references `kernel.users`, `kernel.orgs` or `kernel.branches`. Completeness is the WRITER's
-- (`15-F27`, `publishStaffRoster`): a publish naming another org's person, or a person record
-- naming a branch of another org, is refused there or nowhere.
--
-- ⚠ PARTICIPATION IS PER-(PERSON, BRANCH) AND THERE IS THEREFORE NO `users.status` COLUMN
-- (`11-F22`, disambiguated August 2026). The FR carried both readings — its heading says "a PERSON
-- RECORD carries a participation status" and its transfer clause requires a cashier moving A→B to be
-- "`inactive` in A's roster and `active` in B's at the same moment" — and the transfer clause is the
-- operative one, because no single per-person column can express it. **The first draft of this
-- migration added the column**, and the cost was measured on a real database: deactivating her at A
-- destroyed the credential B's artifact needs (an `active` member with no hash, the defect `11-F23`
-- names), and any later republish at A re-copied her CURRENT status and silently returned a departed
-- cashier to `active` with a working PIN hash on her old branch's tills. So the status is carried
-- where `01-F26` already carries the relationship — INSIDE each element of `users.assignments` —
-- and the only thing this migration does to `kernel.users` for `11-F22` is BACKFILL that field.
--
-- CLOSED SETS CARRY NO CHECK, exactly as `orgs.status`, `branch_type`, `branch_class`,
-- `device_class` and `catalog_entries.kind` already do. Each assignment's `status` and
-- `staff_entries.status` hold `11-F22`'s `active | inactive` and are validated in Zod at the writer,
-- through `packages/domain`'s `PersonAssignment`. One interpretation of a closed set, in one place.
--
-- ADDITIVE ONLY: three CREATEs, one index, one ALTER that RELAXES, and one data backfill. Nothing is
-- dropped, renamed or tightened, and `users_email_lower_uq` is deliberately untouched (see below).

-- 11-F23: THE DEVICE-PLANE PIN HASH LIVES IN ITS OWN TABLE, NOT AS A NINTH COLUMN ON `users`.
--
-- The argument is `11-F21`'s own, followed to its end: `services/api`'s login reads the user row by
-- email, and on a ninth column it "would hold every logged-in owner's *cashiers'* PIN hashes in the
-- memory of a request that has no use for them. A separate table means the login lookup cannot
-- return the credential BECAUSE IT DOES NOT JOIN TO IT — a structural bound rather than a
-- discipline." It also expresses `11-F21`'s active-only rule as an ABSENCE rather than a NULL: a
-- column makes it a nullable field every reader must remember to check, a table makes it NO ROW,
-- and the publisher's `left join` produces `01-F75`'s specified shape without a branch.
--
-- Keyed `(org_id, user_id)` although `users.user_id` is already globally unique: every read of a
-- credential is then scoped by org by construction, which is `01-F71`'s isolation boundary made
-- structural rather than remembered. `pin_hash` is an Argon2id PHC string from `domain`'s
-- `hashPin` (`01-F61`'s cost floor, `01-F26`'s single hashing story) and NEVER a PIN — `11-F21`:
-- "a PIN exists in exactly two places … the keypad it is typed on and the argument to a verify
-- call". `updated_at` is bookkeeping, so this is the one table here whose rows are UPDATEd (a PIN
-- reset, `14-F14`) and DELETEd (R32 — a deactivated person's credential does not outlive her
-- employment). Neither is `01-F1`: that law reaches the ledger, and a credential is not history.
CREATE TABLE "kernel"."user_credentials" (
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"pin_hash" text NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "user_credentials_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
-- 01-F75 / 01-F76: the publication VERSION axis, per `(resource, scope)` key. This table is the
-- resource `staff`; the scope is the two columns below.
--
-- A row here is the COMMIT POINT, exactly as `catalog_versions` is: entries are written first and
-- this row last, so a reader that sees version N is guaranteed to see every entry of version N.
-- Versions are strictly increasing PER KEY and mean nothing across keys — `01-F76`: "two devices
-- both at 'staff v7' hold different bytes when they are at different branches — safe ONLY because
-- the key travels with the number and is compared."
--
-- `branch_id` is NOT NULL although `01-F76`'s scope shape is `{ org_id, branch_id }` with null
-- meaning ORG scope. That is not this table refusing the shape: it is the primary key requiring a
-- value, and the roster has no org-scoped artifact to store — `01-F76` makes it branch-scoped
-- outright, and `publishStaffRoster` refuses a null branch BY NAME so the refusal is a sentence
-- rather than a constraint violation.
CREATE TABLE "kernel"."staff_versions" (
	"org_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"version" bigint NOT NULL,
	"published_at" bigint NOT NULL,
	"actor_user_id" text,
	CONSTRAINT "staff_versions_org_id_branch_id_version_pk" PRIMARY KEY("org_id","branch_id","version")
);
--> statement-breakpoint
-- 01-F75's `staff` ROW, as the artifact carries it — what CHANGED at each version, never a full
-- roster per version (the same choice `catalog_entries` makes, and for the same reason: a full
-- roster per version makes the delta a diff, which is the expensive direction and the one that
-- invites this service to start comparing people).
--
-- `status` is `11-F22`'s, and it is STORED PER VERSION rather than read from `kernel.users` at
-- serve time. That is the whole point of the log: at version 2 a member who was later deactivated
-- still reads `active`, because that is what was published. A DEPARTURE IS A MARKED ENTRY AND NEVER
-- AN ABSENCE (R26, `01-F75`) — there is no removals list and no tombstone column, because dropping
-- her degrades "a past order, a reprint, a shift report and 02-F23's reconciliation" to a raw UUID.
--
-- `pin_hash` is NULLABLE and its absence is the SPECIFIED SHAPE (`11-F21`, `01-F75`): the hash
-- rides only an `active` entry, because "a hash on a non-`active` entry is a credential no verifier
-- can ever reach: pure blast radius with no function". A validator that refuses a missing one is
-- `01-F17`'s stopped till arriving through the identity path. It is a COPY of the credential as it
-- stood at publication, not a join — `11-F23` puts the `left join` in the publisher, and a served
-- artifact has to be the bytes that were published or a delta cannot be constructed from an exact
-- base. Its residual is stated rather than discovered: R32 deletes a departed person's live
-- credential, and this log still holds the hash that was published while she was active. That is
-- commandment 1's append-only property, not a leak of anything a device did not already receive.
--
-- `grid_ordinal` is `01-F61`'s explicit position, carried per entry so the device orders the
-- identification grid by a STATED number and never by a derived one — "ordering by `user_id`, name
-- or recency inserts a new hire wherever it sorts and shifts every tile after it". Uniqueness is
-- "within the artifact" (`01-F75`) and is therefore enforced at the publisher against the FOLDED
-- artifact; whether the cloud enforces it more widely "is a storage choice this FR does not make",
-- and this migration deliberately does not make it — an org-wide unique index would forbid two
-- branches from both starting their grid at position 1, which `01-F75` permits.
CREATE TABLE "kernel"."staff_entries" (
	"org_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"version" bigint NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"grid_ordinal" bigint NOT NULL,
	"status" text NOT NULL,
	"assignments" jsonb NOT NULL,
	"pin_hash" text
);
--> statement-breakpoint
ALTER TABLE "kernel"."staff_entries" ADD CONSTRAINT "staff_entries_org_id_branch_id_version_user_id_pk" PRIMARY KEY("org_id","branch_id","version","user_id");
--> statement-breakpoint
-- ⚠ THE DELTA SCAN DOES NOT USE THIS INDEX; IT USES THE PRIMARY KEY. This line claimed "both
-- access paths in one index, as `catalog_entries_org_kind_entry_version_idx` already is" — copied
-- from a claim `plans/wave-1/oracle-round-2-findings.md` A19 had ALREADY measured false on the
-- catalog, where that index is dead on the snapshot path outright. Measured here with
-- `EXPLAIN (analyze, buffers)` on Postgres 16, 2026-08-18, freshly `ANALYZE`d, 20 branches x 50
-- versions x 20 people = 20 000 entries:
--   snapshot fold (version <= N)          -> Bitmap Index Scan on THIS index          (84 buffers)
--   delta fold (version > A and <= B)     -> Index Scan using the PRIMARY KEY         (36 buffers)
--   staffVersion's max(version)           -> Index Only Scan Backward on the PK        (3 buffers)
-- The PK orders `version` third, so a version RANGE is a leading index condition there and cannot
-- be one here, where `user_id` takes that position. What this index buys is the snapshot fold, and
-- narrowly: dropping it re-plans that query onto the PK's bitmap at 89 buffers against 84. It is
-- KEPT — an index change is its own migration and one machine at 20 000 rows is not the evidence
-- for one — but the sentence now says what EXPLAIN said instead of what the shape suggests.
CREATE INDEX "staff_entries_org_branch_user_version_idx" ON "kernel"."staff_entries" USING btree ("org_id","branch_id","user_id","version");
--> statement-breakpoint
-- 11-F22: the participation status, BACKFILLED INTO EACH ASSIGNMENT rather than added as a column.
-- `kernel.users` could not hold a departure at all before this, so `14-F14`'s "deactivation
-- preserves historical attribution" was unstorable and the device plane invented the opposite
-- answer (hard removal).
--
-- A BACKFILL AND NOT A DEFAULT, and the two are different claims. Rows written before this exist
-- and are current staff, so `active` is the only honest value for them — that is `01-F68`'s
-- reconciliation, the same move `0010` made for a null `display_name`. What `0012`'s first draft did
-- instead was `ADD COLUMN status text DEFAULT 'active' NOT NULL` followed by `DROP DEFAULT`, so the
-- backfill could not become a standing licence; the same discipline applies here and is stronger,
-- because jsonb has no defaults at all — the requirement lives at the writer, in Zod, and an
-- assignment reaching `insertUser` without a status is refused by name (`11-F22`, `01-F75`).
--
-- `WITH ORDINALITY` + `ORDER BY ord` because `jsonb_agg` over a set has no inherent order: nothing
-- reads assignment order today, and silently reversing it in a migration is the kind of change that
-- is discovered later by a reader who assumed it was stable. The `? 'status'` guard makes the
-- statement idempotent against a row that already carries one, and `coalesce` covers a person with
-- an empty assignment array, where `jsonb_agg` over zero rows returns NULL and would otherwise
-- destroy the column's NOT NULL.
UPDATE "kernel"."users" u
SET "assignments" = coalesce(
      (
        SELECT jsonb_agg(
                 CASE WHEN a ? 'status' THEN a ELSE a || '{"status":"active"}'::jsonb END
                 ORDER BY ord
               )
        FROM jsonb_array_elements(u."assignments") WITH ORDINALITY AS t(a, ord)
      ),
      '[]'::jsonb
    );
--> statement-breakpoint
-- R30 (founder): a cashier who only uses the till needs NO email — email is required only for
-- BACK-OFFICE access. `11-F21` gives her a PIN as her working credential, and an owner made to
-- supply an address she does not have "puts a wrong address permanently into a directory 11-F20
-- never deletes from".
--
-- ⚠ `users_email_lower_uq` IS DELIBERATELY UNTOUCHED, and dropping it is the migration mutant this
-- relaxation invites. Postgres permits multiple NULLs in a unique index, so the index survives
-- unchanged and goes on doing its job — R30 "removes the requirement to HAVE an address, not the
-- rule about two people sharing one" (`11 §9.6`), and `28 §9.18`'s global-uniqueness rule is
-- untouched. Dropping it would make the login lookup multi-valued, which is the one thing
-- `0011` chose a global index to prevent.
ALTER TABLE "kernel"."users" ALTER COLUMN "email" DROP NOT NULL;
