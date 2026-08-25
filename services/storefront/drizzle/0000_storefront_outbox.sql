-- 06-F36 / 06-F30 — THE STOREFRONT ORIGIN'S DURABLE OUTBOX.
--
-- `06 §5` gives this module its own tables in cloud Postgres, so this is a `storefront` schema and
-- not a second writer of `kernel.*`. `18 §2` keeps services apart through packages and never
-- through a shared table: the gateway is the writer of every `kernel.*` row, this service holds
-- nothing of the gateway's, and the only thing that crosses between them is the wire.
--
-- ⚠ NO FOREIGN KEY, ANYWHERE, on `01-F68`'s reasoning carried across: an FK to an org or branch
-- record would refuse to persist an order for a tenant whose record has not replicated yet — which
-- is refusing a sale a customer has already placed (`01-F17`, commandment 4). Ordering is the
-- provisioning commands' job or nobody's.

CREATE SCHEMA IF NOT EXISTS "storefront";
--> statement-breakpoint
-- The origin's own row: `06-F36` (b)'s counter and `19 §5`'s write-checkpoint, one per
-- (org, branch) because `06-F30` fixes one origin per (org, branch).
--
-- `next_lamport` is advanced ONLY by the transaction that persists events (see
-- `outbox-postgres.ts`): the gateway's ingest is stop-at-gap per origin, so a slot reserved and
-- never written wedges this origin's watermark permanently. A counter that commits ahead of its
-- events is therefore not a small loss, it is a stopped storefront.
--
-- `acked_through` starts at -1 and NOT 0, because 0 is a real lamport slot — the origin's very
-- first event. Starting at 0 would mark that event acked before it was ever sent.
--
-- TWO COLUMNS FOR THE KEY, never a concatenation (`01-F71` (d)): `("ab","c")` and `("a","bc")` are
-- different tenants, and a separator-less key maps both onto one counter with no error in it.
CREATE TABLE "storefront"."origin" (
	"org_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"next_lamport" bigint NOT NULL,
	"acked_through" bigint NOT NULL,
	CONSTRAINT "storefront_origin_pk" PRIMARY KEY("org_id","branch_id")
);
--> statement-breakpoint
-- The outbox itself. One row per `01-F62` envelope this origin appended, verbatim.
--
-- THE PRIMARY KEY IS THE LAMPORT SLOT, and that is a correctness claim rather than bookkeeping: it
-- makes two events at one slot unrepresentable, which is the shape that would reach the gateway as
-- a `lamport_conflict` quarantine and cost the origin a permanently divergent stream (`01-F8`).
--
-- `event_id` carries its own unique index for `01-F8`'s other half — the same envelope must never
-- be enqueued twice under two slots, because the gateway would store the first and quarantine the
-- second as `id_content_divergence` while this origin went on believing both were sent.
--
-- ROWS ARE NEVER DELETED AND NEVER REWRITTEN except to set `acked`. A row deleted on SEND would be
-- gone before the gateway ever said it had it, which is precisely the ack this table exists to
-- wait for (`19 §5`). Compaction of acked rows is a retention question (`22`) and is deliberately
-- not invented here.
CREATE TABLE "storefront"."outbox" (
	"org_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"lamport_seq" bigint NOT NULL,
	"event_id" text NOT NULL,
	"envelope" jsonb NOT NULL,
	"acked" boolean NOT NULL,
	CONSTRAINT "storefront_outbox_pk" PRIMARY KEY("org_id","branch_id","lamport_seq")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "storefront_outbox_event_id_uq" ON "storefront"."outbox" USING btree ("event_id");
--> statement-breakpoint
-- The drain's only read: the unacked tail in lamport order. Partial, because the acked rows are
-- exactly the ones this index must never grow with — an outbox that has been draining for a year
-- is almost entirely acked, and the pending set stays small by construction.
CREATE INDEX "storefront_outbox_pending_idx" ON "storefront"."outbox" USING btree ("org_id","branch_id","lamport_seq") WHERE "acked" = false;
