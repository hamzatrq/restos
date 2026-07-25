// T-01-07 Postgres data contract (binding — plans/wave-0/kernel-tasks.md T-01-07;
// owning spec 01 §3/§5): the four original kernel-schema tables, plus the
// T-01-08 quarantine-notice outbox (DEC-SYNC-008) and the T-01-09 device
// registry — six in all. sync-gateway is the sole writer of all six (18 §4).
// No UPDATE or DELETE of kernel.events exists anywhere in this
// package (01-F1 append-only ledger; quarantine/registry rows are mutable —
// heal-in-place T-01-11, revocation T-01-09 — but the event ledger never is).
// Ids are text, not
// uuid — the storage layer must not tighten the wire contract (assumption 11).
// envelope jsonb is verbatim-as-received; the two cloud-stamped values live in
// their own columns and are merged into the envelope at serve time (assumption 12).
import { bigint, index, jsonb, pgSchema, primaryKey, text, unique } from "drizzle-orm/pg-core";

export const kernel = pgSchema("kernel");

/** Merged org log (01-F3/01-F7): retained forever (01 §5); no partitioning at v1 (assumption 1). */
export const events = kernel.table(
  "events",
  {
    id: text("id").primaryKey(),
    org_id: text("org_id").notNull(),
    branch_id: text("branch_id").notNull(),
    device_id: text("device_id").notNull(),
    lamport_seq: bigint("lamport_seq", { mode: "number" }).notNull(),
    global_seq: bigint("global_seq", { mode: "number" }).notNull(),
    server_received_at: bigint("server_received_at", { mode: "number" }).notNull(),
    envelope: jsonb("envelope").notNull(),
  },
  (t) => [
    unique("events_org_global_seq_uq").on(t.org_id, t.global_seq),
    // The T-01-03 lamport-collision-is-corruption law, cloud side.
    unique("events_org_device_lamport_uq").on(t.org_id, t.device_id, t.lamport_seq),
    // Catchup paging (01-F9): the session's branch stream in global_seq order.
    index("events_org_branch_global_seq_idx").on(t.org_id, t.branch_id, t.global_seq),
  ],
);

/**
 * Per-org counter row (01-F3, assumption 2): locked FOR UPDATE inside the merge
 * transaction and held to commit — this serialization is what makes catchup
 * paging unable to skip a not-yet-visible lower seq (law 4).
 */
export const orgSequences = kernel.table("org_sequences", {
  org_id: text("org_id").primaryKey(),
  next_global_seq: bigint("next_global_seq", { mode: "number" }).notNull(),
});

/** Per-device high-water mark (01-F8): the source of hello_ack.resume_from. */
export const deviceWatermarks = kernel.table(
  "device_watermarks",
  {
    org_id: text("org_id").notNull(),
    device_id: text("device_id").notNull(),
    acked_watermark: bigint("acked_watermark", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.org_id, t.device_id] })],
);

/**
 * Quarantine storage (01-F37): invalid events verbatim, no global_seq, never in
 * kernel.events / fan-out / catchup. Re-quarantine of the same claimed id is an
 * idempotent no-op — first stored wins (UNIQUE below + ON CONFLICT DO NOTHING).
 * envelope is `text` (verbatim JSON string), NOT jsonb — bytes jsonb cannot
 * faithfully hold (e.g. U+0000 in any string) must still be quarantinable as
 * storage_reject (fix-round amendment 3).
 *
 * Heal-in-place is GONE (T-01-21): it existed only because the org-wide key let a
 * hub's placeholder occupy the origin's single slot. With one row PER CLAIMANT the
 * origin simply stores its own correctly-attributed row and nothing needs rewriting.
 *
 * The only UPDATE that remains is `superseded_at` — a placeholder whose event later
 * merged legitimately (review #7). The stored `envelope` is never rewritten (01-F1 —
 * a relay never re-authors), and a FOREIGN claim is never superseded, because
 * supersession keys on `envelope_author` (who WROTE the bytes) rather than on
 * `device_id` (who the row is attributed to). Those differ exactly where it matters.
 */
export const quarantine = kernel.table(
  "quarantine",
  {
    id: text("id").primaryKey(),
    org_id: text("org_id").notNull(),
    branch_id: text("branch_id").notNull(),
    device_id: text("device_id").notNull(),
    claimed_event_id: text("claimed_event_id").notNull(),
    reason: text("reason").notNull(),
    envelope: text("envelope").notNull(),
    received_at: bigint("received_at", { mode: "number" }).notNull(),
    // Review #7 (ruled): a placeholder whose event was later legitimately merged is
    // RETAINED and marked, never deleted — this table is evidence of what a device
    // tried to send, and deleting would leave an investigation a hole with no trace.
    // null ⇔ live; listQuarantine filters non-null out of the doc-15 live surface.
    superseded_at: bigint("superseded_at", { mode: "number" }),
    // WHO WROTE the stored bytes, as distinct from `device_id` (who the row is
    // attributed to). They differ exactly where supersession must discriminate: a
    // relayed placeholder is attributed to the hub but authored by the origin.
    envelope_author: text("envelope_author"),
  },
  // ONE ROW PER CLAIMANT DEVICE per claimed event id (audit-1 #6). The org-wide
  // (org_id, claimed_event_id) unique index is deliberately GONE: it let the FIRST
  // claimant own the only slot, so an honest origin arriving second had its envelope
  // DISCARDED ENTIRELY — bytes gone, not merely mis-attributed. A trivial insider
  // pre-claim destroyed exactly the evidence 01-F37 exists to preserve.
  (t) => [unique("quarantine_org_claimed_device_uq").on(t.org_id, t.claimed_event_id, t.device_id)],
);

/**
 * Device registry (T-01-09; 01 §5 names the cloud `device_registry` table;
 * 01-F25 registered/class-typed/revocable, 01 §7 layer-1 provisioning). The
 * REGISTRY — never the token, never the hello — is the authority for who may
 * open a session and who may be a relayed origin (18 §5). Rows are provisioning
 * bookkeeping, not event history: revocation SETS revoked_at (never deletes;
 * 01-F1 reaches the ledger only), and re-registration mints a fresh device_id
 * (T-01-09 ruled: wiped devices never collide with their old slots, 01-N5).
 * revoked_at null ⇔ active.
 */
export const deviceRegistry = kernel.table(
  "device_registry",
  {
    org_id: text("org_id").notNull(),
    branch_id: text("branch_id").notNull(),
    device_id: text("device_id").notNull(),
    device_class: text("device_class").notNull(),
    revoked_at: bigint("revoked_at", { mode: "number" }),
    // The cloud's record of this device's last-issued token expiry (T-01-18,
    // 01-F47). Load-bearing for hub-relayed renewal: a WAN-less origin's token
    // never reaches the cloud, so this column — not the credential — is how its
    // remaining life is judged (18 §5). Written at mint and at renewal only.
    token_expires_at: bigint("token_expires_at", { mode: "number" }),
  },
  (t) => [primaryKey({ columns: [t.org_id, t.device_id] })],
);

/**
 * Durable quarantine-notice outbox (T-01-08 binding data contract; DEC-SYNC-008
 * accepted: at-least-once, keyed by ORIGIN device, live-sent + redelivered on
 * next hello, mark-on-send). One notice per claimed id, first wins (UNIQUE +
 * ON CONFLICT DO NOTHING — idempotent with the quarantine row). The ONLY column
 * ever updated is delivered_at: this is delivery bookkeeping, not event history,
 * so 01-F1's no-update law does not reach it (stated explicitly in the contract).
 */
export const quarantineNotices = kernel.table(
  "quarantine_notices",
  {
    id: text("id").primaryKey(),
    org_id: text("org_id").notNull(),
    branch_id: text("branch_id").notNull(),
    device_id: text("device_id").notNull(),
    claimed_event_id: text("claimed_event_id").notNull(),
    reason: text("reason").notNull(),
    created_at: bigint("created_at", { mode: "number" }).notNull(),
    delivered_at: bigint("delivered_at", { mode: "number" }),
  },
  (t) => [
    // Widened in lockstep with kernel.quarantine (T-01-21). Left at the org-wide pair
    // it would silently defeat the widening: the second claimant's row would exist but
    // its origin could NEVER be notified, so an honest device whose event was rejected
    // would simply never hear about it — the exact silence 01-F37 exists to prevent.
    unique("quarantine_notices_org_claimed_device_uq").on(
      t.org_id,
      t.claimed_event_id,
      t.device_id,
    ),
    // The hello-time drain query (undelivered notices for one device).
    index("quarantine_notices_org_device_delivered_idx").on(t.org_id, t.device_id, t.delivered_at),
  ],
);
