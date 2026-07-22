// Acceptance-test builders — T-01-03, authored from the kernel-tasks binding
// contract + specs/01-kernel-sync.md §3/§5 only (24 §3 step 2: read-only to the
// implementing session).

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newId } from "@restos/domain";

/** noUncheckedIndexedAccess-safe unwrap — a missing value is a loud test failure (T-01-05 additive). */
export const must = <T>(value: T | undefined | null, what = "value"): T => {
  if (value === undefined || value === null) throw new Error(`expected ${what} to be defined`);
  return value;
};

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

/** T-01-15 M (oracle enumeration, cross-cutting): payload carries the amended
 * required fields — supersedes ([] = root assignment) + from_table_id (01-F34). */
export const orderTableAssigned = (
  order_id: string,
  table_id: string,
  opts: { from?: string | null; supersedes?: readonly string[] } = {},
) => ({
  type: "order.table_assigned",
  payload: {
    order_id,
    table_id,
    from_table_id: opts.from ?? null,
    supersedes: [...(opts.supersedes ?? [])],
  },
});

export const kotPrinted = (order_id: string) => ({
  type: "kot.printed",
  payload: { order_id },
});

/** The canonical predecessor per target state — the default `from_states` witness
 * for legacy single-step transitions (exits claim a from-birth witness). */
const DEFAULT_FROM: Record<string, string> = {
  confirmed: "placed",
  in_prep: "confirmed",
  ready: "in_prep",
  served: "ready",
  picked_up: "ready",
  delivered: "picked_up",
  voided: "placed",
  cancelled: "placed",
};

/** T-01-15 M (oracle enumeration, cross-cutting): carries the amended required
 * per-line `line_context` — an edge, not a value (01-F34/01-F35). Callers pinning
 * a specific claimed origin pass `from_states` explicitly. */
export const lineStateChanged = (
  order_id: string,
  line_ids: string[],
  state: string,
  from_states?: readonly string[],
) => ({
  type: "order.line_state_changed",
  payload: {
    order_id,
    line_ids,
    state,
    line_context: Object.fromEntries(
      [...new Set(line_ids)].map((lineId) => [
        lineId,
        {
          to: state,
          from_states: [...(from_states ?? [DEFAULT_FROM[state] ?? "placed"])],
          preds: [],
        },
      ]),
    ),
  },
});

/** T-01-15 M (oracle enumeration, cross-cutting): carries the required `purpose`
 * discriminator (01-F30/01-F32). */
export const paymentRecorded = (order_id: string, amount_paisa: number) => ({
  type: "payment.recorded",
  payload: {
    order_id,
    amount_paisa,
    method: "cash",
    purpose: "settles_order",
    settlement_attempt_id: newId(),
  },
});

/** T-01-15 M (oracle enumeration, cross-cutting): the amended 01-F29 shape — the
 * order key is carried; the parent ref is the parent's settlement_attempt_id
 * (envelope-id refs superseded); the refund carries its OWN attempt key (01-F31). */
export const paymentRefunded = (
  order_id: string,
  amount_paisa: number,
  opts: { parent: string; attempt?: string },
) => ({
  type: "payment.refunded",
  payload: {
    order_id,
    amount_paisa,
    method: "cash_out",
    settlement_attempt_id: opts.attempt ?? newId(),
    payment_attempt_id: opts.parent,
  },
});

/** T-01-15 (01-F33): the settlement ACT — the only thing that settles an order. */
export const settlementClosed = (order_id: string) => ({
  type: "order.settlement_closed",
  payload: { order_id },
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
