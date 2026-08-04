// Acceptance tests — S-2 through the DEVICE STORE's ingest path, where 01-F17 actually
// lives. The pure fold is exercised in ./shift-cash-fold.test.ts; this file exists because
// "never blocks a sale" is a property of the path the sale travels, not of a function called
// in isolation: the fold runs inside ingest with no try/catch between, so an uncaught throw
// there wedges ingestion of a real, rung-up sale.
//
// Authored from spec text only (24 §3 step 2): 02-F37, 01-F17, 01-F32/DEC-MONEY-007,
// 02-F23, 26 §7.
//
// RED-AWAITING-IMPLEMENTATION, for TWO reasons, and both are legitimate:
//   * the store exposes no `shifts()` / `unboundSettlements()` projection (S-2, this brief);
//   * `shift.opened` / `shift.closed` / `day.*` / `cash.*` are not in the `01 §4` registry
//     yet (S-1, authored separately).
//
// WHICH TESTS WAIT ON WHICH, counted rather than asserted — the first draft of this comment
// claimed "the 02-F37 and money assertions below do not wait on S-1", and two of the three
// tests below do. The comment was the defect (`oracle-round-2-findings.md` §C pattern 1):
//   * "a settlement with NO shift open is STORED" — S-2 ONLY. Its single envelope is a
//     `payment.recorded`, which IS registered and whose payload schema is a `z.looseObject`,
//     so the carried `shift_id` it relies on is schema-valid today.
//   * "an overflow-regime cash set ingests without throwing" — S-1 **and** S-2. It ingests a
//     `shift.opened`, which has no registry entry, so it reds at ingest before the fold is
//     reached.
//   * "a cash khata repayment is drawer cash for the SHIFT" — S-1 **and** S-2, same reason.
// So exactly one test here is unblocked by S-1's landing, and the two money assertions are
// not it. Nothing below may be read as evidence that the shift-keyed money path works until
// both land.

import { describe, expect, it } from "vitest";
import { identity, peerEnvelope, peerIdentity } from "./builders.js";
import { created, ingestAll, type MergeOpenOrderRow } from "./merge-builders.js";
import {
  BRANCH_T0,
  expectedOf,
  hasCode,
  MAX_SAFE,
  requireShiftRows,
  requireUnbound,
  shiftCashStore,
  shiftEnvelope,
  shiftOpened,
  shiftPayment,
} from "./shift-cash-builders.js";

const onlyOrder = (rows: MergeOpenOrderRow[], order_id: string): MergeOpenOrderRow => {
  const row = rows.find((r) => r.order_id === order_id);
  if (!row) throw new Error(`expected an open_orders row for ${order_id}`);
  return row;
};

describe("02-F37 through the ingest path — the sale is never blocked", () => {
  it("02-F37/01-F17: ingesting a settlement with NO shift open is STORED, never refused, and names the anomaly the FR names", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = shiftCashStore(id);
    // Resolved BEFORE the behavioural assertions so a missing projection is a distinct red
    // rather than a false green on "it didn't throw".
    const unbound = requireUnbound(store);
    const env = shiftEnvelope(
      peer,
      0,
      shiftPayment("O1", 75000, { attempt: "sa-unbound", shift_id: null }),
      { branch_at: BRANCH_T0 + 1000 },
    );
    let result: { stored: boolean } | null = null;
    expect(() => {
      result = store.ingest(env);
    }).not.toThrow();
    expect(result).toEqual({ stored: true });
    expect(unbound()).toEqual([
      {
        settlement_attempt_id: "sa-unbound",
        order_id: "O1",
        method: "cash",
        amount_paisa: 75000,
        anomaly: "unbound_settlement",
      },
    ]);
    store.close();
  });

  it("01-F17/00 §6: an overflow-regime cash set ingests without throwing — the bucket refuses, the till does not", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = shiftCashStore(id);
    const shifts = requireShiftRows(store);
    const envelopes = [
      shiftEnvelope(peer, 0, shiftOpened("S1"), { branch_at: BRANCH_T0 }),
      ...[MAX_SAFE, 1, 1, 1].map((amount, i) =>
        shiftEnvelope(
          peer,
          i + 1,
          shiftPayment(`O${i}`, amount, { attempt: `sa-${i}`, shift_id: "S1" }),
          { branch_at: BRANCH_T0 + 100 + i },
        ),
      ),
    ];
    expect(() => {
      ingestAll(store, envelopes);
    }).not.toThrow();
    const row = shifts().find((r) => r.shift_id === "S1");
    if (!row) throw new Error("expected the S1 shift row");
    expect(expectedOf(row).cash).toBe(0);
    expect(hasCode(row, /overflow/)).toBe(true);
    store.close();
  });
});

describe("the two planes of one payment (DEC-MONEY-007, 01-F32, 02-F23)", () => {
  it("DEC-MONEY-007/02-F23: a cash khata repayment is drawer cash for the SHIFT and is still excluded from the ORDER's pay_total", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = shiftCashStore(id);
    const shifts = requireShiftRows(store);
    ingestAll(store, [
      peerEnvelope(peer, 0, { ...created("O1"), device_created_at: BRANCH_T0 }),
      shiftEnvelope(peer, 1, shiftOpened("S1"), { branch_at: BRANCH_T0 + 10 }),
      shiftEnvelope(peer, 2, shiftPayment("O1", 100000, { attempt: "sa-settle", shift_id: "S1" }), {
        branch_at: BRANCH_T0 + 100,
      }),
      shiftEnvelope(
        peer,
        3,
        shiftPayment("O1", 40000, {
          attempt: "sa-repay",
          shift_id: "S1",
          purpose: "repays_receivable",
        }),
        { branch_at: BRANCH_T0 + 200 },
      ),
    ]);
    const shift = shifts().find((r) => r.shift_id === "S1");
    if (!shift) throw new Error("expected the S1 shift row");
    // The drawer holds both notes …
    expect(expectedOf(shift).cash).toBe(140000);
    // … and the order is still not "overpaid" — 01-F31's keyed sum excludes the repayment
    // (DEC-MONEY-007). The same event legitimately reaches two different totals; a fold that
    // reused one rule for both is wrong in one of the two places.
    const order = onlyOrder(store.openOrders(), "O1");
    expect(order.pay_total).toBe(100000);
    expect(order.repaid_total).toBe(40000);
    store.close();
  });
});
