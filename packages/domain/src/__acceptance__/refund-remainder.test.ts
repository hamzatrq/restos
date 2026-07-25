// Acceptance tests — T-01-08, the executable refund-remainder invariant in
// `packages/domain` (law 7 of the T-01-08 contract; 01-F30 "conservation
// invariants, executable in packages/domain"; 01-F29 cap `Σ refunds ≤
// un-refunded remainder`; DEC-SYNC-007 — the gateway's merge-time decision is
// exactly this function's output, no re-implemented arithmetic at the call
// site). Authored from spec text + the T-01-08 contract ONLY (24 §3 step 2:
// read-only to the implementing session).
//
// ORACLE-PINNED SURFACE (the contract offers `refundRemainderExceeded` or
// `unRefundedRemainder`; this oracle pins the boolean form — the shape of the
// gateway's decision):
//   refundRemainderExceeded({
//     payment_amount_paisa: number,   // the parent payment attempt's amount
//     prior_refunds_total_paisa: number, // Σ over UNIQUE prior refund attempt
//                                        // keys against that parent (01-F31 —
//                                        // the CALLER dedupes by attempt key)
//     this_refund_paisa: number,      // the candidate refund's amount
//   }): boolean                       // true ⇔ the cap would be violated
// Pure, integer-paisa; violation ⇔ this_refund > payment_amount −
// prior_refunds_total. Exact cover is NOT a violation; ONE PAISA over is.
// Non-integer / NaN / ±Infinity inputs throw loudly (00 §6: money is integer
// paisas, floats never; the T-01-13 helper posture — brands are compile-time
// only, so the runtime guard is the enforcement).
//
// RED at authoring time: "not a function" — the helper does not exist yet (the
// structural-cast idiom keeps typecheck green while the surface is unbuilt).
// The gateway boundary tests (services/sync-gateway __acceptance__
// invariant-refund-cap.test.ts) mirror the 1000/600/601 numbers below so the
// two suites pin the SAME boundary from both sides (law 7's "the gateway's
// decision is exactly this function's output").
import { describe, expect, it } from "vitest";
import * as domain from "../index.js";

type RefundRemainderArgs = {
  payment_amount_paisa: number;
  prior_refunds_total_paisa: number;
  this_refund_paisa: number;
};
type InvariantSurface = {
  refundRemainderExceeded(args: RefundRemainderArgs): boolean;
};
const { refundRemainderExceeded } = domain as unknown as InvariantSurface;

const args = (payment: number, prior: number, refund: number): RefundRemainderArgs => ({
  payment_amount_paisa: payment,
  prior_refunds_total_paisa: prior,
  this_refund_paisa: refund,
});

describe("01-F30/01-F29 — refundRemainderExceeded, the shared fold-free cap rule (DEC-SYNC-007)", () => {
  it("01-F29/01-F30: exact cover is NOT a violation — a refund that lands exactly on the un-refunded remainder is legal", () => {
    expect(refundRemainderExceeded(args(1_000, 400, 600))).toBe(false);
    expect(refundRemainderExceeded(args(1_000, 0, 1_000))).toBe(false);
    expect(refundRemainderExceeded(args(1, 0, 1))).toBe(false);
  });

  it("01-F29/01-F30: ONE PAISA over the remainder IS a violation", () => {
    expect(refundRemainderExceeded(args(1_000, 400, 601))).toBe(true);
    expect(refundRemainderExceeded(args(1_000, 0, 1_001))).toBe(true);
    expect(refundRemainderExceeded(args(1, 0, 2))).toBe(true);
  });

  it("01-F29/01-F30: zero-amount boundaries — a zero refund never violates (even at a fully-consumed cap); against a zero payment any positive refund violates", () => {
    expect(refundRemainderExceeded(args(1_000, 1_000, 0))).toBe(false);
    expect(refundRemainderExceeded(args(0, 0, 0))).toBe(false);
    expect(refundRemainderExceeded(args(0, 0, 1))).toBe(true);
  });

  it("01-F29/01-F31: cumulative accounting — the 600-then-600 double refund against 1000 violates on the second, 400-then-600 does not (the gateway law-2 mirror)", () => {
    expect(refundRemainderExceeded(args(1_000, 600, 600))).toBe(true);
    expect(refundRemainderExceeded(args(1_000, 400, 600))).toBe(false);
  });

  it("00 §6/01-F30: non-integer money is rejected loudly on every argument — fractional, NaN and ±Infinity throw (integer paisas, floats never; brands are compile-time only)", () => {
    // Guard against a vacuous pass while the surface is unbuilt: calling a
    // non-function would also "throw" — first prove the helper exists.
    expect(typeof refundRemainderExceeded).toBe("function");
    expect(() => refundRemainderExceeded(args(1_000.5, 0, 1))).toThrow();
    expect(() => refundRemainderExceeded(args(1_000, 0.25, 1))).toThrow();
    expect(() => refundRemainderExceeded(args(1_000, 0, Number.NaN))).toThrow();
    expect(() => refundRemainderExceeded(args(1_000, 0, Number.POSITIVE_INFINITY))).toThrow();
  });
});
