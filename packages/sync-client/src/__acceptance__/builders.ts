// Acceptance-test builders — T-01-03, authored from the kernel-tasks binding
// contract + specs/01-kernel-sync.md §3/§5 only (24 §3 step 2: read-only to the
// implementing session).

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newId } from "@restos/domain";

export const identity = () => ({
  org_id: newId(),
  branch_id: newId(),
  device_id: newId(),
});

export type Identity = ReturnType<typeof identity>;

/** Envelope minus lamport_seq/server_received_at — the store assigns those (plan contract). */
export const appendInput = (id: Identity, overrides: Record<string, unknown> = {}) => ({
  id: newId(),
  org_id: id.org_id,
  branch_id: id.branch_id,
  device_id: id.device_id,
  actor_user_id: null,
  device_created_at: 1752800000000,
  type: "order.created",
  schema_version: 1,
  payload: { order_id: newId(), channel: "dine_in" },
  refs: [],
  ...overrides,
});

export const tempDbPath = () => join(mkdtempSync(join(tmpdir(), "restos-outbox-")), "device.db");

// ---------------------------------------------------------------------------
// T-01-04 additive helpers (fold acceptance tests; kernel-tasks binding contract
// + FOLDS.md). Type/payload fragments for the contract's registry additions —
// spread into appendInput / peerEnvelope overrides.
// ---------------------------------------------------------------------------

export const orderCreated = (order_id: string, extra: Record<string, unknown> = {}) => ({
  type: "order.created",
  payload: { order_id, channel: "dine_in", ...extra },
});

export const orderConfirmed = (order_id: string) => ({
  type: "order.confirmed",
  payload: { order_id },
});

export const orderLineAdded = (
  order_id: string,
  line_id: string,
  extra: Record<string, unknown> = {},
) => ({
  type: "order.line_added",
  payload: { order_id, line_id, item_id: "item-karahi", qty: 1, unit_price_paisa: 50000, ...extra },
});

export const orderTableAssigned = (order_id: string, table_id: string) => ({
  type: "order.table_assigned",
  payload: { order_id, table_id },
});

export const kotPrinted = (order_id: string) => ({
  type: "kot.printed",
  payload: { order_id },
});

export const lineStateChanged = (order_id: string, line_ids: string[], state: string) => ({
  type: "order.line_state_changed",
  payload: { order_id, line_ids, state },
});

export const paymentRecorded = (order_id: string, amount_paisa: number) => ({
  type: "payment.recorded",
  payload: { order_id, amount_paisa, method: "cash", settlement_attempt_id: newId() },
});

/** `payment_id` is the parent payment.recorded EVENT id (01-F29; parking contract). */
export const paymentRefunded = (payment_id: string, amount_paisa: number) => ({
  type: "payment.refunded",
  payload: { payment_id, amount_paisa, method: "cash_out" },
});

/** A peer device in the same org/branch — its envelopes enter via store.ingest. */
export const peerIdentity = (id: Identity): Identity => ({ ...id, device_id: newId() });

/**
 * Full envelope from a peer device for store.ingest — caller supplies lamport_seq
 * (the peer's own counter; the store never assigns peer lamports).
 */
export const peerEnvelope = (
  peer: Identity,
  lamport_seq: number,
  overrides: Record<string, unknown> = {},
) => ({
  id: newId(),
  org_id: peer.org_id,
  branch_id: peer.branch_id,
  device_id: peer.device_id,
  actor_user_id: null,
  lamport_seq,
  device_created_at: 1752800000000,
  server_received_at: null,
  type: "order.created",
  schema_version: 1,
  payload: { order_id: newId(), channel: "dine_in" },
  refs: [],
  ...overrides,
});

/**
 * Canonical JSON per the T-01-04 contract: object keys sorted lexicographically at
 * every depth, no insignificant whitespace — `json_lines` compares byte-for-byte.
 */
export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
};

/** Deterministic PRNG (mulberry32) — seeded runs only, no ambient randomness. */
export const seededRng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
