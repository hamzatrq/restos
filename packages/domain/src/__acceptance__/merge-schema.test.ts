// Acceptance tests — T-01-15 domain schema additions (oracle session; authored from
// specs/01-kernel-sync.md (01-F29/F30/F31/F32/F33/F34, §4 catalog incl.
// order.settlement_closed), specs/26-merge-semantics.md §3/§7, and
// plans/wave-0/merge-semantics-matrix.md §3 + Addendum ONLY — never from an
// implementation (24 §3 step 2). RED-AWAITING-IMPLEMENTATION except where noted.
//
// Oracle-pinned interpretations (each flagged in the oracle report for planner review):
// 1. `payment.recorded.purpose` is REQUIRED with the closed enum
//    `settles_order | repays_receivable` (matrix §3: "making these required rather
//    than optional deletes migration paths entirely"; 01-F30/01-F32 restate the
//    conservation equation over `purpose: settles_order` — an unpurposed payment is
//    neither tendering nor repayment, so absence is not interpretable).
// 2. `payment.refunded` parent ref: 01-F29 says the refund "references its parent
//    payment by settlement_attempt_id (envelope-id parent refs superseded)" while
//    01-F31 requires EVERY emission to carry its OWN attempt key. Two attempt-id
//    fields are therefore required; the contract's brace list names only
//    `settlement_attempt_id` (the refund's own key, per matrix §3), so the parent
//    ref is oracle-pinned as `payment_attempt_id` (the parent payment's
//    settlement_attempt_id). `payment_id` (envelope-id ref) is superseded — no
//    longer required; it may ride as a loose extra.
// 3. `order.table_assigned.{supersedes, from_table_id}` are REQUIRED (supersedes may
//    be [], from_table_id may be null) — matrix §3 marks supersedes "required, []
//    legal" and lists both under "no partial-adoption path".
// 4. `order.line_state_changed.line_context` is REQUIRED, per-line
//    `{to, from_states (min 1), preds}` (T-01-15 contract text; Addendum:
//    "from_states: [] … real schema needs .min(1)").
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import * as domainNs from "../index.js";
import { canonicalJson, eventRegistry, newId, parseEvent } from "../index.js";

// The two new domain exports the contract names (payloadHash; the legality
// predicate LEGAL_NEXT from states.ts). Accessed via a namespace cast so this file
// typechecks before the implementation exists; a missing export is a loud runtime
// failure inside the test, not a module-load crash.
const maybeExports = domainNs as unknown as {
  payloadHash?: (payload: unknown) => string;
  LEGAL_NEXT?: Record<string, readonly string[]>;
};

const mustExport = <T>(value: T | undefined, name: string): T => {
  if (value === undefined)
    throw new Error(
      `@restos/domain does not export ${name} yet (T-01-15 red-awaiting-implementation)`,
    );
  return value;
};

const envelope = (type: string, payload: unknown) => ({
  id: newId(),
  org_id: newId(),
  branch_id: newId(),
  device_id: newId(),
  actor_user_id: newId(),
  lamport_seq: 1,
  device_created_at: 1752800000000,
  server_received_at: null,
  type,
  schema_version: 1,
  payload,
  refs: [] as string[],
});

const recordedPayload = () => ({
  order_id: newId(),
  amount_paisa: 45000,
  method: "cash",
  purpose: "settles_order",
  settlement_attempt_id: newId(),
});

const refundedPayload = () => ({
  order_id: newId(),
  amount_paisa: 45000,
  method: "cash_out",
  settlement_attempt_id: newId(), // the refund's OWN idempotency key (01-F31)
  payment_attempt_id: newId(), // the PARENT payment's settlement_attempt_id (01-F29)
  reason: "customer returned item",
});

const tableAssignedPayload = () => ({
  order_id: newId(),
  table_id: "T4",
  from_table_id: null as string | null,
  supersedes: [] as string[],
});

const lineContextPayload = () => {
  const line = "L1";
  return {
    order_id: newId(),
    line_ids: [line],
    state: "confirmed",
    line_context: {
      [line]: { to: "confirmed", from_states: ["placed"], preds: [] as string[] },
    },
  };
};

const settlementClosedPayload = () => ({
  order_id: newId(),
  settlement_attempt_ids: [newId()],
  billed_paisa: 185000,
  tendered_paisa: 185000,
  refunded_paisa: 0,
  closed_by_user: newId(),
});

describe("payment.recorded purpose discriminator (01-F30/01-F32, matrix §3)", () => {
  it("01-F32: payment.recorded parses with purpose settles_order and with purpose repays_receivable", () => {
    expect(parseEvent(envelope("payment.recorded", recordedPayload())).type).toBe(
      "payment.recorded",
    );
    expect(
      parseEvent(
        envelope("payment.recorded", { ...recordedPayload(), purpose: "repays_receivable" }),
      ).type,
    ).toBe("payment.recorded");
  });

  it("01-F30/01-F32: payment.recorded without purpose is a parse failure — an unpurposed payment is neither tendering nor repayment", () => {
    const { purpose: _drop, ...missing } = recordedPayload();
    expect(() => parseEvent(envelope("payment.recorded", missing))).toThrow();
  });

  it("01-F32: purpose outside the closed enum is a parse failure", () => {
    expect(() =>
      parseEvent(envelope("payment.recorded", { ...recordedPayload(), purpose: "gratuity" })),
    ).toThrow();
  });

  it("01-F31: payment.recorded still requires settlement_attempt_id (retained law — green today)", () => {
    const { settlement_attempt_id: _drop, ...missing } = recordedPayload();
    expect(() => parseEvent(envelope("payment.recorded", missing))).toThrow();
  });
});

describe("payment.refunded {order_id, settlement_attempt_id, payment_attempt_id} (01-F29/01-F31, matrix §3)", () => {
  it("01-F29: payment.refunded parses with order_id + its own settlement_attempt_id + the parent payment_attempt_id, and no payment_id", () => {
    expect(parseEvent(envelope("payment.refunded", refundedPayload())).type).toBe(
      "payment.refunded",
    );
  });

  it("01-F29: payment.refunded without order_id is a parse failure — the order key is carried, never resolved through the parent", () => {
    const { order_id: _drop, ...missing } = refundedPayload();
    expect(() => parseEvent(envelope("payment.refunded", missing))).toThrow();
  });

  it("01-F31: payment.refunded without its own settlement_attempt_id is a parse failure — a double-tapped manager approval must dedupe", () => {
    const { settlement_attempt_id: _drop, ...missing } = refundedPayload();
    expect(() => parseEvent(envelope("payment.refunded", missing))).toThrow();
  });

  it("01-F29: payment.refunded without the parent payment_attempt_id is a parse failure — the cap resolves parents by attempt id, not envelope id", () => {
    const { payment_attempt_id: _drop, ...missing } = refundedPayload();
    expect(() => parseEvent(envelope("payment.refunded", missing))).toThrow();
  });

  it("01-F29: payment_id (envelope-id parent ref) is superseded — not required, but tolerated as a loose extra", () => {
    // No payment_id: parses (covered above). With payment_id as an extra: still parses.
    expect(
      parseEvent(envelope("payment.refunded", { ...refundedPayload(), payment_id: newId() })).type,
    ).toBe("payment.refunded");
  });

  it("01-F29: the refund method enum stays closed — cash_out | raast_reversal_ref | khata_credit (retained law)", () => {
    for (const method of ["cash_out", "raast_reversal_ref", "khata_credit"]) {
      expect(parseEvent(envelope("payment.refunded", { ...refundedPayload(), method })).type).toBe(
        "payment.refunded",
      );
    }
    expect(() =>
      parseEvent(envelope("payment.refunded", { ...refundedPayload(), method: "bank_transfer" })),
    ).toThrow();
  });
});

describe("order.table_assigned {supersedes[], from_table_id} (01-F34, matrix §3)", () => {
  it("01-F34: table_assigned parses with supersedes [] and from_table_id null (both required, both may be empty/null)", () => {
    expect(parseEvent(envelope("order.table_assigned", tableAssignedPayload())).type).toBe(
      "order.table_assigned",
    );
  });

  it("01-F34: table_assigned parses with a populated supersedes chain and a from_table_id", () => {
    expect(
      parseEvent(
        envelope("order.table_assigned", {
          ...tableAssignedPayload(),
          from_table_id: "T7",
          supersedes: [newId(), newId()],
        }),
      ).type,
    ).toBe("order.table_assigned");
  });

  it("01-F34: table_assigned without supersedes is a parse failure — the causal link is the only thing that makes the anchor converge", () => {
    const { supersedes: _drop, ...missing } = tableAssignedPayload();
    expect(() => parseEvent(envelope("order.table_assigned", missing))).toThrow();
  });

  it("01-F34: table_assigned without from_table_id is a parse failure — the origin table must be nameable (null when none)", () => {
    const { from_table_id: _drop, ...missing } = tableAssignedPayload();
    expect(() => parseEvent(envelope("order.table_assigned", missing))).toThrow();
  });
});

describe("order.line_state_changed line_context (01-F34/01-F35, matrix §3 + Addendum)", () => {
  it("01-F35: line_state_changed parses with a per-line {to, from_states, preds} context", () => {
    expect(parseEvent(envelope("order.line_state_changed", lineContextPayload())).type).toBe(
      "order.line_state_changed",
    );
  });

  it("01-F34: line_state_changed without line_context is a parse failure — a value is not an edge", () => {
    const { line_context: _drop, ...missing } = lineContextPayload();
    expect(() => parseEvent(envelope("order.line_state_changed", missing))).toThrow();
  });

  it("01-F35: from_states: [] is a parse failure — ∀ over ∅ is vacuously legal, so the schema pins min 1", () => {
    const payload = lineContextPayload();
    payload.line_context.L1 = { to: "confirmed", from_states: [], preds: [] };
    expect(() => parseEvent(envelope("order.line_state_changed", payload))).toThrow();
  });

  it("01-F35: a to state outside the canonical vocabulary is a parse failure", () => {
    const payload = lineContextPayload();
    payload.line_context.L1 = { to: "flying", from_states: ["placed"], preds: [] };
    expect(() => parseEvent(envelope("order.line_state_changed", payload))).toThrow();
  });

  it("01-F35: a from_states member outside the canonical vocabulary is a parse failure", () => {
    const payload = lineContextPayload();
    payload.line_context.L1 = { to: "confirmed", from_states: ["hovering"], preds: [] };
    expect(() => parseEvent(envelope("order.line_state_changed", payload))).toThrow();
  });
});

describe("order.settlement_closed — the new 01 §4 event type (01-F33)", () => {
  it("01-F33: order.settlement_closed is a registered event type", () => {
    expect(eventRegistry.has("order.settlement_closed")).toBe(true);
  });

  it("01-F33: settlement_closed parses with the carried snapshot payload", () => {
    expect(parseEvent(envelope("order.settlement_closed", settlementClosedPayload())).type).toBe(
      "order.settlement_closed",
    );
  });

  it("01-F33: settlement_closed without order_id is a parse failure", () => {
    const { order_id: _drop, ...missing } = settlementClosedPayload();
    expect(() => parseEvent(envelope("order.settlement_closed", missing))).toThrow();
  });
});

describe("payloadHash — the clock-neutral tiebreak primitive (01-F34, matrix conventions)", () => {
  it("01-F34: payloadHash(payload) = sha256 hex over canonicalJson(payload)", () => {
    const payloadHash = mustExport(maybeExports.payloadHash, "payloadHash");
    const payload = { order_id: "O1", channel: "dine_in", nested: { b: 2, a: 1 } };
    const expected = createHash("sha256").update(canonicalJson(payload), "utf8").digest("hex");
    expect(payloadHash(payload)).toBe(expected);
  });

  it("01-F34: payloadHash is key-order independent — same value, any insertion order, one hash", () => {
    const payloadHash = mustExport(maybeExports.payloadHash, "payloadHash");
    const a = { x: 1, y: { p: "q", r: "s" } };
    const b = { y: { r: "s", p: "q" }, x: 1 };
    expect(payloadHash(a)).toBe(payloadHash(b));
  });

  it("01-F34: distinct payloads hash differently", () => {
    const payloadHash = mustExport(maybeExports.payloadHash, "payloadHash");
    expect(payloadHash({ order_id: "O1" })).not.toBe(payloadHash({ order_id: "O2" }));
  });
});

describe("LEGAL_NEXT — the exported legality predicate (01-F35, states.ts)", () => {
  it("01-F35: LEGAL_NEXT is exported and pins the canonical transition table — terminals map to []", () => {
    const LEGAL_NEXT = mustExport(maybeExports.LEGAL_NEXT, "LEGAL_NEXT");
    const exits = ["voided", "cancelled"];
    expect(LEGAL_NEXT).toEqual({
      placed: ["confirmed", ...exits],
      confirmed: ["in_prep", ...exits],
      in_prep: ["ready", ...exits],
      ready: ["served", "picked_up", ...exits],
      picked_up: ["delivered", ...exits],
      served: [],
      delivered: [],
      voided: [],
      cancelled: [],
    });
  });
});
