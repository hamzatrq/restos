-- 01-F62 (closes DEC-SYNC-012): the ORG-SCOPED event store.
--
-- `EventEnvelope` requires branch_id, branch_created_at and time_basis because 01-F43..F46 make
-- time branch-consensus and stamped at append by an originating DEVICE. A back-office catalog
-- edit has neither a branch nor a hub, so 14-F3's required `catalog.changed` had no legal
-- envelope. 01-F62 rules shape (c): it lands in an org-scoped audit store that is NOT the branch
-- ledger — it never enters a branch stream and no device folds it.
--
-- So this table is deliberately NOT `kernel.events` with a nullable branch: no branch_id, no
-- branch stamp, no device_id, no global_seq (a branch delivery cursor) and no lamport_seq (a
-- per-device chain). The rejected alternative (a) would have put a server value into
-- branch_created_at, making a branch column carry a non-branch value.
--
-- `server_received_at` is the ordering authority (01-F18, 01-F62). `seq` is a surrogate arrival
-- order and NOT an authority a reader may interpret: server_received_at is a millisecond, and a
-- 14-F8 bulk edit writes several records at one instant ON PURPOSE (one 14-F3 history row per
-- item), so reading them back needs a stable tiebreak.
--
-- Append-only (01-F1): no UPDATE and no DELETE of this table exists anywhere in this package.

CREATE TABLE "kernel"."org_events" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"type" text NOT NULL,
	"actor_user_id" text,
	"server_received_at" bigint NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
-- The one read path: an org's history in 01-F18 order, tiebroken by arrival.
CREATE INDEX "org_events_org_received_seq_idx" ON "kernel"."org_events" USING btree ("org_id","server_received_at","seq");
